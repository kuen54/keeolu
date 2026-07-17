/* Real rendering profile for one page, under CPU throttling (headless on a fast Mac
 * hides jank; throttling + a devtools trace exposes where scroll frames actually go).
 * Usage: node trace.cjs <url> [cpuThrottle=4]
 * Reports: total time per trace event category during a scripted scroll, frame stats,
 * and the heaviest individual events — so we know if it's Layout / Paint / Composite /
 * RecalcStyles / image+video decode that dominates.
 */
const { chromium } = require(process.env.PWC_PATH);
const EXEC = process.env.PW_EXEC;
const URL = process.argv[2];
const CPU = +(process.argv[3] || 4);

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXEC });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  const client = await ctx.newCDPSession(pg);
  await client.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await pg.goto(URL, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(2500);

  const events = [];
  await client.send('Tracing.start', {
    transferMode: 'ReportEvents',
    categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink,cc',
  });
  client.on('Tracing.dataCollected', d => { for (const e of d.value) events.push(e); });

  // scripted constant-speed scroll (main-thread + compositor exercised)
  const frames = await pg.evaluate(async () => {
    const fr = []; let last = performance.now(), y = 0;
    const total = document.body.scrollHeight - innerHeight;
    await new Promise(res => {
      function step(now) { const dt = now - last; last = now; if (y > 0) fr.push(dt); y += 22; scrollTo(0, y); if (y < total) requestAnimationFrame(step); else res(); }
      requestAnimationFrame(step);
    });
    return fr;
  });

  await new Promise(r => setTimeout(r, 200));
  await client.send('Tracing.end');
  await new Promise(r => setTimeout(r, 800));

  // aggregate complete (X) events by name
  const agg = {};
  for (const e of events) {
    if (e.ph !== 'X' || !e.dur) continue;
    const n = e.name;
    agg[n] = agg[n] || { total: 0, count: 0, max: 0 };
    agg[n].total += e.dur; agg[n].count++; agg[n].max = Math.max(agg[n].max, e.dur);
  }
  const top = Object.entries(agg).map(([n, v]) => ({ name: n, ms: Math.round(v.total / 1000), count: v.count, maxMs: Math.round(v.max / 1000) }))
    .filter(x => x.ms >= 3).sort((a, b) => b.ms - a.ms).slice(0, 16);
  frames.sort((a, b) => a - b);
  const p = q => Math.round(frames[Math.floor(frames.length * q)] || 0);
  console.log(JSON.stringify({
    url: URL, cpuThrottle: CPU + 'x', deviceScaleFactor: 2,
    frames: frames.length, medianFrameMs: p(0.5), p95FrameMs: p(0.95), maxFrameMs: Math.round(frames[frames.length - 1] || 0),
    jankyFrames_gt50: frames.filter(f => f > 50).length, badFrames_gt100: frames.filter(f => f > 100).length,
    topEvents: top,
  }, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(1); });
