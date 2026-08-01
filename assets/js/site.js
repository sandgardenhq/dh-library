/* Guide-page interactions: reader prefs (theme + text size), mobile nav,
   click-to-copy on path-like inline code, and the right-rail TOC scroll-spy.
   Prefs persist in localStorage as dhLibraryPrefs {scale, theme}; an inline
   boot script in single.html applies them before first paint. */
(function () {
  'use strict';

  var SCALES = [0.9, 1, 1.1, 1.22];

  function prefs() {
    try { return JSON.parse(localStorage.getItem('dhLibraryPrefs') || 'null') || {}; }
    catch (e) { return {}; }
  }
  function savePrefs(p) {
    try { localStorage.setItem('dhLibraryPrefs', JSON.stringify(p)); } catch (e) { /* ignore */ }
  }

  /* ---- toast ---- */
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1300);
  }

  /* ---- reading theme ---- */
  var themeGroup = document.getElementById('theme-group');
  if (themeGroup) {
    var buttons = themeGroup.querySelectorAll('button[data-theme]');
    var current = prefs().theme || 'light';
    buttons.forEach(function (b) {
      b.classList.toggle('active', b.dataset.theme === current);
      b.addEventListener('click', function () {
        var t = b.dataset.theme;
        if (t === 'light') document.body.removeAttribute('data-rt');
        else document.body.setAttribute('data-rt', t);
        buttons.forEach(function (x) { x.classList.toggle('active', x === b); });
        var p = prefs(); p.theme = t; savePrefs(p);
      });
    });
  }

  /* ---- text size ---- */
  function setScale(s) {
    document.body.style.setProperty('--rd', s);
    var p = prefs(); p.scale = s; savePrefs(p);
  }
  function stepScale(dir) {
    var cur = parseFloat(getComputedStyle(document.body).getPropertyValue('--rd')) || 1;
    var i = SCALES.indexOf(cur);
    if (i === -1) i = 1;
    i = Math.min(SCALES.length - 1, Math.max(0, i + dir));
    setScale(SCALES[i]);
  }
  var down = document.getElementById('scale-down');
  var up = document.getElementById('scale-up');
  if (down) down.addEventListener('click', function () { stepScale(-1); });
  if (up) up.addEventListener('click', function () { stepScale(1); });

  /* ---- mobile nav ---- */
  var nav = document.getElementById('guide-nav');
  var navToggle = document.getElementById('nav-toggle');
  var navClose = document.getElementById('nav-close');
  if (nav && navToggle) navToggle.addEventListener('click', function () { nav.classList.toggle('open'); });
  if (nav && navClose) navClose.addEventListener('click', function () { nav.classList.remove('open'); });

  /* ---- click-to-copy on path-like inline code ---- */
  var body = document.querySelector('.article-body');
  if (body && navigator.clipboard) {
    body.querySelectorAll('code').forEach(function (c) {
      if (c.closest('pre') || c.closest('a')) return;
      var t = c.textContent;
      if (t.length > 120 || !/[\/.]/.test(t)) return;
      c.setAttribute('data-copy', t);
      c.title = 'Click to copy';
    });
    body.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('code[data-copy]');
      if (!t) return;
      navigator.clipboard.writeText(t.getAttribute('data-copy')).then(function () {
        toast('copied · ' + t.getAttribute('data-copy'));
      }).catch(function () { /* ignore */ });
    });
  }

  /* ---- TOC scroll-spy ---- */
  var tocLinks = document.querySelectorAll('.guide-toc nav a');
  if (tocLinks.length && body && 'IntersectionObserver' in window) {
    var byId = {};
    tocLinks.forEach(function (a) {
      var id = decodeURIComponent((a.getAttribute('href') || '').replace(/^#/, ''));
      if (id) byId[id] = a;
    });
    var headings = Array.prototype.filter.call(
      body.querySelectorAll('h2[id], h3[id]'),
      function (h) { return byId[h.id]; }
    );
    var activate = function (id) {
      tocLinks.forEach(function (a) { a.classList.remove('active'); });
      if (byId[id]) byId[id].classList.add('active');
    };
    var visible = new Set();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) visible.add(en.target.id);
        else visible.delete(en.target.id);
      });
      var top = headings.find(function (h) { return visible.has(h.id); });
      if (top) activate(top.id);
    }, { rootMargin: '-54px 0px -70% 0px' });
    headings.forEach(function (h) { io.observe(h); });
  }
})();
