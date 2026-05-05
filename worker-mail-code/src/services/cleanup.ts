import type { Env } from '../types';
import { logEvent } from './events';

export interface CleanupResult {
  ran: boolean;
  clearedCodeCount: number;
  ranAt: string;
}

/**
 * 每天执行一次的验证码清理：
 * - 只清空已过期任务的 code 字段
 * - 不删除任务记录，保留审计链路
 */
export async function runDailyCleanup(env: Env, force: boolean): Promise<CleanupResult> {
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  if (!force) {
    const lastRun = await env.DB.prepare(
      `SELECT created_at FROM webhook_events
       WHERE event_type = 'cleanup_run'
       ORDER BY created_at DESC LIMIT 1`
    ).first<{ created_at: string }>();
    if (lastRun?.created_at?.slice(0, 10) === today) {
      return { ran: false, clearedCodeCount: 0, ranAt: nowIso };
    }
  }

  const update = await env.DB.prepare(
    `UPDATE code_requests
     SET code = NULL, updated_at = ?
     WHERE code IS NOT NULL AND (status = 'expired' OR expires_at <= ?)`
  )
    .bind(nowIso, nowIso)
    .run();

  const clearedCodeCount = Number(update.meta.changes ?? 0);
  await logEvent(env, 'cleanup_run', null, null, { clearedCodeCount });

  return { ran: true, clearedCodeCount, ranAt: nowIso };
}

