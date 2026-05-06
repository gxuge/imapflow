import { DEFAULT_TTL_SECONDS, MAX_TTL_SECONDS, MIN_TTL_SECONDS } from '../constants';
import { runDailyCleanup } from '../services/cleanup';
import { logEvent } from '../services/events';
import { ensureAlias, pollMailbox } from '../services/poll';
import {
  createPublicAccess,
  enforceCreateRateLimit,
  generateAccessToken,
  isPublicAppEnabled,
  verifyPublicAccess
} from '../services/public-security';
import type { Env } from '../types';
import { clampInt, isValidEmail, normalizeAliasEmail, safeReadJson } from '../utils/common';
import { assertAdminAuth, json, jsonError } from '../utils/http';

/**
 * API 路由分发：
 * - /api/public/* 用于前端用户接码，不需要 ADMIN_TOKEN
 * - 其他 /api/* 视为管理接口，必须 ADMIN_TOKEN
 */
export async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (url.pathname === '/health' && method === 'GET') {
    return json({ ok: true, time: new Date().toISOString() }, 200, request, env);
  }

  if (url.pathname.startsWith('/api/public/')) {
    return handlePublicApi(url, request, env);
  }

  if (url.pathname.startsWith('/api/')) {
    const authErr = assertAdminAuth(request, env);
    if (authErr) return authErr;
  }

  if (url.pathname === '/api/requests' && method === 'POST') {
    return handleCreateRequest(request, env);
  }

  const reqMatch = url.pathname.match(/^\/api\/requests\/([^/]+)$/);
  if (reqMatch && method === 'GET') {
    return handleGetRequest(reqMatch[1], request, env);
  }

  const aliasMatch = url.pathname.match(/^\/api\/aliases\/([^/]+)\/latest$/);
  if (aliasMatch && method === 'GET') {
    return handleAliasLatest(aliasMatch[1], request, env);
  }

  if (url.pathname === '/api/emails/recent' && method === 'GET') {
    return handleRecentEmails(url, request, env);
  }

  if (url.pathname === '/api/poll-now' && method === 'POST') {
    const result = await pollMailbox(env, 'manual');
    return json(result, result.ok ? 200 : 500, request, env);
  }

  if (url.pathname === '/api/cleanup' && method === 'POST') {
    const cleanup = await runDailyCleanup(env, true);
    return json({ ok: true, cleanup }, 200, request, env);
  }

  return jsonError('not_found', 404, request, env);
}

async function handlePublicApi(url: URL, request: Request, env: Env): Promise<Response> {
  const method = request.method.toUpperCase();
  if (!isPublicAppEnabled(env)) {
    return jsonError('public_app_disabled', 403, request, env);
  }

  if (url.pathname === '/api/public/requests' && method === 'POST') {
    return handlePublicCreateRequest(request, env);
  }

  if (url.pathname === '/api/public/connection-test' && method === 'GET') {
    return handlePublicConnectionTest(request, env);
  }

  const match = url.pathname.match(/^\/api\/public\/requests\/([^/]+)$/);
  if (match && method === 'GET') {
    return handlePublicGetRequest(match[1], url, request, env);
  }

  return jsonError('not_found', 404, request, env);
}

/**
 * 公开连接测试：
 * - 验证前端是否能跨域访问 Worker
 * - 验证 D1 是否可读
 * - 验证 IMAP 关键配置是否已填写（不返回明文）
 */
async function handlePublicConnectionTest(request: Request, env: Env): Promise<Response> {
  const dbRow = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>().catch(() => null);
  const dbReady = Number(dbRow?.ok ?? 0) === 1;

  const imapConfigReady = Boolean(
    env.IMAP_HOST?.trim() &&
      env.IMAP_PORT?.trim() &&
      env.IMAP_USER?.trim() &&
      env.IMAP_PASS?.trim()
  );

  return json(
    {
      ok: true,
      workerTime: new Date().toISOString(),
      publicAppEnabled: isPublicAppEnabled(env),
      dbReady,
      imapConfigReady,
      message: dbReady && imapConfigReady ? 'connection_ok' : 'config_incomplete'
    },
    200,
    request,
    env
  );
}

/**
 * 管理接口：创建接码任务（需要 ADMIN_TOKEN）。
 */
async function handleCreateRequest(request: Request, env: Env): Promise<Response> {
  const body = await safeReadJson(request);
  const aliasEmail = normalizeAliasEmail(String(body?.aliasEmail ?? ''));
  if (!aliasEmail || !isValidEmail(aliasEmail)) {
    return jsonError('invalid_alias_email', 400, request, env);
  }

  const ttlInput = Number(body?.ttlSeconds ?? env.CODE_EXPIRE_SECONDS ?? DEFAULT_TTL_SECONDS);
  const ttlSeconds = clampInt(ttlInput, MIN_TTL_SECONDS, MAX_TTL_SECONDS);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
  const requestId = `req_${crypto.randomUUID().replace(/-/g, '')}`;

  await ensureAlias(env, aliasEmail, true);
  await env.DB.prepare(
    `INSERT INTO code_requests
    (request_id, alias_email, status, expires_at, created_at, updated_at)
    VALUES (?, ?, 'pending', ?, ?, ?)`
  )
    .bind(requestId, aliasEmail, expiresAt, nowIso, nowIso)
    .run();

  await logEvent(env, 'request_created', requestId, aliasEmail, { ttlSeconds, expiresAt });
  return json({ ok: true, requestId, status: 'pending', aliasEmail, expiresAt }, 200, request, env);
}

/**
 * 公开接口：用户从页面创建接码任务。
 * 安全策略：
 * 1) IP 限流
 * 2) 返回一次性 accessToken，仅用于查询当前 requestId
 * 3) 不暴露 ADMIN_TOKEN
 */
async function handlePublicCreateRequest(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('cf-connecting-ip');
  const passLimit = await enforceCreateRateLimit(env, ip);
  if (!passLimit) {
    return jsonError('rate_limited', 429, request, env);
  }

  const body = await safeReadJson(request);
  const aliasEmail = normalizeAliasEmail(String(body?.aliasEmail ?? ''));
  if (!aliasEmail || !isValidEmail(aliasEmail)) {
    return jsonError('invalid_alias_email', 400, request, env);
  }

  const alias = await env.DB.prepare('SELECT enabled FROM aliases WHERE alias_email = ? LIMIT 1')
    .bind(aliasEmail)
    .first<{ enabled: number }>();

  const autoCreateAlias = (env.AUTO_CREATE_ALIAS ?? 'true').toLowerCase() !== 'false';
  if (!alias && !autoCreateAlias) {
    return jsonError('alias_not_allowed', 403, request, env);
  }
  if (alias && Number(alias.enabled) !== 1) {
    return jsonError('alias_disabled', 403, request, env);
  }
  if (!alias && autoCreateAlias) {
    await ensureAlias(env, aliasEmail, true);
  }

  // 前端公开任务固定 1 小时过期。
  const ttlSeconds = clampInt(Number(env.CODE_EXPIRE_SECONDS ?? DEFAULT_TTL_SECONDS), 300, MAX_TTL_SECONDS);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
  const requestId = `req_${crypto.randomUUID().replace(/-/g, '')}`;
  const accessToken = generateAccessToken();

  await env.DB.prepare(
    `INSERT INTO code_requests
    (request_id, alias_email, status, expires_at, created_at, updated_at)
    VALUES (?, ?, 'pending', ?, ?, ?)`
  )
    .bind(requestId, aliasEmail, expiresAt, nowIso, nowIso)
    .run();
  await createPublicAccess(env, requestId, accessToken, expiresAt);

  await logEvent(env, 'public_request_created', requestId, aliasEmail, {
    ip: ip ? '[redacted]' : 'unknown',
    ttlSeconds
  });

  return json(
    {
      ok: true,
      requestId,
      accessToken,
      status: 'pending',
      aliasEmail,
      expiresAt,
      pollIntervalMs: 5000
    },
    200,
    request,
    env
  );
}

/**
 * 公开接口：查询接码任务状态，必须提供 accessToken。
 */
async function handlePublicGetRequest(
  requestId: string,
  _url: URL,
  request: Request,
  env: Env
): Promise<Response> {
  const accessToken = (request.headers.get('x-access-token') ?? '').trim();
  if (!accessToken) return jsonError('missing_access_token', 401, request, env);

  const pass = await verifyPublicAccess(env, requestId, accessToken);
  if (!pass) return jsonError('unauthorized', 401, request, env);

  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE code_requests
     SET status = 'expired', updated_at = ?
     WHERE request_id = ? AND status = 'pending' AND expires_at <= ?`
  )
    .bind(nowIso, requestId, nowIso)
    .run();

  const row = await env.DB.prepare(
    `SELECT request_id, alias_email, status, code, from_email, subject, email_received_at, expires_at
     FROM code_requests WHERE request_id = ? LIMIT 1`
  )
    .bind(requestId)
    .first<{
      request_id: string;
      alias_email: string;
      status: string;
      code: string | null;
      from_email: string | null;
      subject: string | null;
      email_received_at: string | null;
      expires_at: string;
    }>();
  if (!row) return jsonError('request_not_found', 404, request, env);

  return json(
    {
      ok: true,
      requestId: row.request_id,
      status: row.status,
      code: row.status === 'found' ? row.code : null,
      aliasEmail: row.alias_email,
      fromEmail: row.from_email,
      subject: row.subject,
      receivedAt: row.email_received_at,
      expiresAt: row.expires_at
    },
    200,
    request,
    env
  );
}

async function handleGetRequest(requestId: string, request: Request, env: Env): Promise<Response> {
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE code_requests
     SET status = 'expired', updated_at = ?
     WHERE request_id = ? AND status = 'pending' AND expires_at <= ?`
  )
    .bind(nowIso, requestId, nowIso)
    .run();

  const row = await env.DB.prepare(
    `SELECT request_id, alias_email, status, code, from_email, subject, email_received_at, expires_at
     FROM code_requests WHERE request_id = ? LIMIT 1`
  )
    .bind(requestId)
    .first<{
      request_id: string;
      alias_email: string;
      status: string;
      code: string | null;
      from_email: string | null;
      subject: string | null;
      email_received_at: string | null;
      expires_at: string;
    }>();

  if (!row) return jsonError('request_not_found', 404, request, env);
  await logEvent(env, 'request_queried', row.request_id, row.alias_email, { status: row.status });

  return json(
    {
      ok: true,
      requestId: row.request_id,
      status: row.status,
      code: row.status === 'found' ? row.code : null,
      aliasEmail: row.alias_email,
      fromEmail: row.from_email,
      subject: row.subject,
      receivedAt: row.email_received_at,
      expiresAt: row.expires_at
    },
    200,
    request,
    env
  );
}

async function handleAliasLatest(
  aliasParam: string,
  request: Request,
  env: Env
): Promise<Response> {
  const aliasEmail = normalizeAliasEmail(decodeURIComponent(aliasParam));
  if (!aliasEmail || !isValidEmail(aliasEmail)) return jsonError('invalid_alias_email', 400, request, env);

  const row = await env.DB.prepare(
    `SELECT request_id, alias_email, status, code, from_email, subject, email_received_at, expires_at
     FROM code_requests WHERE alias_email = ?
     ORDER BY updated_at DESC LIMIT 1`
  )
    .bind(aliasEmail)
    .first<{
      request_id: string;
      alias_email: string;
      status: string;
      code: string | null;
      from_email: string | null;
      subject: string | null;
      email_received_at: string | null;
      expires_at: string;
    }>();

  if (!row) return jsonError('no_request_for_alias', 404, request, env);
  return json(
    {
      ok: true,
      requestId: row.request_id,
      status: row.status,
      code: row.status === 'found' ? row.code : null,
      aliasEmail: row.alias_email,
      fromEmail: row.from_email,
      subject: row.subject,
      receivedAt: row.email_received_at,
      expiresAt: row.expires_at
    },
    200,
    request,
    env
  );
}

async function handleRecentEmails(url: URL, request: Request, env: Env): Promise<Response> {
  const includeBody = (url.searchParams.get('includeBody') ?? 'false').toLowerCase() === 'true';
  const includeDebug = (url.searchParams.get('includeDebug') ?? 'false').toLowerCase() === 'true';
  const limit = clampInt(Number(url.searchParams.get('limit') ?? 20), 1, 100);

  const sql = includeBody
    ? `SELECT id, message_id, imap_uid, from_email, to_email, delivered_to, subject, text_body, html_body,
              extracted_code, received_at, processed_at, created_at,
              ${includeDebug ? 'raw_headers_json' : 'NULL AS raw_headers_json'}
       FROM emails ORDER BY created_at DESC LIMIT ?`
    : `SELECT id, message_id, imap_uid, from_email, to_email, delivered_to, subject,
              extracted_code, received_at, processed_at, created_at,
              ${includeDebug ? 'raw_headers_json' : 'NULL AS raw_headers_json'}
       FROM emails ORDER BY created_at DESC LIMIT ?`;

  const rows = await env.DB.prepare(sql).bind(limit).all();
  return json({ ok: true, count: rows.results?.length ?? 0, items: rows.results ?? [] }, 200, request, env);
}
