(function () {
  const aliasInput = document.getElementById('aliasEmail');
  const apiBaseInput = document.getElementById('apiBaseInput');
  const startBtn = document.getElementById('startBtn');
  const testBtn = document.getElementById('testBtn');
  const requestIdEl = document.getElementById('requestId');
  const statusEl = document.getElementById('statusText');
  const codeEl = document.getElementById('codeText');
  const expiresEl = document.getElementById('expiresAt');
  const tipEl = document.getElementById('tipText');

  const metaApiBase = readMetaApiBase();
  const savedApiBase = localStorage.getItem('mail_code_api_base') || '';
  apiBaseInput.value = normalizeBase(savedApiBase || metaApiBase);

  let pollTimer = null;
  let currentRequestId = '';
  let currentAccessToken = '';

  function setTip(v) {
    tipEl.textContent = v;
  }

  function setStatus(v) {
    statusEl.className = '';
    statusEl.textContent = v || '-';
    if (v) statusEl.classList.add('status-' + String(v).toLowerCase());
  }

  function setCode(v) {
    codeEl.textContent = v || '-';
  }

  function setRequestId(v) {
    requestIdEl.textContent = v || '-';
  }

  function setExpires(v) {
    expiresEl.textContent = v || '-';
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function readApiBase() {
    const apiBase = normalizeBase(String(apiBaseInput.value || ''));
    if (!apiBase || apiBase.includes('YOUR-WORKER-DOMAIN')) {
      return '';
    }
    return apiBase;
  }

  function saveApiBase(v) {
    localStorage.setItem('mail_code_api_base', v);
  }

  async function createRequest(apiBase, aliasEmail) {
    const resp = await fetch(apiBase + '/api/public/requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aliasEmail })
    });
    return await resp.json();
  }

  async function queryRequest(apiBase, requestId, accessToken) {
    const resp = await fetch(apiBase + '/api/public/requests/' + encodeURIComponent(requestId), {
      method: 'GET',
      headers: { 'x-access-token': accessToken }
    });
    return await resp.json();
  }

  async function testConnection(apiBase) {
    const resp = await fetch(apiBase + '/api/public/connection-test', { method: 'GET' });
    return await resp.json();
  }

  async function pollOnce(apiBase) {
    if (!currentRequestId || !currentAccessToken) return;
    const data = await queryRequest(apiBase, currentRequestId, currentAccessToken);
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

  testBtn.addEventListener('click', async function () {
    const apiBase = readApiBase();
    if (!apiBase) {
      setTip('请先填写后端 API 地址');
      return;
    }

    testBtn.disabled = true;
    setTip('正在测试连接...');
    try {
      const data = await testConnection(apiBase);
      if (!data || !data.ok) {
        setTip((data && data.error) ? ('连接失败：' + data.error) : '连接失败');
        return;
      }

      saveApiBase(apiBase);
      const parts = [];
      parts.push(data.dbReady ? 'D1正常' : 'D1异常');
      parts.push(data.imapConfigReady ? 'IMAP已配置' : 'IMAP未配置');
      parts.push(data.publicAppEnabled ? '公开接口已启用' : '公开接口未启用');
      setTip('连接成功：' + parts.join(' / '));
    } catch (_err) {
      setTip('连接失败：请检查 API 地址、CORS 和 CSP');
    } finally {
      testBtn.disabled = false;
    }
  });

  startBtn.addEventListener('click', async function () {
    const apiBase = readApiBase();
    if (!apiBase) {
      setTip('请先填写后端 API 地址');
      return;
    }

    const aliasEmail = String(aliasInput.value || '').trim().toLowerCase();
    if (!aliasEmail) {
      setTip('请先输入邮箱地址');
      return;
    }

    saveApiBase(apiBase);
    stopPolling();
    setRequestId('-');
    setStatus('-');
    setCode('-');
    setExpires('-');
    startBtn.disabled = true;
    setTip('正在创建任务...');

    try {
      const data = await createRequest(apiBase, aliasEmail);
      if (!data || !data.ok) {
        setTip((data && data.error) ? ('创建失败：' + data.error) : '创建失败');
        return;
      }

      currentRequestId = data.requestId;
      currentAccessToken = data.accessToken;
      setRequestId(data.requestId);
      setStatus(data.status || 'pending');
      setExpires(data.expiresAt || '-');
      setTip('任务已创建，开始轮询');

      await pollOnce(apiBase);
      pollTimer = setInterval(function () {
        pollOnce(apiBase);
      }, Math.max(3000, Number(data.pollIntervalMs || 5000)));
    } catch (_err) {
      setTip('网络错误，请稍后重试');
    } finally {
      startBtn.disabled = false;
    }
  });

  if (!readApiBase()) {
    setTip('请先填写后端 API 地址并点击连接测试');
  }
})();

function normalizeBase(input) {
  const v = String(input || '').trim().replace(/\/+$/, '');
  return v;
}

function readMetaApiBase() {
  const node = document.querySelector('meta[name="api-base"]');
  return node ? String(node.getAttribute('content') || '').trim() : '';
}

