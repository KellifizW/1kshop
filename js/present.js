import { cityById, gapById, industry, companyType, calendarLabel, lifeLabel, computeRedline, symptomIds, endingFlags, topDrivers, describeWorld, stageOf, fillText } from "./sim.js";
import { historicalCompany } from "./historical.js";

export { calendarLabel };

export function money(data, state, units) {
  if (state.mode === "history") {
    const n = Number(units) || 0;
    return `${n < 0 ? "−" : ""}${Math.round(Math.abs(n) * 100) / 100} 個月薪`;
  }
  const city = cityById(data, state.cityId);
  const n = (Number(units) || 0) * city.median_wage;
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  let body;
  if (city.compact === "wan" && abs >= 10000) body = (abs / 10000).toFixed(abs >= 100000 ? 0 : 1).replace(/\.0$/, "") + "萬";
  else if (city.compact === "man" && abs >= 10000) body = (abs / 10000).toFixed(1).replace(/\.0$/, "") + "万";
  else body = Math.round(abs).toLocaleString("zh-Hant");
  return sign + city.symbol + body;
}

export function monthsLabel(m) {
  return lifeLabel(Math.max(0, Math.round(m)));
}

const DRIVER = {
  demand: "需求", price: "價格", cash: "現金", trust: "信任", rent: "租金", team: "人手",
  control: "控制權", margin: "毛利", quality: "品質", supply: "供應", compliance: "合規",
  family: "家庭", founder: "身體與時間", identity: "最初的那句話", scale: "規模",
  independence: "獨立", growth: "增長", capital: "資金", debt: "債務", personal: "個人負擔",
  governance: "治理", focus: "專注", relation: "關係", product: "產品", unit: "每一單是否賺錢",
  retention: "留存", community: "社區", customer: "客戶", ops: "營運", flexibility: "彈性",
  learning: "學習", public: "公開市場", transform: "轉型", stability: "穩定", market: "市場預期",
  culture: "文化", complexity: "複雜度", brand: "品牌",
};

export function driverLabel(k) {
  return DRIVER[k] || k;
}

export function worldLine(data, state) {
  const { city, country, gap, fam } = describeWorld(data, state);
  const company = state.mode === "history" ? historicalCompany(data, state.historical?.companyId) : null;
  if (company) {
    return {
      city: { ...city, name: company.origin, diffs: [] },
      country: { name: "史實起點" }, gap,
      fam: { ...fam, name: state.work?.industry || fam?.name || "企業經營" },
    };
  }
  return { city, country, gap, fam };
}

export function stageName(data, state) {
  if (!state.venture) return "尚未開業";
  return stageOf(data, state.month).label;
}

export function whenLabel(state) {
  if (!state.venture) return calendarLabel(state);
  if (state.month < 4) return `第 ${state.month + 1} 季`;
  const y = Math.floor(state.month / 4);
  const m = state.month % 4;
  return m ? `第 ${y} 年 第${m + 1}季` : `第 ${y} 年`;
}

export function symptomTexts(data, state) {
  const ids = symptomIds(data, state);
  return ids.map((id) => {
    const raw = data.narrative.symptoms.find((s) => s.id === id)?.text || "這季沒有新的句子。";
    return fillText(data, state, raw);
  });
}

export function business(data, state) {
  const gap = gapById(data, state.gapId);
  const work = state.work || gap?.work || {};
  const fam = industry(data, gap?.family || work.family);
  const revId = state.venture?.revenue || state.shape?.revenue;
  const rev = revId ? data.economy.revenues[revId] : null;
  return {
    name: work.name || gap?.title || "還沒成形的生意",
    company: work.company || "",
    does: work.does || gap?.problem || "",
    sells: work.sells || gap?.core || "東西",
    buyer: work.buyer || "客人",
    unit: work.unit || "一筆",
    scale: work.scale || "",
    hire: work.hire || "",
    industry: state.mode === "history" ? (work.industry || fam?.name || "") : (fam?.name || ""),
    direction: state.mode === "history" ? (state.historical?.currentDirection || "") : "",
    companyType: state.mode === "history" ? "歷史範本" : (companyType(data, gap?.company_type)?.name || work.companyTypeName || ""),
    title: gap?.title || "",
    problem: gap?.problem || "",
    unknown: gap?.unknown || "",
    pulse: rev?.pulse || "入帳",
    ticks: rev?.ticks || 6,
    late: !!rev?.late,
    revenueLabel: rev?.label || "",
  };
}

/** 你抽到的那份工作。開局不是從零開始，而是從一份薪水開始。 */
export function jobLine(data, state) {
  const job = (data.content.jobs || []).find((j) => j.id === state.founder?.job);
  if (!job) return { has: false, label: "你現在沒有正職", income: 0, hours: "", notice: "", side: "", severance: 0, learn: "", ladder: "" };
  return {
    has: true,
    label: job.label,
    income: job.income,
    hours: job.hours,
    notice: job.notice,
    side: job.side,
    severance: job.severance,
    learn: job.learn,
    ladder: job.ladder,
  };
}

/** 這種投入方式，對這份工作來說代表甚麼。 */
export function styleLine(data, state, styleId) {
  const style = data.economy.commitment_styles[styleId];
  if (!style) return null;
  const job = jobLine(data, state);
  const kept = job.income * (style.outsideShare ?? 0);
  const severance = Math.max(0, job.severance * job.income * (style.severanceShare ?? 0));
  return {
    ...style,
    salaryKept: kept,
    severance,
    timePct: Math.round((style.hours ?? 0) * 100),
  };
}

export function householdLine(state) {
  const kin = state.cast?.kin;
  const base = familyLabel(state.founder?.family);
  if (!kin) return `${base}。`;
  const when = state.founder?.careMonth > 0 ? `這件事大約從第 ${state.founder.careMonth} 季開始，開局時就排進日曆。` : "";
  return `${base}。要照顧的是${kin.who}，事情是${kin.need}。${when}`;
}

export function ambientLine(state) {
  const a = state.ambient || {};
  const bits = [];
  if ((a.demand || 0) > 0.02) bits.push("這些小事疊起來，需求被墊高了一點");
  if ((a.demand || 0) < -0.02) bits.push("這些小事疊起來，需求被削掉一點");
  if ((a.cost || 0) > 0.02) bits.push("變動成本也被墊高了");
  if ((a.cost || 0) < -0.02) bits.push("變動成本被省下一點");
  return bits.join("。");
}

export function redlineView(data, state) {
  const rl = state.redlineSnap || computeRedline(data, state);
  if (!rl) return null;
  const mark = rl.level === "crit" ? "危" : rl.level === "warn" ? "緊" : "穩";
  return { ...rl, mark };
}

export function endingView(data, state) {
  const id = state.ending?.id || "ongoing";
  const meta = data.narrative.endings[id] || { title: "這一局", stamp: "結局" };
  const flags = endingFlags(state);
  const fact = matchRule(data.narrative.fact_rules, id, flags) || `${state.venture?.name || "這件事"}在${cityById(data, state.cityId).name}走了 ${monthsLabel(state.ending?.month || state.month)}。`;
  const cost = matchRule(data.narrative.cost_rules, id, flags) || "留下的與失去的，寫在同一頁。";
  const prior = data.economy.outcome_prior_per_thousand[id] ?? 40;
  const memories = [...(state.memories || [])].sort((a, b) => b.weight - a.weight);
  const featured = memories[0];
  const pos = topDrivers(state, 1).map((d) => driverLabel(d.k));
  const neg = topDrivers(state, -1).map((d) => driverLabel(d.k));
  return { id, ...meta, fact, cost, prior, memories, featured, pos, neg, flags };
}

function matchRule(rules, ending, flags) {
  let fallback = null;
  for (const rule of rules || []) {
    const endingOk = !rule.ending || rule.ending.includes(ending);
    const flagOk = !rule.flag || flags[rule.flag];
    if (endingOk && flagOk && rule.ending) return rule.fact || rule.cost;
    if (!rule.ending && flagOk) fallback = rule.fact || rule.cost;
  }
  return fallback;
}

export function rarityLine(n) {
  const v = Math.max(1, Math.round(n));
  if (v === 1) return "千分之一";
  return `千分之${v}`;
}

export function commitmentLine(state) {
  const list = (state.commitments || []).slice().sort((a, b) => a.monthsLeft - b.monthsLeft);
  if (!list.length) return "你還沒有簽下不能隨便反悔的東西。";
  const c = list[0];
  return `${c.name}，還有 ${c.monthsLeft} 季。`;
}

export function legalLabel(data, state) {
  if (state.mode === "history") return "遊戲中的公司形式（不模擬實際法律制度）";
  const city = cityById(data, state.cityId);
  const form = data.economy.ownership[state.shape?.ownership]?.form || "limited";
  return data.content.legal_forms[city.country][form];
}

export function familyLabel(id) {
  return { single: "獨自生活", partner: "有伴侶", child: "有孩子", elder: "家中有人需要照護", single_parent: "一個人帶著孩子" }[id] || id;
}

export function fieldLabel(data, id) {
  return data.content.fields[id] || "另一種工作";
}
