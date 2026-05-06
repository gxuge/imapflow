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
  const POLL_INTERVAL_MS = 20000;
  const MAX_POLL_TIMES = 3;

  let pollTimer = null;
  let currentRequestId = '';
  let currentAccessToken = '';
  let pollCount = 0;
  let isFinished = false;
  let isTesting = false;
  let isWaiting = false;

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
    expiresEl.textContent = formatDateTime(v);
  }

  function syncButtons() {
    startBtn.disabled = isTesting || isWaiting;
    testBtn.disabled = isTesting || isWaiting;
    startBtn.textContent = isWaiting ? '正在等待中' : '开始接码';
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function resetPollState() {
    pollCount = 0;
    isFinished = false;
    stopPolling();
  }

  function finishWaiting() {
    isWaiting = false;
    syncButtons();
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

  async function runOnePoll() {
    if (isFinished) return;
    if (!currentRequestId || !currentAccessToken) return;

    pollCount += 1;
    setTip('正在等待中，第 ' + pollCount + '/' + MAX_POLL_TIMES + ' 次查询...');

    const data = await queryRequest(currentRequestId, currentAccessToken);
    if (!data || !data.ok) {
      setTip((data && data.error) ? ('查询失败：' + data.error) : '查询失败');
      if (pollCount >= MAX_POLL_TIMES) {
        setStatus('failed');
        isFinished = true;
        stopPolling();
        finishWaiting();
      }
      return;
    }

    setStatus(data.status);
    setExpires(data.expiresAt || '-');

    if (data.status === 'found') {
      setCode(data.code || '-');
      setTip('已收到验证码');
      isFinished = true;
      stopPolling();
      finishWaiting();
      return;
    }

    if (data.status === 'expired' || data.status === 'cancelled') {
      setCode('-');
      setTip('任务已结束：' + formatStatus(data.status));
      isFinished = true;
      stopPolling();
      finishWaiting();
      return;
    }

    if (pollCount >= MAX_POLL_TIMES) {
      setCode('-');
      setStatus('failed');
      setTip('轮询 3 次仍未获取验证码，请稍后重试');
      isFinished = true;
      stopPolling();
      finishWaiting();
    }
  }

  function startPollingLoop() {
    resetPollState();
    setTip('任务已创建，20 秒后开始第 1 次查询...');

    pollTimer = setInterval(function () {
      runOnePoll().catch(function () {
        setStatus('failed');
        setTip('查询过程发生异常，请稍后重试');
        isFinished = true;
        stopPolling();
        finishWaiting();
      });
    }, POLL_INTERVAL_MS);
  }

  testBtn.addEventListener('click', async function () {
    if (isWaiting) return;
    isTesting = true;
    syncButtons();

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
      isTesting = false;
      syncButtons();
    }
  });

  startBtn.addEventListener('click', async function () {
    if (isTesting || isWaiting) return;

    const aliasEmail = String(aliasInput.value || '').trim().toLowerCase();
    if (!aliasEmail) {
      setTip('请先输入邮箱地址');
      return;
    }

    resetPollState();
    isWaiting = true;
    syncButtons();

    setRequestId('-');
    setStatus('-');
    setCode('-');
    setExpires('-');
    setTip('正在创建任务...');

    try {
      const data = await createRequest(aliasEmail);
      if (!data || !data.ok) {
        setTip((data && data.error) ? ('创建失败：' + data.error) : '创建失败');
        finishWaiting();
        return;
      }

      currentRequestId = data.requestId;
      currentAccessToken = data.accessToken;
      setRequestId(data.requestId);
      setStatus(data.status || 'pending');
      setExpires(data.expiresAt || '-');

      startPollingLoop();
    } catch (_err) {
      setTip('网络错误，请稍后重试');
      finishWaiting();
    }
  });

  syncButtons();
  testBtn.click();
})();

function formatStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'pending') return '等待中';
  if (s === 'found') return '已找到';
  if (s === 'expired') return '已过期';
  if (s === 'cancelled') return '已取消';
  if (s === 'failed') return '失败';
  return status || '';
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('zh-CN', { hour12: false });
}
