// 專項回歸：企業類型、機會分支、產能、帳務和救援。
// node --experimental-default-type=module tests/operating.mjs
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import * as S from "../js/sim.js";
import * as P from "../js/present.js";
import { makeRng } from "../js/rng.js";
import { cashflowLedger } from "../js/cashflow.js";

const read = async (file) => JSON.parse(await fs.readFile(new URL(`../data/${file}.json`, import.meta.url)));
const [world, content, economy, eventFile, life, narrative] = await Promise.all(["world", "content", "economy", "events", "life-events", "narrative"].map(read));
const data = { world, content, economy, events: [...eventFile.events, ...life.events], narrative: { ...narrative, beats: [...narrative.beats, ...life.beats] } };
const typeIndustries = {
  ai_workflow: "saas", vertical_saas: "saas", d2c_brand: "retail", creator_marketing: "pro",
  online_skills: "edu", cyber_sme: "enterprise", merchant_payments: "fin", telehealth_support: "care",
  solar_install: "energy", seller_fulfillment: "logi",
};
const typeIds = Object.keys(typeIndustries);
const clone = (x) => structuredClone(x);
const near = (a, b, message, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${message}: ${a} ≠ ${b}`);
const event = (id) => clone(data.events.find((e) => e.id === id));
const seedWithRoll = (accept, chance) => {
  for (let seed = 1; seed < 1_000_000; seed += 1) if (accept(makeRng(seed).next(), chance)) return seed;
  throw new Error("no suitable seeded roll");
};

function sampled({ mode = "sandbox", seed = 907, gap = "ai_workflow", assets = 7.5 } = {}) {
  const state = S.createRun(data, { mode, seed, sandbox: { city: "taipei", gap, age: 32, assets, match: true } });
  return state;
}
function opened({ style = "quit", venue = "home", position = "pro", seed = 907, gap = "ai_workflow", assets = 7.5 } = {}) {
  const state = sampled({ seed, gap, assets });
  Object.assign(state.shape, { style, ownership: "sole", venue, positioning: position, revenue: S.allowedRevenue(data, state)[0], fulfillment: S.allowedFulfillment(data, state)[0] });
  assert.equal(S.confirmShape(data, state).ok, true);
  S.confirmName(state, "回歸測試");
  return state;
}
function prepareEvent(state, id, month = 8) {
  state.month = month;
  state.finance.cash = 100;
  state.venture.licenseLeft = 0;
  state.phase = "event";
  state.pendingEvent = event(id);
  state.firstMajor = {};
  return state;
}
function finishEvent(data, state, id) {
  const result = S.chooseEvent(data, state, id);
  assert.equal(result.ok, true, result.reason);
  return result;
}

// 十個獨立企業類型一對一連接可營運的缺口，沿用母行業規則而不是新模式。
const types = S.companyTypes(data);
assert.equal(types.length, 10);
assert.deepEqual(types.map((t) => t.id), typeIds);
assert.equal(new Set(types.map((t) => t.id)).size, 10);
assert.equal(new Set(types.map((t) => t.gap_id)).size, 10);
assert.equal(new Set(data.content.gaps.map((g) => g.id)).size, 34);
const oldGaps = data.content.gaps.filter((g) => !g.company_type);
assert.equal(oldGaps.length, 24);
for (const [i, type] of types.entries()) {
  const { id } = type;
  const gap = S.gapById(data, type.gap_id);
  const oldFamilyGap = oldGaps.find((g) => g.family === type.industry);
  assert.ok(gap && oldFamilyGap && S.industry(data, type.industry), id);
  assert.equal(type.industry, typeIndustries[id]);
  assert.equal(gap.family, type.industry);
  assert.equal(gap.company_type, id);
  assert.ok(gap.weight > 0);
  for (const key of ["name", "company", "does", "sells", "buyer", "unit", "scale", "hire"]) assert.ok(gap.work[key], `${id} 缺少 ${key}`);
  const state = S.createRun(data, { mode: "sandbox", seed: 100 + i, sandbox: { city: "taipei", age: 32, assets: 7.5 } });
  const before = clone({ cityId: state.cityId, family: state.family, founder: state.founder });
  assert.equal(S.selectCompanyType(data, state, id).ok, true, id);
  assert.equal(state.gapId, gap.id);
  assert.equal(state.cityId, before.cityId);
  assert.deepEqual(state.family, before.family);
  assert.deepEqual({ ...state.founder, matched: before.founder.matched }, before.founder);
  assert.equal(state.founder.matched, state.founder.field === gap.field);
  assert.equal(state.founder.job, before.founder.job);
  assert.equal(state.official, false);
  assert.equal(state.chosenCompanyType, true);
  assert.equal(S.ensureWork(data, state).company, gap.work.company);
  assert.equal(state.work.companyTypeId, id);
  assert.equal(P.business(data, state).companyType, type.name);
  const sameIndustry = { ...state, gapId: oldFamilyGap.id };
  assert.deepEqual(S.allowedRevenue(data, state), S.allowedRevenue(data, sameIndustry));
  assert.deepEqual(S.allowedFulfillment(data, state), S.allowedFulfillment(data, sameIndustry));
  Object.assign(state.shape, { style: "keep", ownership: "sole", venue: "home", positioning: "easy", revenue: S.allowedRevenue(data, state)[0], fulfillment: S.allowedFulfillment(data, state)[0] });
  assert.equal(S.confirmShape(data, state).ok, true);
  assert.equal(state.venture.gapId, gap.id);
  assert.equal(state.venture.family, type.industry);
  assert.equal(state.venture.companyTypeId, id);
  S.confirmName(state, "企業測試");
  state.finance.cash = 100;
  state._cf = true;
  for (let q = 0; q < 8 && state.phase !== "ending"; q += 1) {
    if (state.phase === "event") finishEvent(data, state, state.pendingEvent.choices.find((c) => !c.disabled).id);
    if (state.phase === "laststand") S.chooseRescue(data, state, "close");
    if (state.phase === "play") S.settle(data, state);
  }
  assert.ok(Number.isFinite(state.finance.cash), id);
  assert.ok(state.month >= 7 && state.last.revenue > 0, `${id} should operate and earn revenue for multiple quarters`);
  assert.equal(S.selectCompanyType(data, state, id).ok, false, "營運中不可換企業");
}
assert.equal(new Set(types.map((type) => S.gapById(data, type.gap_id).work.company)).size, 10);
// 不自選時，十種企業都能由真實的加權開局抽到。
const seenTypes = new Set();
for (let i = 0; i < 3000 && seenTypes.size < 10; i += 1) {
  const run = S.createRun(data, { mode: "story", seed: `type-sample-${i}` });
  const id = S.gapById(data, run.gapId).company_type;
  if (id) seenTypes.add(id);
}
assert.deepEqual([...seenTypes].sort(), [...typeIds].sort());
const daily = S.createRun(data, { mode: "daily", seed: "daily-test" });
const dailyBefore = JSON.stringify(daily);
assert.equal(S.selectCompanyType(data, daily, typeIds[0]).ok, false);
assert.equal(JSON.stringify(daily), dailyBefore, "拒絕每日自選不得改狀態");
const invalid = S.createRun(data, { mode: "sandbox", seed: 3, sandbox: { city: "taipei" } });
const invalidBefore = JSON.stringify(invalid);
assert.equal(S.selectCompanyType(data, invalid, "not_a_type").ok, false);
assert.equal(JSON.stringify(invalid), invalidBefore);
const rejected = S.createRun(data, { mode: "story", seed: "company-reject" });
assert.equal(S.selectCompanyType(data, rejected, typeIds[0]).ok, true);
S.acknowledgeReveal(rejected);
assert.equal(S.rejectOpportunity(data, rejected).ok, true);
S.finishReject(rejected);
assert.equal(rejected.chosenCompanyType, false);
assert.equal(rejected.official, false, "曾自選企業的局即使換回隨機機會仍非正式");
assert.equal(rejected.openingSupport.gapId, rejected.gapId);
// 舊存檔缺少產能及企業類型欄位也能繼續；不追補已開業的資金。
const legacy = opened({ gap: oldGaps[0].id });
delete legacy.chosenCompanyType;
delete legacy.venture.companyTypeId;
delete legacy.venture.perm.capacity;
delete legacy.venture.perm.fixedAdd;
legacy.venture.timed = [{ months: 2, revenue: 1.03, fixed: 1 }];
legacy.finance.cash = 100;
legacy._cf = true;
const oldGap = legacy.gapId;
assert.ok(S.forecast(data, legacy).revenue[0] >= 0);
S.settle(data, legacy);
assert.equal(legacy.gapId, oldGap);
assert.equal(legacy.venture.timed[0].months, 1);
// 開發中保存的企業缺口沒有新 ID 時，從缺口還原識別，不重置帳目。
const previousTypeSave = opened();
previousTypeSave.chosenRoute = true;
delete previousTypeSave.chosenCompanyType;
delete previousTypeSave.venture.companyTypeId;
const savedCash = previousTypeSave.finance.cash;
S.ensureWork(data, previousTypeSave);
assert.equal(previousTypeSave.venture.companyTypeId, "ai_workflow");
assert.equal(previousTypeSave.work.companyTypeId, "ai_workflow");
assert.equal(previousTypeSave.finance.cash, savedCash);

// 分支使用相同 seed 可重播；成功／失敗、成本、禁用和成功率均是實際效果。
const branch = prepareEvent(opened(), "scale_fork");
const cityChoice = branch.pendingEvent.choices.find((c) => c.id === "city");
const chance = S.boldChance(data, branch, cityChoice.outcome.base_chance);
assert.ok(chance >= 0.64 && chance <= 0.9);
const successSeed = seedWithRoll((r, c) => r < c, chance);
const failSeed = seedWithRoll((r, c) => r >= c, chance);
const success = clone(branch), replay = clone(branch), fail = clone(branch);
success.rngState = replay.rngState = successSeed;
fail.rngState = failSeed;
finishEvent(data, success, "city");
finishEvent(data, replay, "city");
finishEvent(data, fail, "city");
assert.equal(success.lastOutcome.success, true);
assert.equal(fail.lastOutcome.success, false);
assert.equal(success.lastOutcome.chance, chance);
assert.deepEqual(success, replay, "同 seed 應有相同結果");
near(success.finance.cash, 100.8, "擴張成功收到首批淨款");
near(fail.finance.cash, 100, "擴張受挫沒有首批淨款");
assert.ok(success.venture.perm.capacity > branch.venture.perm.capacity);
assert.ok(fail.venture.perm.capacity > branch.venture.perm.capacity, "共同擴張先增加產能");
assert.ok(success.venture.perm.capacity > fail.venture.perm.capacity);
const poorEvent = prepareEvent(opened(), "surprise_pilot");
poorEvent.finance.cash = 0.1;
assert.equal(S.eventChoiceDisabled(data, poorEvent, poorEvent.pendingEvent.choices[0]), true);
assert.notEqual(S.suggestEventChoice(poorEvent.pendingEvent, poorEvent, data), "pilot", "舊存檔的自動選擇不可卡在禁用選項");
const poorEventBefore = JSON.stringify(poorEvent);
assert.equal(S.chooseEvent(data, poorEvent, "pilot").ok, false);
assert.equal(JSON.stringify(poorEvent), poorEventBefore, "資金不足的事件不可消耗成本或 RNG");
// 反事實從選擇之前出發，不能疊加實際選擇的成本或結局。
const counterfactual = prepareEvent(opened(), "scale_fork");
counterfactual.firstMajor = null;
counterfactual.pendingEvent = {
  id: "counterfactual_test", title: "比較", body: "", major: true,
  choices: [
    { id: "chosen", label: "付出", effects: { cash: -5, force_ending: "voluntary" } },
    { id: "other", label: "另選", effects: { cash: 7, force_ending: "sale" } },
  ],
};
finishEvent(data, counterfactual, "chosen");
near(counterfactual.finance.cash, 95, "實際決策成本");
near(counterfactual.counterfactual.cash, 107, "反事實只套用另一個決策");
assert.equal(counterfactual.counterfactual.ending, "sale");

const action = opened();
action.finance.cash = 100;
action.month = 6;
action.venture.licenseLeft = 0;
const product = S.initiatives(data, action).find((i) => i.id === "new_product");
assert.ok(product.chance >= 0.64 && product.chance <= 0.9);
const productChance = product.chance;
const won = clone(action), lost = clone(action);
won.rngState = seedWithRoll((r, c) => r < c, productChance);
lost.rngState = seedWithRoll((r, c) => r >= c, productChance);
assert.equal(S.actInitiative(data, won, "new_product").ok, true);
assert.equal(S.actInitiative(data, lost, "new_product").ok, true);
assert.equal(won.lastOutcome.success, true);
assert.equal(lost.lastOutcome.success, false);
near(won.finance.cash, 100 - economy.initiatives.product_cost, "產品成本");
near(lost.finance.cash, 100 - economy.initiatives.product_cost, "產品失敗仍有成本");
assert.ok(won.venture.perm.capacity > action.venture.perm.capacity);
assert.equal(lost.venture.perm.capacity, action.venture.perm.capacity);
assert.equal(won.flags.product_attempt, 6);
// 下一季沒有繞過冷卻的行動入口。
won.month += 1; won.initiativeReady = won.month;
assert.ok(!S.initiatives(data, won).some((i) => i.id === "new_product"));
assert.equal(S.actInitiative(data, won, "new_product").ok, false);
const noCash = clone(action);
noCash.finance.cash = 0.1;
const disabled = S.initiatives(data, noCash).find((i) => i.id === "new_product");
assert.equal(disabled.disabled, true);
const noCashBefore = JSON.stringify(noCash);
assert.equal(S.actInitiative(data, noCash, "new_product").ok, false);
assert.equal(JSON.stringify(noCash), noCashBefore);
let successes = 0;
for (let seed = 1; seed <= 2000; seed += 1) if (makeRng(seed).next() < productChance) successes += 1;
assert.ok(Math.abs(successes / 2000 - productChance) < 0.06, "seeded 擲骰近似顯示的機率");
for (const id of ["surprise_pilot", "surprise_referral", "surprise_grant"]) {
  const surprise = event(id);
  assert.equal(surprise.surprise, true);
  assert.ok(surprise.choices.length >= 2);
}
assert.ok(event("surprise_pilot").choices.some((c) => c.outcome));

// 購買永久設備真的增加受產能限制的收入；資產和固定費有對應。
const equipment = prepareEvent(opened(), "asset_growth");
equipment.venture.marketFit = 0.9;
equipment.venture.trust = 0.9;
const beforeEquip = S.forecast(data, equipment);
const assetsBefore = equipment.venture.capexBook;
finishEvent(data, equipment, "buy");
const afterEquip = S.forecast(data, equipment);
assert.ok(afterEquip.probe.unitCap > beforeEquip.probe.unitCap);
assert.ok(afterEquip.revenue[0] > beforeEquip.revenue[0]);
near(equipment.venture.capexBook - assetsBefore, 1.5, "購買設備增加資產帳面價值");
near(afterEquip.parts.premises - beforeEquip.parts.premises, 0.12, "設備維護費");

// 租設備的產能和費用恰好持續四次結算，然後歸零。
const leased = prepareEvent(opened(), "asset_growth");
leased._cf = true;
leased.finance.cash = 1000;
leased.spine = [];
leased.nextChapter = 999;
const control = clone(leased);
control.phase = "play";
control.pendingEvent = null;
finishEvent(data, leased, "lease");
assert.equal(leased.venture.timed[0].months, 4);
for (let quarter = 1; quarter <= 5; quarter += 1) {
  leased.phase = control.phase = "play";
  S.settle(data, leased);
  S.settle(data, control);
  near(leased.last.parts.premises - control.last.parts.premises, quarter <= 4 ? 0.18 : 0, `租賃第 ${quarter} 季費用`);
  assert.equal(leased.venture.timed.length, quarter < 4 ? 1 : 0);
}

// 預測使用下一季而非本季季節，且不改變真實狀態。
const forecastState = opened();
forecastState._cf = true;
forecastState.finance.cash = 100;
forecastState.venture.licenseLeft = 0;
forecastState.spine = [];
forecastState.nextChapter = 999;
const snapshot = JSON.stringify(forecastState);
const next = S.forecast(data, forecastState);
assert.equal(JSON.stringify(forecastState), snapshot);
const predicted = (next.revenue[0] + next.revenue[1]) / 2;
S.settle(data, forecastState, { noevents: true });
near(forecastState.last.revenue, predicted, "沒有天氣及噪音時下一季收入等於預測中心");
near(forecastState.last.parts.operating, next.parts.operating, "下一季成本和預測分項一致");
// 全年盈虧必須包含第四季，不可在第四季入帳前提早歸零。
const year = opened();
year.month = 3;
year.finance.cash = 100;
year._cf = true;
year.spine = [];
year.nextChapter = 999;
year.venture.licenseLeft = 0;
year.venture.marketFit = 0.9;
year.founder.wantsDraw = 0;
const yearForecast = S.forecast(data, year);
const fourthProfit = (yearForecast.revenue[0] + yearForecast.revenue[1]) / 2 - yearForecast.parts.operating;
assert.ok(fourthProfit > 0);
year.yearProfit = -fourthProfit / 2;
const yearsBefore = year.profitYears;
S.settle(data, year);
assert.equal(year.profitYears, yearsBefore + 1);
assert.equal(year.yearProfit, 0);

// 開局貸款在合理期限內足額攤還；首季預估與第一季帳務一致。
let borrower;
for (let seed = 1; seed <= 50; seed += 1) {
  const candidate = sampled({ seed, assets: 0 });
  Object.assign(candidate.shape, { style: "part", ownership: "sole", venue: "factory", positioning: "pro", revenue: S.allowedRevenue(data, candidate)[0], fulfillment: S.allowedFulfillment(data, candidate)[0] });
  if (S.previewVenture(data, candidate).debt > 0) { borrower = candidate; break; }
}
assert.ok(borrower, "fixture 需要開局貸款");
const quote = S.previewVenture(data, borrower);
assert.ok(quote.costs > 0, "開業預算包含營運成本");
assert.equal(S.confirmShape(data, borrower).ok, true);
S.confirmName(borrower, "貸款測試");
borrower.finance.cash = 1000;
borrower._cf = true;
borrower.spine = [];
borrower.nextChapter = 999;
const principal = borrower.finance.debt;
const firstForecast = S.forecast(data, borrower);
S.settle(data, borrower, { noevents: true });
near(borrower.last.revenue, (firstForecast.revenue[0] + firstForecast.revenue[1]) / 2, "開局下一季收入");
near(borrower.last.parts.principal, principal / 12, "第一期本金");
near(quote.costs, firstForecast.parts.operating, "開業預算包括首期貸款");
let paidPrincipal = borrower.last.parts.principal;
for (let q = 1; q < 12; q += 1) {
  borrower.phase = "play";
  S.settle(data, borrower);
  paidPrincipal += borrower.last.parts.principal;
}
near(paidPrincipal, principal, "十二季還清開局本金");
near(borrower.finance.debt, 0, "本金不留下無期尾數");

// 測試期事件在第一季觸發，場地優惠結束，兼職正職薪資以月薪 × 45% × 3 入帳。
const trial = opened({ style: "test" });
near(trial.venture.capexBook, trial.openingPreview.capex, "測試期設備帳面值等於實際開業投入");
trial.finance.cash = 100;
trial._cf = true;
S.settle(data, trial);
assert.equal(trial.pendingEvent?.id, "test_end", "同季其他事件不可擠掉測試期結束");
const firstPremises = trial.last.parts.premises;
const overhead = trial.venture.complexity * economy.formula.maturity_overhead_per_complexity;
finishEvent(data, trial, "part");
assert.equal(trial.flags.tested, true);
assert.equal(trial.flags.progress_style, "part");
trial.spine = [];
trial.personal.cash = 10;
trial.personal.debt = 0;
S.settle(data, trial, { noevents: true });
near(trial.last.parts.premises - overhead, 2 * (firstPremises - overhead), "測試期場地半價只持續一季");
const job = S.jobOf(data, trial);
const living = S.livingCost(data, trial);
near(trial.personal.cash, 10 + job.income * 0.45 * 3 + trial.last.parts.draw - living, "兼職季度收入");
trial.phase = "event";
trial.pendingEvent = event("moonlight");
finishEvent(data, trial, "disclose");
const cashBeforeDisclosureQuarter = trial.personal.cash;
S.settle(data, trial);
near(trial.personal.cash, cashBeforeDisclosureQuarter + job.income * 0.45 * 3 * 0.5 + trial.last.parts.draw - living, "攤開談後的兼職薪資減半");
// 舊存檔中的固定季度收入也受攤開談的倍率影響，而非被當成月薪再乘三。
trial.phase = "play";
trial.flags.outside_value = 4;
trial.flags.outside_mult = 0.5;
trial.personal.cash = 10;
trial.personal.debt = 0;
S.settle(data, trial);
near(trial.personal.cash, 10 + 4 * 0.5 + trial.last.parts.draw - living, "舊存檔固定季度收入");

// 暫停領錢一季必須覆蓋下一次結算，之後自動恢復。
const paused = opened();
paused.finance.cash = 100;
paused._cf = true;
paused.spine = [];
paused.nextChapter = 999;
paused.founder.wantsDraw = 1;
paused.founder.drawPause = 1;
assert.equal(S.forecast(data, paused).parts.draw, 0);
S.settle(data, paused);
assert.equal(paused.last.parts.draw, 0);
assert.equal(paused.founder.drawPause, 0);
paused.phase = "play";
S.settle(data, paused);
assert.ok(paused.last.parts.draw > 0);

// 個人還債只用生活費後且預留一季的個人現金，不混入公司成本。
const repayment = opened();
repayment.finance.cash = 100;
repayment.personal.cash = 10;
repayment.personal.debt = 3;
repayment._cf = true;
repayment.spine = [];
repayment.nextChapter = 999;
const companyCashBefore = repayment.finance.cash;
S.settle(data, repayment, { noevents: true });
assert.ok(repayment.personal.lastDebtPayment > 0);
near(repayment.personal.debt, 3 - repayment.personal.lastDebtPayment, "個人債下降");
const ledger = cashflowLedger(repayment.last);
near(repayment.finance.cash - companyCashBefore, ledger.net, "個人償債不重複算公司支出");
assert.ok(repayment.personal.cash >= living - 1e-8, "還款後保留一季生活費");

// 現金危機可由事件直接觸發；救援額度、一次性補助、股權資格和再次危機正確。
const crisis = prepareEvent(opened(), "asset_growth");
crisis.venture.marketFit = crisis.venture.trust = 0.6;
crisis.finance.cash = 0.1;
crisis.pendingEvent.choices.push({ id: "test_crisis", label: "測試", effects: { cash: -0.5 } });
finishEvent(data, crisis, "test_crisis");
assert.equal(crisis.phase, "laststand");
assert.equal(crisis.rescueLeft, economy.modes.sandbox.rescue_actions);
assert.ok(S.rescueOptions(data, crisis).some((o) => o.id === "bridge_support"));
const supportChance = S.boldChance(data, crisis, economy.opportunities.rescue_chance);
crisis.rngState = seedWithRoll((r, c) => r >= c, supportChance);
const failedSupport = S.chooseRescue(data, crisis, "bridge_support");
assert.equal(failedSupport.ok, true);
assert.equal(crisis.lastOutcome.success, false);
assert.equal(crisis.rescueLeft, economy.modes.sandbox.rescue_actions - 1);
assert.equal(crisis.flags.rescue_bridge, true);
assert.ok(!S.rescueOptions(data, crisis).some((o) => o.id === "bridge_support"));
// 另一支測試成功補助及再次危機。
const support = prepareEvent(opened(), "asset_growth");
support.venture.marketFit = support.venture.trust = 0.6;
support.finance.cash = 0.1;
support.pendingEvent.choices.push({ id: "crash", label: "測試", effects: { cash: -0.5 } });
finishEvent(data, support, "crash");
support.rngState = seedWithRoll((r, c) => r < c, S.boldChance(data, support, economy.opportunities.rescue_chance));
const debtBefore = support.finance.debt, controlBefore = support.founder.control;
assert.equal(S.chooseRescue(data, support, "bridge_support").ok, true);
assert.equal(support.lastOutcome.success, true);
assert.equal(support.finance.debt, debtBefore);
assert.equal(support.founder.control, controlBefore);
assert.equal(support.phase, "play");
// 下一次新的現金危機需重設本次嘗試數，並不得重新申請一次性補助。
support.rescueLeft = 1;
support.phase = "event";
support.pendingEvent = { id: "second_crisis", choices: [{ id: "crash", effects: { cash: -100 } }] };
finishEvent(data, support, "crash");
assert.equal(support.phase, "laststand");
assert.equal(support.rescueLeft, economy.modes.sandbox.rescue_actions);
assert.ok(!S.rescueOptions(data, support).some((o) => o.id === "bridge_support"));
// 過度稀釋時不可再引資。
const equity = prepareEvent(opened(), "asset_growth");
equity.finance.cash = 0.1;
equity.founder.control = 0.28;
equity.pendingEvent.choices.push({ id: "crash", label: "測試", effects: { cash: -0.5 } });
finishEvent(data, equity, "crash");
assert.ok(!S.rescueOptions(data, equity).some((o) => o.id === "equity"));
const declined = S.chooseRescue(data, equity, "close");
assert.equal(declined.ok, true);
assert.equal(equity.phase, "ending", "高風險情況仍可結業");
// 股權救援之後四季內不可無限引資。
const funding = prepareEvent(opened(), "asset_growth");
funding.venture.marketFit = funding.venture.trust = 0.6;
funding.finance.cash = 0.1;
funding.pendingEvent.choices.push({ id: "crash", label: "測試", effects: { cash: -0.5 } });
finishEvent(data, funding, "crash");
assert.ok(S.rescueOptions(data, funding).some((o) => o.id === "equity"));
assert.equal(S.chooseRescue(data, funding, "equity").ok, true);
funding.phase = "laststand";
assert.ok(!S.rescueOptions(data, funding).some((o) => o.id === "equity"));
funding.month += 4;
assert.ok(S.rescueOptions(data, funding).some((o) => o.id === "equity"));

console.log("operating: 10 company types, old saves, seeded branches, capacity, cashflow, loans, trial and rescue ok");
