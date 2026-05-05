import type { Env } from '../types';
import { clampInt, mustGetEnv, safeTrim } from '../utils/common';

const DEFAULT_CREATE_LIMIT_PER_10_MIN = 10;

/**
 * 生成公开查询用的临时访问令牌（只返回一次给前端）。
 */
export function generateAccessToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/**
 * 校验公开页面是否启用，默认关闭。
 */
export function isPublicAppEnabled(env: Env): boolean {
  const value = (env.PUBLIC_APP_ENABLED ?? 'false').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(value);
}

export async function createPublicAccess(
  env: Env,
  requestId: string,
  rawToken: string,
  expiresAt: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  const tokenHash = await hashToken(env, rawToken);
  await env.DB.prepare(
    `INSERT INTO public_request_access (request_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?)`
  )
    .bind(requestId, tokenHash, expiresAt, nowIso)
    .run();
}

export async function verifyPublicAccess(
  env: Env,
  requestId: string,
  rawToken: string
): Promise<boolean> {
  if (!rawToken || rawToken.length < 16) return false;
  const tokenHash = await hashToken(env, rawToken);
  const nowIso = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT id FROM public_request_access
     WHERE request_id = ? AND token_hash = ? AND expires_at > ?
     LIMIT 1`
  )
    .bind(requestId, tokenHash, nowIso)
    .first<{ id: number }>();
  return !!row;
}

/**
 * 简单 IP 限流：每 10 分钟每个 IP 最多创建 N 次任务。
 */
export async function enforceCreateRateLimit(env: Env, ip: string | null): Promise<boolean> {
  const safeIp = safeTrim((ip ?? 'unknown').trim(), 80);
  const limit = clampInt(Number(env.PUBLIC_CREATE_LIMIT_PER_10M ?? DEFAULT_CREATE_LIMIT_PER_10_MIN), 1, 100);
  const windowStart = getTenMinuteWindowStart(new Date());
  const nowIso = new Date().toISOString();
  const bucketKey = `create:${safeIp}`;

  await env.DB.prepare(
    `INSERT INTO rate_limits (bucket_key, window_start, count, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(bucket_key, window_start)
     DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`
  )
    .bind(bucketKey, windowStart, nowIso, nowIso)
    .run();

  const row = await env.DB.prepare(
    `SELECT count FROM rate_limits WHERE bucket_key = ? AND window_start = ? LIMIT 1`
  )
    .bind(bucketKey, windowStart)
    .first<{ count: number }>();

  return Number(row?.count ?? 0) <= limit;
}

async function hashToken(env: Env, rawToken: string): Promise<string> {
  const pepper = (env.WEBHOOK_SECRET || env.ADMIN_TOKEN || '').trim();
  mustGetEnv(pepper, 'WEBHOOK_SECRET_or_ADMIN_TOKEN');
  const payload = new TextEncoder().encode(`${rawToken}:${pepper}`);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return bytesToHex(new Uint8Array(digest));
}

function getTenMinuteWindowStart(date: Date): string {
  const d = new Date(date);
  d.setUTCSeconds(0, 0);
  const m = d.getUTCMinutes();
  d.setUTCMinutes(m - (m % 10));
  return d.toISOString();
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map(v => v.toString(16).padStart(2, '0')).join('');
}

