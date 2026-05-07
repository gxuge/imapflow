import { safeTrim } from './common';

type LogLevel = 'info' | 'warn' | 'error';

type LogFields = Record<string, unknown>;

/**
 * 输出结构化日志，便于在 Workers 日志中检索。
 * 注意：调用方不要传入密码、验证码明文、完整邮件正文。
 */
export function logInfo(event: string, fields: LogFields = {}): void {
  writeLog('info', event, fields);
}

export function logWarn(event: string, fields: LogFields = {}): void {
  writeLog('warn', event, fields);
}

export function logError(event: string, fields: LogFields = {}): void {
  writeLog('error', event, fields);
}

/**
 * 邮箱脱敏：保留前 2 位和完整域名。
 * 例如：abcde@example.com -> ab***@example.com
 */
export function maskEmail(email?: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain) return '***';
  const keep = local.slice(0, 2);
  return `${keep}${local.length > 2 ? '***' : '*'}@${domain}`;
}

function writeLog(level: LogLevel, event: string, fields: LogFields): void {
  const sanitizedFields = sanitizeFields(fields);
  const errorText =
    typeof sanitizedFields.error === 'string' && sanitizedFields.error
      ? ` (${safeTrim(sanitizedFields.error, 120)})`
      : '';
  const payload = {
    message: `${event}${errorText}`,
    event,
    ts: new Date().toISOString(),
    ...sanitizedFields
  };
  if (level === 'error') {
    console.error(payload);
    return;
  }
  if (level === 'warn') {
    console.warn(payload);
    return;
  }
  console.info(payload);
}

function sanitizeFields(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (typeof v === 'string') {
      out[k] = safeTrim(v, 300);
      continue;
    }
    out[k] = v;
  }
  return out;
}
