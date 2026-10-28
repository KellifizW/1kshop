// 可重現的長期固定種子樣本；詳見 gameplay-research.md。
// node --experimental-default-type=module tests/long-balance.mjs
// 可用 SHOP_ROOT 指向另一個版本；兩個版本均鎖定同一種子版本及原有 24 個市場缺口。
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.env.SHOP_ROOT || resolve(here, ".."));
const S = await import(pathToFileURL(resolve(root, "js/sim.js")));
const load = (name) => JSON.parse(readFileSync(resolve(root, `data/${name}.json`), "utf8"));
const life = load("life-events"), content = load("content"), economy = load("economy");
const seedVersion = process.env.SIM_SEED_VERSION || "1.0.0";
economy.meta.simulation_version = seedVersion; // 配對比較時鎖住開局亂數，不代表新版仍是 1.0。
const selectedType = process.env.COMPANY_TYPE
  ? (content.company_types || []).find((t) => t.id === process.env.COMPANY_TYPE)
  : null;
if (process.env.COMPANY_TYPE) assert.ok(selectedType, "COMPANY_TYPE must be a known company type ID");
if (process.env.ALL_GAPS !== "1" && !selectedType) {
  content.gaps = content.gaps.filter((g) => !g.company_type);
  assert.equal(content.gaps.length, 24, "配對比較應只使用原有 24 個缺口");
}
const data = {
  world: load("world"), content, economy,
  events: [...load("events").events, ...life.events],
  narrative: { ...load("narrative"), beats: [...load("narrative").beats, ...life.beats] },
};
const n = Number(process.env.SAMPLE_SIZE || 400);
assert.ok(Number.isInteger(n) && n > 0 && n <= 10000, "SAMPLE_SIZE must be an integer from 1 to 10000");
const strategies = [
  { name: "aggressive", style: "quit", venue: "street", pos: "cheap", ownership: "sole", preferBold: true },
  { name: "balanced", style: "part", venue: "studio", pos: "easy", ownership: "sole", preferBold: false },
  { name: "hybrid", style: "keep", venue: "home", pos: "easy", ownership: "partner", preferBold: false },
];
const results = [];
for (const strategy of strategies) for (const allowRescue of [false, true]) {
  const targets = [8, 16, 40], reach = [0, 0, 0], crisisBefore = [0, 0, 0];
  let ended = 0, personalDebt = 0, fourYearCount = 0, positiveOperating = 0;
  let surprisePlayers = 0, boldOutcomes = 0, successfulBold = 0;
  for (let i = 0; i < n; i += 1) {
    const run = S.createRun(data, {
      seed: `cohort-${i}`, mode: "story",
      ...(selectedType ? { sandbox: { gap: selectedType.gap_id } } : {}),
    });
    if (selectedType) assert.equal(run.gapId, selectedType.gap_id);
    run.shape = {
      style: strategy.style, venue: strategy.venue, positioning: strategy.pos, ownership: strategy.ownership,
      revenue: S.allowedRevenue(data, run)[0], fulfillment: S.allowedFulfillment(data, run)[0],
    };
    run.phase = "shaping";
    assert.equal(S.confirmShape(data, run).ok, true);
    S.confirmName(run, "測試");
    run.firstMajor = {}; // 不跑反事實，免得額外模擬影響耗時。
    const checked = [false, false, false];
    let hasCrisis = false, steps = 0;
    while (steps++ < 1000 && !run.ending) {
      if (run.phase === "play") {
        for (let j = 0; j < targets.length; j += 1) {
          if (run.month < targets[j] || checked[j]) continue;
          checked[j] = true;
          reach[j] += 1;
          if (hasCrisis) crisisBefore[j] += 1;
          if (j === 1) {
            personalDebt += run.personal.debt;
            fourYearCount += 1;
            if (run.finance.lastProfit > 0) positiveOperating += 1;
          }
        }
        if (run.month >= 40) break;
        S.settle(data, run);
      } else if (run.phase === "event") {
        const event = run.pendingEvent;
        let choice = S.suggestEventChoice(event, run, data);
        if (strategy.preferBold && event.id === "scale_fork") choice = "city";
        if (strategy.preferBold && event.id === "year_review") choice = "scale";
        assert.equal(S.chooseEvent(data, run, choice).ok, true, `event: ${event.id}/${choice}`);
      } else if (run.phase === "chapter") S.continueChapter(run);
      else if (run.phase === "laststand") {
        hasCrisis = true;
        if (!allowRescue) break; // 這個樣本量的是第一次危機之前，而不是把危機當成實際結局。
        const options = S.rescueOptions(data, run);
        const order = ["collect_early", "bridge_support", "equity", "presell", "delay", "borrow", "asset", "turnaround_lean", "shrink", "nodraw", "close"];
        const choice = order.find((id) => options.some((o) => o.id === id));
        assert.ok(choice, "rescue must have an option");
        assert.equal(S.chooseRescue(data, run, choice).ok, true);
      } else if (run.phase === "succession") {
        const options = S.successorOptions(data, run);
        S.chooseSuccessor(data, run, options.find((o) => o.id !== "sell")?.id || options[0]?.id);
      } else if (run.phase === "summary") S.ackSummary(run);
      else throw new Error(`Unexpected phase: ${run.phase}`);
    }
    assert.ok(steps < 1000, `stuck: ${strategy.name}/${i}/${run.phase}`);
    if (run.ending) ended += 1;
    if (Object.keys(run.seen).some((id) => id.startsWith("surprise_"))) surprisePlayers += 1;
    for (const choice of run.choices || []) if (choice.outcome) {
      boldOutcomes += 1;
      if (choice.outcome === "success") successfulBold += 1;
    }
  }
  const pct = (value, total = n) => total ? Math.round(value / total * 1000) / 10 : null;
  const result = {
    strategy: strategy.name, rescue: allowRescue,
    reached2y: pct(reach[0]), reached4y: pct(reach[1]), reached10y: pct(reach[2]),
    hadCrisisAndReached4y: pct(crisisBefore[1]),
    positiveOperatingAmong4y: pct(positiveOperating, fourYearCount),
    meanPersonalDebtAmong4y: fourYearCount ? Math.round(100 * personalDebt / fourYearCount) / 100 : null,
    surprisePlayers: pct(surprisePlayers), boldOutcomes: pct(successfulBold, boldOutcomes), ended: pct(ended),
  };
  results.push(result);
  console.log(JSON.stringify(result));
}
// 偵測「兩至四年幾乎必倒」的明顯回歸，同時保留會失敗的高風險情況。
if (!process.env.SHOP_ROOT && n >= 100 && process.env.ALL_GAPS !== "1" && !selectedType) {
  assert.ok(results.find((r) => r.strategy === "aggressive" && r.rescue).reached4y >= 65);
  assert.ok(results.find((r) => r.strategy === "balanced" && r.rescue).reached4y >= 70);
  assert.ok(results.find((r) => r.strategy === "hybrid" && r.rescue).reached4y >= 70);
  assert.ok(results.find((r) => r.strategy === "aggressive" && !r.rescue).reached4y < 100);
}
