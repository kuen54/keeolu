const { chromium } = require(process.env.PWC_PATH);
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: process.env.PW_EXEC });
  const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0,100)));
  await page.goto('https://keeolu.pages.dev/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo(0, 1700)); await page.waitForTimeout(1200);
  await page.screenshot({ path: 'shots/live-keeolu.png' });
  const r = await page.evaluate(() => {
    function eff(el){let n=el;while(n&&n!==document.body){const cs=getComputedStyle(n);if(parseFloat(cs.opacity)<0.5||cs.display==='none')return false;n=n.parentElement;}return true;}
    const imgs=[...document.images];
    const icons=['linkedin','instagram','gmail'].map(k=>{const a=[...document.querySelectorAll('a[href*="'+k+'"]')].filter(a=>a.querySelector('div[class*="-container"]')&&a.querySelector('svg'))[0]; return a?'Y':'N';}).join('');
    return { title: document.title, imgsVisible: imgs.filter(eff).length, icons };
  });
  console.log(JSON.stringify({ ...r, jsErrors: errs }));
  await b.close();
})();
