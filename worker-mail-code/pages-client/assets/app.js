(function () {
  const aliasInput = document.getElementById('aliasEmail');
  const startBtn = document.getElementById('startBtn');
  const requestIdEl = document.getElementById('requestId');
  const statusEl = document.getElementById('statusText');
  const codeEl = document.getElementById('codeText');
  const expiresEl = document.getElementById('expiresAt');
  const tipEl = document.getElementById('tipText');

  const apiBase = String(window.API_BASE || '').replace(/\/$/, '');
  if (!apiBase || apiBase.includes('YOUR-WORKER-DOMAIN')) {
    setTip('请先在 index.html 配置 window.API_BASE');
  }

  let pollTimer = null;
  let currentRequestId = '';
  let currentAccessToken = '';

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

  async function createRequest(aliasEmail) {
    const resp = await fetch(apiBase + '/api/public/requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aliasEmail })
    });
    return await resp.json();
  }

  async function queryRequest(requestId, accessToken) {
    const resp = await fetch(apiBase + '/api/public/requests/' + encodeURIComponent(requestId), {
      method: 'GET',
      headers: { 'x-access-token': accessToken }
    });
    return await resp.json();
  }

  async function pollOnce() {
    if (!currentRequestId || !currentAccessToken) return;
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
      setRequestId(data.requestId);
      setStatus(data.status || 'pending');
      setExpires(data.expiresAt || '-');
      setTip('任务已创建，开始轮询');

      await pollOnce();
      pollTimer = setInterval(pollOnce, Math.max(3000, Number(data.pollIntervalMs || 5000)));
    } catch (_err) {
      setTip('网络错误，请稍后重试');
    } finally {
      startBtn.disabled = false;
    }
  });
})();
