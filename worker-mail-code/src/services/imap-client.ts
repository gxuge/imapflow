import { connect } from 'cloudflare:sockets';
import { escapeRegExp, imapQuote } from '../utils/common';

export class SimpleImapClient {
  private readonly host: string;
  private readonly port: number;
  private readonly user: string;
  private readonly pass: string;
  private readonly tls: boolean;
  private socket: Socket | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readonly decoder = new TextDecoder('latin1');
  private readonly encoder = new TextEncoder();
  private buffer = '';
  private tagCounter = 0;

  constructor(cfg: { host: string; port: number; user: string; pass: string; tls: boolean }) {
    this.host = cfg.host;
    this.port = cfg.port;
    this.user = cfg.user;
    this.pass = cfg.pass;
    this.tls = cfg.tls;
  }

  /**
   * 建立 IMAP 短连接并完成登录。
   * 这里采用最小命令集，兼容性不足时可替换为外部轮询服务。
   */
  async connectAndLogin(): Promise<void> {
    const secureTransport: 'on' | 'off' = this.tls ? 'on' : 'off';
    this.socket = connect(
      { hostname: this.host, port: this.port },
      { secureTransport, allowHalfOpen: false }
    );
    this.reader = this.socket.readable.getReader();
    this.writer = this.socket.writable.getWriter();

    const greeting = await this.readLine();
    if (!greeting.toUpperCase().startsWith('* OK')) throw new Error('imap_greeting_not_ok');

    const login = await this.command(`LOGIN ${imapQuote(this.user)} ${imapQuote(this.pass)}`);
    if (!login.ok) throw new Error('imap_login_failed');

    const select = await this.command('SELECT INBOX');
    if (!select.ok) throw new Error('imap_select_inbox_failed');
  }

  async command(cmd: string): Promise<{ ok: boolean; raw: string }> {
    if (!this.writer) throw new Error('imap_not_connected');
    const tag = `A${String(++this.tagCounter).padStart(4, '0')}`;
    await this.writer.write(this.encoder.encode(`${tag} ${cmd}\r\n`));
    const raw = await this.readUntilTagged(tag);
    const tagged = findTaggedLine(raw, tag);
    const status = tagged.split(' ')[1]?.toUpperCase() || 'BAD';
    return { ok: status === 'OK', raw };
  }

  async logout(): Promise<void> {
    try {
      if (this.writer) await this.command('LOGOUT');
    } catch {
      // ignore
    }
    try {
      await this.writer?.close();
    } catch {
      // ignore
    }
    this.reader?.releaseLock();
    this.writer?.releaseLock();
    this.reader = null;
    this.writer = null;
    this.socket = null;
    this.buffer = '';
  }

  private async readUntilTagged(tag: string): Promise<string> {
    while (true) {
      const i0 = this.buffer.startsWith(`${tag} `) ? 0 : this.buffer.indexOf(`\r\n${tag} `);
      const start = i0 >= 0 ? (i0 === 0 ? 0 : i0 + 2) : -1;
      if (start >= 0) {
        const end = this.buffer.indexOf('\r\n', start);
        if (end >= 0) {
          const take = end + 2;
          const out = this.buffer.slice(0, take);
          this.buffer = this.buffer.slice(take);
          return out;
        }
      }
      if (!(await this.readMore())) throw new Error('imap_connection_closed');
    }
  }

  private async readLine(): Promise<string> {
    while (true) {
      const idx = this.buffer.indexOf('\r\n');
      if (idx >= 0) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 2);
        return line;
      }
      if (!(await this.readMore())) throw new Error('imap_connection_closed_before_line');
    }
  }

  private async readMore(): Promise<boolean> {
    if (!this.reader) throw new Error('imap_not_connected');
    const { value, done } = await this.reader.read();
    if (done) return false;
    this.buffer += this.decoder.decode(value, { stream: true });
    return true;
  }
}

export function parseSearchUids(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split(/\r\n/)) {
    const m = line.match(/^\*\s+SEARCH\s*(.*)$/i);
    if (!m) continue;
    const parts = m[1].trim().split(/\s+/).filter(Boolean);
    for (const p of parts) if (/^\d+$/.test(p)) out.push(p);
  }
  return out;
}

export function extractLiteral(raw: string, token: string): string | null {
  const re = new RegExp(`${escapeRegExp(token)}\\s+\\{(\\d+)\\}\\r\\n`, 'i');
  const m = re.exec(raw);
  if (!m || m.index === undefined) return null;
  const size = Number(m[1]);
  const start = m.index + m[0].length;
  return raw.slice(start, start + size);
}

function findTaggedLine(raw: string, tag: string): string {
  const lines = raw.split(/\r\n/).filter(Boolean).reverse();
  for (const line of lines) if (line.startsWith(`${tag} `)) return line;
  return `${tag} BAD unknown`;
}

