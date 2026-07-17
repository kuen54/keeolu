const { chromium } = require(process.env.PWC_PATH);
const EXEC = process.env.PW_EXEC;
(async()=>{
  const b=await chromium.launch({headless:true,executablePath:EXEC});
  const ctx=await b.newContext({viewport:{width:1440,height:900}});
  const pg=await ctx.newPage();
  async function shoot(name, ys){
    await pg.goto('http://127.0.0.1:8848/'+name+'.html',{waitUntil:'domcontentloaded'});
    await pg.waitForTimeout(1500);
    for(let i=0;i<ys.length;i++){
      await pg.evaluate(y=>scrollTo(0,y), ys[i]);
      await pg.waitForTimeout(1400);
      await pg.screenshot({path:`shots/opt-${name}-${i}.png`});
    }
  }
  await shoot('index',[0,1600]);
  await shoot('motion',[900,2200]);
  await shoot('tangibles',[700]);
  await b.close();
  console.log('done');
})().catch(e=>{console.error(e);process.exit(1)});
