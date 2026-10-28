// 可選的真實瀏覽器冒煙測試：先啟動靜態伺服器，再設定 PLAYWRIGHT_CORE／CHROMIUM_PATH。
const assert = require('node:assert/strict');
const { chromium: pw } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const url = process.env.GAME_URL || 'http://127.0.0.1:8000/';
const executablePath = process.env.CHROMIUM_PATH || undefined;
const browserArgs = process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : ['--no-sandbox'];
const settings = (autoplay = false) => ({ flow:false, flowVersion:2, still:true, smart:false, autoplay, speed:'standard' });
const click = async (page, selector) => { await page.locator(selector).first().click(); };
const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('qf-run')));
async function context(browser, viewport, autoplay=false) {
 const ctx=await browser.newContext({viewport});
 const errors=[]; ctx.on('page', page=>page.on('pageerror', e=>errors.push(e.message)));
 const page=await ctx.newPage();
 await page.addInitScript((s)=>localStorage.setItem('qf-settings',JSON.stringify(s)),settings(autoplay));
 await page.goto(url,{waitUntil:'networkidle'});
 return {ctx,page,errors};
}
async function continueSaved(page) {
 await page.reload({waitUntil:'networkidle'});
 await click(page,'[data-act="continue"]');
}
(async()=>{
 const launch = async () => pw.launch({executablePath,args:browserArgs,headless:true});
 let browser=await launch();
 const desk=await context(browser,{width:1280,height:800}); const p=desk.page;
 assert.equal(await p.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px QianWen', '繁體中文'); }), true);
 // Service worker 安裝後離線重載仍可啟動；不要只檢查快取版本字串。
 await p.evaluate(() => navigator.serviceWorker.ready);
 await p.waitForFunction(() => navigator.serviceWorker.controller !== null);
 await desk.ctx.setOffline(true);
 await p.reload({waitUntil:'domcontentloaded'});
 await p.locator('[data-act="to-mode"]').waitFor();
 await desk.ctx.setOffline(false);
 await click(p,'[data-act="to-mode"]'); await click(p,'[data-act="pick-mode"][data-id="story"]');
 const before=await state(p); assert.ok(before);
 // 十種企業類型是開局抽到的公司，不是額外選項：開局頁不應有自選入口。
 assert.equal(await p.locator('[data-act="company-types"],[data-act="select-company-type"]').count(),0);
 assert.doesNotMatch(await p.locator('#app').innerText(), /探索 10 種|自選企業/);
 // 模擬抽到其中一種新企業類型：開局頁照樣顯示這間公司，不另開流程。
 await p.evaluate(()=>{const r=JSON.parse(localStorage.getItem('qf-run'));r.gapId='ai_workflow';delete r.work;delete r.openingSupport;localStorage.setItem('qf-run',JSON.stringify(r));});
 await continueSaved(p);
 const chosen=await state(p);
 assert.equal(chosen.gapId,'ai_workflow');
 assert.equal(chosen.cityId,before.cityId); assert.equal(chosen.founder.job,before.founder.job); assert.equal(chosen.personal.cash,before.personal.cash);
 assert.match(await p.locator('#app').innerText(), /你抽到的生意/);
 assert.match(await p.locator('#app').innerText(), /企業類型：AI 自動化服務/);
 assert.doesNotMatch(await p.locator('#app').innerText(), /自選了企業類型/);
 await click(p,'[data-act="accept"]');
 await click(p,'[data-act="shape-pick"][data-key="style"][data-value="keep"]');
 await click(p,'[data-act="shape-pick"][data-key="venue"][data-value="home"]');
 await click(p,'[data-act="shape-pick"][data-key="fulfillment"]');
 await click(p,'[data-act="shape-pick"][data-key="revenue"]');
 await click(p,'[data-act="shape-pick"][data-key="ownership"][data-value="sole"]');
 await click(p,'[data-act="shape-pick"][data-key="positioning"][data-value="pro"]');
 await click(p,'[data-act="shape-next"]');
 assert.match(await p.locator('#app').innerText(), /開業之前/);
 await p.locator('#custom-name').fill('瀏覽器測試店');
 await click(p,'[data-act="open"]');
 assert.equal((await state(p)).phase,'play');
 assert.equal((await state(p)).venture.companyTypeId,'ai_workflow');
 assert.equal((await state(p)).venture.family,'saas');
 assert.match(await p.locator('#app').innerText(), /AI 自動化服務/);
 assert.match(await p.locator('.rail-self').innerText(),/個人債務/);
 await click(p,'[data-act="drawer"][data-id="ledger"]');
 assert.match(await p.locator('#app').innerText(),/生活費付清並預留一季生活費後/);
 await click(p,'[data-act="close-drawer"]');
 await click(p,'[data-act="month-end"]');
 assert.equal((await state(p)).month,1);

 // 真實 UI 載入舊存檔缺少新增欄位，仍能結算。
 await p.evaluate(()=>{ const r=JSON.parse(localStorage.getItem('qf-run')); r.phase='play'; r.pendingEvent=null; r.finance.cash=100; delete r.venture.perm.capacity; delete r.venture.perm.fixedAdd; delete r.venture.companyTypeId; localStorage.setItem('qf-run',JSON.stringify(r)); });
 await continueSaved(p); await click(p,'[data-act="month-end"]');
 assert.equal((await state(p)).month,2);
 assert.equal((await state(p)).venture.companyTypeId,'ai_workflow');

 // 無資金的自願試做不能點；存款足夠後顯示機率、兩個分支及結果。
 await p.evaluate(async()=>{ const r=JSON.parse(localStorage.getItem('qf-run')); const e=await (await fetch('data/events.json')).json(); r.phase='event'; r.pendingEvent=e.events.find(x=>x.id==='surprise_pilot'); r.finance.cash=.1; r.firstMajor={skip:true}; localStorage.setItem('qf-run',JSON.stringify(r)); });
 await continueSaved(p);
 assert.equal(await p.locator('[data-act="choice"][data-id="pilot"]').isDisabled(),true);
 assert.match(await p.locator('[data-act="choice"][data-id="pilot"]').innerText(), /現金不足/);
 assert.equal(await p.locator('[data-act="choice"][data-id="pass"]').isEnabled(),true);
 await p.evaluate(()=>{const r=JSON.parse(localStorage.getItem('qf-run'));r.finance.cash=100;r.rngState=1;localStorage.setItem('qf-run',JSON.stringify(r));});
 await continueSaved(p);
 assert.match(await p.locator('[data-act="choice"][data-id="pilot"]').innerText(), /成功\s*\d+%/);
 assert.match(await p.locator('[data-act="choice"][data-id="pilot"]').innerText(), /受挫/);
 await click(p,'[data-act="choice"][data-id="pilot"]');
 assert.equal((await state(p)).lastOutcome.success,true);
 assert.match(await p.locator('.opportunity-result').innerText(),/好消息/);

 // 主動決策顯示成功與受挫，實際執行後存檔與畫面都有結果。
 await p.evaluate(()=>{const r=JSON.parse(localStorage.getItem('qf-run'));r.phase='play';r.month=5;r.initiativeReady=0;r.finance.cash=100;r.rngState=1;localStorage.setItem('qf-run',JSON.stringify(r));});
 await continueSaved(p); await click(p,'[data-act="initiative-open"]');
 const product=p.locator('[data-act="initiative"][data-id="new_product"]');
 assert.match(await product.innerText(),/成功\s*\d+%/); assert.match(await product.innerText(),/受挫/);
 await product.click(); await p.locator('.opportunity-result').waitFor();
 assert.equal((await state(p)).lastOutcome.success,true);

 // 非自願支出直接進入危機；補助失敗後清楚顯示及消耗次數。
 await p.evaluate(async()=>{ const r=JSON.parse(localStorage.getItem('qf-run')); const e=await (await fetch('data/events.json')).json(); r.phase='event';r.pendingEvent=e.events.find(x=>x.id==='asset_growth');r.finance.cash=.1;r.venture.marketFit=.6;r.venture.trust=.6;r.rngState=4; localStorage.setItem('qf-run',JSON.stringify(r));});
 await continueSaved(p); await click(p,'[data-act="choice"][data-id="buy"]');
 assert.equal((await state(p)).phase,'laststand');
 const rescue=p.locator('[data-act="rescue"][data-id="bridge_support"]'); assert.match(await rescue.innerText(),/成功機率/);
 await rescue.click();
 assert.equal((await state(p)).lastOutcome.success,false); assert.equal((await state(p)).rescueLeft,2);
 assert.match(await p.locator('.opportunity-result').innerText(),/沒有獲批/);
 assert.equal(await rescue.count(),0);
 assert.deepEqual(desk.errors, []); await browser.close(); browser=await launch();

 // 每日世界與其他模式一樣只有隨機抽取；手機版目錄無水平溢出。
 const daily=await context(browser,{width:390,height:844});
 await click(daily.page,'[data-act="to-mode"]'); await click(daily.page,'[data-act="pick-mode"][data-id="daily"]');
 assert.equal(await daily.page.locator('[data-act="company-types"]').count(),0);
 assert.match(await daily.page.locator('#app').innerText(),/約每一千個開局/);
 assert.deepEqual(daily.errors, []); await browser.close(); browser=await launch();
 const mobile=await context(browser,{width:390,height:844});
 await click(mobile.page,'[data-act="to-mode"]'); await click(mobile.page,'[data-act="pick-mode"][data-id="story"]');
 assert.equal(await mobile.page.locator('[data-act="company-types"]').count(),0);
 const overflow=await mobile.page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
 assert.ok(overflow<=1,`mobile horizontal overflow ${overflow}px`);
 if (process.env.SMOKE_SCREENSHOT) await mobile.page.screenshot({path:process.env.SMOKE_SCREENSHOT,fullPage:true});
 assert.deepEqual(mobile.errors, []); await browser.close(); browser=await launch();

 // 沙盒可直接在原有的缺口選單挑一個市場，十種企業類型也在同一個選單裡。
 const sandbox=await context(browser,{width:900,height:700});
 await click(sandbox.page,'[data-act="to-mode"]'); await click(sandbox.page,'[data-act="to-sandbox"]');
 assert.equal(await sandbox.page.locator('#sb-gap option').count(),35);
 assert.match(await sandbox.page.locator('#sb-gap option[value="solar_install"]').innerText(),/太陽能工程/);
 await sandbox.page.selectOption('#sb-city','taipei');
 await sandbox.page.selectOption('#sb-gap','solar_install');
 await click(sandbox.page,'[data-act="start-sandbox"]');
 assert.equal((await state(sandbox.page)).work.companyTypeId,'solar_install');
 assert.equal((await state(sandbox.page)).official,false);
 assert.equal(await sandbox.page.locator('[data-act="company-types"]').count(),0);
 assert.equal((await state(sandbox.page)).gapId,'solar_install');
 assert.equal((await state(sandbox.page)).cityId,'taipei');
 assert.deepEqual(sandbox.errors, []); await browser.close(); browser=await launch();

 // 真實自動選擇通過 6 項塑形，且行業限制的選項均可用。
 const auto=await context(browser,{width:900,height:700},true);
 await click(auto.page,'[data-act="to-mode"]'); await click(auto.page,'[data-act="pick-mode"][data-id="story"]');
 await auto.page.waitForFunction(()=>{const r=JSON.parse(localStorage.getItem('qf-run')||'null');return r?.phase==='play' && !!r?.venture?.name;},null,{timeout:45000});
 const ar=await state(auto.page); assert.ok(ar.shape.revenue && ar.shape.fulfillment && ar.venture.gapId===ar.gapId);
 const err=[...desk.errors,...daily.errors,...mobile.errors,...sandbox.errors,...auto.errors]; assert.deepEqual(err,[]);
 console.log('browser: desktop/mobile company types, sandbox, daily, old save, branches, rescue, personal ledger, autoplay and offline ok');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
