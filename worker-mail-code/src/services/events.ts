import type { Env } from '../types';
import { safeTrim } from '../utils/common';

/**
 * 统一记录业务事件到 D1，便于排障和审计。
 * 注意：payload 不应包含邮箱密码或验证码明文。
 */
export async function logEvent(
  env: Env,
  eventType: string,
  requestId: string | null,
  aliasEmail: string | null,
  payload: unknown
): Promise<void> {
  const payloadJson = JSON.stringify(payload ?? {});
  await env.DB.prepare(
    `INSERT INTO webhook_events (event_type, request_id, alias_email, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(eventType, requestId, aliasEmail, safeTrim(payloadJson, 2000), new Date().toISOString())
    .run();
}
