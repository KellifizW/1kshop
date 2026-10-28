/**
 * 把數據變成玩家看得見、感受得到、可以回味的戲劇。
 *
 * 這裡做三件事：
 * 1. monthStory　　季結先講故事，再講損益表。
 * 2. evaluateLife　結局不是只檢查資產，而是綜合八個軸，選出一個「這一局是甚麼」。
 * 3. memorial　　　創業訃告／企業紀念卡：一張值得分享的直式卡片的內容。
 *
 * 全部是純函式，讀 run 與 data，回傳文字與數字。
 */
import { hashSeed } from "./rng.js";
import { money, monthsLabel, worldLine, rarityLine } from "./present.js";
import { cashflowLedger } from "./cashflow.js";
import { confirmedMarks, fillCrew, lifeLabel } from "./sim.js";
import { SCENES, sceneOf } from "./stage.js";

/** 「由一間街舖開始」對餐飲成立，對網店、攤車、上門服務就不成立。用場景講。 */
function sceneLabelOf(data, run) {
  const label = SCENES[sceneOf(data, run)]?.label || "一間小店";
  const unit = /桌|攤車|雲端/.test(label) ? "一個" : "一間";
  return `${unit}${label}`;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const r0 = (n) => Math.round(num(n, 0)).toLocaleString("zh-Hant");

/** 同一季每次 render 都挑到同一句，畫面才不會閃。 */
function pick(data, run, key, list) {
  if (!list?.length) return "";
  const h = hashSeed(`${run.seed}:${run.month}:${key}`);
  return list[h % list.length];
}

function fillVars(data, run, text, vars) {
  const map = { company: run.venture?.name, sells: run.work?.sells, ...vars };
  const out = String(text || "").replace(/\{(\w+)\}/g, (all, k) => (map[k] == null || map[k] === "" ? all : String(map[k])));
  // 剩下的 {kinWho} 之類交給 sim 的人物表；沒有的部分保留原樣，避免出現「那個人」。
  return out.replace(/\{(\w+)\}/g, (all, k) => (castToken(data, run, k) ?? all));
}

const CAST_KEYS = ["customer", "employee", "partner", "family", "kinName", "kinWho", "kinRelation", "kinNeed", "city", "landlord", "supplier", "mentor", "peer", "trade", "buyer", "unit"];
function castToken(data, run, k) {
  if (!CAST_KEYS.includes(k)) return null;
  if (k === "city") return worldLine(data, run).city.name;
  if (k === "peer") return run.peers?.[0]?.name;
  if (k === "employee") return (run.crew || []).find((c) => !c.gone)?.name || run.team?.names?.[0];
  if (k === "customer" || k === "partner" || k === "mentor" || k === "landlord" || k === "supplier") return run.cast?.[k];
  if (k === "kinName") return run.cast?.kin?.name;
  if (k === "kinWho") return run.cast?.kin?.who;
  if (k === "kinRelation") return run.cast?.kin?.relation;
  if (k === "kinNeed") return run.cast?.kin?.need;
  if (k === "family") return run.cast?.kin?.name || run.cast?.home;
  if (k === "trade") return run.work?.name;
  if (k === "buyer") return run.work?.buyer;
  if (k === "unit") return run.work?.unit;
  return null;
}

/* ── 1. 季結：先故事，後損益表 ─────────────────────────── */

export function monthStory(data, run) {
  const N = data.narrative;
  const ops = run.last?.ops || run.lastOps;
  const parts = run.last?.parts || {};
  const k = run.kpis || {};
  const wx = run.weather;
  const crew = (run.crew || []).filter((c) => !c.gone);
  const tired = crew.slice().sort((a, b) => num(b.stress, 0) - num(a.stress, 0))[0];
  const beats = run.lastBeats || [];
  const left = beats.find((b) => b.id === "crew_leave");
  const joined = beats.find((b) => b.id === "crew_join");
  const promoted = beats.find((b) => b.id === "crew_promote");
  const profit = num(run.last?.revenue, 0) - num(parts.operating, 0);
  const runway = num(run.finance?.runway, 9);
  const revenue = num(run.last?.revenue, 0);
  const out = [];

  if (wx && ["rain", "downpour", "storm", "snow"].includes(wx.id)) {
    out.push(fillVars(data, run, pick(data, run, "wx", N.month_story?.[wx.id] || N.month_story?.rain), { rainDays: wx.days }));
  } else if (wx && ["heat", "cold"].includes(wx.id)) {
    out.push(fillVars(data, run, pick(data, run, "wx", N.month_story?.[wx.id]), {}));
  }

  if (ops && ops.lost > Math.max(6, ops.orders * 0.12)) {
    out.push(fillVars(data, run, pick(data, run, "backlog", N.month_story?.backlog), { backlog: r0(ops.backlog), lost: r0(ops.lost) }));
  } else if (ops && ops.utilization > 0.94) {
    out.push(fillVars(data, run, pick(data, run, "rush", N.month_story?.rush), {}));
  } else if (ops && ops.orders > 0 && ops.lost <= 2) {
    out.push(fillVars(data, run, pick(data, run, "smooth", N.month_story?.smooth), {}));
  }

  const released = num(parts.releasing, 0);
  const commitment = (run.commitments || []).slice().sort((a, b) => a.monthsLeft - b.monthsLeft)[0];
  if (profit > 0 && released > revenue * 0.18 && commitment) {
    out.push(fillVars(data, run, pick(data, run, "saved", N.month_story?.commitment_saved), { commitment: commitment.name }));
  } else if (profit > 0 && k.profitMonths === 1) {
    out.push(fillVars(data, run, pick(data, run, "first", N.month_story?.profit_first), {}));
  }

  if (left) out.push(fillVars(data, run, left.text, {}));
  else if (promoted) out.push(fillVars(data, run, promoted.text, {}));
  else if (joined) out.push(fillVars(data, run, joined.text, {}));
  else if (tired && num(tired.stress, 0) > 0.62 && tired.overtimeDays > 8) {
    out.push(fillVars(data, run, pick(data, run, "tired", N.month_story?.crew_tired), { name: tired.name, overtime: tired.overtimeDays }));
  }

  if (num(parts.platformRate, 0) > 0.14) {
    out.push(fillVars(data, run, pick(data, run, "plat", N.month_story?.platform_fees), { platformPct: Math.round(parts.platformRate * 100) }));
  } else if (num(parts.premises, 0) > revenue * 0.32) {
    out.push(fillVars(data, run, pick(data, run, "rent", N.month_story?.rent), { rentPct: Math.round((parts.premises / Math.max(0.01, revenue)) * 100) }));
  }

  if (runway < 3) {
    out.push(fillVars(data, run, pick(data, run, "cash", N.month_story?.cash_tight), { runway: runway.toFixed(1) }));
  } else if (run.negStreak >= 3) {
    out.push(fillVars(data, run, pick(data, run, "streak", N.month_story?.loss_streak), { streak: run.negStreak }));
  }

  if (run.flags.second_city && run.month % 4 === 0) out.push(fillVars(data, run, pick(data, run, "exp", N.month_story?.expansion), {}));
  if (!out.length) out.push(fillVars(data, run, pick(data, run, "quiet", N.month_story?.quiet), {}));
  return out.slice(0, 4);
}

/* ── 2. 這一局是甚麼：八個軸，二十六種結局 ──────────────── */

export function lifeScores(data, run) {
  const k = run.kpis || {};
  const v = run.venture || {};
  const months = run.ending?.month ?? run.month ?? 0;
  const marks = Object.fromEntries(confirmedMarks(data, run).map((m) => [m.id, m.value]));
  const crew = run.crew || [];
  const live = crew.filter((c) => !c.gone);
  const loyaltyAvg = crew.length ? crew.reduce((s, c) => s + num(c.loyalty, 0), 0) / crew.length : 0.5;
  const median = num(data.economy.life?.kpis?.median_life_months, 26);

  const lifespan = clamp(1 - Math.pow(0.5, months / median), 0, 1);
  const peak = clamp(num(k.peakRevenue, 0) / num(data.economy.life?.kpis?.peak_value_unit, 12), 0, 1);
  const staff = clamp(
    0.3
    + loyaltyAvg * 0.35
    + Math.min(0.2, num(k.promotes, 0) * 0.1)
    + Math.min(0.15, num(k.raises, 0) * 0.05)
    - Math.min(0.35, num(k.quits, 0) * 0.07)
    - Math.min(0.25, num(k.fired, 0) * 0.08)
    - (marks.grinder ? 0.2 : 0)
    + (marks.people_keeper ? 0.15 : 0),
    0, 1,
  );
  const social = clamp(
    0.2
    + Math.min(0.35, num(k.customers, 0) / 6000)
    + (marks.customer_first ? 0.2 : 0)
    + (run.flags.mission_clause ? 0.15 : 0)
    + (run.flags.craft_handoff ? 0.1 : 0)
    - (marks.platform_leaning ? 0.1 : 0),
    0, 1,
  );
  const trust = clamp(num(v.trust, 0.4), 0, 1);
  const health = clamp(num(run.founder?.health, 0.6), 0, 1);
  const control = clamp(num(run.founder?.control, 1), 0, 1);
  const legacy = clamp(
    0.15
    + Math.min(0.3, (run.memories || []).length / 24)
    + Math.min(0.25, num(run.successionCount, 0) * 0.12)
    + (run.coreKept === false ? -0.25 : 0.1)
    + (v.public ? 0.1 : 0)
    + (months >= 240 ? 0.15 : 0),
    0, 1,
  );
  return { lifespan, peak, staff, social, trust, health, control, legacy, months, marks, live, loyaltyAvg };
}

export const SCORE_LABELS = [
  ["lifespan", "公司壽命"],
  ["peak", "峰值規模"],
  ["staff", "員工待遇"],
  ["social", "社會影響"],
  ["trust", "品牌信任"],
  ["health", "創辦人健康"],
  ["control", "是否保留控制權"],
  ["legacy", "企業傳承"],
];

const ENDING_TO_KEY = {
  century: "century",
  ipo_running: "listed",
  employee_trust: "employee_owned",
  foundation: "employee_owned",
  mission: "reformer",
  sale: "sold",
  merge: "sold",
  privatize: "sold",
  erased: "acquired",
  hostile: "acquired",
  shrink_on: "shrink_survive",
  decline_preserve: "decline_preserve",
  preserve_craft: "decline_preserve",
  family_leave: "family_business",
  partner_break: "partner_break",
  compliance: "compliance_stop",
  guarantee_ruin: "guarantee_ruin",
  return_to_job: "job_return",
};

/** 結局不是只檢查資產。同一個「清算」，死因可以完全不同。 */
export function categoryOf(data, run, scores) {
  const id = run.ending?.id || "ongoing";
  const k = run.kpis || {};
  const v = run.venture || {};
  const parts = run.last?.parts || {};
  const M = scores.marks;
  const months = scores.months;
  const revenue = Math.max(0.05, num(run.finance?.lastRevenue, num(run.last?.revenue, 0.05)));

  if (id === "succession" || id === "death_continue") {
    if (k.lossMonths > k.profitMonths && months > 96) return "succession_fail";
    if (months >= 300 && scores.social > 0.55) return "regional_famous";
    if (id === "death_continue") return "succession_fail";
    return "founder_retire";
  }
  if (ENDING_TO_KEY[id]) return ENDING_TO_KEY[id];
  if (months >= 240 && (run.flags.second_city || num(v.complexity, 0) > 1.8) && M.expansionist) return "global_chain";
  if (months >= 120 && scores.trust > 0.58 && scores.social > 0.5) return "regional_famous";

  // 失敗：把「現金耗盡」拆成玩家看得懂的死因
  if (months < 4) return "early_death";
  if (M.grinder && num(run.founder?.health, 1) < 0.42) return "founder_burnout";
  if (M.platform_leaning && num(parts.platformRate, 0) > 0.13) return "platform_trap";
  if (M.expansionist && (run.flags.second_city || num(v.complexity, 0) > 1.6)) return "over_expand";
  if (M.risk_taker && num(run.finance?.debt, 0) > 2.5) return "debt_call";
  if (run.redlineSnap?.type === "occupancy" && num(parts.premises, 0) / revenue > 0.36) return "rent_squeeze";
  if (num(v.trust, 1) < 0.34 || num(v.quality, 1) < 0.4) return "trust_collapse";
  if (run.flags.equipment_damage || num(v.returnsRate, 0) > 0.16) return "supply_quality";
  if (M.grinder) return "founder_burnout";
  if (months >= 96 && k.profitMonths > k.lossMonths) return "small_rich";
  return "cash_choke";
}

export function beatPercent(data, run, scores, group) {
  const median = num(data.economy.life?.kpis?.median_life_months, 26);
  const months = scores.months;
  const lifePct = clamp(1 - Math.pow(0.5, months / median), 0, 1) * 100;
  const endPct = group === "success" ? 92 : group === "neutral" ? 62 : 26;
  const quality = (scores.staff + scores.social + scores.trust + scores.legacy) / 4 * 100;
  return Math.max(1, Math.min(99, Math.round(lifePct * 0.5 + endPct * 0.3 + quality * 0.2)));
}

/** 一句由過程生成的墓誌銘。 */
export function epitaphOf(data, run, scores, key, group, cause) {
  const list = data.narrative.epitaphs || [];
  const k = run.kpis || {};
  const crew = run.crew || [];
  const stayed = crew.filter((c) => !c.gone).sort((a, b) => b.tenure - a.tenure)[0] || crew.slice().sort((a, b) => num(b.tenure, 0) - num(a.tenure, 0))[0];
  const flags = {
    storm_survived: num(k.storms, 0) > 0,
    crew_left: num(k.quits, 0) + num(k.fired, 0) > 0,
    short_life: scores.months < 12,
    discount_used: !!run.flags.discount,
    long_struggle: scores.months >= 24 && num(k.lossMonths, 0) > num(k.profitMonths, 0),
    crew_kept: num(k.promotes, 0) > 0 || (num(k.raises, 0) > 0 && num(k.quits, 0) === 0),
    crew_promoted: num(k.promotes, 0) > 0,
    sold: ["sale", "merge", "privatize"].includes(run.ending?.id),
    century: run.ending?.id === "century",
    many_customers: num(k.customers, 0) > 1500,
  };
  const vars = {
    storms: num(k.storms, 0),
    name: stayed?.name || (run.cast?.customer ?? "那個人"),
    tenure: stayed ? Math.max(1, num(stayed.tenure, 1)) : 1,
    role: stayed?.role || "第一個位置",
    life: monthsLabel(scores.months),
    lossMonths: num(k.lossMonths, 0),
    company: run.venture?.name || "這間店",
    years: yearRange(run),
    cause,
    causeShort: cause.replace(/。$/, ""),
    eras: Math.max(1, Math.floor(scores.months / num(data.economy.life?.stage?.era_months, 180)) + 1),
    successions: num(run.successionCount, 0),
    customers: r0(k.customers),
  };
  for (const t of list) {
    const when = t.when || {};
    if (when.group && when.group !== group) continue;
    if (when.key && when.key !== key) continue;
    if (when.flag && !flags[when.flag]) continue;
    return fillVars(data, run, t.text, vars);
  }
  return `${vars.company}，${vars.years}。${cause}`;
}

export function yearRange(run) {
  if (run.mode === "history") return "歷史模擬";
  const cal = run.calendar || { year: 2026, month: 0 };
  const startYear = cal.year;
  const endYear = cal.year + Math.floor(((cal.month || 0) + (run.ending?.month ?? run.month ?? 0)) / 12);
  return startYear === endYear ? `${startYear}` : `${startYear} 至 ${endYear}`;
}

/** 一整局的總結。結局頁、診斷頁、紀念卡與訃告都用它。 */
export function evaluateLife(data, run) {
  const scores = lifeScores(data, run);
  const key = categoryOf(data, run, scores);
  const meta = data.narrative.life_endings?.[key]
    || { group: "neutral", title: "這一局", line: "", cause: "時間到了。" };
  const marks = confirmedMarks(data, run);
  const percentile = beatPercent(data, run, scores, meta.group);
  const k = run.kpis || {};
  const crisis = (k.crises || [])[0] || null;
  const decision = keyDecision(run);
  const epitaph = epitaphOf(data, run, scores, key, meta.group, meta.title || "");
  return {
    key, group: meta.group, title: meta.title, line: meta.line || "", cause: meta.cause || "",
    scores, percentile, marks, crisis, decision, epitaph,
    endingId: run.ending?.id || "ongoing",
  };
}

function keyDecision(run) {
  const choices = run.choices || [];
  if (!choices.length) return null;
  const scored = choices.map((c) => {
    const weight = (c.drivers ? Object.values(c.drivers).reduce((s, v) => s + Math.abs(num(v, 0)), 0) : 0);
    return { ...c, score: weight };
  });
  scored.sort((a, b) => b.score - a.score || a.month - b.month);
  return scored[0];
}

/* ── 3. 創業訃告／企業紀念卡 ───────────────────────────── */

export function memorial(data, run, ending) {
  const life = ending?.key ? ending : evaluateLife(data, run);
  const k = run.kpis || {};
  const w = worldLine(data, run);
  const months = life.scores.months;
  const branches = run.flags.second_city ? 2 + Math.floor(num(run.venture?.complexity, 0) / 1.5) : 1;
  const crew = run.crew || [];
  const longest = crew.slice().sort((a, b) => num(b.tenure, 0) - num(a.tenure, 0))[0];
  const scene = sceneLabelOf(data, run);
  const arc = months < 6
    ? `它沒有來得及變成一門生意。`
    : branches > 1
      ? `由${scene}開始，變成 ${branches} 個據點、最多 ${num(k.peakCrew, 0)} 個人。`
      : `由${scene}開始，最多時有 ${num(k.peakCrew, 0)} 個人在裡面做事。`;
  return {
    name: run.venture?.name || "未開的店",
    city: w.city.name,
    country: w.country.name,
    industry: w.fam?.name || "",
    gap: w.gap?.title || "",
    sceneLabel: run.work?.company || "",
    years: yearRange(run),
    life: monthsLabel(months),
    months,
    arc,
    customers: num(k.customers, 0),
    peakCrew: num(k.peakCrew, 0),
    revenueTotal: num(k.revenueTotal, 0),
    profitTotal: num(k.profitTotal, 0),
    peakCash: num(k.peakCash, 0),
    worstCash: num(k.worstCash, 0),
    lossMonths: num(k.lossMonths, 0),
    storms: num(k.storms, 0),
    rainDays: num(k.rainDays, 0),
    rescues: num(k.rescues, 0),
    branches,
    longest: longest ? { name: longest.name, role: longest.role, tenure: Math.max(1, num(longest.tenure, 1)), promoted: longest.promoted, gone: longest.gone } : null,
    crisis: life.crisis ? { month: life.crisis.m, title: life.crisis.title } : null,
    decision: life.decision ? { month: life.decision.month, label: life.decision.label } : null,
    title: life.title,
    group: life.group,
    cause: life.cause,
    line: life.line,
    epitaph: life.epitaph,
    percentile: life.percentile,
    marks: life.marks,
    prior: num(data.economy.outcome_prior_per_thousand?.[run.ending?.id], 40),
    rarity: rarityLine(num(data.economy.outcome_prior_per_thousand?.[run.ending?.id], 40)),
    seed: run.seed,
    money: (units) => money(data, run, units),
  };
}

/** 訃告的正文。四到六句，全部來自這一局真的發生過的事。 */
export function obituary(data, run, m) {
  const out = [];
  out.push(`${m.name}，${m.years}。${m.city}，${m.industry}。`);
  out.push(m.arc);
  if (m.longest) {
    out.push(m.longest.promoted
      ? `${m.longest.name}從${m.longest.role}一路做到能替這間店做決定，做了 ${m.longest.tenure} 季。`
      : m.longest.gone
        ? `${m.longest.name}是待最久的人，${m.longest.tenure} 季之後離開。`
        : `${m.longest.name}跟了它 ${m.longest.tenure} 季。`);
  }
  if (m.crisis) out.push(`最大的危機在第 ${m.crisis.month} 季：${m.crisis.title}。`);
  if (m.decision) out.push(`最重要的決定在第 ${m.decision.month} 季：${m.decision.label}。`);
  out.push(`最後：${m.cause}`);
  return out;
}

/* ── 員工名冊：把「工資支出」換成人 ─────────────────────── */

const ARC_LABEL = ["剛來", "站穩了", "獨當一面", "能替你做決定"];

export function crewRoster(data, run) {
  const list = (run.crew || []).slice();
  return list.map((m) => {
    const tenure = m.gone ? num(m.tenure, 0) : Math.max(0, run.month - num(m.joined, 0));
    return {
      ...m,
      tenure,
      tenureLabel: lifeLabel(tenure),
      arcLabel: ARC_LABEL[Math.min(3, num(m.arc, 0))],
      stressPct: Math.round(num(m.stress, 0) * 100),
      loyaltyPct: Math.round(clamp(num(m.loyalty, 0), 0, 1) * 100),
      trustPct: Math.round(num(m.trust, 0) * 100),
      skillPct: Math.round(num(m.skill, 0) * 100),
      state: m.gone ? (m.gone === "poached" ? "被同行接走" : m.gone === "fired" ? "被你請走" : "已經離開") : num(m.stress, 0) > 0.82 ? "快撐不住" : num(m.stress, 0) > 0.62 ? "很累" : "還好",
      line: m.gone
        ? (m.gone === "poached" ? "他走之前把交接寫完了。" : m.gone === "overwork" ? "他是在最忙的那段時間走的。" : "班表上還排著他。")
        : num(m.stress, 0) > 0.82 ? "他沒有說要辭職。他只是不再多說一句話。"
          : m.promoted ? "現在有一部分決定是他做的。"
            : tenure > 24 && num(m.raises, 0) === 0 ? "他做了兩年多，薪水沒有動過。"
              : "他還在。",
    };
  }).sort((a, b) => (a.gone ? 1 : 0) - (b.gone ? 1 : 0) || b.tenure - a.tenure);
}

/** 五個即時指標裡，「員工壓力」與「品牌信任」的讀法。 */
export function quickMetrics(data, run) {
  const v = run.venture || {};
  const ops = run.last?.ops || run.lastOps;
  const previousCash = (run.series || []).slice(-2)[0]?.cash;
  const flow = run.last?.parts ? cashflowLedger(run.last, run.work || {}, previousCash) : null;
  const cashChange = flow?.net ?? 0;
  return [
    { id: "cash", label: "現金", value: money(data, run, run.finance?.cash), level: num(run.finance?.cash, 0) < 0.4 ? "bad" : num(run.finance?.cash, 0) < 1.2 ? "warn" : "good", note: `跑道 ${run.finance?.runway != null ? Math.max(0, num(run.finance.runway, 0)).toFixed(1) + " 季" : "—"}` },
    { id: "profit", label: "本季現金淨變動", value: flow ? `${cashChange > 0 ? "+" : ""}${money(data, run, cashChange)}` : "—", level: !flow || cashChange >= 0 ? "good" : "bad", note: flow ? `入帳 ${money(data, run, flow.totalIn)} · 流出 ${money(data, run, -flow.totalOut)}` : "第一季結算後會列出收支" },
    { id: "flow", label: "客流", value: ops ? `${r0(ops.entered)} 人` : "—", level: ops && ops.lost > ops.orders * 0.15 ? "warn" : "good", note: ops ? `${r0(ops.served)} 單做完${ops.lost > 0 ? ` · ${r0(ops.lost)} 單沒接住` : ""}` : "結算後才有數字" },
    { id: "stress", label: "員工壓力", value: `${Math.round(num(run.crewStress, 0) * 100)}%`, level: num(run.crewStress, 0) > 0.78 ? "bad" : num(run.crewStress, 0) > 0.6 ? "warn" : "good", note: `${(run.crew || []).filter((c) => !c.gone).length} 個人在場` },
    { id: "trust", label: "品牌信任", value: `${Math.round(num(v.trust, 0) * 100)}%`, level: num(v.trust, 0) < 0.35 ? "bad" : num(v.trust, 0) < 0.5 ? "warn" : "good", note: `品質 ${Math.round(num(v.quality, 0) * 100)}% · 牌子 ${Math.round(num(v.brand, 0) * 100)}%` },
  ];
}

/** 把「你怎麼經營」講回給玩家聽。 */
export function marksLine(data, run) {
  const marks = confirmedMarks(data, run);
  if (!marks.length) return "還沒有形成風格。你做的決定還太少，或還太分散。";
  return marks.map((m) => `${m.label}：${m.blurb}`).join("　");
}

export function fillCrewLine(data, run, raw, member, vars) {
  return fillCrew(data, run, raw, member, vars);
}

/* ── 每個選項旁邊的三行：最可能結果、最大下行風險、誰會受到影響 ── */

const FX = [
  ["cash", (v, f) => `現金${v > 0 ? "立刻多" : "立刻少"}約 ${f.money(Math.abs(v))}`],
  ["revenue_mult", (v) => `需求係數${v > 1 ? "上升" : "下降"}約 ${Math.round(Math.abs(v - 1) * 100)}%（實收仍受產能限制）`],
  ["cost_mod", (v) => `變動成本率${v > 0 ? "增加" : "減少"} ${Math.round(Math.abs(v) * 100)} 個百分點`],
  ["fixed_mult", (v) => `固定帳${v > 1 ? "上升" : "下降"}約 ${Math.round(Math.abs(v - 1) * 100)}%`],
  ["fixed_add", (v, f) => `每季固定帳${v > 0 ? "多" : "少"} ${f.money(Math.abs(v))}`],
  ["trust", (v) => `客人信任${v > 0 ? "上升" : "下降"}約 ${Math.round(Math.abs(v) * 100)} 個百分點`],
  ["brand", (v) => `牌子${v > 0 ? "被更多人認得" : "變得沒有人認得"}`],
  ["quality", (v) => `品質${v > 0 ? "上升" : "下降"}`],
  ["market_fit", (v) => `市場配合度${v > 0 ? "上升" : "下降"}`],
  ["morale", (v) => `團隊士氣${v > 0 ? "上升" : "下降"}`],
  ["wage_mult", (v) => `人事成本${v > 1 ? "上升" : "下降"}約 ${Math.round(Math.abs(v - 1) * 100)}%`],
  ["headcount", (v) => `人手${v > 0 ? `多 ${v} 個` : `少 ${Math.abs(v)} 個`}`],
  ["headcount_delta", (v) => `人手${v > 0 ? `多 ${v} 個` : `少 ${Math.abs(v)} 個`}`],
  ["headcount_min", (v) => `至少要有 ${v} 個人`],
  ["key_dependency", (v) => (v > 0 ? "更依賴其中一個人" : "不再只靠一個人")],
  ["debt", (v) => `債務${v > 0 ? "上升" : "下降"}`],
  ["control", (v) => `你的控制權${v > 0 ? "上升" : "下降"}約 ${Math.round(Math.abs(v) * 100)} 個百分點`],
  ["health", (v) => `你的健康${v > 0 ? "回升" : "往下"}`],
  ["will", (v) => `你的意志${v > 0 ? "回升" : "往下"}`],
  ["hours", (v) => `你的工時${v > 0 ? "變長" : "變短"}`],
  ["hours_set", (v) => `投入公司的時間約為 ${Math.round(v * 100)}%`],
  ["outside_share", (v) => `保留正職月薪的 ${Math.round(v * 100)}%，按季入帳`],
  ["platform_fee", (v) => `平台抽成${v > 0 ? "上升" : "下降"}`],
  ["ar_days", (v) => `收款期設為約 ${v} 天`],
  ["churn", (v) => `客人流失${v > 0 ? "變快" : "變慢"}`],
  ["complexity", (v) => `公司變${v > 0 ? "複雜" : "簡單"}`],
  ["price_mod", (v) => `價格${v > 0 ? "上升" : "下降"}`],
  ["reputation", (v) => `你的名聲${v > 0 ? "上升" : "下降"}`],
  ["returns", (v) => `退貨與客訴${v > 0 ? "變多" : "變少"}`],
  ["for_months", (v) => `這樣的情況會持續約 ${v} 季`],
  ["care", () => "家裡的那件事會要更多時間"],
  ["guarantee", () => "你簽下個人擔保"],
  ["core_drop", () => "原本的做法會被改掉一部分"],
  ["core_kept", () => "原本的做法保住了"],
  ["investor", () => "投資人進來"],
  ["board", () => "董事會進來"],
  ["royalty", () => "多一筆權利金"],
  ["subsidy", () => "補助的條件變了"],
  ["subsidy_add", () => "多一筆補助"],
  ["peer_pressure", (v) => `同行給你的壓力${v > 0 ? "上升" : "下降"}`],
  ["concentration_set", (v) => `最大客戶佔比變成約 ${Math.round(v * 100)}%`],
  ["control_set", (v) => `控制權變成約 ${Math.round(v * 100)}%`],
  ["control_to", (v) => `控制權變成約 ${Math.round(v * 100)}%`],
  ["draw_zero", (v) => `你暫停從公司領錢 ${v} 季`],
  ["draw_mult", (v) => `你拿的錢${v > 1 ? "變多" : "變少"}`],
  ["fire_to", (v) => `人手降到 ${v} 個`],
  ["try_ipo", () => "啟動上市程序"],
  ["open_succession", () => "開始安排接班"],
  ["mission_clause", () => "把使命寫進章程"],
  ["audited", () => "帳要經過查核"],
  ["tax_hit", () => "會有一筆稅"],
  ["force_ending", () => "這一項會直接決定這間店的結局"],
  ["inventory", (v) => `庫存${v > 0 ? "增加" : "減少"}`],
  ["capacity_add", () => "產能上限打開"],
  ["capacity_mult", (v) => `產能上限${v > 1 ? "上升" : "下降"}約 ${Math.round(Math.abs(v - 1) * 100)}%`],
  ["transformed", () => "記為一次轉型"],
];

/** 「誰會受到影響」不是百分比。這裡把 driver 翻成真的會被動到的人與事。 */
const AFFECTS = [
  [["team", "culture"], "你的人"],
  [["family", "personal", "care"], "家裡的人"],
  [["customer", "trust", "demand", "quality", "product", "retention", "churn"], "客人，以及他們會不會再來"],
  [["control", "governance", "independence", "identity"], "你的控制權"],
  [["debt", "capital"], "你個人的擔保與債權人"],
  [["cash"], "公司的現金，以及你還能撐多久"],
  [["compliance"], "監管與同行怎麼看你"],
  [["concentration"], "那個最大客戶"],
  [["scale", "growth", "focus", "ops"], "之後能不能長大"],
  [["founder", "health"], "你自己的身體"],
  [["brand", "public", "community", "relation"], "這個地方怎麼記得你"],
];

const DRIVER_DOWN = {
  margin: "毛利被壓薄", cash: "現金更緊", trust: "客人不再相信你", team: "人撐不住",
  demand: "來的人變少", quality: "東西變差", control: "你說話不算了", debt: "債追上來",
  compliance: "被查", founder: "你自己先垮", independence: "你不再自己決定", family: "家裡的事爆開",
  concentration: "那個客戶一走就空了", supply: "供應斷了", ops: "做不完", scale: "撐不起這個尺寸",
  rent: "場地吃掉你", price: "價格站不住", reputation: "名聲壞掉", governance: "董事會反對你",
  capital: "沒有人願意再給錢", focus: "你分心了", stability: "不穩", learning: "學不來",
  brand: "牌子沒了", public: "外面看著你", community: "這條街不再挺你", relation: "關係斷了",
  customer: "客人跑了", retention: "人留不住", culture: "這裡的味道變了", product: "東西不對了",
  growth: "長不動", transform: "轉不過去", market: "市場不買單", unit: "單位經濟不成立",
  flexibility: "你動不了", personal: "你個人的部分被拖進去", complexity: "太複雜管不動",
};

/** 每個選項都要講三件事。有寫好的就用寫好的，沒有就從效果推。 */
export function choiceBrief(data, run, ev, choice) {
  const fx = choice.effects || {};
  const f = { money: (u) => money(data, run, u) };
  const drivers = choice.drivers || {};
  const who = [];
  for (const [keys, label] of AFFECTS) {
    if (keys.some((k) => num(drivers[k], 0) !== 0 || fx[k] != null)) who.push(label);
  }
  const crewName = (run.crew || []).find((c) => !c.gone)?.name;
  if (crewName && /team|culture/.test(Object.keys(drivers).join("|"))) who.push(crewName);
  const parts = [];
  for (const [k, fn] of FX) {
    if (fx[k] == null) continue;
    const text = fn(num(fx[k], 0), f);
    if (text) parts.push(text);
  }
  const authored = !!(choice.likely && choice.downside && choice.affects);
  const likely = choice.likely || (parts.length ? parts.slice(0, 3).join("；") + "。" : (choice.detail || "這是一個確定的動作，效果要幾季之後才看得見。"));
  const neg = Object.entries(drivers).filter(([, v]) => num(v, 0) < 0).sort((a, b) => a[1] - b[1]).slice(0, 2);
  const downside = choice.downside
    || [choice.risk ? choice.risk : "", neg.length ? `若事情往壞的方向走，${neg.map(([k]) => DRIVER_DOWN[k] || k).join("、")}。` : ""]
      .filter(Boolean).join(" ")
    || "這一項本身不會立刻殺死你，但它佔掉這一季唯一一次行動。";
  const affects = choice.affects
    || (ev?.subject || ev?.object
      ? [ev.subject, ev.object].filter(Boolean).join("、") + (who.length ? `，以及${who.slice(0, 3).join("、")}` : "")
      : who.slice(0, 4).join("、") || "這間店本身");
  return { likely, downside, affects, authored };
}
