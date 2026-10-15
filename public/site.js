/* Lashed By Tash: page behaviour (menu, dropdowns, carousels, slider, reveals, price list). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- full-screen menu ---------- */
  var menu = $('#menu'), openBtn = $('#menu-open'), closeBtn = $('#menu-close');
  function setMenu(open) {
    menu.classList.toggle('open', open);
    menu.setAttribute('aria-hidden', String(!open));
    openBtn.setAttribute('aria-expanded', String(open));
    document.documentElement.style.overflow = open ? 'hidden' : '';
    if (open) setTimeout(function () { closeBtn.focus(); }, 50); else openBtn.focus();
  }
  if (menu && openBtn) {
    openBtn.addEventListener('click', function () { setMenu(true); });
    closeBtn.addEventListener('click', function () { setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.classList.contains('open')) setMenu(false); });
    menu.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = $$('a, button', menu), first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ---------- nav dropdowns (hover on desktop, click/keyboard everywhere) ---------- */
  $$('.has-dd').forEach(function (li) {
    var btn = $('button', li);
    btn.addEventListener('click', function () {
      var open = !li.classList.contains('open');
      $$('.has-dd.open').forEach(function (x) { x.classList.remove('open'); $('button', x).setAttribute('aria-expanded', 'false'); });
      li.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open));
    });
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.has-dd')) $$('.has-dd.open').forEach(function (x) { x.classList.remove('open'); $('button', x).setAttribute('aria-expanded', 'false'); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') $$('.has-dd.open').forEach(function (x) { x.classList.remove('open'); var b = $('button', x); b.setAttribute('aria-expanded', 'false'); b.focus(); });
  });

  /* ---------- carousels: native scrolling plus arrow buttons ---------- */
  $$('[data-rail]').forEach(function (sec) {
    var rail = $('.rail', sec), prev = $('[data-prev]', sec), next = $('[data-next]', sec);
    if (!rail || !prev || !next) return;
    function step(dir) {
      var card = $('.card', rail), w = card ? card.getBoundingClientRect().width + 11 : 300;
      rail.scrollBy({ left: dir * w, behavior: reduce ? 'auto' : 'smooth' });
    }
    prev.addEventListener('click', function () { step(-1); });
    next.addEventListener('click', function () { step(1); });
  });

  /* ---------- approach slider ---------- */
  $$('[data-slider]').forEach(function (box) {
    var slides = $$('.ap-slide', box), i = 0, live = $('[data-live]', box);
    function show(n) {
      i = (n + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle('on', k === i); s.setAttribute('aria-hidden', String(k !== i)); s.inert = k !== i; });
      if (live) live.textContent = 'Slide ' + (i + 1) + ' of ' + slides.length;
    }
    $('[data-prev]', box).addEventListener('click', function () { show(i - 1); });
    $('[data-next]', box).addEventListener('click', function () { show(i + 1); });
    show(0);
  });

  /* ---------- price list: highlight the category being read ---------- */
  var pnav = $$('.p-nav a');
  if (pnav.length && 'IntersectionObserver' in window) {
    var cats = pnav.map(function (a) { return $(a.getAttribute('href')); });
    var spy = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (!en.isIntersecting) return;
        var k = cats.indexOf(en.target);
        pnav.forEach(function (a, j) { if (j === k) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    cats.forEach(function (c) { if (c) spy.observe(c); });
  }

  /* ---------- about page: split paragraphs into words for the scroll highlight ---------- */
  $$('.hl-para').forEach(function (p) {
    var words = p.textContent.trim().split(/\s+/);
    p.innerHTML = '';
    words.forEach(function (w, k) {
      var s = document.createElement('span'); s.className = 'w'; s.textContent = w;
      p.appendChild(s); if (k < words.length - 1) p.appendChild(document.createTextNode(' '));
    });
  });

  /* ---------- reveals on scroll (transform and opacity only) ---------- */
  if (document.documentElement.classList.contains('mo') && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.filter(function (e) { return e.isIntersecting; }).forEach(function (e, k) {
        e.target.style.transitionDelay = Math.min(k * 0.08, 0.32) + 's';
        e.target.classList.add('in'); io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('[data-r]').forEach(function (el) { io.observe(el); });
  }
})();
