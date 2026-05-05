export interface Env {
  DB: D1Database;
  IMAP_HOST: string;
  IMAP_PORT: string;
  IMAP_USER: string;
  IMAP_PASS: string;
  IMAP_TLS?: string;
  WEBHOOK_SECRET?: string;
  ADMIN_TOKEN: string;
  POLL_LOOKBACK_MINUTES?: string;
  MAX_EMAILS_PER_POLL?: string;
  AUTO_CREATE_ALIAS?: string;
  STORE_BODY?: string;
  ALLOWED_ORIGIN?: string;
  ALLOWED_ORIGINS?: string;
  CODE_EXPIRE_SECONDS?: string;
  PUBLIC_APP_ENABLED?: string;
  PUBLIC_CREATE_LIMIT_PER_10M?: string;
}

export interface PollResult {
  ok: boolean;
  scannedCount: number;
  processedCount: number;
  runId?: number;
  error?: string;
}

export interface ParsedMail {
  uid: string;
  messageId: string | null;
  fromEmail: string | null;
  toEmail: string | null;
  deliveredTo: string | null;
  subject: string;
  textBody: string;
  htmlBody: string;
  receivedAt: string;
  rawHeaders: Record<string, string>;
}
