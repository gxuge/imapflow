import type { Env } from '../types';

export function assertAdminAuth(request: Request, env: Env): Response | null {
  if (!env.ADMIN_TOKEN?.trim()) {
    return jsonError('missing_admin_token_env', 500, request, env);
  }
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return jsonError('unauthorized', 401, request, env);
  if (auth.slice(7).trim() !== env.ADMIN_TOKEN.trim()) return jsonError('unauthorized', 401, request, env);
  return null;
}

export function json(data: unknown, status: number, request: Request, env: Env): Response {
  return withCors(
    new Response(JSON.stringify(data), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff'
      }
    }),
    request,
    env
  );
}

export function jsonError(error: string, status: number, request: Request, env: Env): Response {
  return json({ ok: false, error }, status, request, env);
}

export function withCors(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  const reqOrigin = request.headers.get('origin') || '';
  const allowedSingle = env.ALLOWED_ORIGIN?.trim() || '';
  const allowedMulti = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

  const allowed = [allowedSingle, ...allowedMulti].filter(Boolean);
  if (reqOrigin && isAllowedOrigin(reqOrigin, allowed)) {
    headers.set('access-control-allow-origin', reqOrigin);
    headers.set('vary', 'origin');
  }

  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'Authorization,Content-Type,X-Access-Token');
  headers.set('access-control-max-age', '600');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function isAllowedOrigin(origin: string, allowlist: string[]): boolean {
  for (const item of allowlist) {
    if (item === origin) return true;
    // 支持通配配置：例如 https://*.pages.dev
    if (item.includes('*')) {
      const escaped = item.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      const re = new RegExp(`^${escaped}$`);
      if (re.test(origin)) return true;
    }
  }
  return false;
}
