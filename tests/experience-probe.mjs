// 體驗探針：把「好不好玩」拆成可以量度的幾個數字。
//
//   node --experimental-default-type=module tests/experience-probe.mjs
//   node --experimental-default-type=module tests/experience-probe.mjs --check   # 用 SLO 門檻判斷，不合格時 exit 1
//
// 2026-10 的基線本身有 6 項未達標（現金曲線、事件重量、紅線、塑形差距、重玩重疊），
// 所以現在跑 --check 會以 exit 1 結束；修好之後它才變成回歸門檻。判讀見
// gameplay-review-2026-10.md。
//
// 這支腳本不改遊戲、不碰存檔，只用固定種子模擬，量六件事：
//   1. 錢的曲線：被動玩家與積極玩家的現金／生活費比例、存活率
//   2. 事件的重量：事件最大現金代價佔當時現金多少
//   3. 結構紅線：中期之後還會不會亮
//   4. 六頁塑形：同一組選項之內的存活率差距（有沒有支配解）
//   5. 重玩新鮮感：相鄰兩局的事件重疊比例
//   6. 決定密度：每局決定數、決定之間的季數
//
// 全部數字都是這套規則下的模擬結果，不是現實統計；也不是「玩家一定這樣玩」，
// 而是用兩種極端政策（完全不行動 / 每季都用一個經營行動）去看系統的邊界。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.env.SHOP_ROOT || resolve(here, ".."));
const S = await import(new URL(`file://${resolve(root, "js/sim.js")}`).href);
const load = (name) => JSON.parse(readFileSync(resolve(root, `data/${name}.json`), "utf8"));

const content = load("content");
const economy = load("economy");
const life = load("life-events");
const data = {
  world: load("world"),
  content,
  economy,
  events: [...load("events").events, ...life.events],
  narrative: { ...load("narrative"), beats: [...load("narrative").beats, ...life.beats] },
};

const CHECK = process.argv.includes("--check");
const SEEDS = Math.max(1, Number(process.env.PROBE_SEEDS || 60));
const GAPS = content.gaps.slice(0, 24); // 用原有 24 個缺口，樣本才穩定
const LIVING = economy.formula.living_cost;
const BASE_SHAPE = { style: "part", venue: "online", ownership: "sole", positioning: "easy" };

const median = (list) => {
  const a = list.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : NaN;
};
const pct = (n) => Math.round(n * 10) / 10;

function open(data, seed, gapId, shape = {}, opts = {}) {
  const run = S.createRun(data, {
    seed,
    mode: opts.mode || "sandbox",
    sandbox: { gap: gapId, assets: 0 },
    history: opts.history || { events: [], beats: [], cities: [], families: [], gaps: [] },
  });
  run.shape = {
    ...BASE_SHAPE,
    revenue: S.allowedRevenue(data, run)[0],
    fulfillment: S.allowedFulfillment(data, run)[0],
    ...shape,
  };
  run.phase = "shaping";
  const res = S.confirmShape(data, run);
  if (!res.ok) throw new Error(`shape rejected: ${JSON.stringify(res)}`);
  S.confirmName(run, "探針");
  run.firstMajor = {}; // 不在樣本裡跑反事實模擬，避免拖慢。
  return run;
}

const ACTION_ORDER = [
  "collect_early", "turnaround_lean", "expand", "new_product", "second_channel",
  "partner", "optimize", "hire", "market", "rest",
];
const RESCUE_ORDER = [
  "collect_early", "bridge_support", "equity", "presell", "delay", "borrow",
  "asset", "turnaround_lean", "shrink", "nodraw", "close",
];

/** 玩一局；active 代表每一季都按一次經營行動，passive 代表只答事件。 */
function play(seed, gapId, { active = false, shape = {}, maxMonths = 40, story = false, history = null } = {}) {
  const run = open(data, seed, gapId, shape, {
    mode: story ? "story" : "sandbox",
    history: history || undefined,
  });
  const log = { decisions: [], events: [], actions: 0, cashAt: {}, redlineAt: {} };
  let steps = 0;
  while (steps++ < 4000 && !run.ending) {
    if (run.phase === "play") {
      if (run.month >= maxMonths) break;
      if (active) {
        const available = S.initiatives(data, run).filter((it) => !it.disabled);
        const pick = ACTION_ORDER.find((id) => available.some((it) => it.id === id));
        if (pick && S.actInitiative(data, run, pick).ok) {
          log.actions += 1;
          log.decisions.push(run.month);
        }
      }
      const before = run.month;
      S.settle(data, run);
      if (run.month === before) break;
      if ([12, 24, 40, 80].includes(run.month)) {
        log.cashAt[run.month] = run.finance.cash;
        log.redlineAt[run.month] = S.computeRedline(data, run)?.level || "none";
      }
    } else if (run.phase === "event") {
      log.events.push(run.pendingEvent.id);
      log.decisions.push(run.month);
      S.chooseEvent(data, run, S.suggestEventChoice(run.pendingEvent, run, data));
    } else if (run.phase === "chapter") {
      log.decisions.push(run.month);
      S.continueChapter(run);
    } else if (run.phase === "summary") {
      S.ackSummary(run);
    } else if (run.phase === "laststand") {
      log.decisions.push(run.month);
      const options = S.rescueOptions(data, run);
      const pick = RESCUE_ORDER.find((id) => options.some((o) => o.id === id));
      if (!pick) break;
      S.chooseRescue(data, run, pick);
    } else if (run.phase === "succession") {
      log.decisions.push(run.month);
      const options = S.successorOptions(data, run);
      S.chooseSuccessor(data, run, options.find((o) => o.id !== "sell")?.id || options[0].id);
    } else break;
  }
  const quarters = Object.keys(log.cashAt).length ? Math.max(...Object.keys(log.cashAt).map(Number)) : run.month;
  return {
    run,
    log,
    months: run.ending?.month ?? run.month,
    reached: (n) => (run.ending?.month ?? run.month) >= n,
    cash: run.finance.cash,
    quarters: Math.min(run.month, maxMonths),
  };
}

function cohort({ active = false, shape = {}, maxMonths = 40, n = SEEDS } = {}) {
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    rows.push(play(`probe-${active ? "a" : "p"}-${i}`, GAPS[i % GAPS.length].id, { active, shape, maxMonths }));
  }
  return rows;
}

const lines = [];
const record = (key, value, slo, note = "") => lines.push({ key, value, slo, note, ok: slo == null ? null : slo(value) });

/* ── 1. 錢的曲線 ─────────────────────────────────────── */
const passive = cohort({ active: false });
const active = cohort({ active: true });
const survive = (rows, n) => pct(rows.filter((r) => r.reached(n)).length / rows.length * 100);
const cashAt = (rows, m) => median(rows.map((r) => r.log.cashAt[m]).filter(Number.isFinite));

const passiveCash40 = cashAt(passive, 40);
const activeCash40 = cashAt(active, 40);
record("被動玩家：第 40 季現金", `${(passiveCash40 / LIVING).toFixed(1)} 季`,
  (v) => parseFloat(v) <= 12, "季生活費；理想 3–12，太高代表錢不再是限制");
record("積極玩家：第 40 季現金", `${(activeCash40 / LIVING).toFixed(1)} 季`,
  (v) => parseFloat(v) <= 18, "季生活費；超過 18 就等於後期沒有取捨");
record("被動玩家：活到第 40 季", `${survive(passive, 40)}%`, (v) => parseFloat(v) >= 55 && parseFloat(v) <= 92, "");
record("積極玩家：活到第 40 季", `${survive(active, 40)}%`, (v) => parseFloat(v) >= 45 && parseFloat(v) <= 90, "");

/* ── 2. 事件的重量 ───────────────────────────────────── */
const cashEffects = data.events
  .flatMap((e) => (e.choices || []).map((c) => -((c.effects || {}).cash || 0)))
  .filter((n) => n > 0);
const heaviest = Math.max(...cashEffects);
const heavyShare = pct(heaviest / activeCash40 * 100);
record("最貴的事件佔第 40 季現金", `${heavyShare}%`, (v) => parseFloat(v) >= 3 || activeCash40 < 6, "低於 3% 代表事件沒有重量");

/* ── 3. 結構紅線 ─────────────────────────────────────── */
const redline = { 12: {}, 24: {}, 40: {}, 80: {} };
for (const row of active) for (const [m, lv] of Object.entries(row.log.redlineAt)) redline[m][lv] = (redline[m][lv] || 0) + 1;
const warnShare = (m) => {
  const t = redline[m] || {};
  const total = Object.values(t).reduce((a, b) => a + b, 0) || 1;
  return pct((((t.warn || 0) + (t.crit || 0)) / total) * 100);
};
record("第 24 季紅線亮起", `${warnShare(24)}%`, (v) => parseFloat(v) >= 20, "warn+crit 佔比；一直綠就不是紅線");
record("第 40 季紅線亮起", `${warnShare(40)}%`, (v) => parseFloat(v) >= 20, "");

/* ── 4. 六頁塑形：同組之內有沒有支配解 ───────────────── */
function spreadOf(key, ids) {
  const rows = [];
  for (const activePlay of [false, true]) {
    for (const id of ids) {
      const runs = [];
      for (let i = 0; i < Math.min(SEEDS, 30); i += 1) {
        runs.push(play(`shape-${key}-${id}-${i}`, GAPS[i % GAPS.length].id, { active: activePlay, shape: { [key]: id }, maxMonths: 40 }));
      }
      rows.push({ id, active: activePlay, survive40: pct(runs.filter((r) => r.reached(40)).length / runs.length * 100) });
    }
  }
  const spreadIn = (activePlay) => {
    const values = rows.filter((r) => r.active === activePlay).map((r) => r.survive40);
    return pct(Math.max(...values) - Math.min(...values));
  };
  return { rows, passive: spreadIn(false), active: spreadIn(true), spread: Math.max(spreadIn(false), spreadIn(true)) };
}
const shapeSpreads = [
  spreadOf("style", Object.keys(economy.commitment_styles)),
  spreadOf("venue", Object.keys(economy.venues)),
  spreadOf("ownership", Object.keys(economy.ownership)),
  spreadOf("positioning", Object.keys(economy.positioning)),
];
const worstShape = shapeSpreads.slice().sort((a, b) => b.spread - a.spread)[0];
record("塑形選項存活率最大差距", `${worstShape.spread} 點`, (v) => parseFloat(v) <= 30,
  "同組最好與最差選項，40 季存活率相差幾個百分點");

/* ── 5. 重玩新鮮感 ───────────────────────────────────── */
function overlap(story) {
  let memory = [];
  const sets = [];
  for (let i = 0; i < 10; i += 1) {
    const history = story ? { events: memory, beats: [], cities: [], families: [], gaps: [] } : null;
    const r = play(`replay-${story ? "s" : "x"}-${i}`, GAPS[i % GAPS.length].id, {
      active: true, maxMonths: 120, story, history,
    });
    sets.push(new Set(r.log.events));
    memory = [...r.log.events, ...memory].slice(0, 30);
  }
  let same = 0, total = 0;
  for (let i = 1; i < sets.length; i += 1) {
    for (const id of sets[i]) { total += 1; if (sets[i - 1].has(id)) same += 1; }
  }
  return total ? pct(same / total * 100) : 0;
}
const storyOverlap = overlap(true);
record("相鄰兩局事件重疊", `${storyOverlap}%`, (v) => parseFloat(v) <= 45, "故事模式、同一種子群；越接近 100 越似曾相識");

/* ── 6. 決定密度 ─────────────────────────────────────── */
const gapsOf = (rows) => {
  const out = [];
  for (const row of rows) {
    const months = [...new Set(row.log.decisions)].sort((a, b) => a - b);
    for (let i = 1; i < months.length; i += 1) out.push(months[i] - months[i - 1]);
  }
  return out.sort((a, b) => a - b);
};
const meanDecisions = (rows) => (rows.reduce((s, r) => s + new Set(r.log.decisions).size, 0) / rows.length).toFixed(1);
const medianGap = (rows) => {
  const g = gapsOf(rows);
  return g[Math.floor(g.length / 2)] ?? 0;
};
record("每局事件決定數（被動）", `${meanDecisions(passive)} 個`,
  (v) => parseFloat(v) >= 12 && parseFloat(v) <= 45, "10 年內；太少等於看電影，太多等於疲勞");
record("每局決定數（積極）", `${meanDecisions(active)} 個`,
  (v) => parseFloat(v) >= 18 && parseFloat(v) <= 60, "含自己按的經營行動");
record("決定之間的中位季數", `${medianGap(passive)} 季`,
  (v) => parseFloat(v) >= 1 && parseFloat(v) <= 2.5, "只計事件／危機／章節，不含自己按的行動");

/* ── 輸出 ───────────────────────────────────────────── */
const width = (s) => [...String(s)].reduce((n, ch) => n + (/[\u3000-\u9fff]/.test(ch) ? 2 : 1), 0);
const pad = (s, n) => String(s) + " ".repeat(Math.max(1, n - width(s)));
console.log(`\n體驗探針 · ${SEEDS} 個種子／組 · 生活費 ${LIVING} 單位／季 · ${data.events.length} 個事件\n`);
console.log(pad("指標", 32) + pad("實測", 12) + "判讀");
console.log("─".repeat(78));
for (const line of lines) {
  const flag = line.ok === false ? " ✗" : line.ok === true ? " ✓" : "";
  console.log(pad(line.key, 32) + pad(line.value, 12) + (line.note || "") + flag);
}
console.log("\n塑形選項存活率（同組比較，40 季；左＝只答事件，右＝每季用一次經營行動）：");
for (const group of shapeSpreads) {
  const on = (a) => group.rows.filter((r) => r.active === a).map((r) => `${r.id} ${r.survive40}%`).join(" · ");
  console.log(`─ ${group.rows[0].id} 類：被動 ${group.passive} 點 / 積極 ${group.active} 點`);
  console.log(`   被動：${on(false)}`);
  console.log(`   積極：${on(true)}`);
}
console.log("");

const failed = lines.filter((l) => l.ok === false);
if (CHECK) {
  if (failed.length) {
    console.log(`SLO 未達標 ${failed.length} 項：${failed.map((f) => f.key).join("、")}`);
    process.exit(1);
  }
  console.log("SLO 全部達標。");
} else if (failed.length) {
  console.log(`（參考）${failed.length} 項偏離建議範圍；加 --check 可作為回歸門檻。`);
}
