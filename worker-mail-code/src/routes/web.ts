import type { Env } from '../types';
import { isPublicAppEnabled } from '../services/public-security';

/**
 * 返回用户接码页面。该页面只调用 /api/public/* 接口，不接触 ADMIN_TOKEN。
 */
export async function handleWeb(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method.toUpperCase() !== 'GET') return null;
  if (url.pathname !== '/' && url.pathname !== '/ui') return null;

  if (!isPublicAppEnabled(env)) {
    return new Response('Public app disabled', { status: 403 });
  }

  const nonce = genNonce();
  const html = renderHtml(nonce);
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'geolocation=(), microphone=(), camera=()',
    'content-security-policy': [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      "img-src 'self' data:",
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'"
    ].join('; ')
  });
  return new Response(html, { status: 200, headers });
}

function renderHtml(nonce: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>邮箱接码</title>
  <style nonce="${nonce}">
    :root {
      --bg: #f6f7f9;
      --panel: #ffffff;
      --ink: #1c2024;
      --muted: #56606f;
      --line: #d8dee7;
      --brand: #0d5bd7;
      --ok: #1f8f4f;
      --warn: #a65a00;
      --bad: #a10f2b;
      --radius: 14px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      background: radial-gradient(circle at 20% 20%, #fefefe 0%, #eef3fa 45%, #e8edf5 100%);
      color: var(--ink);
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: min(680px, 100%);
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: 0 14px 40px rgba(12, 28, 49, 0.10);
      overflow: hidden;
    }
    .head {
      padding: 22px 24px;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(120deg, #f7fbff 0%, #edf4ff 100%);
    }
    .title { margin: 0 0 6px; font-size: 22px; font-weight: 700; }
    .desc { margin: 0; color: var(--muted); font-size: 14px; }
    .body { padding: 20px 24px 24px; display: grid; gap: 14px; }
    label { font-size: 13px; color: var(--muted); }
    input {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px 14px;
      font-size: 15px;
      outline: none;
      background: #fff;
    }
    input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(13, 91, 215, 0.12); }
    .row { display: flex; gap: 10px; align-items: center; }
    button {
      border: 0;
      border-radius: 10px;
      padding: 11px 16px;
      color: #fff;
      background: var(--brand);
      cursor: pointer;
      font-weight: 600;
      transition: transform .12s ease, opacity .12s ease;
    }
    button:disabled { opacity: .6; cursor: not-allowed; }
    button:active { transform: translateY(1px); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .panel {
      border: 1px dashed var(--line);
      border-radius: 10px;
      padding: 14px;
      background: #fbfdff;
      display: grid;
      gap: 8px;
    }
    .kv { display: grid; grid-template-columns: 126px 1fr; gap: 10px; font-size: 14px; }
    .k { color: var(--muted); }
    .status-pending { color: var(--warn); }
    .status-found { color: var(--ok); }
    .status-expired, .status-cancelled { color: var(--bad); }
    .foot { color: var(--muted); font-size: 12px; line-height: 1.6; }
  </style>
</head>
<body>
  <main class="card">
    <section class="head">
      <h1 class="title">邮箱验证码接收</h1>
      <p class="desc">输入你的邮箱地址，系统会自动创建 1 小时有效的接码任务并轮询结果。</p>
    </section>
    <section class="body">
      <label for="aliasEmail">邮箱地址（示例：main_openai@2925.com）</label>
      <div class="row">
        <input id="aliasEmail" type="email" placeholder="请输入邮箱地址" maxlength="120" autocomplete="off" />
        <button id="startBtn" type="button">开始接码</button>
      </div>
      <div class="panel">
        <div class="kv"><div class="k">任务 ID</div><div id="requestId" class="mono">-</div></div>
        <div class="kv"><div class="k">任务状态</div><div id="statusText">-</div></div>
        <div class="kv"><div class="k">验证码</div><div id="codeText" class="mono">-</div></div>
        <div class="kv"><div class="k">过期时间</div><div id="expiresAt">-</div></div>
        <div class="kv"><div class="k">最新提示</div><div id="tipText">等待创建任务</div></div>
      </div>
      <p class="foot">安全说明：页面不会保存管理员密钥；每个任务都有独立访问令牌，只能查询自己的任务。</p>
    </section>
  </main>

  <script nonce="${nonce}">
    (function () {
      const aliasInput = document.getElementById('aliasEmail');
      const startBtn = document.getElementById('startBtn');
      const requestIdEl = document.getElementById('requestId');
      const statusEl = document.getElementById('statusText');
      const codeEl = document.getElementById('codeText');
      const expiresEl = document.getElementById('expiresAt');
      const tipEl = document.getElementById('tipText');

      let pollTimer = null;
      let currentRequestId = '';
      let currentAccessToken = '';
      let pollCount = 0;
      const MAX_POLL_TIMES = 6;

      function setTip(v) { tipEl.textContent = v; }
      function setStatus(v) {
        statusEl.className = '';
        statusEl.textContent = v || '-';
        if (v) statusEl.classList.add('status-' + String(v).toLowerCase());
      }
      function setCode(v) { codeEl.textContent = v || '-'; }
      function setRequestId(v) { requestIdEl.textContent = v || '-'; }
      function setExpires(v) { expiresEl.textContent = v || '-'; }
      function stopPolling() {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }

      function resetPolling() {
        pollCount = 0;
        stopPolling();
      }

      async function createRequest(aliasEmail) {
        const resp = await fetch('/api/public/requests', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ aliasEmail })
        });
        return await resp.json();
      }

      async function queryRequest(requestId, accessToken) {
        const url = '/api/public/requests/' + encodeURIComponent(requestId);
        const resp = await fetch(url, {
          method: 'GET',
          headers: { 'x-access-token': accessToken }
        });
        return await resp.json();
      }

      async function triggerFetch(requestId, accessToken) {
        const url = '/api/public/requests/' + encodeURIComponent(requestId) + '/fetch';
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'x-access-token': accessToken }
        });
        return await resp.json();
      }

      async function pollOnce() {
        if (!currentRequestId || !currentAccessToken) return;
        pollCount += 1;
        if (pollCount > MAX_POLL_TIMES) {
          setStatus('failed');
          setTip('轮询 6 次仍未获取验证码，请稍后重试');
          stopPolling();
          return;
        }
        await triggerFetch(currentRequestId, currentAccessToken);
        const data = await queryRequest(currentRequestId, currentAccessToken);
        if (!data || !data.ok) {
          setTip((data && data.error) ? ('查询失败：' + data.error) : '查询失败');
          return;
        }
        setStatus(data.status);
        setExpires(data.expiresAt || '-');
        if (data.status === 'found') {
          setCode(data.code || '-');
          setTip('已命中验证码');
          stopPolling();
        } else if (data.status === 'expired' || data.status === 'cancelled') {
          setCode('-');
          setTip('任务已结束：' + data.status);
          stopPolling();
        } else {
          setCode('-');
          setTip('等待邮件到达...');
        }
      }

      startBtn.addEventListener('click', async function () {
        const aliasEmail = String(aliasInput.value || '').trim().toLowerCase();
        if (!aliasEmail) {
          setTip('请先输入邮箱地址');
          return;
        }

        stopPolling();
        resetPolling();
        setRequestId('-');
        setStatus('-');
        setCode('-');
        setExpires('-');
        startBtn.disabled = true;
        setTip('正在创建任务...');

        try {
          const data = await createRequest(aliasEmail);
          if (!data || !data.ok) {
            setTip((data && data.error) ? ('创建失败：' + data.error) : '创建失败');
            return;
          }

          currentRequestId = data.requestId;
          currentAccessToken = data.accessToken;
          resetPolling();
          setRequestId(data.requestId);
          setStatus(data.status || 'pending');
          setExpires(data.expiresAt || '-');
          setTip('任务已创建，10 秒后开始第 1 次查询...');

          pollTimer = setInterval(pollOnce, Math.max(3000, Number(data.pollIntervalMs || 10000)));
        } catch (_err) {
          setTip('网络错误，请稍后重试');
        } finally {
          startBtn.disabled = false;
        }
      });
    })();
  </script>
</body>
</html>`;
}

function genNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map(v => v.toString(16).padStart(2, '0')).join('');
}
