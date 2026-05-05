import PostalMime from 'postal-mime';
import type { ParsedMail } from '../types';
import {
  cleanupMessageId,
  firstAddressFromHeader,
  normalizeDate,
  normalizeAliasEmail,
  safeTrim
} from '../utils/common';
import { extractLiteral } from './imap-client';

/**
 * 从 IMAP FETCH 原始响应解析出业务需要的字段。
 * 为了兼容不同邮件服务商，收件地址会按多个头部兜底提取。
 */
export async function parseMailFromFetch(rawFetch: string, uid: string): Promise<ParsedMail> {
  const headerRaw = extractLiteral(rawFetch, 'RFC822.HEADER') ?? '';
  const bodyRaw = extractLiteral(rawFetch, 'BODY[TEXT]') ?? '';
  const parser = new PostalMime();
  const parsed = await parser.parse(`${headerRaw}\r\n${bodyRaw}`);
  const headers = parseHeaders(headerRaw);

  const subject = safeTrim(parsed.subject || headers.subject || '', 1000);
  const fromEmail = firstAddressFromHeader(headers.from) || null;
  const toEmail = firstAddressFromHeader(headers.to) || null;
  const deliveredTo =
    firstAddressFromHeader(headers['delivered-to']) ||
    firstAddressFromHeader(headers['x-original-to']) ||
    firstAddressFromHeader(headers['envelope-to']) ||
    toEmail;

  const messageId = cleanupMessageId(headers['message-id']);
  const receivedAt = normalizeDate(extractInternalDate(rawFetch) || headers.date || new Date().toISOString());
  const textBody = typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text : safeTrim(bodyRaw, 100000);
  const htmlBody = typeof parsed.html === 'string' ? parsed.html : '';

  return {
    uid,
    messageId,
    fromEmail,
    toEmail,
    deliveredTo,
    subject,
    textBody,
    htmlBody,
    receivedAt,
    rawHeaders: headers
  };
}

export function pickTargetAlias(
  headers: Record<string, string>,
  toEmail: string | null,
  deliveredTo: string | null
): string | null {
  const candidates = [
    deliveredTo,
    headers['delivered-to'],
    headers['x-original-to'],
    headers['envelope-to'],
    toEmail,
    headers.to,
    headers.cc
  ];

  for (const c of candidates) {
    const email = firstAddressFromHeader(c || '');
    if (email) return normalizeAliasEmail(email);
  }
  return null;
}

function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  let k = '';
  let v = '';
  const flush = () => {
    if (!k) return;
    out[k.toLowerCase()] = safeTrim(v, 4000);
    k = '';
    v = '';
  };
  for (const line of raw.split(/\r\n/)) {
    if (!line) {
      flush();
      continue;
    }
    if (/^[ \t]/.test(line) && k) {
      v += ` ${line.trim()}`;
      continue;
    }
    flush();
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    k = line.slice(0, idx).trim();
    v = line.slice(idx + 1).trim();
  }
  flush();
  return out;
}

function extractInternalDate(raw: string): string | null {
  const m = raw.match(/INTERNALDATE\s+"([^"]+)"/i);
  return m ? m[1] : null;
}

