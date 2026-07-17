const { chromium } = require(process.env.PWC_PATH);
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: process.env.PW_EXEC });
  // 1. Mobile layout + reveal
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mp = await m.newPage();
  await mp.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
  await mp.waitForTimeout(1500);
  await mp.evaluate(() => window.scrollTo(0, 900)); await mp.waitForTimeout(900);
  await mp.screenshot({ path: 'shots/final-mobile-index.png' });
  const mobileInfo = await mp.evaluate(() => {
    // which breakpoint hidden class is inactive? count elements actually laid out
    const w = window.innerWidth;
    return { innerWidth: w };
  });
  await m.close();
  // 2. No-JS: JavaScript disabled — noscript CSS must reveal media, keep captions hidden
  const nj = await b.newContext({ viewport: { width: 1920, height: 1080 }, javaScriptEnabled: false });
  const np = await nj.newPage();
  await np.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'load' });
  await np.waitForTimeout(1200);
  const noJs = await np.evaluate(() => {
    function eff(el){let n=el;while(n&&n!==document.body){const cs=getComputedStyle(n);if(parseFloat(cs.opacity)<0.5||cs.display==='none')return false;n=n.parentElement;}return true;}
    const imgs=[...document.images];
    // a caption overlay (backdrop-blur) should remain hidden
    const caps=[...document.querySelectorAll('a')].filter(a=>/blur/.test(getComputedStyle(a).backdropFilter||''));
    const capVisible=caps.filter(c=>parseFloat(getComputedStyle(c).opacity)>=0.5).length;
    return { imgs: imgs.length, imgsVisible: imgs.filter(eff).length, captions: caps.length, captionsWronglyVisible: capVisible };
  }).catch(e => 'evaluate needs JS? ' + String(e).slice(0,60));
  await np.screenshot({ path: 'shots/final-nojs-index.png' });
  await nj.close();
  await b.close();
  console.log(JSON.stringify({ mobileInfo, noJs }, null, 1));
})();
