/* Independent headless verification using Playwright's bundled Chromium with a
   throwaway profile (avoids the MCP browser's shared-profile conflict). */
const { chromium } = require(process.env.PWC_PATH);
const EXEC = process.env.PW_EXEC;

// classify why an element isn't visible: 'ok' | 'variant' (display:none inactive
// breakpoint copy — correct) | 'opacity' (a fade wrapper never revealed — a bug)
const EFF = `function why(el){let n=el,disp=false;while(n&&n!==document.body){const cs=getComputedStyle(n);if(cs.display==='none')disp=true;if(parseFloat(cs.opacity)<0.5&&!disp)return 'opacity';n=n.parentElement;}return disp?'variant':'ok';}
function eff(el){return why(el)==='ok';}`;

async function checkPage(page, name) {
  const errs = [];
  const onerr = e => errs.push(String(e).slice(0, 140));
  page.on('pageerror', onerr);
  await page.goto('http://127.0.0.1:8848/' + name + '.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  // scroll through to trigger reveal
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 450) { await page.evaluate(yy => window.scrollTo(0, yy), y); await page.waitForTimeout(230); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  const r = await page.evaluate(`(()=>{${EFF}
    const imgs=[...document.images];
    const cls=imgs.map(why);
    const vids=[...document.querySelectorAll('video')];
    const icons=['linkedin','instagram','gmail'].map(k=>{const a=[...document.querySelectorAll('a[href*="'+k+'"]')].filter(a=>a.querySelector('div[class*="-container"]')&&a.querySelector('svg'))[0]; const p=a&&a.querySelector('svg path'); return p?p.getAttribute('d').slice(0,10):'MISSING';});
    const play=[...document.querySelectorAll('[data-framer-name="Play "]')].filter(e=>e.offsetParent);
    const playWithIcon=play.filter(e=>e.querySelector('svg')).length;
    return {imgs:imgs.length,
      imgsVisible:cls.filter(c=>c==='ok').length,
      imgsInactiveVariant:cls.filter(c=>c==='variant').length,
      imgsOpacityStranded:cls.filter(c=>c==='opacity').length,
      vids:vids.length, vidsOpacityStranded:vids.filter(v=>why(v)==='opacity').length,
      socialIcons:icons, playButtons:play.length, playWithIcon};
  })()`);
  page.off('pageerror', onerr);
  return { ...r, jsErrors: errs };
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXEC });
  const out = {};
  for (const vp of [{ w: 1920, h: 1080, tag: 'desktop' }, { w: 390, h: 844, tag: 'mobile' }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    for (const name of ['index', 'motion', 'graphic', '3d-fashion', 'photography', 'tangibles']) {
      out[vp.tag + ':' + name] = await checkPage(page, name);
    }
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  // screenshots of a couple of pages (top viewport + a mid scroll) to eyeball
  await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'shots/verify-index-top.png' });
  await page.evaluate(() => window.scrollTo(0, 1700)); await page.waitForTimeout(900);
  await page.screenshot({ path: 'shots/verify-index-mid.png' });
  await page.goto('http://127.0.0.1:8848/photography.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'shots/verify-photography.png' });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
