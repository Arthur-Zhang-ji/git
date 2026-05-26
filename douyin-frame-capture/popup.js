(function () {
  'use strict';

  const $link = document.getElementById('linkInput');
  const $open = document.getElementById('openBtn');
  const $go = document.getElementById('goBtn');
  const $status = document.getElementById('status');

  // Auto-paste if clipboard contains a douyin link
  navigator.clipboard.readText().then((text) => {
    if (text && text.includes('douyin.com')) {
      $link.value = text.trim();
    }
  }).catch(() => {});

  // Check current tab
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab && tab.url && tab.url.includes('douyin.com')) {
      setStatus('✅ 当前正在抖音页面，悬停视频即可截帧', 'ok');
    }
  });

  $open.addEventListener('click', () => {
    const raw = $link.value.trim();
    if (!raw) return setStatus('请粘贴抖音分享链接', 'err');
    if (!raw.includes('douyin.com')) return setStatus('链接格式不正确', 'err');

    setStatus('正在打开...', '');
    chrome.tabs.create({ url: raw }, () => window.close());
  });

  $go.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.douyin.com' }, () => window.close());
  });

  $link.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $open.click();
  });

  function setStatus(msg, cls) {
    $status.textContent = msg;
    $status.className = cls ? 'status status-' + cls : 'status';
  }
})();
