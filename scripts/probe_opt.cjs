/* Focused check of the optimization behaviours (fast: desktop only, 2 pages). */
const { chromium } = require(process.env.PWC_PATH);
const EXEC = process.env.PW_EXEC;

async function run(pg, name) {
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await pg.goto('http://127.0.0.1:8848/' + name + '.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1200);
  const h = await pg.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 500) { await pg.evaluate(v => scrollTo(0, v), y); await pg.waitForTimeout(180); }
  await pg.evaluate(() => scrollTo(0, 0));
  await pg.waitForTimeout(700);
  const r = await pg.evaluate(() => {
    const vids = [...document.querySelectorAll('video')];
    const gifVids = vids.filter(v => /\.poster\.jpg$/.test(v.getAttribute('poster') || ''));
    const clickPlayers = vids.filter(v => v.closest('[data-framer-name="Video-pause"]'));
    return {
      videos: vids.length,
      gifVideos: gifVids.length,
      gifVidsPlayedSomeFrames: gifVids.filter(v => v.readyState >= 2 || v.currentTime > 0).length,
      gifVidsPreloadNone: gifVids.filter(v => v.preload === 'none').length,
      clickPlayers: clickPlayers.length,
      clickPlayersMetadata: clickPlayers.filter(v => v.preload === 'metadata').length,
      prefetchLinks: document.querySelectorAll('link[rel="prefetch"]').length,
      lazyImgs: [...document.images].filter(i => i.loading === 'lazy').length,
      totalImgs: document.images.length,
      viewTransitionCSS: !![...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => r.constructor.name.includes('ViewTransition') || /view-transition/i.test(r.cssText)); } catch (e) { return false; } }),
    };
  });
  return { ...r, jsErrors: errs };
}

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXEC });
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  const pg = await ctx.newPage();
  const out = {};
  for (const n of ['index', 'motion']) out[n] = await run(pg, n);
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
