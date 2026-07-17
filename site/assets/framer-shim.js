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

  // The page now ships "revealed by default" (an always-on <style> reveals the
  // fade-up wrappers so the browser paints them as the HTML streams). This pass only
  // RE-HIDES the below-the-fold blocks (off-screen, no visible flash) so they can
  // fade up on scroll — the initial view stays instant. Inline `!important` beats the
  // always-on stylesheet regardless of selector specificity.
  function initReveal() {
    var els = filter(document.querySelectorAll('[style*="opacity"]'), isFadeEl);
    var vh = window.innerHeight;
    var hidden = [];
    els.forEach(function (el) {
      if (el.getBoundingClientRect().top >= vh) {         // below the fold -> arm fade-up
        el.style.setProperty('opacity', '0', 'important');
        el.style.setProperty('transform', 'translateY(20px)', 'important');
        el.__hidden = true; hidden.push(el);
      } else {
        // in/above view -> reveal via JS now (don't trust the CSS string-match to have
        // caught every inline-style format, e.g. spaced `opacity: 0;` wrappers)
        el.__shown = true;
        el.style.setProperty('opacity', '1', 'important');
        el.style.setProperty('transform', 'none', 'important');
      }
    });

    function reveal(el) {
      if (el.__shown) return;
      el.__shown = true;
      el.style.setProperty('transition', 'opacity 0.5s ' + EASE + ', transform 0.6s ' + EASE, 'important');
      el.style.setProperty('opacity', '1', 'important');
      el.style.setProperty('transform', 'none', 'important');
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (e) { if (e.isIntersecting) { reveal(e.target); obs.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -8% 0px' });
      hidden.forEach(function (el) { io.observe(el); });
    } else { hidden.forEach(reveal); }

    // Backstop: never leave an armed block hidden once it's near/into view (covers
    // fast scrolling and any environment that throttles IntersectionObserver). rAF-
    // throttled so a burst of scroll events does at most one layout read per frame,
    // and `hidden` shrinks as blocks reveal so the loop stays cheap.
    var ticking = false;
    function sweep() {
      ticking = false;
      var h = window.innerHeight * 1.35;
      for (var i = hidden.length - 1; i >= 0; i--) {
        var el = hidden[i];
        if (el.__shown) { hidden.splice(i, 1); continue; }
        if (el.getBoundingClientRect().top < h) { reveal(el); hidden.splice(i, 1); }
      }
    }
    function guarantee() { if (!ticking) { ticking = true; requestAnimationFrame(sweep); } }
    window.addEventListener('scroll', guarantee, { passive: true });
    window.addEventListener('resize', guarantee);
    var ticks = 0, iv = setInterval(function () { sweep(); if (++ticks >= 8 || !hidden.length) clearInterval(iv); }, 700);
  }

  /* ================================================================== *
   * 4. VIDEOS                                                           *
   * ================================================================== */
  function initVideos() {
    // Background clips: decoding many autoplay videos at once is the real scroll-jank
    // killer. Play only the most-visible few (>=35% in view, capped) and pause the
    // rest — clips scrolling past (or barely peeking in) don't decode. Each shows its
    // poster while paused, so a paused-but-visible tile still looks intentional.
    var bg = [], CAP = 6;
    function reconcile() {
      var vis = bg.filter(function (v) { return v.__ratio >= 0.35; })
                  .sort(function (a, b) { return b.__ratio - a.__ratio; });
      bg.forEach(function (v) {
        var i = vis.indexOf(v);
        if (i > -1 && i < CAP) safePlay(v); else v.pause();
      });
    }
    var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
      es.forEach(function (e) { e.target.__ratio = e.isIntersecting ? e.intersectionRatio : 0; });
      reconcile();
    }, { threshold: [0, 0.35, 0.6, 1] }) : null;
    // warm interactive clips (click-players) BEFORE the user acts, once they're near
    // the viewport — so a click plays instantly instead of buffering 3-4MB from cold.
    // A first-frame poster is already shown, so this only affects click latency.
    var warm = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es, obs) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        obs.unobserve(e.target);
        try { e.target.preload = 'auto'; e.target.load(); } catch (x) {}
      });
    }, { rootMargin: '400px' }) : null;

    each(document.querySelectorAll('video'), function (v) {
      v.setAttribute('playsinline', ''); v.playsInline = true;
      var card = v.closest('[data-framer-name="Thumbnail-Video"]');
      var player = v.closest('[data-framer-name="Video-pause"]');
      if (card) {
        v.muted = true; v.loop = true; v.setAttribute('muted', '');
        v.__hoverPlay = true; setupThumb(card, v);
      } else if (player) {
        setupClickPlayer(player, v);
        if (warm) warm.observe(v);                         // buffer ahead -> instant click
      } else {
        v.muted = true; v.loop = true; v.setAttribute('muted', '');
        bg.push(v);
        // hero / above-the-fold clips: buffer eagerly and play now so the first screen
        // isn't a blank video (reconcile keeps it playing since it's fully visible).
        if (v.getBoundingClientRect().top < window.innerHeight) {
          try { v.preload = 'auto'; } catch (x) {}
          v.__ratio = 1; safePlay(v);
        }
        if (io) io.observe(v); else safePlay(v);
      }
    });

    // Pause ALL background clips while the user is actively scrolling — decoding a
    // wall of videos mid-scroll is the heaviest per-frame cost on a Retina display.
    // They resume (most-visible first) a moment after scrolling settles; each shows
    // its poster meanwhile, so nothing looks broken.
    var scrolling = false, scrollTO;
    window.addEventListener('scroll', function () {
      if (!scrolling) { scrolling = true; for (var i = 0; i < bg.length; i++) if (!bg[i].paused) bg[i].pause(); }
      clearTimeout(scrollTO);
      scrollTO = setTimeout(function () { scrolling = false; reconcile(); }, 130);
    }, { passive: true });
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
   * 5. PREFETCH  (warm the next page so cross-page nav feels instant)   *
   *    Static MPA: each click is a full document load. Prefetch the      *
   *    target HTML on hover/focus (high intent) and when a link idles    *
   *    into view, so the browser serves it from cache on click. Paired   *
   *    with immutable asset caching, the new page paints immediately.    *
   * ================================================================== */
  function initPrefetch() {
    var seen = {};
    function prefetch(url) {
      if (!url || seen[url]) return;
      seen[url] = 1;
      var l = document.createElement('link');
      l.rel = 'prefetch'; l.href = url;
      document.head.appendChild(l);
    }
    function pageHref(a) {
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#') return null;
      if (/^[a-z]+:/i.test(href) || href.indexOf('//') === 0) return null;  // external / mailto / tel
      var base = href.split('#')[0].split('?')[0];
      return /\.html$/.test(base) ? base : null;                            // only our page docs
    }
    var links = filter(document.querySelectorAll('a[href]'), pageHref);
    links.forEach(function (a) {
      var u = pageHref(a);
      a.addEventListener('pointerenter', function () { prefetch(u); });
      a.addEventListener('focus', function () { prefetch(u); });
    });
    // warm links idling into view too (only a handful of distinct page docs, deduped)
    var ric = window.requestIdleCallback || function (fn) { return setTimeout(fn, 1); };
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es, obs) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          obs.unobserve(e.target);
          var u = pageHref(e.target);
          ric(function () { prefetch(u); });
        });
      }, { rootMargin: '200px' });
      links.forEach(function (a) { io.observe(a); });
    }
  }

  /* ================================================================== *
   * 6. SMOOTH ANCHOR SCROLL                                             *
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
    initReveal();       // FIRST: keep the first screen visible, arm below-fold fade-ups
    initIcons();
    initVideos();
    initMarquees();     // clones ticker items + reveals them itself
    initSmoothScroll();
    initPrefetch();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
  // retry any ticker that wasn't measurable until layout/images settled
  window.addEventListener('load', function () { setTimeout(initMarquees, 250); });
})();
