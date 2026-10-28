// 可選：啟動靜態伺服器後，以 Playwright 真實操作歷史模式。
// PLAYWRIGHT_CORE=/path/to/playwright-core CHROMIUM_PATH=/path/to/chromium node tests/historical-browser.cjs
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const url = process.env.GAME_URL || 'http://127.0.0.1:8000/';
const click = (page, selector) => page.locator(selector).first().click();
const state = page => page.evaluate(() => JSON.parse(localStorage.getItem('qf-run') || 'null'));
const settings = { flow: false, flowVersion: 2, still: true, smart: false, autoplay: false, speed: 'standard' };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'], headless: true });
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
  const p = await context.newPage();
  await p.addInitScript(s => localStorage.setItem('qf-settings', JSON.stringify(s)), settings);
  await p.goto(url, { waitUntil: 'networkidle' });
  await click(p, '[data-act="to-mode"]');
  assert.match(await p.locator('[data-act="pick-mode"][data-id="history"]').innerText(), /歷史模式/);
  await click(p, '[data-act="pick-mode"][data-id="history"]');
  assert.equal(await p.locator('.history-item').count(), 100);
  assert.match(await p.locator('.history-intro').innerText(), /2026 年 3 月 31 日/);
  await p.locator('#history-search').fill('Tesla');
  assert.equal(await p.locator('.history-item:visible').count(), 1);
  assert.match(await p.locator('#history-count').innerText(), /1 間/);
  await click(p, '[data-act="history-pick"][data-id="tesla"]');
  assert.equal((await state(p)).historical.companyId, 'tesla');
  assert.equal((await state(p)).official, false);
  assert.match(await p.locator('#app').innerText(), /電動跑車/);
  await p.locator('.history-opening summary').click();
  assert.match(await p.locator('.history-opening').innerText(), /Roadster/);
  assert.match(await p.locator('.history-opening a').getAttribute('href'), /^https:\/\//);
  await click(p, '[data-act="accept"]');
  await click(p, '[data-act="shape-pick"][data-key="style"][data-value="keep"]');
  await click(p, '[data-act="shape-pick"][data-key="venue"][data-value="home"]');
  await click(p, '[data-act="shape-pick"][data-key="fulfillment"]');
  await click(p, '[data-act="shape-pick"][data-key="revenue"]');
  await click(p, '[data-act="shape-pick"][data-key="ownership"][data-value="sole"]');
  await click(p, '[data-act="shape-pick"][data-key="positioning"][data-value="pro"]');
  await click(p, '[data-act="shape-next"]');
  assert.equal(await p.locator('#custom-name').inputValue(), '特斯拉');
  // Naming already has a venture object; reloading must resume naming, not skip to play.
  await p.reload({ waitUntil: 'networkidle' }); await click(p, '[data-act="continue"]');
  assert.equal(await p.locator('#custom-name').inputValue(), '特斯拉');
  await click(p, '[data-act="open"]');
  assert.equal((await state(p)).phase, 'play');
  assert.match(await p.locator('.worldbar').innerText(), /歷史範本/);
  assert.match(await p.locator('.worldbar').innerText(), /美國加州/);
  assert.match(await p.locator('#kpi-cash').innerText(), /遊戲單位/);
  await p.evaluate(() => { const r = JSON.parse(localStorage.getItem('qf-run')); r.finance.cash = 1000; r.spine = []; r.nextChapter = 8; r.firstMajor = { skip: true }; localStorage.setItem('qf-run', JSON.stringify(r)); });
  await p.reload({ waitUntil: 'networkidle' }); await click(p, '[data-act="continue"]');
  let guard = 0;
  while (guard++ < 25) {
    const r = await state(p);
    if (r.phase === 'event' && r.pendingEvent.historicalIndex === 0) break;
    if (r.phase === 'play') await click(p, '[data-act="month-end"]');
    else if (r.phase === 'event') await click(p, `[data-act="choice"][data-id="${r.pendingEvent.choices.find(c => !c.effects?.force_ending && !c.disabled).id}"]`);
    else if (r.phase === 'chapter') await click(p, '[data-act="chapter-go"]');
    else throw Error(`unexpected ${r.phase}`);
  }
  assert.ok(guard < 25, 'first milestone did not appear');
  assert.match(await p.locator('.history-reference').innerText(), /2008 年/);
  assert.match(await p.locator('.history-reference').innerText(), /Roadster/);
  assert.match(await p.locator('[data-act="choice"][data-id="alternate"]').innerText(), /假設分支/);
  // Pending card survives an actual browser reload.
  await p.reload({ waitUntil: 'networkidle' }); await click(p, '[data-act="continue"]');
  assert.match(await p.locator('.history-reference').innerText(), /Roadster/);
  await click(p, '[data-act="choice"][data-id="alternate"]');
  assert.equal((await state(p)).historical.nextMilestone, 1);
  assert.equal((await state(p)).historical.decisions[0].route, 'alternate');
  assert.match(await p.locator('.history-status').innerText(), /最近的決定/);
  await click(p, '[data-act="drawer"][data-id="history"]');
  assert.match(await p.locator('.drawer').innerText(), /假設方向/);
  await click(p, '[data-act="close-drawer"]');
  guard = 0;
  let followupSeen = false;
  while (guard++ < 50) {
    const r = await state(p);
    if (r.phase === 'event' && r.pendingEvent.historicalIndex === 1) break;
    if (r.phase === 'play') await click(p, '[data-act="month-end"]');
    else if (r.phase === 'chapter') await click(p, '[data-act="chapter-go"]');
    else if (r.phase === 'event' && r.pendingEvent.historyFollowup) {
      followupSeen = true;
      assert.match(await p.locator('#app').innerText(), /虛構後續/);
      assert.match(await p.locator('.chain-banner').innerText(), /第 2 季/);
      await click(p, '[data-act="choice"][data-id="test"]');
    }
    else if (r.phase === 'event') await click(p, `[data-act="choice"][data-id="${r.pendingEvent.choices.find(c => !c.effects?.force_ending && !c.disabled).id}"]`);
    else throw Error(`unexpected ${r.phase}`);
  }
  assert.ok(guard < 50, 'second milestone did not appear');
  assert.equal(followupSeen, true);
  assert.equal((await state(p)).historical.followups[0].done, true);
  assert.match(await p.locator('.history-reference').innerText(), /2017 年/);
  assert.match(await p.locator('#app').innerText(), /你上次選了/);
  await click(p, '[data-act="choice"][data-id="historical"]');
  assert.equal((await state(p)).historical.nextMilestone, 2);
  assert.equal((await state(p)).historical.decisions.length, 2);
  assert.deepEqual(errors, []);
  await context.close();

  // Mobile filtering, no horizontal overflow, and offline reload of both the module and dataset.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const m = await mobile.newPage(); m.on('pageerror', e => errors.push(e.message));
  await m.addInitScript(s => localStorage.setItem('qf-settings', JSON.stringify(s)), settings);
  await m.goto(url, { waitUntil: 'networkidle' });
  await m.evaluate(() => navigator.serviceWorker.ready);
  await m.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await mobile.setOffline(true);
  await m.reload({ waitUntil: 'domcontentloaded' });
  await click(m, '[data-act="to-mode"]'); await click(m, '[data-act="pick-mode"][data-id="history"]');
  assert.equal(await m.locator('.history-item').count(), 100);
  await m.locator('#history-search').fill('台積電');
  assert.equal(await m.locator('.history-item:visible').count(), 1);
  await click(m, '[data-act="history-pick"][data-id="tsmc"]');
  assert.match(await m.locator('#app').innerText(), /台積電/);
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `mobile horizontal overflow ${overflow}px`);
  assert.deepEqual(errors, []);
  await mobile.close(); await browser.close();
  console.log('historical browser: selection/search, shaping, two events, reload, branching, mobile and offline OK');
})().catch(e => { console.error(e); process.exit(1); });
