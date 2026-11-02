// 專項回歸：創辦人健康／意志產能、強制休養、個人債務與公司存續分離。
// node --experimental-default-type=module tests/founder-solvency.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../js/sim.js";
import { cashflowLedger } from "../js/cashflow.js";

const load = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url)));
const life = load("life-events");
const data = {
  world: load("world"), economy: load("economy"), content: load("content"),
  events: [...load("events").events, ...life.events],
  narrative: { ...load("narrative"), beats: [...load("narrative").beats, ...life.beats] },
};
const near = (a, b, msg, tol = 1e-8) => assert.ok(Math.abs(a - b) < tol, `${msg}: ${a} ≠ ${b}`);

function opened({ seed = "founder-rules", health = 0.82, will = 0.74, control = 0.72, debt = 0, cash = 7.5 } = {}) {
  const r = S.createRun(data, { mode: "sandbox", seed, sandbox: { city: "cdmx", gap: "ai_workflow", age: 32, assets: cash, match: true } });
  Object.assign(r.shape, {
    style: "quit", venue: "home", ownership: "sole", positioning: "pro",
    revenue: S.allowedRevenue(data, r)[0], fulfillment: S.allowedFulfillment(data, r)[0],
  });
  assert.equal(S.confirmShape(data, r).ok, true);
  S.confirmName(r, "機制回歸");
  Object.assign(r.founder, { health, will, control, wantsDraw: 0 });
  Object.assign(r.personal, { cash: 0, debt, planLeft: 0, distressQuarters: 0 });
  r.finance.cash = 100;
  r.spine = [];
  r.nextChapter = 999;
  r.firstMajor = {};
  r._cf = true; // 關掉隨機小事，保留核心結算與強制事件。
  return r;
}

// 1. 健康 0%、意志 3%、控制權 72% 不再讓創辦人照常產出。
const broken = opened({ health: 0, will: 0.03, control: 0.72, debt: 15 });
assert.equal(S.founderCapacity(data, broken).availability, 0);
assert.equal(S.forecast(data, broken).revenue[0], 0, "一人公司健康歸零時不應有創辦人產能");
const beforePreview = JSON.stringify(broken);
assert.equal(S.previewMonth(data, broken), null, "強制休養前不應預演下一季收支");
assert.equal(JSON.stringify(broken), beforePreview, "預演不可改動真實存檔");
assert.deepEqual(S.initiatives(data, broken).map((x) => x.id), ["mandatory_founder"]);
S.settle(data, broken);
assert.equal(broken.phase, "event");
assert.equal(broken.pendingEvent.id, "health_crisis");
assert.equal(broken.month, 0, "強制事件不能先免費推進一季");
assert.equal(S.chooseEvent(data, broken, "handoff").ok, true);
assert.equal(broken.founder.recoveryLeft, 2);
assert.equal(broken.founder.hours, 0);
assert.ok(broken.team.headcount >= 1);
for (let q = 0; q < 2; q += 1) {
  broken.finance.cash = 100;
  S.settle(data, broken);
  assert.equal(broken._probe.founderUnits, 0, "休養期間創辦人產能必須是零");
  assert.ok(broken.founder.health > 0);
}
assert.equal(broken.founder.recoveryLeft, 0);
assert.ok(S.founderCapacity(data, broken).availability > 0);
assert.ok(S.founderCapacity(data, broken).availability < 1, "休養後仍受尚未完全恢復的健康／意志限制");
// 再次跌到臨界值仍會觸發，不是一生一次。
broken.personal.debt = 0;
broken.personal.distressQuarters = 0;
broken.pendingEvent = null;
broken.phase = "play";
broken.founder.health = 0;
S.settle(data, broken);
assert.equal(broken.pendingEvent?.id, "health_crisis");

// 2. 個人債務會計息、補貼有上限，連續無力償債會強制處理，但不直接沒收公司。
const debtor = opened({ health: 0.8, will: 0.7, debt: 15 });
const living = S.livingCost(data, debtor);
S.settle(data, debtor);
near(debtor.personal.lastInterest, 15 * data.economy.personal_finance.interest_quarterly, "第一季個人利息");
assert.ok(debtor.personal.debt > 15);
assert.equal(debtor.personal.distressQuarters, 1);
assert.ok(debtor.personal.lastPersonalTransfer <= living * data.economy.personal_finance.distress_support_living_multiple + 1e-8);
S.settle(data, debtor);
assert.equal(debtor.phase, "event");
assert.equal(debtor.pendingEvent.id, "personal_debt_crisis");
assert.ok(debtor.finance.cash > 0, "個人債務危機不等於公司現金危機");
assert.notEqual(debtor.phase, "laststand");
const companyCash = debtor.finance.cash;
const ledger = cashflowLedger(debtor.last);
near(ledger.net, debtor.last.cash - debtor.last.cashStart, "個人利息／還款不混入公司現金帳");
assert.equal(S.chooseEvent(data, debtor, "work_and_repay").ok, true);
assert.equal(debtor.personal.planLeft, 8);
assert.ok(debtor.founder.hours <= 0.45);
assert.equal(debtor.flags.outside_share, 0.45);
const debtBeforePlan = debtor.personal.debt;
debtor.finance.cash = 100;
S.settle(data, debtor);
near(debtor.personal.lastInterest, debtBeforePlan * data.economy.personal_finance.interest_quarterly * data.economy.personal_finance.plan_interest_multiplier, "還款安排利息減半");
assert.equal(debtor.personal.planLeft, 7);
assert.equal(debtor.finance.cash > 0, true);
assert.ok(companyCash > 0);

// 3. 出售個人股權只改善個人帳，不替公司憑空加現金；一次性選項會鎖死。
const seller = opened({ health: 0.8, will: 0.7, debt: 15, control: 0.72 });
S.settle(data, seller);
S.settle(data, seller);
assert.equal(seller.pendingEvent?.id, "personal_debt_crisis");
const saleChoice = seller.pendingEvent.choices.find((c) => c.id === "sell_stake");
assert.equal(S.eventChoiceDisabled(data, seller, saleChoice), false);
const sellerCompanyCash = seller.finance.cash;
const sellerDebt = seller.personal.debt;
assert.equal(S.chooseEvent(data, seller, "sell_stake").ok, true);
near(seller.finance.cash, sellerCompanyCash, "個人出售股權不增加公司現金");
near(seller.personal.debt, Math.max(0, sellerDebt - data.economy.personal_finance.equity_sale_proceeds), "套現優先用於還債");
near(seller.founder.control, 0.52, "控制權下降 20 個百分點");
assert.equal(seller.flags.personal_equity_sold, true);
assert.equal(S.eventChoiceDisabled(data, seller, saleChoice), true);

// 4. 已接班且有團隊的公司，不再把創辦人的健康當成日常產能。
const handed = opened({ health: 0, will: 0 });
handed.founder.exited = true;
handed.operator = { name: "接班人", age: 44, type: "pro" };
handed.team.headcount = 2;
S.ensureCrew(data, handed);
S.settle(data, handed);
assert.notEqual(handed.pendingEvent?.id, "health_crisis");
assert.ok(handed.last.revenue > 0, "有接班人與團隊時公司可以繼續");

// 5. 舊存檔補欄位且不重置債務；舊版「暫停」旗標會變成真正的休養。
const legacy = opened({ health: 0.2, will: 0.2, debt: 9 });
delete legacy.founder.recoveryLeft;
delete legacy.personal.planLeft;
delete legacy.personal.distressQuarters;
legacy.flags.founder_rules_v2 = false;
legacy.flags.founder_absent = true;
S.ensureFounderRules(data, legacy);
assert.equal(legacy.founder.recoveryLeft, 2);
assert.equal(legacy.founder.hours, 0);
assert.equal(legacy.personal.debt, 9);
assert.equal(legacy.personal.planLeft, 0);

console.log("founder-solvency: capacity, mandatory recovery, recurrence, personal interest, support cap, debt crisis, equity sale, succession and legacy saves OK");
