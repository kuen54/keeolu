const { chromium } = require(process.env.PWC_PATH);
const EXEC = process.env.PW_EXEC;
const PAGES = ['index','motion','graphic','3d-fashion','photography','tangibles'];
(async()=>{
  const b = await chromium.launch({headless:true, executablePath:EXEC});
  const ctx = await b.newContext({viewport:{width:1920,height:1080}});
  const pg = await ctx.newPage();
  const out = {};
  for (const name of PAGES){
    await pg.goto('http://127.0.0.1:8848/'+name+'.html',{waitUntil:'domcontentloaded'});
    const info = await pg.evaluate(()=>{
      const base = s => (s.split('/').pop()||'').replace(/\.(scale-down-to-\d+)\./,'.').replace(/\.gif$/,'');
      const gifs = [...document.querySelectorAll('img')].filter(i=>/\.gif(\?|$)/.test(i.getAttribute('src')||''));
      const rows = gifs.map(i=>({
        src: (i.getAttribute('src')||'').split('/').pop(),
        base: base(i.getAttribute('src')||''),
        inPlayer: !!i.closest('[data-framer-name="Video-pause"]'),
        inTicker: !!i.closest('ul'),
        w: i.getAttribute('width'), h: i.getAttribute('height'),
      }));
      return rows;
    });
    out[name]=info;
  }
  await b.close();
  const std=new Set(), player=new Set(), ticker=new Set();
  for (const n in out) for (const r of out[n]){ (r.inPlayer?player:r.inTicker?ticker:std).add(r.base); }
  console.log(JSON.stringify({
    perPage: Object.fromEntries(Object.entries(out).map(([k,v])=>[k,{total:v.length, inPlayer:v.filter(x=>x.inPlayer).length, inTicker:v.filter(x=>x.inTicker).length}])),
    standaloneBases:[...std].sort(),
    playerBases:[...player].sort(),
    tickerBases:[...ticker].sort(),
  },null,1));
})().catch(e=>{console.error('FATAL',e);process.exit(1)});
