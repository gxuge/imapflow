/**
 * Pages Functions 反向代理：
 * - 前端只访问同域 /api/*
 * - 实际后端地址保存在 Pages 变量 BACKEND_ORIGIN 中
 * - 仅允许转发到 /api/public/*，避免变成开放代理
 */
export async function onRequest(context) {
  const { request, env, params } = context;
  const backendOrigin = normalizeOrigin(env.BACKEND_ORIGIN || '');
  if (!backendOrigin) {
    return json({ ok: false, error: 'missing_backend_origin' }, 500);
  }

  const routePath = toRoutePath(params.path);
  if (!routePath.startsWith('public/')) {
    return json({ ok: false, error: 'forbidden_route' }, 403);
  }

  const reqUrl = new URL(request.url);
  const upstreamUrl = `${backendOrigin}/api/${routePath}${reqUrl.search}`;
  const method = request.method.toUpperCase();

  const upstreamHeaders = new Headers();
  for (const [k, v] of request.headers.entries()) {
    const key = k.toLowerCase();
    if (key === 'content-type' || key === 'x-access-token' || key === 'accept') {
      upstreamHeaders.set(k, v);
    }
  }
  upstreamHeaders.set('x-forwarded-by', 'cf-pages-function-proxy');

  const upstreamResp = await fetch(upstreamUrl, {
    method,
    headers: upstreamHeaders,
    body: method === 'GET' || method === 'HEAD' ? undefined : request.body
  }).catch(() => null);

  if (!upstreamResp) {
    return json({ ok: false, error: 'upstream_unreachable' }, 502);
  }

  const respHeaders = new Headers(upstreamResp.headers);
  respHeaders.set('cache-control', 'no-store');
  respHeaders.delete('access-control-allow-origin');
  respHeaders.delete('access-control-allow-methods');
  respHeaders.delete('access-control-allow-headers');
  respHeaders.delete('access-control-max-age');

  return new Response(upstreamResp.body, {
    status: upstreamResp.status,
    statusText: upstreamResp.statusText,
    headers: respHeaders
  });
}

function toRoutePath(pathParam) {
  if (Array.isArray(pathParam)) {
    return pathParam.filter(Boolean).join('/');
  }
  return String(pathParam || '').replace(/^\/+/, '');
}

function normalizeOrigin(v) {
  return String(v || '').trim().replace(/\/+$/, '');
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

