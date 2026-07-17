/*
 * framer-shim.js — reproduces the interactions the original site's Framer React
 * bundle provided, with zero CDN dependency:
 *   1. Icons        — inline the Material-Icon SVGs the bundle rendered
 *                     (social header/footer + the video Play button)
 *   2. Marquees     — seamless horizontal auto-scroll of the ticker rows
 *   3. Reveal       — the fade-up appear/scroll animation on every media block
 *   4. Videos       — hover-to-play thumbnails (+ caption), click-to-play
 *                     showcase players, in-view autoplay for background clips
 *   5. Smooth scroll for in-page anchors
 *
 * IMPORTANT: Framer SSRs every animated block at opacity:0 (fade-up initial
 * state). Without JS the page is blank — exactly like the original — so this
 * script is what makes content visible; the reveal logic is deliberately
 * defensive so nothing is ever left hidden.
 */
(function () {
  'use strict';

  var PAGE = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

  /* ================================================================== *
   * 1. ICONS  (Material-Icon SVGs the Framer bundle injected at runtime) *
   * ================================================================== */
  var ICON = {
    linkedin: 'M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z',
    instagram: 'M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z',
    gmail: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
    play: 'M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z'
  };
  var GRAY = 'var(--token-804a14cb-c7e0-4b6d-b88b-481d2bb2eb04, rgb(204, 204, 204))';

  function svg(d, fill) {
    return '<svg xmlns="http://www.w3.org/2000/svg" focusable="false" viewBox="0 0 24 24" ' +
      'style="user-select:none;width:100%;height:100%;display:inline-block;flex-shrink:0;fill:' + fill + '">' +
      '<path d="' + d + '"></path></svg>';
  }
  function fillSlot(container, markup) {
    if (!container || container.querySelector('svg')) return;
    var slot = container.querySelector('div[style*="display:contents"]');
    if (slot) slot.innerHTML = markup;
  }
  function initIcons() {
    [['linkedin', ICON.linkedin], ['instagram', ICON.instagram], ['gmail', ICON.gmail]].forEach(function (pair) {
      each(document.querySelectorAll('a[href*="' + pair[0] + '"]'), function (a) {
        // only real icon anchors have a "*-container" wrapper (text links don't)
        fillSlot(a.querySelector('div[class*="-container"]'), svg(pair[1], GRAY));
      });
    });
    each(document.querySelectorAll('[data-framer-name="Play "]'), function (p) {
      fillSlot(p.querySelector('div[class*="-container"]') || p, svg(ICON.play, 'rgb(255, 255, 255)'));
    });
  }

  /* ================================================================== *
   * 2. MARQUEES                                                         *
   * ================================================================== */
  // Direction (+1 = rightward, -1 = leftward) per ticker <ul> in DOM order,
  // measured from the live site. Only the home page has tickers.
  var MARQUEE = { 'index.html': [ +1, -1, -1 ] };   // Photography r1, Photography r2, AI
  var MARQUEE_SPEED = 152;                            // px / sec

  function initMarquees() {
    var uls = filter(document.querySelectorAll('ul[style*="translateX"], ul[style*="will-change"]'),
      function (u) { return u.children.length > 0; });
    var dirs = MARQUEE[PAGE] || [];
    uls.forEach(function (ul, i) {
      if (ul.__marquee) return;                        // never init a track twice
      // flag only once setup succeeds, so a track that isn't yet measurable
      // (e.g. width 0 before layout settles) is retried on the load handler
      if (setupMarquee(ul, (i < dirs.length) ? dirs[i] : -1, MARQUEE_SPEED)) ul.__marquee = true;
    });
  }

  function setupMarquee(ul, dir, speed) {
    var items = slice(ul.children);
    if (!items.length) return false;
    var cs = getComputedStyle(ul);
    var gap = parseFloat(cs.columnGap || cs.gap || '0') || 0;
    var setWidth = ul.scrollWidth + gap;               // one original set + trailing gap
    if (setWidth <= gap) return false;

    var container = ul.parentElement;
    var targetW = (container ? container.clientWidth : window.innerWidth) * 2 + setWidth;
    for (var guard = 0; ul.scrollWidth < targetW && guard < 20; guard++) {
      items.forEach(function (it) { ul.appendChild(it.cloneNode(true)); });
    }

    // Ticker items use an opacity-only initial state that the scroll-reveal
    // matcher intentionally skips (it only touches translate-based fade-ups, to
    // avoid revealing hover overlays). A marquee's items shouldn't fade
    // individually, so make them all visible now — the ticker's own section
    // wrapper still fades in as a group via initReveal.
    each(ul.querySelectorAll('[style*="opacity"]'), function (n) {
      if (parseFloat(n.style.opacity) < 0.5) { n.style.transition = 'none'; n.style.opacity = '1'; n.style.transform = 'none'; }
    });

    ul.style.willChange = 'transform';
    var pos = dir < 0 ? 0 : -setWidth;
    var last = null, running = false, ticking = false;

    function tick(now) {
      if (!running) { ticking = false; return; }
      if (last == null) last = now;
      var dt = (now - last) / 1000; last = now;
      if (dt > 0.1) dt = 0.016;                         // clamp after a tab switch
      pos += dir * speed * dt;
      if (pos <= -setWidth) pos += setWidth;
      if (pos >= 0) pos -= setWidth;
      ul.style.transform = 'translateX(' + pos + 'px)';
      requestAnimationFrame(tick);
    }
    function start() { if (ticking || !running) return; ticking = true; last = null; requestAnimationFrame(tick); }

    if ('IntersectionObserver' in window && container) {
      new IntersectionObserver(function (es) {
        running = es[0].isIntersecting;                // pause off-screen (perf + matches Framer)
        if (running) start(); else last = null;
      }, { threshold: 0 }).observe(container);
    } else { running = true; start(); }
    return true;
  }

  /* ================================================================== *
   * 3. REVEAL  (fade-up appear / scroll-in animation)                   *
   *    Reveal every element carrying Framer's fade initial-state         *
   *    signature — inline opacity<=0.5 AND a translate transform (or a    *
   *    data-framer-appear-id) — as it scrolls into view. Bare opacity:0   *
   *    (no translate) and blurred caption overlays are hover/variant      *
   *    states and are intentionally left hidden.                          *
   * ================================================================== */
  function isFadeEl(el) {
    var st = el.getAttribute('style') || '';
    if (/backdrop-filter\s*:\s*blur/i.test(st)) return false;       // caption overlay
    if (el.hasAttribute('data-framer-appear-id')) return true;      // load-appear
    var op = el.style.opacity;
    if (op === '' || parseFloat(op) > 0.5) return false;
    if (/translate/i.test(el.style.transform || '')) return true;   // fade-up / slide
    // opacity-only fades: the ticker/marquee wrappers are <section>s (Framer uses
    // <section> only for these content containers, never for hover overlays)
    return el.tagName === 'SECTION';
  }

  function initReveal() {
    var els = filter(document.querySelectorAll('[style*="opacity"]'), isFadeEl);

    // reveal(el, animate): animate=true fades up (real browsers); animate=false
    // snaps to final with no transition (bulletproof — never depends on a
    // transition completing, which some environments throttle).
    function reveal(el, animate) {
      if (el.__shown) return;
      el.__shown = true;
      if (animate) {
        el.style.transition = 'opacity 0.5s ' + EASE + ', transform 0.6s ' + EASE;
        el.style.opacity = '1';
        el.style.transform = 'none';
        // lock the final state in case the transition is throttled/interrupted
        setTimeout(function () { el.style.transition = 'none'; el.style.opacity = '1'; el.style.transform = 'none'; }, 620);
      } else {
        el.style.transition = 'none';
        el.style.opacity = '1';
        el.style.transform = 'none';
      }
    }

    // Primary: fade each block up as it scrolls into view (matches the original).
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (e) { if (e.isIntersecting) { reveal(e.target, true); obs.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -8% 0px' });
      els.forEach(function (el) { io.observe(el); });
    }

    // Guarantee: snap-reveal anything already in or above the viewport. Runs on
    // load, on scroll/resize, and on a short interval — so content is never left
    // hidden even where IntersectionObserver/transitions are throttled. Below-
    // the-fold blocks are left for the animated reveal above.
    // reveal anything within ~1.35 viewports of the top edge (covers fast / jumpy
    // scrolling and anything already scrolled past). `snap=true` forces the final
    // state with no transition (used by the periodic backstop).
    function guarantee(snap) {
      var vh = window.innerHeight;
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (!el.__shown && el.getBoundingClientRect().top < vh * 1.35) reveal(el, false);
      }
    }
    guarantee();
    window.addEventListener('scroll', guarantee, { passive: true });
    window.addEventListener('resize', guarantee);
    window.addEventListener('load', function () { setTimeout(guarantee, 150); });
    var ticks = 0, iv = setInterval(function () { guarantee(); if (++ticks >= 10) clearInterval(iv); }, 800);
  }

  /* ================================================================== *
   * 4. VIDEOS                                                           *
   * ================================================================== */
  function initVideos() {
    var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.target.__hoverPlay) return;
        if (e.isIntersecting) safePlay(e.target); else e.target.pause();
      });
    }, { threshold: 0.25 }) : null;

    each(document.querySelectorAll('video'), function (v) {
      v.setAttribute('playsinline', ''); v.playsInline = true;
      var card = v.closest('[data-framer-name="Thumbnail-Video"]');
      var player = v.closest('[data-framer-name="Video-pause"]');
      if (card) {
        v.muted = true; v.loop = true; v.setAttribute('muted', '');
        v.__hoverPlay = true; setupThumb(card, v);
      } else if (player) {
        setupClickPlayer(player, v);                     // click-to-play, no autoplay
      } else {
        v.muted = true; v.loop = true; v.setAttribute('muted', '');
        if (io) io.observe(v); else safePlay(v);         // background clips: in-view autoplay
      }
    });
  }
  function safePlay(v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }

  // Showcase player: paused with a "Play " button; click toggles play/pause
  // (unmuted, with sound) and shows/hides the Play button.
  function setupClickPlayer(comp, v) {
    var playBtn = comp.querySelector('[data-framer-name="Play "]');
    comp.style.cursor = 'pointer';
    var started = false;
    comp.addEventListener('click', function (e) {
      if (e.target.closest('a')) return;                 // let real links through
      e.preventDefault();
      if (v.paused) {
        if (!started) { v.muted = false; started = true; }
        safePlay(v);
        if (playBtn) playBtn.style.opacity = '0';
      } else {
        v.pause();
        if (playBtn) playBtn.style.opacity = '1';
      }
    });
  }

  // Thumbnail card: GIF poster at rest; hover plays the mp4 and reveals the
  // blurred caption overlay. The caption is the anchor WITHOUT an appear-id.
  function setupThumb(card, v) {
    var anchors = slice(card.querySelectorAll('a'));
    var caption = filter(anchors, function (a) { return !a.hasAttribute('data-framer-appear-id'); })[0]
      || filter(anchors, function (a) { return getComputedStyle(a).backdropFilter !== 'none'; })[0]
      || anchors[anchors.length - 1];
    if (caption) {
      caption.style.opacity = '0';
      caption.style.transition = 'opacity 0.25s ease';
      caption.setAttribute('data-shim-caption', '1');
    }
    // pointer events cover mouse + pen + touch without firing twice like
    // pointer+mouse pairs would
    card.addEventListener('pointerenter', function () { safePlay(v); if (caption) caption.style.opacity = '1'; });
    card.addEventListener('pointerleave', function () { v.pause(); try { v.currentTime = 0; } catch (e) {} if (caption) caption.style.opacity = '0'; });
  }

  /* ================================================================== *
   * 5. SMOOTH ANCHOR SCROLL                                             *
   * ================================================================== */
  function initSmoothScroll() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href*="#"]');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      var i = href.indexOf('#');
      if (i < 0) return;
      var hash = href.slice(i);
      if (!hash || hash === '#') return;
      var base = href.slice(0, i);
      if (base && base !== PAGE && base !== './' && base.indexOf(PAGE) < 0) return;  // cross-page: let it navigate
      var id = decodeURIComponent(hash.slice(1));
      var target = document.getElementById(id) || safeQuery('[name="' + cssEscape(id) + '"]') || safeQuery('#' + cssEscape(id));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', hash);
      }
    });
  }

  /* ---------------- helpers ---------------- */
  function slice(x) { return Array.prototype.slice.call(x); }
  function each(x, fn) { Array.prototype.forEach.call(x, fn); }
  function filter(x, fn) { return Array.prototype.filter.call(x, fn); }
  function safeQuery(sel) { try { return document.querySelector(sel); } catch (e) { return null; } }
  function cssEscape(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&'); }

  function boot() {
    initIcons();
    initMarquees();     // clone ticker items first…
    initReveal();       // …so their clones are picked up by the reveal sweep
    initVideos();
    initSmoothScroll();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
  // retry any ticker that wasn't measurable until layout/images settled
  window.addEventListener('load', function () { setTimeout(initMarquees, 250); });
})();
