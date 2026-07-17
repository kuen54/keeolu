/* How much image work does a page really do? Decoded megapixels (memory + decode
 * cost, the real driver of image jank at Retina) and transfer bytes.
 * Usage: node imgcost.cjs <url> [dpr=2]
 */
const { chromium } = require(process.env.PWC_PATH);
const EXEC = process.env.PW_EXEC;
const URL = process.argv[2];
const DPR = +(process.argv[3] || 2);

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXEC });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR });
  const pg = await ctx.newPage();
  let bytes = 0, imgBytes = 0, vidBytes = 0;
  pg.on('response', r => {
    const h = r.headers();
    const len = parseInt(h['content-length'] || '0', 10) || 0;
    const t = r.request().resourceType();
    bytes += len;
    if (t === 'image') imgBytes += len;
    if (t === 'media') vidBytes += len;
  });
  await pg.goto(URL, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(2000);
  const h = await pg.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 700) { await pg.evaluate(v => scrollTo(0, v), y); await pg.waitForTimeout(180); }
  await pg.waitForTimeout(800);

  const stat = await pg.evaluate((dpr) => {
    let decodedMP = 0, wastedMP = 0, oversized = 0, count = 0, biggest = [];
    document.querySelectorAll('img').forEach(im => {
      if (!im.naturalWidth) return;
      const cs = getComputedStyle(im);
      if (cs.display === 'none') return;
      const nMP = (im.naturalWidth * im.naturalHeight) / 1e6;     // decoded pixels
      const rect = im.getBoundingClientRect();
      const dispMP = (rect.width * dpr * rect.height * dpr) / 1e6; // pixels actually shown at DPR
      decodedMP += nMP;
      const waste = Math.max(0, nMP - dispMP);
      wastedMP += waste;
      if (im.naturalWidth > rect.width * dpr * 1.3 && rect.width > 0) oversized++;
      count++;
      biggest.push({ nat: im.naturalWidth + 'x' + im.naturalHeight, disp: Math.round(rect.width) + 'x' + Math.round(rect.height), mp: +nMP.toFixed(1), src: (im.currentSrc || '').split('/').pop().slice(0, 28) });
    });
    biggest.sort((a, b) => b.mp - a.mp);
    return { imgCount: count, decodedMP: Math.round(decodedMP), wastedMP: Math.round(wastedMP), oversizedImgs: oversized, top: biggest.slice(0, 8) };
  }, DPR);

  console.log(JSON.stringify({
    url: URL, dpr: DPR,
    totalMB: +(bytes / 1048576).toFixed(1), imgMB: +(imgBytes / 1048576).toFixed(1), vidMB: +(vidBytes / 1048576).toFixed(1),
    ...stat,
  }, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(1); });
