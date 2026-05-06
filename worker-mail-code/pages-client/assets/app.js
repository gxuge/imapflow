(function () {
  const aliasInput = document.getElementById('aliasEmail');
  const startBtn = document.getElementById('startBtn');
  const testBtn = document.getElementById('testBtn');
  const requestIdEl = document.getElementById('requestId');
  const statusEl = document.getElementById('statusText');
  const codeEl = document.getElementById('codeText');
  const expiresEl = document.getElementById('expiresAt');
  const tipEl = document.getElementById('tipText');

  const apiBase = '/api';
  let pollTimer = null;
  let currentRequestId = '';
  let currentAccessToken = '';

  function setTip(v) {
    tipEl.textContent = v;
  }

  function setStatus(v) {
    statusEl.className = '';
    statusEl.textContent = formatStatus(v) || '-';
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

  async function createRequest(aliasEmail) {
    const resp = await fetch(apiBase + '/public/requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aliasEmail })
    });
    return await resp.json();
  }

  async function queryRequest(requestId, accessToken) {
    const resp = await fetch(apiBase + '/public/requests/' + encodeURIComponent(requestId), {
      method: 'GET',
      headers: { 'x-access-token': accessToken }
    });
    return await resp.json();
  }

  async function testConnection() {
    const resp = await fetch(apiBase + '/public/connection-test', { method: 'GET' });
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
      setTip('已收到验证码');
      stopPolling();
    } else if (data.status === 'expired' || data.status === 'cancelled') {
      setCode('-');
      setTip('任务已结束：' + formatStatus(data.status));
      stopPolling();
    } else {
      setCode('-');
      setTip('等待邮件到达...');
    }
  }

  testBtn.addEventListener('click', async function () {
    testBtn.disabled = true;
    setTip('正在测试连接...');
    try {
      const data = await testConnection();
      if (!data || !data.ok) {
        setTip((data && data.error) ? ('连接失败：' + data.error) : '连接失败');
        return;
      }

      const parts = [];
      parts.push(data.dbReady ? 'D1 正常' : 'D1 未就绪');
      parts.push(data.imapConfigReady ? 'IMAP 已配置' : 'IMAP 未配置');
      parts.push(data.publicAppEnabled ? '公开接口已启用' : '公开接口未启用');
      setTip('连接成功：' + parts.join(' / '));
    } catch (_err) {
      setTip('连接失败：请检查网络或联系管理员');
    } finally {
      testBtn.disabled = false;
    }
  });

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
      setTip('任务已创建，开始轮询...');

      await pollOnce();
      pollTimer = setInterval(function () {
        pollOnce();
      }, Math.max(3000, Number(data.pollIntervalMs || 5000)));
    } catch (_err) {
      setTip('网络错误，请稍后重试');
    } finally {
      startBtn.disabled = false;
    }
  });

  testBtn.click();
})();

function formatStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'pending') return '等待中';
  if (s === 'found') return '已找到';
  if (s === 'expired') return '已过期';
  if (s === 'cancelled') return '已取消';
  return status || '';
}
