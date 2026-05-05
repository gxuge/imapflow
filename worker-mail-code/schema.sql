PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias_email TEXT UNIQUE NOT NULL,
  label TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS code_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT UNIQUE NOT NULL,
  alias_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'found', 'expired', 'cancelled')),
  code TEXT,
  from_email TEXT,
  subject TEXT,
  message_id TEXT,
  email_received_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT UNIQUE,
  imap_uid TEXT,
  from_email TEXT,
  to_email TEXT,
  delivered_to TEXT,
  subject TEXT,
  text_body TEXT,
  html_body TEXT,
  extracted_code TEXT,
  received_at TEXT,
  processed_at TEXT NOT NULL,
  raw_headers_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS processed_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_key TEXT UNIQUE NOT NULL,
  processed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  scanned_count INTEGER DEFAULT 0,
  processed_count INTEGER DEFAULT 0,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  request_id TEXT,
  alias_email TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public_request_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT UNIQUE NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket_key TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_aliases_alias_email ON aliases(alias_email);
CREATE INDEX IF NOT EXISTS idx_code_requests_request_id ON code_requests(request_id);
CREATE INDEX IF NOT EXISTS idx_code_requests_alias_status ON code_requests(alias_email, status);
CREATE INDEX IF NOT EXISTS idx_code_requests_expires_at ON code_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);
CREATE INDEX IF NOT EXISTS idx_emails_to_email ON emails(to_email);
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at);
CREATE INDEX IF NOT EXISTS idx_processed_messages_message_key ON processed_messages(message_key);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_created ON webhook_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_public_request_access_request_id ON public_request_access(request_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_bucket_window ON rate_limits(bucket_key, window_start);
