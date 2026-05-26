(function () {
  'use strict';

  const CONFIG = {
    FRAME_STEP: 1 / 30,
    CAPTURE_DELAY_MS: 60,
  };

  const processed = new WeakSet();
  let hoveredVideo = null;

  // ── Video scanning ──────────────────────

  function scan() {
    document.querySelectorAll('video').forEach((v) => setup(v));
  }

  function setup(video) {
    if (processed.has(video)) return;
    processed.add(video);

    const wrap = ensureWrapper(video);
    const ctrl = buildControls(video);
    wrap.appendChild(ctrl);

    bindVideoEvents(video, ctrl);
    bindControlEvents(video, ctrl);

    video.addEventListener('mouseenter', () => { hoveredVideo = video; });
    video.addEventListener('mouseleave', () => {
      if (hoveredVideo === video) hoveredVideo = null;
    });
  }

  function ensureWrapper(video) {
    const parent = video.parentElement;
    if (!parent) return video;
    const cs = getComputedStyle(parent);
    if (cs.position === 'static') parent.style.position = 'relative';
    return parent;
  }

  // ── Controls DOM ────────────────────────

  function buildControls(video) {
    const el = document.createElement('div');
    el.className = 'dyfc-controls';
    el.innerHTML =
      '<button class="dyfc-btn" data-a="prev" title="后退一帧 (,)">◀◀</button>' +
      '<button class="dyfc-btn dyfc-btn-play" data-a="play" title="播放 / 暂停 (Space)">' +
        '<span class="dyfc-play-icon">▶</span>' +
      '</button>' +
      '<button class="dyfc-btn" data-a="next" title="前进一帧 (.)">▶▶</button>' +
      '<button class="dyfc-btn dyfc-btn-capture" data-a="capture" title="保存当前帧 (Ctrl+S)">' +
        '<span class="dyfc-capture-icon">📷</span>' +
        '<span class="dyfc-capture-label">截帧</span>' +
        '<span class="dyfc-resolution"></span>' +
      '</button>';
    return el;
  }

  function bindVideoEvents(video, ctrl) {
    const update = () => {
      const icon = ctrl.querySelector('.dyfc-play-icon');
      icon.textContent = video.paused ? '▶' : '⏸';
      const res = ctrl.querySelector('.dyfc-resolution');
      if (video.videoWidth) {
        res.textContent = ` ${video.videoWidth}\xd7${video.videoHeight}`;
      }
    };
    video.addEventListener('play', update);
    video.addEventListener('pause', update);
    video.addEventListener('loadedmetadata', update);
    update();
  }

  function bindControlEvents(video, ctrl) {
    ctrl.addEventListener('click', (e) => {
      const btn = e.target.closest('.dyfc-btn');
      if (!btn) return;
      const a = btn.dataset.a;
      if (a === 'prev') step(video, -1);
      else if (a === 'next') step(video, 1);
      else if (a === 'play') video.paused ? video.play() : video.pause();
      else if (a === 'capture') handleCapture(video);
    });

    video.addEventListener('mouseenter', () => ctrl.classList.add('dyfc-visible'));
    video.addEventListener('mouseleave', () => {
      setTimeout(() => {
        if (!ctrl.matches(':hover')) ctrl.classList.remove('dyfc-visible');
      }, 200);
    });
    ctrl.addEventListener('mouseenter', () => ctrl.classList.add('dyfc-visible'));
    ctrl.addEventListener('mouseleave', () => ctrl.classList.remove('dyfc-visible'));
  }

  // ── Frame stepping ──────────────────────

  function step(video, dir) {
    if (video.paused) {
      video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + dir * CONFIG.FRAME_STEP));
    } else {
      video.currentTime += dir * 5;
    }
  }

  // ── Capture ─────────────────────────────

  async function handleCapture(video) {
    if (!video.videoWidth || !video.videoHeight) {
      toast(video, '视频未加载完毕，请稍后再试', 'error');
      return;
    }

    const wasPlaying = !video.paused;
    if (wasPlaying) video.pause();
    await sleep(CONFIG.CAPTURE_DELAY_MS);

    let blob = null;
    try {
      blob = await captureDirect(video);
    } catch (_) {
      try {
        blob = await captureWithCORS(video);
      } catch (__) {
        toast(video, '截帧失败，请尝试使用系统截图', 'error');
      }
    }

    if (wasPlaying) video.play();

    if (blob) {
      download(blob, `douyin_${video.videoWidth}x${video.videoHeight}_${fmtTime()}.png`);
      toast(video, `已保存 ${video.videoWidth}\xd7${video.videoHeight}`, 'success');
    }
  }

  function captureDirect(video) {
    return new Promise((resolve, reject) => {
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      const ctx = c.getContext('2d');
      try {
        ctx.drawImage(video, 0, 0);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('tainted'))), 'image/png', 1.0);
      } catch (e) {
        reject(e);
      }
    });
  }

  function captureWithCORS(video) {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous';
      v.preload = 'auto';
      v.muted = true;
      const target = video.currentTime;
      const clean = () => v.remove();

      const onSeeked = () => {
        try {
          const c = document.createElement('canvas');
          c.width = v.videoWidth;
          c.height = v.videoHeight;
          const ctx = c.getContext('2d');
          ctx.drawImage(v, 0, 0);
          c.toBlob((b) => { clean(); b ? resolve(b) : reject(new Error('empty')); }, 'image/png', 1.0);
        } catch (e) {
          clean();
          reject(e);
        }
      };

      v.addEventListener('loadedmetadata', () => {
        v.currentTime = target;
        v.addEventListener('seeked', onSeeked, { once: true });
      }, { once: true });

      v.addEventListener('error', () => { clean(); reject(new Error('cors')); }, { once: true });

      v.src = video.currentSrc || video.src;
    });
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ── Toast ───────────────────────────────

  function toast(video, msg, type) {
    const t = document.createElement('div');
    t.className = `dyfc-toast dyfc-toast-${type}`;
    t.textContent = msg;
    const wrap = video.parentElement || document.body;
    wrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add('dyfc-toast-show'));
    setTimeout(() => {
      t.classList.remove('dyfc-toast-show');
      setTimeout(() => t.remove(), 300);
    }, 2000);
  }

  // ── Keyboard ────────────────────────────

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, [contenteditable]')) return;

    const video = hoveredVideo || mostVisibleVideo();
    if (!video) return;

    const hover = hoveredVideo === video;

    if (e.key === ' ' && hover) {
      e.preventDefault();
      video.paused ? video.play() : video.pause();
    }
    if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleCapture(video);
    }
    if (e.key === ',' && hover) {
      e.preventDefault();
      step(video, -1);
    }
    if (e.key === '.' && hover) {
      e.preventDefault();
      step(video, 1);
    }
  });

  function mostVisibleVideo() {
    const videos = [...document.querySelectorAll('video')];
    let best = null;
    let max = 0;
    for (const v of videos) {
      const r = v.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const vis = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      if (vis > max) { max = vis; best = v; }
    }
    return best;
  }

  // ── Helpers ─────────────────────────────

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function fmtTime() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  }

  // ── Init ────────────────────────────────

  scan();
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
