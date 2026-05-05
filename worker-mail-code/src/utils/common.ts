import { EMAIL_REGEX } from '../constants';
import type { ParsedMail } from '../types';

export function normalizeAliasEmail(v: string): string {
  return v.trim().toLowerCase();
}

export function isValidEmail(v: string): boolean {
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(v);
}

export function mustGetEnv(v: string | undefined, key: string): string {
  if (!v?.trim()) throw new Error(`missing_env_${key}`);
  return v.trim();
}

export function readBool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === null || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

export function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

export function formatImapDate(d: Date): string {
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getUTCMonth()
  ];
  return `${d.getUTCDate()}-${mon}-${d.getUTCFullYear()}`;
}

export function cleanupMessageId(v?: string | null): string | null {
  if (!v) return null;
  const cleaned = v.replace(/[<>]/g, '').trim();
  return cleaned || null;
}

export function normalizeDate(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function summarizeText(v: string): string | null {
  if (!v) return null;
  const cleaned = v.replace(/\s+/g, ' ').trim();
  return cleaned ? safeTrim(cleaned, 300) : null;
}

export function trimForStorage(v: string, n: number): string | null {
  if (!v) return null;
  return safeTrim(v, n);
}

export function safeTrim(v: string, n: number): string {
  return v.length <= n ? v : v.slice(0, n);
}

export function imapQuote(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function escapeRegExp(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function safeReadJson(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export function firstAddressFromHeader(value?: string | null): string | null {
  if (!value) return null;
  const m = value.match(EMAIL_REGEX);
  if (!m?.length) return null;
  return normalizeAliasEmail(m[0]);
}

export async function buildMessageKey(mail: ParsedMail): Promise<string> {
  if (mail.messageId) return `mid:${mail.messageId.toLowerCase()}`;
  const base = `${mail.uid}|${mail.receivedAt}|${mail.subject}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base));
  const hex = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
  return `uid:${mail.uid}:${hex.slice(0, 24)}`;
}

