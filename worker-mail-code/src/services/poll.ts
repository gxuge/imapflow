import type { Env, PollResult } from '../types';
import { extractCode } from './code-extractor';
import { runDailyCleanup } from './cleanup';
import { logEvent } from './events';
import { parseExistsCount, SimpleImapClient } from './imap-client';
import { parseMailFromFetch, pickTargetAlias } from './mail-parser';
import {
  buildMessageKey,
  clampInt,
  mustGetEnv,
  readBool,
  summarizeText,
  trimForStorage,
  safeTrim
} from '../utils/common';

/**
 * 核心轮询函数（Cron 和手动触发共用）。
 * 所有状态均入 D1，方便可观测与审计。
 */
export async function pollMailbox(env: Env, source: 'cron' | 'manual'): Promise<PollResult> {
  const startedAt = new Date().toISOString();
  const runInsert = await env.DB.prepare(
    `INSERT INTO poll_runs (started_at, status, scanned_count, processed_count)
     VALUES (?, 'running', 0, 0)`
  )
    .bind(startedAt)
    .run();
  const runId = Number(runInsert.meta.last_row_id ?? 0);

  let scannedCount = 0;
  let processedCount = 0;

  try {
    const lookbackMinutes = clampInt(Number(env.POLL_LOOKBACK_MINUTES ?? '10'), 1, 180);
    const maxEmails = clampInt(Number(env.MAX_EMAILS_PER_POLL ?? '20'), 1, 100);
    const autoCreateAlias = readBool(env.AUTO_CREATE_ALIAS, true);
    const storeBody = readBool(env.STORE_BODY, false);

    const imap = new SimpleImapClient({
      host: mustGetEnv(env.IMAP_HOST, 'IMAP_HOST'),
      port: clampInt(Number(env.IMAP_PORT ?? '993'), 1, 65535),
      user: mustGetEnv(env.IMAP_USER, 'IMAP_USER'),
      pass: mustGetEnv(env.IMAP_PASS, 'IMAP_PASS'),
      tls: readBool(env.IMAP_TLS, true)
    });

    await imap.connectAndLogin();

    // 2925 实测不支持 SEARCH，改为 SELECT + FETCH 最近 N 封。
    const selectResp = await imap.command('SELECT INBOX');
    if (!selectResp.ok) {
      throw new Error('imap_select_inbox_failed');
    }

    const existsCount = parseExistsCount(selectResp.raw);
    if (existsCount <= 0) {
      scannedCount = 0;
    }

    const endSeq = existsCount;
    const startSeq = Math.max(1, endSeq - maxEmails + 1);
    const seqList: number[] = [];
    for (let seq = startSeq; seq <= endSeq; seq++) {
      seqList.push(seq);
    }
    scannedCount = seqList.length;

    for (const seq of seqList) {
      const fetchResp = await imap.command(
        `FETCH ${seq} (UID INTERNALDATE RFC822.HEADER BODY.PEEK[TEXT])`
      );
      if (!fetchResp.ok) continue;

      const uid = parseUidFromFetch(fetchResp.raw, String(seq));
      const mail = await parseMailFromFetch(fetchResp.raw, uid);
      if (!isWithinLookback(mail.receivedAt, lookbackMinutes)) continue;

      const messageKey = await buildMessageKey(mail);
      const exists = await env.DB.prepare(
        'SELECT id FROM processed_messages WHERE message_key = ? LIMIT 1'
      )
        .bind(messageKey)
        .first<{ id: number }>();
      if (exists) continue;

      const extractedCode = extractCode(mail.subject, mail.textBody);
      const aliasEmail = pickTargetAlias(mail.rawHeaders, mail.toEmail, mail.deliveredTo);
      if (aliasEmail && autoCreateAlias) await ensureAlias(env, aliasEmail, true);

      const nowIso = new Date().toISOString();
      const textBody = storeBody ? trimForStorage(mail.textBody, 50000) : summarizeText(mail.textBody);
      const htmlBody = storeBody ? trimForStorage(mail.htmlBody, 50000) : null;

      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO emails (
            message_id, imap_uid, from_email, to_email, delivered_to, subject,
            text_body, html_body, extracted_code, received_at, processed_at,
            raw_headers_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          mail.messageId,
          mail.uid,
          mail.fromEmail,
          mail.toEmail,
          mail.deliveredTo,
          mail.subject,
          textBody,
          htmlBody,
          extractedCode,
          mail.receivedAt,
          nowIso,
          JSON.stringify(mail.rawHeaders),
          nowIso
        ),
        env.DB.prepare('INSERT INTO processed_messages (message_key, processed_at) VALUES (?, ?)').bind(
          messageKey,
          nowIso
        )
      ]);

      processedCount += 1;

      if (extractedCode && aliasEmail) {
        const pending = await env.DB.prepare(
          `SELECT id, request_id FROM code_requests
           WHERE alias_email = ? AND status = 'pending' AND expires_at > ?
           ORDER BY created_at DESC LIMIT 1`
        )
          .bind(aliasEmail, nowIso)
          .first<{ id: number; request_id: string }>();

        if (pending) {
          await env.DB.prepare(
            `UPDATE code_requests
             SET status = 'found', code = ?, from_email = ?, subject = ?, message_id = ?,
                 email_received_at = ?, updated_at = ?
             WHERE id = ?`
          )
            .bind(
              extractedCode,
              mail.fromEmail,
              mail.subject,
              mail.messageId,
              mail.receivedAt,
              nowIso,
              pending.id
            )
            .run();

          await logEvent(env, 'code_found', pending.request_id, aliasEmail, {
            source,
            messageId: mail.messageId,
            code_found: true
          });
        }
      }
    }

    await imap.logout();

    const nowIso = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE code_requests
       SET status = 'expired', updated_at = ?
       WHERE status = 'pending' AND expires_at <= ?`
    )
      .bind(nowIso, nowIso)
      .run();

    await runDailyCleanup(env, false);

    await env.DB.prepare(
      `UPDATE poll_runs
       SET finished_at = ?, status = 'ok', scanned_count = ?, processed_count = ?, error_message = NULL
       WHERE id = ?`
    )
      .bind(new Date().toISOString(), scannedCount, processedCount, runId)
      .run();

    return { ok: true, runId, scannedCount, processedCount };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'poll_failed';
    await env.DB.prepare(
      `UPDATE poll_runs
       SET finished_at = ?, status = 'error', scanned_count = ?, processed_count = ?, error_message = ?
       WHERE id = ?`
    )
      .bind(new Date().toISOString(), scannedCount, processedCount, safeTrim(error, 1000), runId)
      .run();

    await logEvent(env, 'poll_error', null, null, { source, runId, scannedCount, processedCount, error });
    return { ok: false, runId, scannedCount, processedCount, error };
  }
}

export async function ensureAlias(env: Env, aliasEmail: string, enabled: boolean): Promise<void> {
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO aliases (alias_email, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(alias_email) DO UPDATE SET updated_at = excluded.updated_at`
  )
    .bind(aliasEmail, enabled ? 1 : 0, nowIso, nowIso)
    .run();
}

function parseUidFromFetch(raw: string, fallback: string): string {
  const m = raw.match(/\bUID\s+(\d+)\b/i);
  if (m && m[1]) return m[1];
  return fallback;
}

function isWithinLookback(receivedAt: string, lookbackMinutes: number): boolean {
  const ts = new Date(receivedAt).getTime();
  if (!Number.isFinite(ts)) return true;
  const ageMs = Date.now() - ts;
  return ageMs <= lookbackMinutes * 60 * 1000;
}
