(function () {
  const aliasInput = document.getElementById('aliasEmail');
  const startBtn = document.getElementById('startBtn');
  const testBtn = document.getElementById('testBtn');
  const requestIdEl = document.getElementById('requestId');
  const statusEl = document.getElementById('statusText');
  const codeEl = document.getElementById('codeText');
  const copyCodeBtn = document.getElementById('copyCodeBtn');
  const expiresEl = document.getElementById('expiresAt');
  const tipEl = document.getElementById('tipText');
  const toastContainer = document.getElementById('toast-container');

  const apiBase = '/api';
  const POLL_INTERVAL_MS = 10000;
  const MAX_POLL_TIMES = 6;

  let pollTimer = null;
  let currentRequestId = '';
  let currentAccessToken = '';
  let pollCount = 0;
  let isFinished = false;
  let isTesting = false;
  let isWaiting = false;

  function showToast(msg, type = 'info') {
    if (!toastContainer) return;
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} shadow-lg mb-2 transform transition-all duration-300 translate-y-[-100%] opacity-0`;
    alertDiv.innerHTML = `<span>${msg}</span>`;
    toastContainer.appendChild(alertDiv);
    
    requestAnimationFrame(() => {
      alertDiv.classList.remove('translate-y-[-100%]', 'opacity-0');
    });

    setTimeout(() => {
      alertDiv.classList.add('opacity-0');
      setTimeout(() => alertDiv.remove(), 300);
    }, 3000);
  }

  function setTip(msg, type = 'info') {
    tipEl.className = 'text-sm text-right flex items-center justify-end gap-1 ' + 
      (type === 'success' ? 'text-success' : 
       type === 'error' ? 'text-error' : 
       type === 'warning' ? 'text-warning' : 'text-info');
    
    let iconStr = '';
    if (type === 'loading') {
      iconStr = '<span class="loading loading-spinner loading-xs"></span>';
      tipEl.className = 'text-sm text-right flex items-center justify-end gap-1 text-info';
    } else if (type === 'success') {
      iconStr = '<i data-lucide="check-circle" class="w-4 h-4"></i>';
    } else if (type === 'error') {
      iconStr = '<i data-lucide="alert-circle" class="w-4 h-4"></i>';
    } else {
      iconStr = '<i data-lucide="info" class="w-4 h-4"></i>';
    }
    
    tipEl.innerHTML = `${iconStr}<span>${msg}</span>`;
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: tipEl });
  }

  function setStatus(v) {
    statusEl.className = 'badge';
    statusEl.textContent = formatStatus(v) || '-';
    if (!v) {
      statusEl.classList.add('badge-ghost');
      return;
    }
    const s = String(v).toLowerCase();
    if (s === 'pending') statusEl.classList.add('badge-warning');
    else if (s === 'found') statusEl.classList.add('badge-success');
    else if (s === 'expired' || s === 'cancelled' || s === 'failed') statusEl.classList.add('badge-error');
    else statusEl.classList.add('badge-ghost');
  }

  function setCode(v) {
    const text = v || '-';
    codeEl.textContent = text;
    if (copyCodeBtn) {
      copyCodeBtn.disabled = !v || text === '-';
    }
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
    
    if (isWaiting) {
      startBtn.innerHTML = '<span class="loading loading-spinner loading-sm"></span>正在等待中';
    } else {
      startBtn.textContent = '开始接码';
    }

    if (isTesting) {
      testBtn.innerHTML = '<span class="loading loading-spinner loading-sm"></span>测试中...';
    } else {
      testBtn.innerHTML = '<i data-lucide="activity" class="w-4 h-4"></i> 连接测试';
      if (typeof lucide !== 'undefined') lucide.createIcons({ root: testBtn });
    }
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

  async function triggerFetch(requestId, accessToken) {
    const resp = await fetch(apiBase + '/public/requests/' + encodeURIComponent(requestId) + '/fetch', {
      method: 'POST',
      headers: { 'x-access-token': accessToken }
    });
    return await resp.json();
  }

  async function testConnection() {
    const resp = await fetch(apiBase + '/public/connection-test', { method: 'GET' });
    return await resp.json();
  }

  async function copyCurrentCode() {
    const code = String(codeEl.textContent || '').trim();
    if (!code || code === '-') {
      showToast('没有可复制的验证码', 'error');
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
      showToast('✅ 验证码已复制', 'success');
      setTip('验证码已复制', 'success');
    } catch (_err) {
      showToast('复制失败，请手动复制', 'error');
      setTip('复制失败，请手动复制', 'error');
    }
  }

  async function runOnePoll() {
    if (isFinished) return;
    if (!currentRequestId || !currentAccessToken) return;

    pollCount += 1;
    setTip('正在等待中，第 ' + pollCount + '/' + MAX_POLL_TIMES + ' 次查询...', 'loading');

    await triggerFetch(currentRequestId, currentAccessToken);
    const data = await queryRequest(currentRequestId, currentAccessToken);
    if (!data || !data.ok) {
      setTip((data && data.error) ? ('查询失败：' + data.error) : '查询失败', 'error');
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
      setTip('已收到验证码', 'success');
      showToast('🎉 已收到验证码', 'success');
      isFinished = true;
      stopPolling();
      finishWaiting();
      return;
    }

    if (data.status === 'expired' || data.status === 'cancelled') {
      setCode('-');
      setTip('任务已结束：' + formatStatus(data.status), 'warning');
      isFinished = true;
      stopPolling();
      finishWaiting();
      return;
    }

    if (pollCount >= MAX_POLL_TIMES) {
      setCode('-');
      setStatus('failed');
      setTip('轮询 6 次仍未获取验证码，请稍后重试', 'error');
      showToast('轮询超时，未获取到验证码', 'warning');
      isFinished = true;
      stopPolling();
      finishWaiting();
    }
  }

  function startPollingLoop() {
    resetPollState();
    setTip('任务已创建，10 秒后开始第 1 次查询...', 'info');

    pollTimer = setInterval(function () {
      runOnePoll().catch(function () {
        setStatus('failed');
        setTip('查询过程发生异常，请稍后重试', 'error');
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

    setTip('正在测试连接...', 'loading');
    try {
      const data = await testConnection();
      if (!data || !data.ok) {
        setTip((data && data.error) ? ('连接失败：' + data.error) : '连接失败', 'error');
        showToast('连接失败', 'error');
        return;
      }

      const parts = [];
      parts.push(data.dbReady ? 'D1 正常' : 'D1 未就绪');
      parts.push(data.imapConfigReady ? 'IMAP 已配置' : 'IMAP 未配置');
      parts.push(data.publicAppEnabled ? '公开接口已启用' : '公开接口未启用');
      setTip('连接成功：' + parts.join(' / '), 'success');
      showToast('✅ 连接成功', 'success');
    } catch (_err) {
      setTip('连接失败：请检查网络或联系管理员', 'error');
      showToast('连接失败', 'error');
    } finally {
      isTesting = false;
      syncButtons();
    }
  });

  startBtn.addEventListener('click', async function () {
    if (isTesting || isWaiting) return;

    const aliasEmail = String(aliasInput.value || '').trim().toLowerCase();
    if (!aliasEmail) {
      setTip('请先输入邮箱地址', 'warning');
      showToast('请先输入邮箱地址', 'warning');
      return;
    }

    resetPollState();
    isWaiting = true;
    syncButtons();

    setRequestId('-');
    setStatus('-');
    setCode('-');
    setExpires('-');
    setTip('正在创建任务...', 'loading');

    try {
      const data = await createRequest(aliasEmail);
      if (!data || !data.ok) {
        setTip((data && data.error) ? ('创建失败：' + data.error) : '创建失败', 'error');
        showToast('任务创建失败', 'error');
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
      setTip('网络错误，请稍后重试', 'error');
      showToast('网络错误', 'error');
      finishWaiting();
    }
  });

  if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', function () {
      copyCurrentCode().catch(function () {
        setTip('复制失败，请手动复制', 'error');
        showToast('复制失败，请手动复制', 'error');
      });
    });
  }

  syncButtons();
  testBtn.click();
})();

function formatStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'pending') return '等待中';
  if (s === 'found') return '已接收';
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

// Initialize lucide icons
if (typeof lucide !== 'undefined') {
  lucide.createIcons();
}

// Theme toggle logic
(function() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const iconSun = document.getElementById('iconSun');
  const iconMoon = document.getElementById('iconMoon');

  if (!themeToggleBtn || !iconSun || !iconMoon) return;

  function applyThemeIcons() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    if (currentTheme === 'dark') {
      iconSun.classList.remove('hidden');
      iconMoon.classList.add('hidden');
    } else {
      iconMoon.classList.remove('hidden');
      iconSun.classList.add('hidden');
    }
  }

  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    applyThemeIcons();
  });

  applyThemeIcons();
})();
