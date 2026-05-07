import type { Env } from '../types';
import { isPublicAppEnabled } from '../services/public-security';

/**
 * 杩斿洖鐢ㄦ埛鎺ョ爜椤甸潰銆傝椤甸潰鍙皟鐢?/api/public/* 鎺ュ彛锛屼笉鎺ヨЕ ADMIN_TOKEN銆?
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
  <title>閭鎺ョ爜</title>
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
    .code-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .code-text { font-size: 28px; font-weight: 800; letter-spacing: 1px; color: var(--ink); }
    .btn-copy {
      min-width: 84px;
      padding: 8px 12px;
      font-size: 13px;
      border-radius: 8px;
      background: #2f3d56;
    }
    .status-pending { color: var(--warn); }
    .status-found { color: var(--ok); }
    .status-expired, .status-cancelled { color: var(--bad); }
    .foot { color: var(--muted); font-size: 12px; line-height: 1.6; }
  </style>
</head>
<body>
  <main class="card">
    <section class="head">
      <h1 class="title">閭楠岃瘉鐮佹帴鏀?/h1>
      <p class="desc">杈撳叆浣犵殑閭鍦板潃锛岀郴缁熶細鑷姩鍒涘缓 1 灏忔椂鏈夋晥鐨勬帴鐮佷换鍔″苟杞缁撴灉銆?/p>
    </section>
    <section class="body">
      <label for="aliasEmail">閭鍦板潃锛堢ず渚嬶細main_openai@2925.com锛?/label>
      <div class="row">
        <input id="aliasEmail" type="email" placeholder="璇疯緭鍏ラ偖绠卞湴鍧€" maxlength="120" autocomplete="off" />
        <button id="startBtn" type="button">寮€濮嬫帴鐮?/button>
      </div>
      <div class="panel">
        <div class="kv"><div class="k">浠诲姟 ID</div><div id="requestId" class="mono">-</div></div>
        <div class="kv"><div class="k">浠诲姟鐘舵€?/div><div id="statusText">-</div></div>
        <div class="kv"><div class="k">楠岃瘉鐮?/div><div class="code-row"><div id="codeText" class="mono code-text">-</div><button id="copyCodeBtn" type="button" class="btn-copy" disabled>澶嶅埗</button></div></div>
        <div class="kv"><div class="k">杩囨湡鏃堕棿</div><div id="expiresAt">-</div></div>
        <div class="kv"><div class="k">鏈€鏂版彁绀?/div><div id="tipText">绛夊緟鍒涘缓浠诲姟</div></div>
      </div>
      <p class="foot">瀹夊叏璇存槑锛氶〉闈笉浼氫繚瀛樼鐞嗗憳瀵嗛挜锛涙瘡涓换鍔￠兘鏈夌嫭绔嬭闂护鐗岋紝鍙兘鏌ヨ鑷繁鐨勪换鍔°€?/p>
    </section>
  </main>

  <script nonce="${nonce}">
    (function () {
      const aliasInput = document.getElementById('aliasEmail');
      const startBtn = document.getElementById('startBtn');
      const requestIdEl = document.getElementById('requestId');
      const statusEl = document.getElementById('statusText');
      const codeEl = document.getElementById('codeText');
      const copyCodeBtn = document.getElementById('copyCodeBtn');
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
      function setCode(v) {
        const text = v || '-';
        codeEl.textContent = text;
        if (copyCodeBtn) {
          copyCodeBtn.disabled = !v || text === '-';
        }
      }
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

      async function copyCurrentCode() {
        const code = String(codeEl.textContent || '').trim();
        if (!code || code === '-') {
          setTip('当前暂无可复制的验证码');
          return;
        }
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(code);
          } else {
            const ta = document.createElement('textarea');
            ta.value = code;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }
          setTip('楠岃瘉鐮佸凡澶嶅埗');
        } catch (_err) {
          setTip('澶嶅埗澶辫触锛岃鎵嬪姩澶嶅埗');
        }
      }

      async function pollOnce() {
        if (!currentRequestId || !currentAccessToken) return;
        pollCount += 1;
        if (pollCount > MAX_POLL_TIMES) {
          setStatus('failed');
          setTip('杞 6 娆′粛鏈幏鍙栭獙璇佺爜锛岃绋嶅悗閲嶈瘯');
          stopPolling();
          return;
        }
        await triggerFetch(currentRequestId, currentAccessToken);
        const data = await queryRequest(currentRequestId, currentAccessToken);
        if (!data || !data.ok) {
          setTip((data && data.error) ? ('鏌ヨ澶辫触锛? + data.error) : '鏌ヨ澶辫触');
          return;
        }
        setStatus(data.status);
        setExpires(data.expiresAt || '-');
        if (data.status === 'found') {
          setCode(data.code || '-');
          setTip('宸插懡涓獙璇佺爜');
          stopPolling();
        } else if (data.status === 'expired' || data.status === 'cancelled') {
          setCode('-');
          setTip('浠诲姟宸茬粨鏉燂細' + data.status);
          stopPolling();
        } else {
          setCode('-');
          setTip('绛夊緟閭欢鍒拌揪...');
        }
      }

      startBtn.addEventListener('click', async function () {
        const aliasEmail = String(aliasInput.value || '').trim().toLowerCase();
        if (!aliasEmail) {
          setTip('璇峰厛杈撳叆閭鍦板潃');
          return;
        }

        stopPolling();
        resetPolling();
        setRequestId('-');
        setStatus('-');
        setCode('-');
        setExpires('-');
        startBtn.disabled = true;
        setTip('姝ｅ湪鍒涘缓浠诲姟...');

        try {
          const data = await createRequest(aliasEmail);
          if (!data || !data.ok) {
            setTip((data && data.error) ? ('鍒涘缓澶辫触锛? + data.error) : '鍒涘缓澶辫触');
            return;
          }

          currentRequestId = data.requestId;
          currentAccessToken = data.accessToken;
          resetPolling();
          setRequestId(data.requestId);
          setStatus(data.status || 'pending');
          setExpires(data.expiresAt || '-');
          setTip('浠诲姟宸插垱寤猴紝10 绉掑悗寮€濮嬬 1 娆℃煡璇?..');

          pollTimer = setInterval(pollOnce, Math.max(3000, Number(data.pollIntervalMs || 10000)));
        } catch (_err) {
          setTip('缃戠粶閿欒锛岃绋嶅悗閲嶈瘯');
        } finally {
          startBtn.disabled = false;
        }
      });

      if (copyCodeBtn) {
        copyCodeBtn.addEventListener('click', function () {
          copyCurrentCode().catch(function () {
            setTip('澶嶅埗澶辫触锛岃鎵嬪姩澶嶅埗');
          });
        });
      }
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
