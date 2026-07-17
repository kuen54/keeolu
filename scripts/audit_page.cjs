/* Audit one page against the LIVE original: what asset ids does the original request
 * (across desktop + mobile, full scroll + light hover) that we DON'T have on disk?
 * Usage: node audit_page.cjs <route>       ('' = home, 'motion', 'graphic', ...)
 * Output: JSON { route, originalIds, missing:[{id,url}], onDiskCount }
 */
const { chromium } = require(process.env.PWC_PATH);
const fs = require('fs');
const path = require('path');
const EXEC = process.env.PW_EXEC;
const ROUTE = process.argv[2] || '';
const ORIG = 'https://daily-start-813434.framer.app/' + ROUTE;

function idOf(u) {
  const m = u.match(/framerusercontent\.com\/(?:images|assets|modules)\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}
// asset ids we already have on disk (basename minus ext / scale suffix)
function diskIds() {
  const dirs = ['images', 'videos', 'fonts', 'media'].map(d => path.join('site/assets', d));
  const ids = new Set();
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      const id = f.replace(/\.(scale-down-to-\d+)?.*$/, '').replace(/\.[a-z0-9]+$/i, '');
      // basename up to first dot = the framer id
      ids.add(f.split('.')[0]);
    }
  }
  return ids;
}

async function capture(pg) {
  const urls = new Map(); // id -> full url
  pg.on('response', r => {
    const u = r.url();
    if (!/framerusercontent\.com/.test(u)) return;
    if (!/\.(png|jpe?g|gif|webp|avif|mp4|webm|woff2?)/i.test(u)) return;
    if (r.status() >= 400) return;
    const id = idOf(u);
    if (id && !urls.has(id)) urls.set(id, u.split('?')[0]);
  });
  await pg.goto(ORIG, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(2500);
  const h = await pg.evaluate(() => document.body.scrollHeight).catch(() => 3000);
  for (let y = 0; y < h; y += 600) { await pg.evaluate(v => scrollTo(0, v), y).catch(() => {}); await pg.waitForTimeout(180); }
  // hover a few media tiles to trigger hover-only video/gif loads
  await pg.evaluate(() => {
    const els = [...document.querySelectorAll('[data-framer-name*="Thumbnail"], video, [data-framer-name*="Video"]')].slice(0, 20);
    els.forEach(e => e.dispatchEvent(new MouseEvent('pointerenter', { bubbles: true })));
  }).catch(() => {});
  await pg.waitForTimeout(1200);
  return urls;
}

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXEC });
  const all = new Map();
  for (const vp of [{ w: 1440, h: 900 }, { w: 400, h: 850 }]) {
    const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h } });
    const pg = await ctx.newPage();
    try { const m = await capture(pg); for (const [k, v] of m) if (!all.has(k)) all.set(k, v); } catch (e) {}
    await ctx.close();
  }
  await b.close();
  const disk = diskIds();
  const missing = [];
  for (const [id, url] of all) if (!disk.has(id)) missing.push({ id, url });
  console.log(JSON.stringify({
    route: ROUTE || 'home', originalCount: all.size, onDiskCount: disk.size,
    missingCount: missing.length, missing,
  }, null, 1));
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(1); });
