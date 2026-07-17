/* Diagnose blank-first + asset health for one URL.
 * Usage: node diag.cjs <url> <label> [width] [height]
 * Reports: navigation timing, time-to-first-visible-content (the "blank" window),
 * every failed/404 asset request, and the full set of asset IDs the page requests
 * (framerusercontent ids for the live original; local assets/ paths for the clone).
 */
const { chromium } = require(process.env.PWC_PATH);
const EXEC = process.env.PW_EXEC;
const [, , URL, LABEL, W = '1440', H = '900'] = process.argv;

function assetId(u) {
  // framerusercontent.com/images/<id>.ext  or  .../assets/.../<id>.ext
  const m = u.match(/framerusercontent\.com\/(?:images|assets|modules)\/([A-Za-z0-9]+)/);
  if (m) return m[1];
  const l = u.match(/\/assets\/(?:images|videos|fonts|media)\/([A-Za-z0-9]+)/);
  return l ? l[1] : null;
}

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXEC });
  const ctx = await b.newContext({ viewport: { width: +W, height: +H } });
  const pg = await ctx.newPage();
  const reqs = [];
  const failed = [];
  pg.on('response', r => {
    const u = r.url(); const t = r.request().resourceType();
    if (['image', 'media', 'font', 'stylesheet'].includes(t) || /\.(png|jpe?g|gif|webp|mp4|webm|woff2?|avif)/i.test(u)) {
      reqs.push({ u, s: r.status(), t });
      if (r.status() >= 400) failed.push({ u: u.slice(0, 120), s: r.status() });
    }
  });
  pg.on('requestfailed', r => {
    const u = r.url();
    if (/\.(png|jpe?g|gif|webp|mp4|webm|woff2?|avif)/i.test(u)) {
      const reason = (r.failure() && r.failure().errorText) || '';
      if (!/ERR_ABORTED/.test(reason)) failed.push({ u: u.slice(0, 120), s: reason });
    }
  });

  const t0 = Date.now();
  await pg.goto(URL, { waitUntil: 'commit' });

  // poll the blank window: how many reveal-signature blocks are actually visible
  // (opacity>0.5, not display:none) within the first viewport, sampled over time
  const REVEAL = `(() => {
    const vh = innerHeight;
    let vis = 0, hid = 0;
    document.querySelectorAll('[style*="opacity"]').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top > vh || r.bottom < 0 || r.width < 40 || r.height < 40) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const op = parseFloat(cs.opacity);
      if (op > 0.5) vis++; else if (op <= 0.5) hid++;
    });
    return { vis, hid };
  })()`;
  const samples = [];
  for (const ms of [150, 300, 500, 800, 1200, 1800, 2600]) {
    while (Date.now() - t0 < ms) await pg.waitForTimeout(20);
    let s = { vis: -1, hid: -1 };
    try { s = await pg.evaluate(REVEAL); } catch (e) {}
    samples.push({ t: Date.now() - t0, ...s });
  }

  // full scroll to trigger the rest of lazy loads
  const doch = await pg.evaluate(() => document.body.scrollHeight).catch(() => 0);
  for (let y = 0; y < doch; y += 700) { await pg.evaluate(v => scrollTo(0, v), y).catch(() => {}); await pg.waitForTimeout(120); }
  await pg.waitForTimeout(600);

  const timing = await pg.evaluate(() => {
    const t = performance.getEntriesByType('navigation')[0] || {};
    const paints = performance.getEntriesByType('paint').map(p => ({ n: p.name, t: Math.round(p.startTime) }));
    return { dcl: Math.round(t.domContentLoadedEventEnd || 0), load: Math.round(t.loadEventEnd || 0), paints };
  }).catch(() => ({}));

  const ids = [...new Set(reqs.map(r => assetId(r.u)).filter(Boolean))].sort();
  console.log(JSON.stringify({
    label: LABEL, url: URL, vp: `${W}x${H}`,
    timing, blankSamples: samples,
    assetCount: ids.length, assetIds: ids,
    reqTotal: reqs.length, failedCount: failed.length, failed: failed.slice(0, 40),
  }));
  await b.close();
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(1); });
