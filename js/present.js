import { cityById, gapById, industry, calendarLabel, lifeLabel, computeRedline, symptomIds, endingFlags, topDrivers, describeWorld, stageOf } from "./sim.js";

export { calendarLabel };

export function money(data, state, units) {
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
  governance: "治理", focus: "專注", relation: "關係", product: "產品", unit: "單位經濟",
  retention: "留存", community: "社區", customer: "客戶", ops: "營運", flexibility: "彈性",
  learning: "學習", public: "公開市場", transform: "轉型", stability: "穩定", market: "市場預期",
  culture: "文化", complexity: "複雜度", brand: "品牌",
};

export function driverLabel(k) {
  return DRIVER[k] || k;
}

export function worldLine(data, state) {
  const { city, country, gap, fam } = describeWorld(data, state);
  return { city, country, gap, fam };
}

export function stageName(data, state) {
  if (!state.venture) return "尚未開業";
  return stageOf(data, state.month).label;
}

export function whenLabel(state) {
  if (!state.venture) return calendarLabel(state);
  if (state.month < 12) return `第 ${state.month} 個月`;
  const y = Math.floor(state.month / 12);
  const m = state.month % 12;
  return m ? `第 ${y} 年 ${m} 個月` : `第 ${y} 年`;
}

export function symptomTexts(data, state) {
  const ids = symptomIds(data, state);
  return ids.map((id) => data.narrative.symptoms.find((s) => s.id === id)?.text || "這個月沒有新的句子。");
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
  return `${c.name}，還有 ${c.monthsLeft} 個月。`;
}

export function legalLabel(data, state) {
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
