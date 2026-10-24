/* Oroboros page layer: the scroll-scrubbed hero, caption bands, motes, reveals.
   Engineering follows the 10k-websites scrub standard: Blob fetch behind a ring with a
   watchdog, dt-normalised lerp that rests, gated seeks, delta-gated DOM writes, the five
   static-hero gates kept live, and a page that is complete if the video never loads. */
(function () {
  'use strict';

  var VIDEO_URL = 'assets/hero-scrub.mp4';
  var VIDEO_BYTES = 1788555;
  var POSTER_URL = 'assets/hero-poster.jpg';
  var GATES = [
    '(max-width: 720px)',
    '(orientation: portrait) and (max-width: 1024px)',
    '(orientation: portrait) and (pointer: coarse)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
    '(prefers-reduced-motion: reduce)'
  ];
  var RM = matchMedia('(prefers-reduced-motion: reduce)');

  var hero = document.querySelector('.hero');
  var stage = document.querySelector('.stage');
  var video = document.querySelector('.hero__video');
  var posterLayer = document.querySelector('.poster');
  var loader = document.querySelector('.ring-loader');
  var bandEls = Array.prototype.slice.call(document.querySelectorAll('.band'));

  var clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };
  var smoothstep = function (p, e0, e1) { var t = clamp((p - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  /* ---------- split headlines once, with seeded jitter ---------- */
  bandEls.forEach(function (band, bi) {
    var h = band.querySelector('.split');
    if (!h) return;
    var text = h.textContent.trim();
    var fx = band.getAttribute('data-fx');
    var r = rng(97 + bi * 31);
    var sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = text;
    var vis = document.createElement('span'); vis.setAttribute('aria-hidden', 'true');
    var words = text.split(' '), nChars = text.replace(/ /g, '').length, ci = 0;
    words.forEach(function (w, wi) {
      var ws = document.createElement('span'); ws.className = 'w';
      ws.style.setProperty('--th', (wi / words.length * 0.55).toFixed(3));
      w.split('').forEach(function (ch) {
        var cs = document.createElement('span'); cs.className = 'c'; cs.textContent = ch;
        if (fx === 'ember') {   // characters fall in from above, like the embers in the footage
          cs.style.setProperty('--th', (ci / nChars * 0.45 + r() * 0.08).toFixed(3));
          cs.style.setProperty('--jx', ((r() - 0.5) * 30).toFixed(1) + 'px');
          cs.style.setProperty('--jy', (-40 - r() * 60).toFixed(1) + 'px');
          cs.style.setProperty('--jr', ((r() - 0.5) * 50).toFixed(1) + 'deg');
        }
        ws.appendChild(cs); ci++;
      });
      vis.appendChild(ws);
      if (wi < words.length - 1) vis.appendChild(document.createTextNode(' '));
    });
    h.textContent = '';
    if (fx === 'blur') {          // two stacked copies crossfaded: static blur, never animated filter
      var soft = vis.cloneNode(true); soft.className = 'soft';
      vis.className = 'sharp';
      h.appendChild(sr); h.appendChild(soft); h.appendChild(vis);
    } else { h.appendChild(sr); h.appendChild(vis); }
  });

  var bands = bandEls.map(function (el, i) {
    var r = el.getAttribute('data-band').split(',').map(Number);
    return { el: el, a: r[0], b: r[1], first: i === 0, last: i === bandEls.length - 1, op: -1, k: -1, ks: -1, kb: -1 };
  });

  function heroProgress() {
    var rect = hero.getBoundingClientRect();
    var range = hero.offsetHeight - innerHeight;
    return range > 0 ? clamp(-rect.top / range, 0, 1) : 0;
  }

  /* ---------- captions: delta-gated writes ---------- */
  var loadK = 0, loadStart = 0;
  function updateCaptions(p) {
    bands.forEach(function (b) {
      var f = Math.min(0.02, (b.b - b.a) / 3);
      var op = (b.first ? 1 : smoothstep(p, b.a, b.a + f)) * (b.last ? 1 : 1 - smoothstep(p, b.b - f, b.b));
      if (b.first) op = Math.min(op, 0.15 + 0.85 * loadK);
      var k = clamp((p - b.a) / Math.min(0.03, (b.b - b.a) * 0.35), 0, 1);
      if (b.first) k = Math.max(k, loadK);
      var ks = clamp((k - 0.5) * 2.5, 0, 1), kb = clamp((k - 0.7) * 3.4, 0, 1);
      if (Math.abs(op - b.op) > 0.004) { b.op = op; b.el.style.opacity = op.toFixed(3); b.el.classList.toggle('is-live', op > 0.5); }
      if (Math.abs(k - b.k) > 0.008) { b.k = k; b.el.style.setProperty('--k', k.toFixed(3)); }
      if (Math.abs(ks - b.ks) > 0.008) { b.ks = ks; b.el.style.setProperty('--ks', ks.toFixed(3)); }
      if (Math.abs(kb - b.kb) > 0.008) { b.kb = kb; b.el.style.setProperty('--kb', kb.toFixed(3)); }
    });
    var scrolled = p > 0.02;
    if (scrolled !== stage.classList.contains('is-scrolled')) stage.classList.toggle('is-scrolled', scrolled);
  }
  function loadRamp(now) {           // band one assembles on load, then hands over to scroll
    if (!loadStart) loadStart = now;
    loadK = clamp((now - loadStart) / 1400, 0, 1);
    loadK = 1 - Math.pow(1 - loadK, 3);
    updateCaptions(shown);
    if (loadK < 1) requestAnimationFrame(loadRamp);
  }

  /* ---------- seeks: gated, coalesced, deadlock-safe ---------- */
  var seekBusy = false, pendingTime = null;
  function requestSeek(t) {
    if (!video.duration || !videoReady) return;
    if (seekBusy) { pendingTime = t; return; }
    seekBusy = true;
    try { video.currentTime = t; } catch (e) { seekBusy = false; }
  }
  video.addEventListener('seeked', function () {
    seekBusy = false;
    if (pendingTime !== null) { var t = pendingTime; pendingTime = null; requestSeek(t); }
  });
  video.addEventListener('error', function () { seekBusy = false; pendingTime = null; failVideo(); });

  /* ---------- lerp loop that rests ---------- */
  var target = 0, shown = 0, rafId = null, lastTick = 0, heroOnScreen = true, videoReady = false;
  function tick(now) {
    var dt = Math.min(100, now - (lastTick || now));
    lastTick = now;
    shown += (target - shown) * (1 - Math.pow(1 - 0.14, dt / 16.667));
    if (Math.abs(target - shown) < 0.0005) { shown = target; rafId = null; lastTick = 0; }
    else rafId = requestAnimationFrame(tick);
    if (videoReady) requestSeek(shown * (video.duration - 0.05));
    updateCaptions(shown);
  }
  function onScroll() {
    target = heroProgress();
    if (rafId === null && heroOnScreen) rafId = requestAnimationFrame(tick);
  }
  new IntersectionObserver(function (e) { heroOnScreen = e[0].isIntersecting; if (heroOnScreen) onScroll(); }).observe(hero);

  /* ---------- the Blob loader with an honest ring ---------- */
  var heroInit = false;
  function initHeroOnce() {
    if (heroInit) return; heroInit = true;
    posterLayer.style.backgroundImage = "url('" + POSTER_URL + "')";
    var started = false;
    var start = function () { if (started) return; started = true; loadHeroBlob().catch(failVideo); };
    var img = new Image(); img.onload = start; img.onerror = start; img.src = POSTER_URL;
    setTimeout(start, 4000);
  }
  function loadHeroBlob() {
    if (location.protocol === 'file:') return Promise.reject(new Error('file: preview, still hero'));
    var ctrl = new AbortController();
    var watchdog = setTimeout(function () { ctrl.abort(); }, 20000);
    return fetch(VIDEO_URL, { priority: 'low', signal: ctrl.signal }).then(function (res) {
      if (!res.ok || !res.body) throw new Error('video HTTP ' + res.status);
      var total = Number(res.headers.get('Content-Length')) || VIDEO_BYTES;
      var reader = res.body.getReader(), chunks = [], got = 0, lastRing = 0;
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) return;
          clearTimeout(watchdog); watchdog = setTimeout(function () { ctrl.abort(); }, 20000);
          chunks.push(r.value); got += r.value.length;
          var frac = Math.min(1, got / total), now = performance.now();
          if (now - lastRing > 100 || frac === 1) { lastRing = now; loader.style.setProperty('--ld', Math.round(126 * (1 - frac))); }
          return pump();
        });
      }
      return pump().then(function () {
        clearTimeout(watchdog);
        loader.style.setProperty('--ld', 0);
        video.src = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
        video.load();
        video.addEventListener('loadeddata', function () {
          videoReady = true;
          requestSeek(heroProgress() * (video.duration - 0.05));
          stage.classList.add('video-ready');
        }, { once: true });
      });
    });
  }
  function failVideo() {
    stage.classList.add('video-failed');
    video.removeAttribute('src');
    video.style.display = 'none';           // the poster carries the journey
  }

  /* ---------- the five gates, live in both directions ---------- */
  var scrubOn = false;
  function enableScrub() {
    if (scrubOn) return; scrubOn = true;
    initHeroOnce();
    addEventListener('scroll', onScroll, { passive: true });
    bands.forEach(function (b) { b.op = -1; b.k = -1; b.ks = -1; b.kb = -1; });
    unpinFinalStates();
    requestAnimationFrame(loadRamp);
    target = shown = heroProgress();
    updateCaptions(shown);
    onScroll();
  }
  function disableScrub() {
    if (!scrubOn) return; scrubOn = false;
    removeEventListener('scroll', onScroll);
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }
  function applyHeroMode() {
    if (GATES.some(function (q) { return matchMedia(q).matches; })) disableScrub();
    else enableScrub();
  }
  var MQLS = GATES.map(function (q) { return matchMedia(q); });
  MQLS.forEach(function (m) { m.addEventListener('change', applyHeroMode); });

  /* ---------- page around the hero ---------- */
  var nav = document.querySelector('.nav');
  var navSolid = null;
  function onPageScroll() {
    var solid = scrollY > innerHeight * 0.6;
    if (solid !== navSolid) { navSolid = solid; nav.classList.toggle('is-solid', solid); }
    drawHowRing();
  }
  addEventListener('scroll', onPageScroll, { passive: true });

  var how = document.querySelector('.how'), howRing = document.querySelector('.how__ring'), lastDraw = -1;
  function drawHowRing() {
    if (!how) return;
    var r = how.getBoundingClientRect();
    var d = RM.matches ? 1 : clamp((innerHeight - r.top) / (r.height + innerHeight * 0.4), 0, 1);
    if (Math.abs(d - lastDraw) > 0.004) { lastDraw = d; howRing.style.setProperty('--draw', d.toFixed(3)); }
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      io.unobserve(e.target);
      setTimeout(function () { e.target.classList.add('settled'); }, 1400);   // retire stagger delays
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('.reveal, .closing').forEach(function (el) { io.observe(el); });

  function pinToFinalStates() {
    document.querySelectorAll('.reveal, .closing').forEach(function (el) { el.classList.add('in', 'settled'); });
    if (howRing) howRing.style.setProperty('--draw', 1);
    stopMotes();
  }
  function unpinFinalStates() { lastDraw = -1; drawHowRing(); startMotes(); }
  RM.addEventListener('change', function (e) { if (e.matches) pinToFinalStates(); else applyHeroMode(); });

  document.addEventListener('visibilitychange', function () {
    document.body.classList.toggle('paused', document.hidden);
    if (document.hidden) stopMotes(); else if (!RM.matches) startMotes();
  });

  /* Persona links anywhere on the page load that persona into the engine. */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-persona]');
    if (!a) return;
    document.dispatchEvent(new CustomEvent('oro:persona', { detail: a.getAttribute('data-persona') }));
  });

  /* ---------- motes: coral embers fall, aqua spores rise, at whisper level ---------- */
  var cv = document.querySelector('.motes'), ctx = cv.getContext('2d'), motes = [], moteRaf = null, W = 0, H = 0, DPR = 1;
  function sizeMotes() {
    DPR = Math.min(2, devicePixelRatio || 1);
    W = cv.width = Math.round(innerWidth * DPR); H = cv.height = Math.round(innerHeight * DPR);
  }
  function seedMotes() {
    var r = rng(7), n = innerWidth < 700 ? 22 : 46;
    motes = [];
    for (var i = 0; i < n; i++) {
      var ember = i % 2 === 0;
      motes.push({ x: r(), y: r(), z: 0.4 + r() * 0.6, ember: ember, ph: r() * 6.28, sp: 0.00006 + r() * 0.00012 });
    }
  }
  var lastMote = 0;
  function moteFrame(now) {
    var dt = Math.min(50, now - (lastMote || now)); lastMote = now;
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      m.y += (m.ember ? 1 : -1) * m.sp * dt * m.z;
      m.ph += dt * 0.0006;
      if (m.y > 1.05) m.y = -0.05; if (m.y < -0.05) m.y = 1.05;
      var x = (m.x + Math.sin(m.ph) * 0.006) * W, y = m.y * H, rad = (0.8 + m.z * 1.5) * DPR;
      var a = 0.16 + 0.22 * m.z * (0.6 + 0.4 * Math.sin(m.ph * 2.3));
      ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.283);
      ctx.fillStyle = m.ember ? 'rgba(255,122,92,' + a.toFixed(3) + ')' : 'rgba(111,240,222,' + a.toFixed(3) + ')';
      ctx.shadowBlur = 8 * DPR; ctx.shadowColor = m.ember ? 'rgba(255,122,92,.6)' : 'rgba(111,240,222,.6)';
      ctx.fill();
    }
    moteRaf = requestAnimationFrame(moteFrame);
  }
  function startMotes() { if (moteRaf === null && !RM.matches && !document.hidden) { lastMote = 0; moteRaf = requestAnimationFrame(moteFrame); } }
  function stopMotes() { if (moteRaf !== null) { cancelAnimationFrame(moteRaf); moteRaf = null; } ctx.clearRect(0, 0, W, H); }
  addEventListener('resize', function () { sizeMotes(); onScroll(); });

  sizeMotes(); seedMotes();
  applyHeroMode();
  if (RM.matches) pinToFinalStates(); else startMotes();
  onPageScroll();
})();
