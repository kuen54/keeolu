/* Measure runtime/scroll jank for one page.
 * Usage: node scrollperf.cjs <url>
 * Reports: DOM size, will-change count, content-visibility usage, peak simultaneous
 * playing videos, and frame timing during a scripted scroll (janky frames >50ms).
 */
const { chromium } = require(process.env.PWC_PATH);
const EXEC = process.env.PW_EXEC;
const URL = process.argv[2];

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXEC });
  const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await pg.goto(URL, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1800);

  const statics = await pg.evaluate(() => {
    const all = document.querySelectorAll('*');
    let wc = 0, cv = 0;
    all.forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.willChange && cs.willChange !== 'auto') wc++;
      if (cs.contentVisibility && cs.contentVisibility !== 'visible') cv++;
    });
    return { domNodes: all.length, willChange: wc, contentVisibility: cv, videos: document.querySelectorAll('video').length, images: document.images.length };
  });

  // scripted scroll with per-frame timing + playing-video sampling
  const jank = await pg.evaluate(async () => {
    function playing() { return [...document.querySelectorAll('video')].filter(v => !v.paused && !v.ended && v.readyState > 2 && v.currentTime > 0).length; }
    const frames = [];
    let peakPlaying = 0, longTasks = 0, longTaskTime = 0;
    try {
      new PerformanceObserver(list => { for (const e of list.getEntries()) { longTasks++; longTaskTime += e.duration; } }).observe({ entryTypes: ['longtask'] });
    } catch (e) {}
    const total = document.body.scrollHeight - innerHeight;
    let y = 0, last = performance.now();
    await new Promise(res => {
      function step(now) {
        const dt = now - last; last = now;
        if (y > 0) frames.push(dt);
        peakPlaying = Math.max(peakPlaying, playing());
        y += 28;                                   // ~ constant-speed scroll
        window.scrollTo(0, y);
        if (y < total) requestAnimationFrame(step); else res();
      }
      requestAnimationFrame(step);
    });
    frames.sort((a, b) => a - b);
    const p = q => Math.round(frames[Math.floor(frames.length * q)] || 0);
    return {
      frameCount: frames.length,
      medianFrameMs: p(0.5), p95FrameMs: p(0.95), maxFrameMs: Math.round(frames[frames.length - 1] || 0),
      jankyFrames: frames.filter(f => f > 50).length,
      badFrames: frames.filter(f => f > 100).length,
      peakSimultaneousVideos: peakPlaying,
      longTasks, longTaskTimeMs: Math.round(longTaskTime),
    };
  });

  console.log(JSON.stringify({ url: URL, ...statics, ...jank }, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(1); });
