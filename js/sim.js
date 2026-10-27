import { hashSeed, makeRng, pickWeighted } from "./rng.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

function rngOf(state) {
  const r = makeRng(1);
  r.state = state.rngState || 1;
  return {
    next() {
      const n = r.next();
      state.rngState = r.state;
      return n;
    },
    int(k) {
      return Math.floor(this.next() * k);
    },
  };
}

export function cityById(data, id) {
  return data.world.cities.find((c) => c.id === id);
}
export function gapById(data, id) {
  return data.content.gaps.find((g) => g.id === id);
}
export function industry(data, id) {
  return data.content.industries.find((i) => i.id === id);
}
function econ(data) {
  return data.economy;
}
function modeOf(data, id) {
  return data.economy.modes[id] || data.economy.modes.story;
}

function familyName(data, id) {
  return industry(data, id)?.name || "";
}

export function stageOf(data, month) {
  const list = data.economy.stages;
  return list.find((s) => month >= s.min && month <= s.max) || list[list.length - 1];
}

export function livingCost(data, state) {
  const city = cityById(data, state.cityId);
  const f = econ(data).formula;
  const mult = econ(data).family_mult[state.founder.family] || 1;
  return f.living_cost * mult * city.living_index;
}

function skillOf(founder, gap) {
  const years = clamp(founder.experience / 18, 0, 1);
  const match = founder.field === gap.field ? 1 : 0.72;
  return (0.38 + years * 0.62) * match;
}

export function redlineType(shape, gap, data, isPublic) {
  if (isPublic) return "public";
  const ind = gap.family;
  if (["sub", "member"].includes(shape.revenue) && ["online", "home", "studio"].includes(shape.venue)) return "saas";
  if (ind === "saas" && ["sub", "member", "license"].includes(shape.revenue)) return "saas";
  if (shape.revenue === "commission" || shape.fulfillment === "match" || ind === "platform") return "platform";
  if (["project", "wholesale", "license"].includes(shape.revenue) || ind === "enterprise" || ind === "fin") return "b2b";
  if (shape.venue === "factory" || ind === "mfg") return "manufacturing";
  if (shape.venue === "online" && (ind === "retail" || shape.fulfillment === "stock" || shape.fulfillment === "resell")) return "ecommerce";
  if (["onsite", "studio", "mobile"].includes(shape.venue) || ["pro", "repair", "edu", "care"].includes(ind)) return "personal";
  if (["street", "mall"].includes(shape.venue)) return "occupancy";
  return "personal";
}

function spineForRedline(type) {
  return {
    occupancy: "redline_rent",
    saas: "redline_churn",
    platform: "redline_platform",
    b2b: "redline_customer",
    manufacturing: "redline_util",
    personal: "redline_founder",
    ecommerce: "redline_returns",
    public: "earnings",
  }[type];
}

function blankMods() {
  return { revenue: 1, fixed: 1, price: 0, cost: 0, platform: 0, fixedAdd: 0, royalty: 0 };
}

function effectiveMods(v) {
  const m = { ...v.perm };
  for (const t of v.timed || []) {
    if (t.price) m.price += t.price;
    if (t.cost) m.cost += t.cost;
    if (t.platform) m.platform += t.platform;
    if (t.revenue) m.revenue *= t.revenue;
    if (t.fixed) m.fixed *= t.fixed;
  }
  const caps = {
    revenue_mult: [0.35, 3.2],
    fixed_mult: [0.45, 2.4],
    price: [-0.35, 0.55],
    cost: [-0.2, 0.28],
    platform: [0, 0.28],
  };
  m.revenue = clamp(m.revenue, caps.revenue_mult[0], caps.revenue_mult[1]);
  m.fixed = clamp(m.fixed, caps.fixed_mult[0], caps.fixed_mult[1]);
  m.price = clamp(m.price, caps.price[0], caps.price[1]);
  m.cost = clamp(m.cost, caps.cost[0], caps.cost[1]);
  m.platform = clamp(m.platform, caps.platform[0], caps.platform[1]);
  return m;
}

export function nameOptions(state, data) {
  const gap = gapById(data, state.gapId);
  const a = data.content.name_a;
  const b = data.content.name_b[gap.family] || ["社"];
  const h = hashSeed(state.seed + ":name");
  const out = [];
  for (let i = 0; i < 3; i++) {
    const x = hashSeed(h + ":" + i);
    out.push(a[x % a.length] + b[(x >>> 8) % b.length]);
  }
  return [...new Set(out)].concat(a.slice(0, 3)).slice(0, 3);
}

function personName(data, country, salt) {
  const pool = data.content.people[country] || data.content.people.tw;
  const i = hashSeed(salt) % pool.length;
  return pool[i];
}

function buildKin(data, country, family, seed) {
  if (!family || family === "single") return null;
  const h = hashSeed(seed + ":kin");
  const name = personName(data, country, seed + ":kinname");
  if (family === "elder") {
    const relation = h % 2 ? "父親" : "母親";
    const needs = ["每週兩次的洗腎陪診", "中風後的日常起居", "失智後不能獨留在家", "復健門診和夜裡的翻身"];
    const need = needs[h % needs.length];
    return { relation, name, need, who: relation + name };
  }
  if (family === "child" || family === "single_parent") {
    const needs = family === "single_parent"
      ? ["放學與生病日都只有你能接", "夜裡不能獨留", "固定回診沒有第二個大人"]
      : ["放學後沒有人接", "慢性病的固定回診", "夜裡發燒時要有人在"];
    const need = needs[h % needs.length];
    return { relation: "孩子", name, need, who: "孩子" + name };
  }
  const modes = [
    { relation: "伴侶", need: "手術後這一個月不能獨留" },
    { relation: "伴侶的父親", need: "突然排進來的陪診" },
    { relation: "伴侶", need: "產後夜裡的輪替" },
  ];
  const mode = modes[h % modes.length];
  const whoName = mode.relation === "伴侶" ? name : personName(data, country, seed + ":kinother");
  return { relation: mode.relation, name: whoName, need: mode.need, who: mode.relation + whoName };
}

export function ensureCast(data, state) {
  if (!state?.cityId) return null;
  if (state.cast?.ready) return state.cast;
  const country = cityById(data, state.cityId).country;
  const family = state.founder?.family || "single";
  const kin = buildKin(data, country, family, state.seed || "seed");
  const named = (salt) => personName(data, country, (state.seed || "seed") + salt);
  const contacts = state.contacts || [];
  state.cast = {
    ready: true,
    kin,
    partner: contacts[0]?.name || named(":partner"),
    customer: contacts[1]?.name || named(":customer"),
    mentor: contacts[2]?.name || named(":mentor"),
    home: kin?.name || contacts[3]?.name || named(":home"),
    supplier: named(":supplier"),
    landlord: named(":landlord"),
  };
  if (kin && contacts[3]) {
    contacts[3].role = kin.relation;
    contacts[3].name = kin.name;
    contacts[3].known = true;
    contacts[3].need = kin.need;
  }
  return state.cast;
}

export function ensureWork(data, state) {
  if (!state?.gapId) return state?.work || null;
  const gap = gapById(data, state.gapId);
  const work = gap?.work;
  if (!work) return state.work || null;
  state.work = {
    id: gap.id,
    name: work.name,
    does: work.does,
    sells: work.sells,
    buyer: work.buyer,
    unit: work.unit,
    family: gap.family,
    core: gap.core,
  };
  if (state.venture) state.venture.work = state.work;
  return state.work;
}

function castTokens(data, state) {
  const cast = ensureCast(data, state) || {};
  const work = ensureWork(data, state) || {};
  const kin = cast.kin;
  const city = state.cityId ? cityById(data, state.cityId) : null;
  return {
    trade: work.name || "這門生意",
    sells: work.sells || "東西",
    buyer: work.buyer || "客人",
    unit: work.unit || "一筆",
    partner: cast.partner || "合夥人",
    employee: state.team?.names?.[0] || "那名員工",
    customer: cast.customer || "那位客人",
    family: kin?.name || cast.home || "家里的人",
    kinName: kin?.name || "家里的人",
    kinRelation: kin?.relation || "家里",
    kinNeed: kin?.need || "一段離不開人的照護",
    kinWho: kin?.who || "家里的人",
    city: city?.name || "這座城市",
    company: state.venture?.name || "這間公司",
    landlord: cast.landlord || "業主",
    supplier: cast.supplier || "供應商",
    mentor: cast.mentor || "那位導師",
    peer: state.peers?.[0]?.name || "對街那一間",
  };
}

export function fillText(data, state, s) {
  const names = castTokens(data, state);
  return String(s || "").replace(/\{(\w+)\}/g, (_, k) => (names[k] == null || names[k] === "" ? "那個人" : names[k]));
}

export function createRun(data, opts = {}) {
  const modeId = opts.mode || "story";
  const mode = modeOf(data, modeId);
  const seed = String(opts.seed ?? Math.floor(Math.random() * 1e9));
  const rng = makeRng(hashSeed("world:" + seed + ":" + data.economy.meta.simulation_version));
  const history = opts.history || { cities: [], families: [], gaps: [] };
  const challenge = opts.challenge || null;
  const sandbox = opts.sandbox || null;
  const useHistory = modeId !== "daily" && modeId !== "sandbox" && !challenge;

  let cities = data.world.cities.slice();
  if (challenge === "high_rent") cities = cities.filter((c) => c.rent_index >= 1.5);
  if (challenge === "gdl_example") cities = cities.filter((c) => c.id === "gdl");
  if (useHistory) {
    const filtered = cities.filter((c) => !history.cities.includes(c.id));
    if (filtered.length) cities = filtered;
  }
  if (sandbox?.city && cityById(data, sandbox.city)) cities = [cityById(data, sandbox.city)];
  const city = pickWeighted(rng, cities, (c) => c.weight);

  let gaps = data.content.gaps.slice();
  if (challenge === "decline") gaps = gaps.filter((g) => g.declining);
  if (challenge === "gdl_example") gaps = gaps.filter((g) => g.id === "farm_sourcing");
  if (useHistory) {
    const filtered = gaps.filter((g) => !history.gaps.includes(g.id) && !history.families.includes(g.family));
    if (filtered.length) gaps = filtered;
  }
  if (sandbox?.gap && gapById(data, sandbox.gap)) gaps = [gapById(data, sandbox.gap)];
  const gap = pickWeighted(rng, gaps, (g) => g.weight);

  const ageBand = sandbox?.age
    ? data.economy.age_bands.find((b) => sandbox.age >= b.min && sandbox.age <= b.max) || data.economy.age_bands[2]
    : pickWeighted(rng, data.economy.age_bands, (b) => b.weight);
  let age = sandbox?.age || ageBand.min + rng.int(ageBand.max - ageBand.min + 1);
  if (challenge === "gdl_example") age = 34;
  const assetBand = challenge === "in_debt"
    ? data.economy.asset_bands[0]
    : sandbox?.assets != null
      ? data.economy.asset_bands.find((b) => sandbox.assets >= b.min && sandbox.assets <= b.max) || data.economy.asset_bands[2]
      : pickWeighted(rng, data.economy.asset_bands, (b) => b.weight);
  let assets = sandbox?.assets != null ? sandbox.assets : assetBand.min + rng.int(assetBand.max - assetBand.min + 1);
  if (challenge === "in_debt") assets = -2 - rng.int(5);
  if (challenge === "gdl_example") assets = 14;

  let family = challenge === "care_8" || challenge === "gdl_example" ? "elder" : pickWeighted(rng, Object.keys(data.economy.family_weights), (k) => data.economy.family_weights[k]);
  if (sandbox?.family) family = sandbox.family;

  const exp = challenge === "gdl_example" ? 7 : clamp(Math.round((age - 22) * 0.42 + rng.int(7) - 2), 0, 28);
  const matchRoll = rng.next();
  const field = challenge === "gdl_example" || sandbox?.match
    ? gap.field
    : matchRoll < 0.55
      ? gap.field
      : gap.field;

  let fieldId = field;
  if (challenge !== "gdl_example" && !sandbox?.match && matchRoll >= 0.55) {
    const others = Object.keys(data.content.fields).filter((k) => k !== gap.field);
    fieldId = others[rng.int(others.length)];
  }

  const advantage = data.economy.advantages[rng.int(data.economy.advantages.length)];
  let riskPool = data.economy.risks.slice();
  if (!["elder", "child", "single_parent"].includes(family)) riskPool = riskPool.filter((r) => r.id !== "care");
  const risk = challenge === "care_8" ? data.economy.risks.find((r) => r.id === "care") : riskPool[rng.int(riskPool.length)];
  const careMonth = family === "elder"
    ? (challenge === "care_8" || challenge === "gdl_example" ? 8 : 6 + rng.int(13))
    : family === "child"
      ? 10 + rng.int(8)
      : family === "single_parent"
        ? 6 + rng.int(8)
        : family === "partner"
          ? 14 + rng.int(16)
          : 0;

  const contacts = ["可能的合夥人", "可能的第一位客人", "一位導師", "家里的支援"].map((role, i) => ({
    role,
    name: personName(data, city.country, seed + ":c" + i),
    known: i < 2,
  }));

  const lifeWeight = (data.economy.family_weights[family] / 100) * (assetBand.weight / 100);
  const cityP = city.weight / data.world.cities.reduce((s, c) => s + c.weight, 0);
  const gapP = gap.weight / data.content.gaps.reduce((s, g) => s + g.weight, 0);
  const perThousand = Math.round(cityP * gapP * 1000 * 10) / 10;

  const state = {
    versions: { ...data.economy.meta },
    seed,
    rngState: rng.state,
    mode: modeId,
    official: mode.official !== false && !sandbox,
    challenge,
    phase: "reveal",
    month: 0,
    speed: "standard",
    smart: mode.smart,
    autoplay: false,
    rejectsLeft: mode.rejects,
    rejected: [],
    cityId: city.id,
    gapId: gap.id,
    perThousand,
    lifeWeight,
    founder: {
      age,
      ageBand: ageBand.id,
      family,
      experience: exp,
      field: fieldId,
      matched: fieldId === gap.field,
      assetMonths: assets,
      assetBand: assetBand.id,
      advantage: advantage.id,
      risk: risk.id,
      riskRevealed: false,
      health: 0.82,
      will: 0.74,
      hours: 0.3,
      control: 1,
      reputation: 0.5,
      care: family === "single" ? 0 : 0.15,
      careMonth,
      guarantee: 0,
      exited: false,
      exitReason: null,
      drawPause: 0,
      wantsDraw: 0,
    },
    personal: {
      cash: Math.max(0, assets),
      debt: Math.max(0, -assets),
    },
    contacts,
    shape: {},
    shapeStep: 0,
    venture: null,
    finance: null,
    team: null,
    peers: [],
    far: [],
    commitments: [],
    memories: [],
    timeline: [],
    analytics: [],
    flags: {},
    drivers: {},
    counts: { priceHold: 0 },
    pendingEvent: null,
    queuedEvent: null,
    summary: null,
    last: null,
    rescueLeft: mode.rescue_actions,
    rescueDays: mode.rescue_days,
    seen: {},
    cooldown: {},
    spine: [],
    lastMajorMonth: 0,
    chapter: 0,
    nextChapter: 12,
    successionCount: 0,
    successors: [],
    operator: null,
    role: "創辦人",
    ending: null,
    choices: [],
    firstMajor: null,
    counterfactual: null,
    ecosystemHint: opts.ecosystemHint || null,
    calendar: { year: opts.year || 2026, month: hashSeed(seed + ":cal") % 12 },
    preMonths: 0,
    rejectPreview: 2 + (hashSeed(seed + ":rej0") % 3),
    log: [],
    series: [],
    factors: null,
    feed: [],
    ambient: { demand: 0, cost: 0 },
    beatUntil: {},
    initiativeReady: 0,
    negStreak: 0,
    negStreakMax: 0,
    yearProfit: 0,
    profitYears: 0,
    maxConcentration: 0,
    coreKept: true,
    _cf: false,
  };
  state.founder.personalNote = assets >= 0
    ? `口袋裡大約 ${assets} 個月的當地薪資。`
    : `名下已有約 ${Math.abs(assets)} 個月薪資的債務。`;
  ensureCast(data, state);
  ensureWork(data, state);
  logEvent(state, "game_start", { seed, mode: modeId, city: city.id, gap: gap.id });
  return state;
}

export function acknowledgeReveal(state) {
  if (state.phase === "reveal") {
    state.phase = "opportunity";
    logEvent(state, "opportunity_view", { gap: state.gapId, n: 1 + state.rejected.length });
  }
  return state;
}

export function rejectOpportunity(data, state) {
  if (state.phase !== "opportunity") return { ok: false, reason: "現在不能拒絕。" };
  if (state.rejectsLeft <= 0) return { ok: false, reason: "沒有拒絕的餘額。" };
  const rng = rngOf(state);
  const months = state.rejectPreview;
  const city = cityById(data, state.cityId);
  let spent = 0;
  for (let i = 0; i < months; i++) {
    const cost = livingCost(data, state);
    state.personal.cash -= cost;
    spent += cost;
    if (state.personal.cash < 0) {
      state.personal.debt += -state.personal.cash;
      state.personal.cash = 0;
    }
    state.founder.age += 1 / 12;
    if (state.founder.careMonth > 0) state.founder.careMonth -= 1;
  }
  state.preMonths += months;
  state.rejectsLeft -= 1;
  state.rejected.push(state.gapId);
  const taken = rng.next() < 0.6;
  const peerName = data.content.peer_prefixes[rng.int(data.content.peer_prefixes.length)] + industry(data, gapById(data, state.gapId).family).name.slice(0, 2);
  logEvent(state, "opportunity_reject", { gap: state.gapId, months });
  let gaps = data.content.gaps.filter((g) => !state.rejected.includes(g.id) && g.id !== state.gapId);
  if (!gaps.length) gaps = data.content.gaps.filter((g) => g.id !== state.gapId);
  const gap = pickWeighted(rng, gaps, (g) => g.weight);
  state.gapId = gap.id;
  state.founder.matched = state.founder.field === gap.field;
  state.rejectPreview = 2 + rng.int(3);
  const cityP = city.weight / data.world.cities.reduce((s, c) => s + c.weight, 0);
  const gapP = gap.weight / data.content.gaps.reduce((s, g) => s + g.weight, 0);
  state.perThousand = Math.round(cityP * gapP * 1000 * 10) / 10;
  state.phase = "rejected";
  state.rejectResult = {
    months,
    spent,
    taken,
    peerName: taken ? peerName : null,
    city: city.name,
  };
  return { ok: true };
}

export function finishReject(state) {
  if (state.phase === "rejected") {
    state.phase = "opportunity";
    logEvent(state, "opportunity_view", { gap: state.gapId, n: 1 + state.rejected.length });
  }
}

export function returnToJob(data, state) {
  state.ending = {
    id: "return_to_job",
    month: state.preMonths,
    personalDebt: state.personal.debt,
  };
  award(data, state, "job_return", 4);
  if (!state.memories.find((m) => m.id === "unsent_resignation")) award(data, state, "unsent_resignation", 4);
  state.phase = "ending";
  logEvent(state, "venture_exit", { ending: "return_to_job" });
  return state;
}

export function acceptOpportunity(state) {
  if (state.phase !== "opportunity") return;
  state.phase = "shaping";
  state.shapeStep = 0;
  logEvent(state, "setup_choice", { step: "accept" });
}

export function setShape(state, key, value) {
  state.shape[key] = value;
  logEvent(state, "setup_choice", { step: key, value });
}

const SHAPE_KEYS = ["style", "venue", "revenue", "fulfillment", "ownership", "positioning"];

export function previewVenture(data, state, shape = state.shape) {
  if (!shape.style || !shape.venue) return null;
  const city = cityById(data, state.cityId);
  const gap = gapById(data, state.gapId);
  const E = econ(data);
  const venue = E.venues[shape.venue];
  const own = E.ownership[shape.ownership || "sole"];
  const style = E.commitment_styles[shape.style];
  if (!venue || !style) return null;
  const living = livingCost(data, { ...state });
  const reserveWanted = Math.min(Math.max(0, state.personal.cash), living * E.formula.personal_reserve_months);
  const inject = Math.max(0, state.personal.cash - reserveWanted);
  let cash = inject + (own ? own.cash : 0);
  let capex = venue.capex * (shape.style === "test" ? 0.5 : 1);
  if (state.ecosystemHint?.type === "vacant" && ["street", "mall"].includes(shape.venue)) capex *= 0.85;
  if (state.ecosystemHint?.type === "equipment" && shape.venue === "factory") capex *= 0.8;
  cash -= capex;
  let debt = 0;
  if (cash < 0) {
    debt = -cash;
    cash = 0;
  }
  const fixed = venue.fixed * city.rent_index * (shape.style === "test" ? 0.5 : 1);
  const probe = buildProbe(data, state, shape, cash);
  const rev = probe.revenue;
  const costs = probe.costs;
  const personalGap = founderShortfall(data, state, shape, rev);
  const burn = Math.max(0, costs - probe.collected + personalGap);
  const runway = burn > 0.05 ? cash / burn : 99;
  return {
    cash,
    debt,
    capex,
    personalLeft: Math.max(0, state.personal.cash - inject),
    fixed,
    revenue: rev,
    collected: probe.collected,
    costs,
    runway,
    personalGap,
    redline: redlineType(shape, gap, data, false),
    license: Math.round(venue.license * city.license_strict),
    living,
  };
}

function buildProbe(data, state, shape, cashIgnored) {
  const styleNow = econ(data).commitment_styles[shape.style];
  const livingNow = livingCost(data, state);
  const fake = {
    ...state,
    shape,
    founder: {
      ...state.founder,
      hours: styleNow.hours,
      exited: false,
      wantsDraw: styleNow.outside >= 0.4 ? livingNow * 0.12 : livingNow * 0.46,
      drawPause: 0,
    },
    venture: ventureSkeleton(data, state, shape),
    team: { headcount: 0, morale: 0.62, keyDependency: 0.85, wageMult: 1 },
    peersPressure: 0.06,
    month: 1,
    flags: {},
  };
  fake.venture.marketFit = openingFit(fake, gapById(data, state.gapId));
  const rev = potentialRevenue(data, fake, 0);
  const parts = costParts(data, fake, rev, 0);
  return { revenue: rev, collected: parts.collectedNow, costs: parts.operating };
}

function founderShortfall(data, state, shape, revenue) {
  const style = econ(data).commitment_styles[shape.style];
  if (!style) return 0;
  const living = livingCost(data, state);
  const outside = style.outside || 0;
  const wants = style.outside >= 0.4 ? living * 0.12 : living * 0.46;
  const draw = Math.min(wants, Math.max(0.04, (revenue || 0) * 0.32));
  return Math.max(0, living - outside - draw);
}

function openingFit(state, gap) {
  const f = 0.3 + (state.founder.matched ? 0.12 : 0) + clamp(state.founder.experience / 40, 0, 0.1);
  return clamp(f, 0.2, 0.55);
}

function ventureSkeleton(data, state, shape) {
  const gap = gapById(data, state.gapId);
  const E = econ(data);
  const venue = E.venues[shape.venue];
  const rev = E.revenues[shape.revenue];
  const own = E.ownership[shape.ownership];
  const pos = E.positioning[shape.positioning];
  const ful = E.fulfillment[shape.fulfillment];
  return {
    name: state.venture?.name || "",
    gapId: gap.id,
    family: gap.family,
    ...shape,
    redlineType: redlineType(shape, gap, data, false),
    tags: [...(venue?.tags || []), ...(gap.tags || [])],
    perm: blankMods(),
    timed: [],
    marketFit: 0.32,
    quality: clamp(0.48 + (ful?.quality || 0) + (state.founder.advantage === "craft" ? 0.06 : 0), 0.3, 0.9),
    trust: (venue?.trust || 0.4) + (own?.trust || 0) + (state.founder.advantage === "trust" ? 0.05 : 0),
    brand: 0.35,
    churn: rev ? Math.max(0.02, 1 - (rev.retain || 0.5)) * 0.25 : 0.05,
    arDays: (rev?.ar || 0) + cityById(data, state.cityId).ar_extra_days * (["project", "wholesale", "commission", "license"].includes(shape.revenue) ? 1 : 0.25),
    concentration: 0.18,
    returnsRate: shape.fulfillment === "resell" ? 0.08 : shape.venue === "online" ? 0.06 : 0.02,
    inventory: ful?.inventory || 0,
    platformFee: 0,
    utilization: 0.55,
    complexity: (shape.venue === "factory" ? 0.6 : 0.2) + (own?.slow || 0),
    capexBook: venue?.capex || 0,
    subsidyMonths: 0,
    public: false,
    audited: false,
    board: !!own?.board,
    royalty: own?.royalty || 0,
    licenseLeft: Math.round((venue?.license || 0) * cityById(data, state.cityId).license_strict),
    skill: 0.5,
    keyDependency: 0.82,
    wagePressure: 1,
    core: gap.core,
    unit: 0,
  };
}

export function confirmShape(data, state) {
  for (const k of SHAPE_KEYS) {
    if (!state.shape[k]) return { ok: false, reason: "六步還沒有走完。" };
  }
  const E = econ(data);
  const preview = previewVenture(data, state);
  const own = E.ownership[state.shape.ownership];
  const style = E.commitment_styles[state.shape.style];
  const venue = E.venues[state.shape.venue];
  state.founder.hours = style.hours;
  state.founder.will = clamp(state.founder.will * style.energy, 0.2, 1);
  state.founder.control = own.control;
  const livingDraw = livingCost(data, state);
  state.founder.wantsDraw = style.outside >= 0.4 ? livingDraw * 0.12 : livingDraw * 0.46;
  const living = livingCost(data, state);
  const reserveWanted = Math.min(state.personal.cash, living * E.formula.personal_reserve_months);
  const inject = Math.max(0, state.personal.cash - reserveWanted);
  state.personal.cash -= inject;
  const v = ventureSkeleton(data, state, state.shape);
  v.marketFit = openingFit(state, gapById(data, state.gapId));
  v.skill = skillOf(state.founder, gapById(data, state.gapId));
  if (own.skill) v.skill = clamp(v.skill + own.skill, 0, 1.2);
  if (own.growth) v.perm.revenue *= 1 + own.growth;
  if (state.founder.advantage === "learn") v.skill = clamp(v.skill + 0.05, 0, 1.25);
  state.venture = v;
  state.finance = {
    cash: preview.cash,
    debt: preview.debt + (own ? 0 : 0),
    arQueue: [],
    arPending: 0,
    lastRevenue: 0,
    lastCollected: 0,
    lastCost: 0,
    lastProfit: 0,
  };
  if (preview.debt > 0) {
    state.finance.debt = preview.debt;
    state.commitments.push({
      name: "開業借款或設備款",
      monthsLeft: 36,
      total: 36,
      kind: "debt",
      payment: preview.debt / 36,
    });
  }
  state.team = {
    headcount: 0,
    morale: clamp(0.58 + (own.morale || 0) + (state.ecosystemHint?.type === "people" ? 0.05 : 0), 0.2, 0.95),
    keyDependency: 0.82,
    wageMult: 1,
    names: [],
  };
  if (state.founder.advantage === "reputation") state.venture.trust += 0.04;
  if (state.ecosystemHint?.type === "scandal") state.venture.trust -= 0.05;
  if (state.ecosystemHint?.type === "standard") state.venture.trust += 0.03;
  state.venture.trust = clamp(state.venture.trust, 0.1, 0.95);
  buildPeers(data, state);
  if (state.venture.licenseLeft > 0) {
    state.commitments.push({ name: "牌照審核", monthsLeft: state.venture.licenseLeft, total: state.venture.licenseLeft, kind: "license", payment: 0 });
  }
  award(data, state, "first_receipt", 3);
  if (state.shape.style !== "quit") award(data, state, "unsent_resignation", 3);
  if (gapById(data, state.gapId).id === "farm_sourcing") award(data, state, "trace_tag", 2);
  scheduleSpine(data, state);
  state.phase = "naming";
  state.month = 0;
  return { ok: true, preview };
}

function buildPeers(data, state) {
  const rng = rngOf(state);
  const pers = data.economy.personalities.slice();
  const prefixes = data.content.peer_prefixes.slice();
  state.peers = [];
  for (let i = 0; i < 3; i++) {
    const p = pers.splice(rng.int(pers.length), 1)[0];
    const pre = prefixes.splice(rng.int(prefixes.length), 1)[0];
    state.peers.push({
      id: "p" + i,
      name: pre + "·" + nameOptions(state, data)[i % 3],
      personality: p.id,
      label: p.label,
      owner: personName(data, cityById(data, state.cityId).country, state.seed + ":peer" + i),
      pressure: 0.04 + rng.next() * 0.06,
      cash: 2 + rng.next() * 4,
      alive: true,
      note: "與你共用一種有限的東西：客人、人手、供應或曝光。",
    });
  }
  const others = data.world.cities.filter((c) => c.id !== state.cityId);
  const sameCountry = others.filter((c) => c.country === cityById(data, state.cityId).country);
  const farCity = (sameCountry[0] || others[0]);
  state.far = [
    {
      kind: "地區對照",
      name: farCity.name + "的相似店",
      cityId: farCity.id,
      alive: true,
      months: 0,
      note: "同一種做法，不同的租金、帳期與人。",
      cash: 3,
    },
    {
      kind: "反事實",
      name: "另一個早期選擇",
      alive: true,
      months: 0,
      note: "世界相同。第一個重大選擇不同。",
      pending: true,
    },
  ];
  state.peersPressure = 0.08;
}

function scheduleSpine(data, state) {
  const rng = rngOf(state);
  const add = (id, min, max) => {
    if (!data.events.find((e) => e.spine === id)) return;
    state.spine.push({ id, month: min + rng.int(Math.max(1, max - min + 1)), tries: 0, done: false });
  };
  add("first_customers", 2, 4);
  add(spineForRedline(state.venture.redlineType), 7, 12);
  add("peer_intro", 5, 11);
  if (state.founder.risk === "health") add("hidden_health", 14, 26);
  if (state.founder.risk === "compliance") add("hidden_compliance", 8, 16);
  if (state.founder.risk === "conflict") add("hidden_conflict", 8, 18);
  if (state.founder.careMonth > 0) add("family_care", state.founder.careMonth, state.founder.careMonth);
  if (state.shape.style === "test") add("test_end", 4, 4);
  if (["keep", "part"].includes(state.shape.style)) add("moonlighting", 6, 14);
  if (state.shape.style === "intra") add("employer_claim", 5, 14);
  if (gapById(data, state.gapId).declining) add("decline", 8, 15);
  add("scale_fork", 22, 40);
  add("capital_fork", 28, 48);
  const to68 = Math.max(48, Math.round((68 - state.founder.age) * 12));
  add("succession_due", to68, to68 + 10);
  add("transform_due", 50, 84);
  add("ipo_prep", 72, 110);
  add("ipo_window", 100, 140);
  add("century_question", 540, 680);
  state.spine.sort((a, b) => a.month - b.month);
}

export function confirmName(state, name) {
  if (state.phase !== "naming") return;
  state.venture.name = String(name || nameOptions(state, { content: { name_a: ["店"], name_b: { x: ["社"] } } })[0]).slice(0, 16);
  state.phase = "play";
  state.role = "創辦人";
  pushTimeline(state, "開業", `${state.venture.name}寫上帳簿。`);
  logEvent(state, "setup_choice", { step: "name", value: state.venture.name });
}

function logEvent(state, name, extra) {
  state.analytics.push({ e: name, m: state.month, ...extra, t: state.analytics.length });
  if (state.analytics.length > 500) state.analytics.shift();
}

function pushTimeline(state, title, text) {
  state.timeline.push({ m: state.month, title, text });
  if (state.timeline.length > 180) state.timeline.splice(20, state.timeline.length - 160);
}

function award(data, state, id, weightBoost = 0) {
  if (!id || state.memories.some((m) => m.id === id)) return;
  const meta = (data.narrative.memories || []).find((m) => m.id === id);
  state.memories.push({
    id,
    name: fillText(data, state, meta?.name || id),
    blurb: fillText(data, state, meta?.blurb || ""),
    month: state.month,
    weight: (meta?.weight || 1) + weightBoost,
  });
}

export function calendarLabel(state, add = 0) {
  const m = state.month + state.preMonths + add;
  const month = (state.calendar.month + m) % 12;
  const year = state.calendar.year + Math.floor((state.calendar.month + m) / 12);
  return `${year}年${month + 1}月`;
}

export function lifeLabel(months) {
  if (months < 12) return `${Math.max(0, months)} 個月`;
  const y = Math.floor(months / 12);
  const mo = months % 12;
  return mo ? `${y} 年 ${mo} 個月` : `${y} 年`;
}

export function forecast(data, state) {
  if (!state.venture) return null;
  const rev = potentialRevenue(data, state, 0);
  const parts = costParts(data, state, rev, 0);
  const band = state.mode === "hardcore" ? econ(data).formula.forecast_band_hardcore : state.month < 6 ? econ(data).formula.forecast_band_early : econ(data).formula.forecast_band;
  return {
    revenue: [rev * (1 - band), rev * (1 + band)],
    collected: [parts.collectedNow * (1 - band), parts.collectedNow * (1 + band) + parts.releasing],
    costs: [parts.operating * (1 - band * 0.5), parts.operating * (1 + band * 0.5)],
  };
}

function trendFactor(data, state) {
  const gap = gapById(data, state.gapId);
  const yearly = (gap?.trend || 0) + (state.venture?.timedTrend || 0) + (state.flags.transformed ? 0.03 : 0);
  const years = state.month / 12;
  return Math.max(0.45, Math.pow(1 + yearly, years));
}

function potentialRevenue(data, state, noise) {
  const v = state.venture;
  const city = cityById(data, state.cityId);
  const gap = gapById(data, state.gapId);
  const E = econ(data);
  const pos = E.positioning[v.positioning];
  const ven = E.venues[v.venue];
  const ful = E.fulfillment[v.fulfillment];
  const rev = E.revenues[v.revenue];
  const mods = effectiveMods(v);
  const fit = E.formula.fit_floor + E.formula.fit_span * v.marketFit;
  const season = 1 + city.seasonality * Math.sin(((state.month + city.season_phase) * Math.PI) / 6);
  const supply = city.supply_bonus_families?.includes(familyName(data, gap.family)) ? 1.06 : 1;
  const peerDrag = clamp(state.peersPressure || 0, 0, E.formula.peer_pressure_cap);
  const ambientDemand = clamp(state.ambient?.demand || 0, -0.1, 0.1);
  let unitDemand =
    E.formula.base_revenue *
    city.demand_index *
    (gap.demand || 0.8) *
    pos.volume *
    ven.traffic *
    ful.throughput *
    rev.scale *
    fit *
    trendFactor(data, state) *
    season *
    supply *
    (mods.revenue || 1) *
    (1 - peerDrag) *
    (1 + ambientDemand) *
    (1 + noise);
  const tenure = 1 + Math.min(E.formula.tenure_cap, (state.month || 0) * E.formula.tenure_per_month);
  unitDemand *= tenure;
  if (v.public) unitDemand *= 1.04;
  if (v.licenseLeft > 0) unitDemand *= 0.5;
  if (state.flags.exclusive) unitDemand *= 1.03;
  const morale = state.team?.morale ?? 0.6;
  const heads = state.team?.headcount || 0;
  const dep = v.keyDependency ?? 0.6;
  const timeFactor = state.founder.exited
    ? clamp(0.55 + heads * 0.08, 0.55, 1.25)
    : clamp(state.founder.hours || 0.5, 0.25, 1);
  const fitCap = 0.7 + 0.6 * (v.marketFit || 0.3);
  const operator = state.founder.exited ? (state.operator?.type === "pro" ? 0.9 : 0.74) : 1;
  const founderUnits = timeFactor * (v.skill || 0.55) * E.formula.founder_output * fitCap * operator;
  const empUnits = heads * E.formula.employee_output * (0.68 + 0.32 * morale) * (1 - 0.28 * dep * (state.founder.exited ? 1 : 0.35));
  const unitCap = Math.max(0.2, (founderUnits + empUnits) * (ven.capacity || 1));
  const units = Math.min(Math.max(0, unitDemand), unitCap);
  v.utilization = clamp(units / unitCap, 0.05, 1.25);
  const qualityFactor = E.formula.quality_floor_factor + E.formula.quality_span * (v.quality || 0.5);
  const price = pos.price * (city.price_index || 1) * (1 + (mods.price || 0));
  return Math.max(0, units * price * qualityFactor);
}

function costParts(data, state, revenue, released) {
  const v = state.venture;
  const city = cityById(data, state.cityId);
  const E = econ(data);
  const pos = E.positioning[v.positioning];
  const ven = E.venues[v.venue];
  const ful = E.fulfillment[v.fulfillment];
  const rev = E.revenues[v.revenue];
  const mods = effectiveMods(v);
  const ambientCost = clamp(state.ambient?.cost || 0, -0.08, 0.08);
  const variable = revenue * clamp(pos.variable + ful.variable_add + mods.cost, 0.12, 0.84) * (1 + ambientCost);
  const premises = ven.fixed * city.rent_index * mods.fixed + mods.fixedAdd + v.complexity * E.formula.maturity_overhead_per_complexity;
  const platformRate = ven.platform + rev.platform + mods.platform + city.platform_pressure * ven.platform * 0.45;
  const platform = revenue * platformRate;
  const royalty = revenue * ((v.royalty || 0) + mods.royalty);
  const labor = (state.team?.headcount || 0) * E.formula.labor_per_head * city.wage_index * (state.team?.wageMult || 1) * (v.wagePressure || 1);
  let draw = 0;
  if (!state.founder.exited && !(state.founder.drawPause > 0)) {
    const target = state.founder.wantsDraw || 0;
    const affordable = Math.max(0.04, revenue * 0.32);
    draw = Math.min(target, affordable);
    state.flags.draw_short = target > draw + 0.03;
  } else state.flags.draw_short = false;
  const rate = city.credit_tight >= 0.45 ? E.formula.interest_tight : E.formula.interest_monthly;
  const interest = (state.finance?.debt || 0) * rate;
  let principal = 0;
  for (const c of state.commitments || []) if (c.kind === "debt" && c.monthsLeft > 0) principal += c.payment || 0;
  const collectedNow = collectNow(state, revenue, city);
  const profitBase = collectedNow + released - variable - labor - premises - platform - royalty - interest;
  const tax = profitBase > 0 ? profitBase * city.tax_rate : 0;
  const operating = variable + labor + premises + platform + royalty + interest + tax + draw + principal;
  return { variable, premises, platform, royalty, labor, draw, interest, principal, tax, collectedNow, releasing: released, operating, platformRate };
}

function collectNow(state, revenue, city) {
  const v = state.venture;
  const bad = 0.02 + city.bad_debt_extra + (v.returnsRate || 0) * 0.5;
  const ar = v.arDays || 0;
  const lag = Math.max(1, Math.round(ar / 30));
  const nowPart = lag <= 1 ? 1 : 0.4;
  return revenue * clamp(1 - bad, 0.4, 0.99) * nowPart;
}

function enqueueReceivable(state, revenue, city) {
  const v = state.venture;
  const bad = 0.02 + city.bad_debt_extra + (v.returnsRate || 0) * 0.5;
  const ar = v.arDays || 0;
  const lag = Math.max(1, Math.round(ar / 30));
  if (lag <= 1) return;
  const later = revenue * clamp(1 - bad, 0.4, 0.99) * 0.6;
  state.finance.arQueue.push({ due: state.month + lag, amount: later });
}

export function settle(data, state) {
  if (state.phase !== "play" || !state.venture || state.ending) return state;
  return settleOne(data, state);
}

export function previewMonth(data, state) {
  if (!state?.venture || state.phase !== "play" || state.ending) return null;
  const ghost = structuredClone(state);
  settleOne(data, ghost);
  return {
    month: ghost.month,
    cash: ghost.finance.cash,
    collected: ghost.last?.collected || 0,
    revenue: ghost.last?.revenue || 0,
    cost: ghost.last?.cost || 0,
    line: ghost.last?.line || "",
    beats: ghost.lastBeats || [],
    phase: ghost.phase,
    when: calendarLabel(ghost),
  };
}

function settleOne(data, state) {
  ensureWork(data, state);
  const rng = state._cf ? { next: () => 0.5, int: () => 0 } : rngOf(state);
  state.month += 1;
  if (state.month % 12 === 0) {
    if (!state.founder.exited) state.founder.age += 1;
    if (state.operator) state.operator.age += 1;
    if (state.yearProfit > 0) state.profitYears += 1;
    state.yearProfit = 0;
  }
  for (const c of state.commitments) if (c.monthsLeft > 0) c.monthsLeft -= 1;
  state.commitments = state.commitments.filter((c) => c.monthsLeft > 0);
  if (state.founder.drawPause > 0) state.founder.drawPause -= 1;
  state.venture.timed = (state.venture.timed || []).map((t) => ({ ...t, months: t.months - 1 })).filter((t) => t.months > 0);

  const noiseAmp = state._cf ? 0 : econ(data).formula.noise;
  const noise = (rng.next() - 0.5) * 2 * noiseAmp;
  const revenue = potentialRevenue(data, state, noise);
  let released = 0;
  const keep = [];
  for (const q of state.finance.arQueue) {
    if (q.due <= state.month) released += q.amount;
    else keep.push(q);
  }
  state.finance.arQueue = keep;
  enqueueReceivable(state, revenue, cityById(data, state.cityId));
  const parts = costParts(data, state, revenue, released);
  const city = cityById(data, state.cityId);
  state.finance.cash += parts.collectedNow + released;
  state.finance.cash -= parts.operating;
  state.finance.debt = Math.max(0, state.finance.debt - parts.principal);
  state.personal.cash += econ(data).commitment_styles[state.shape.style]?.outside && !state.founder.exited
    ? outsideNow(data, state)
    : 0;
  state.personal.cash += parts.draw;
  state.personal.cash -= state.founder.exited ? 0 : livingCost(data, state);
  if (state.personal.cash < 0 && state.finance.cash > 0.4 - state.personal.cash) {
    const need = -state.personal.cash;
    state.finance.cash -= need;
    state.personal.cash = 0;
    state.flags.extra_draw = true;
  } else if (state.personal.cash < 0) {
    state.personal.debt += -state.personal.cash;
    state.personal.cash = 0;
    state.founder.will = clamp(state.founder.will - 0.02, 0, 1);
    state.founder.health = clamp(state.founder.health - 0.01, 0, 1);
    state.flags.personal_strain = true;
  } else {
    state.flags.personal_strain = false;
  }

  const gap = gapById(data, state.gapId);
  const f = econ(data).formula;
  let gain = f.fit_monthly_gain * (gap.declining && !state.flags.transformed ? f.fit_decline_mult : 1) * (0.65 + state.venture.quality * 0.5);
  if (state.flags.discount) gain *= 0.7;
  if (state.founder.advantage === "learn") gain *= 1.15;
  gain *= econ(data).commitment_styles[state.shape.style].speed;
  state.venture.marketFit = clamp(state.venture.marketFit + gain, 0.05, f.fit_cap);
  state.venture.trust = clamp(state.venture.trust + econ(data).positioning[state.venture.positioning].trust_gain * city.loyalty - (state.flags.discount ? 0.004 : 0), 0.05, 0.97);
  state.peersPressure = clamp((state.peersPressure || 0) + Math.max(0, state.venture.marketFit - 0.55) * city.competition_elasticity * f.competition_per_fit / 12, 0, f.peer_pressure_cap);
  tickPeers(state, rng);
  const unit = (parts.collectedNow - parts.variable - parts.platform) / Math.max(revenue, 0.05);
  state.venture.unit = unit;
  if (unit < 0) state.negStreak += 1;
  else state.negStreak = 0;
  state.negStreakMax = Math.max(state.negStreakMax, state.negStreak);
  if (state.venture.licenseLeft > 0) state.venture.licenseLeft -= 1;
  state.yearProfit += revenue - parts.operating;
  state.maxConcentration = Math.max(state.maxConcentration, state.venture.concentration);
  if (state.founder.age > 70 && !state.founder.exited) state.founder.health = clamp(state.founder.health - 0.012, 0, 1);
  if (state.founder.hours > 0.92 && state.venture.utilization > 0.9) state.founder.health = clamp(state.founder.health - 0.008, 0, 1);
  state.venture.churn = clamp(state.venture.churn + (state.flags.discount ? -0.002 : 0.001) - state.venture.trust * 0.002, 0.015, 0.2);

  const line = monthLine(data, state, revenue, parts);
  state.finance.lastRevenue = revenue;
  state.finance.lastCollected = parts.collectedNow + released;
  state.finance.lastCost = parts.operating;
  state.finance.lastProfit = revenue - parts.variable - parts.labor - parts.premises - parts.platform - parts.royalty;
  state.last = { month: state.month, line, revenue, collected: state.finance.lastCollected, cost: parts.operating, cash: state.finance.cash, parts };
  state.factors = explainFactors(data, state, revenue, parts);
  state.series.push({ m: state.month, cash: round2(state.finance.cash), rev: round2(revenue), cost: round2(parts.operating) });
  if (state.series.length > 1200) state.series.shift();

  const rl = computeRedline(data, state);
  state.prevLevel = state.level;
  state.level = rl.level;
  state.redlineSnap = rl;

  if (!state._cf) rollBeats(data, state, rng);
  if (state.last && state.lastBeats?.length) state.last.beat = state.lastBeats.map((b) => b.text).join(" ");

  if (!state._cf && state.month % 3 === 0) {
    const pool = data.narrative.atmosphere;
    state.last.aside = pool[state.month % pool.length];
  }

  if (state.finance.cash < 0) {
    state.phase = "laststand";
    state.rescueLeft = state.rescueLeft || modeOf(data, state.mode).rescue_actions;
    pushTimeline(state, "現金不夠", "公司付不出這一輪。");
    return state;
  }
  if (state.founder.health < 0.2 && !state.founder.exited && !state.flags.crisis_scheduled) {
    state.flags.crisis_scheduled = true;
    state.spine.push({ id: "founder_health_crisis", month: state.month + 1, tries: 0, done: false });
  }
  if (state.operator && state.operator.age > 68 && !state.spine.some((s) => s.id === "succession_due" && !s.done)) {
    state.spine.push({ id: "succession_due", month: state.month + 2, tries: 0, done: false });
  }

  const event = takeEvent(data, state, rng);
  const chapter = isChapter(state);
  if (state.month >= econ(data).formula.max_month) {
    finishCentury(data, state);
    return state;
  }
  if (chapter) {
    state.chapter += 1;
    const m = state.month;
    const step = m >= 180 ? 60 : m >= 60 ? 24 : 12;
    state.nextChapter = m + step;
    if (event) state.queuedEvent = event;
    state.phase = "chapter";
    logEvent(state, "chapter_close", { chapter: state.chapter });
    return state;
  }
  if (event) {
    state.pendingEvent = event;
    state.phase = "event";
    state.lastMajorMonth = state.month;
    logEvent(state, "event_view", { id: event.id });
    return state;
  }
  state.phase = "play";
  return state;
}

function outsideNow(data, state) {
  const style = econ(data).commitment_styles[state.shape.style];
  if (!style || state.founder.exited) return 0;
  if (state.flags.outside_off) return 0;
  if (state.flags.outside_value != null) return state.flags.outside_value;
  return style.outside * (state.flags.outside_mult || 1);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function monthLine(data, state, revenue, parts) {
  const name = state.work?.name || "這門生意";
  const sells = state.work?.sells || "東西";
  if (parts.collectedNow + 0.001 < parts.variable + parts.premises) return `${name}的帳面有數字。付完場地與${sells}的成本之後，所剩不多。`;
  if (state.finance.arQueue.length && state.venture.arDays > 40) return `${name}賣出的${sells}有些是真的，只是錢還在別人的帳上。`;
  if (revenue > parts.operating) return `${name}這個月的${sells}收進來了，蓋過了要付出去的。`;
  return `${name}沒有大事。賣${sells}的固定帳仍舊要付。`;
}

function explainFactors(data, state, revenue, parts) {
  const city = cityById(data, state.cityId);
  const gap = gapById(data, state.gapId);
  const v = state.venture;
  return [
    ["生意", state.work?.name || gap.title],
    ["賣的是", state.work?.sells || gap.core],
    ["付錢的人", state.work?.buyer || "客人"],
    ["城市需求", city.demand_index],
    ["缺口強度", gap.demand],
    ["配合度", round2(v.marketFit)],
    ["趨勢係數", round2(trendFactor(data, state))],
    ["產能利用", round2(v.utilization)],
    ["價格係數", round2(1 + effectiveMods(v).price)],
    ["帳面收入", round2(revenue)],
    ["本月實收", round2(parts.collectedNow)],
    ["稍後才到的應收", round2(state.finance.arQueue.reduce((s, q) => s + q.amount, 0))],
    ["場地與平台", round2(parts.premises + parts.platform)],
    ["人力", round2(parts.labor)],
    ["你取走", round2(parts.draw)],
  ];
}

function isChapter(state) {
  return state.month > 0 && state.month === state.nextChapter;
}

function takeEvent(data, state, rng) {
  const due = state.spine.find((s) => !s.done && s.month <= state.month);
  if (due) {
    const ev = data.events.find((e) => e.spine === due.id);
    if (ev && eligible(data, state, ev)) {
      due.done = true;
      return decorate(data, state, ev);
    }
    due.tries += 1;
    if (due.tries < 4) due.month += 6;
    else due.done = true;
  }
  const stage = stageOf(data, state.month);
  const since = state.month - (state.lastMajorMonth || 0);
  if (since < stage.decision_gap * 0.6) return null;
  const p = clamp((since - stage.decision_gap * 0.6) / stage.decision_gap, 0, 0.8);
  if (rng.next() > p && since < stage.decision_gap * 1.45) return null;
  const pool = data.events.filter((e) => !e.spine && eligible(data, state, e));
  if (!pool.length) return null;
  const picked = pickWeighted(rng, pool, (e) => weightOf(data, state, e));
  if (!picked || weightOf(data, state, picked) <= 0) return null;
  return decorate(data, state, picked);
}

function eligible(data, state, e) {
  if (e.once && state.seen[e.id]) return false;
  if ((state.cooldown[e.id] || 0) > state.month) return false;
  if (e.min_month && state.month < e.min_month) return false;
  if (e.max_month && state.month > e.max_month) return false;
  if (e.cities && !e.cities.includes(state.cityId)) return false;
  if (e.families && !e.families.includes(state.venture.family)) return false;
  if (e.tags_any && !e.tags_any.some((t) => state.venture.tags.includes(t) || state.venture.family === t)) return false;
  const r = e.requires || {};
  if (r.min_headcount && state.team.headcount < r.min_headcount) return false;
  if (r.max_headcount && state.team.headcount > r.max_headcount) return false;
  if (r.ownership && !r.ownership.includes(state.shape.ownership)) return false;
  if (r.family && !r.family.includes(state.founder.family)) return false;
  if (r.style && !r.style.includes(state.shape.style)) return false;
  if (r.board && !state.venture.board) return false;
  if (r.public && !state.venture.public) return false;
  if (r.declining && !gapById(data, state.gapId).declining) return false;
  if (r.flag && !state.flags[r.flag]) return false;
  if (r.min_fit && state.venture.marketFit < r.min_fit) return false;
  if (r.max_investor != null && (state.drivers.capital || 0) > 8 && state.founder.control < 0.5) return false;
  if (r.positioning && !r.positioning.includes(state.venture.positioning)) return false;
  if (r.min_month && state.month < r.min_month) return false;
  return true;
}

function weightOf(data, state, e) {
  let w = e.weight || 10;
  const stage = stageOf(data, state.month).id;
  if (["spark", "early"].includes(stage) && e.layer === "generic") w *= 1.1;
  if (["mature", "legacy", "century"].includes(stage) && e.min_month >= 24) w *= 1.15;
  if (state.finance.cash < 1.2 && ["CREDIT", "LEASE", "SUPPLY_TERMS"].includes(e.grammar)) w *= 1.4;
  if (state.level === "crit" && e.layer === "structure") w *= 1.3;
  const last = state.choices[state.choices.length - 1];
  if (last && e.grammar && last.grammar === e.grammar) w *= 0.45;
  if ((state.cooldown[e.id] || 0) > state.month) return 0;
  return w;
}

function decorate(data, state, e) {
  const gap = gapById(data, state.gapId);
  const skin = e.skins && (e.skins[gap.family] || e.skins[state.venture.family]);
  const fill = (s) => fillText(data, state, s);
  const tokens = castTokens(data, state);
  const actors = data.narrative.actors?.[e.grammar] || {};
  let subject = fill(actors.subject || state.venture?.name || "這間公司");
  let object = fill(actors.object || e.title);
  if (!state.cast?.kin && e.grammar === "CONFLICT") {
    subject = `客人${tokens.customer}與你自己`;
    object = "同一個晚上、你答應過的兩件事";
  }
  return {
    ...e,
    title: fill(skin?.title || e.title),
    body: fill(skin?.body || e.body),
    omen: fill(e.omen),
    subject,
    object,
    choices: e.choices.map((c) => ({ ...c, label: fill(c.label), detail: fill(c.detail), risk: fill(c.risk) })),
  };
}

function beatOk(state, b) {
  if ((state.beatUntil?.[b.id] || 0) > state.month) return false;
  const need = b.when || [];
  if (need.includes("kin") && !state.cast?.kin) return false;
  if (need.includes("staff") && !(state.team?.headcount > 0)) return false;
  if (need.includes("premises") && !(state.venture?.tags || []).some((t) => t === "physical" || t === "premises")) return false;
  if (need.includes("peer") && !(state.peers || []).length) return false;
  if (need.includes("care") && (state.founder?.care || 0) < 0.2) return false;
  return true;
}

function applyBeatEffects(state, effects = {}) {
  const v = state.venture;
  if (!v) return;
  state.ambient = state.ambient || { demand: 0, cost: 0 };
  if (effects.trust) v.trust = clamp(v.trust + effects.trust, 0.05, 0.97);
  if (effects.market_fit) v.marketFit = clamp(v.marketFit + effects.market_fit, 0.05, 0.95);
  if (effects.quality) v.quality = clamp((v.quality || 0.5) + effects.quality, 0.2, 0.95);
  if (effects.morale && state.team) state.team.morale = clamp(state.team.morale + effects.morale, 0.15, 0.95);
  if (effects.health) state.founder.health = clamp(state.founder.health + effects.health, 0.05, 1);
  if (effects.will) state.founder.will = clamp(state.founder.will + effects.will, 0.05, 1);
  if (effects.care) state.founder.care = clamp((state.founder.care || 0) + effects.care, 0, 1);
  if (effects.hours) state.founder.hours = clamp(state.founder.hours + effects.hours, 0.2, 1);
  if (effects.cash) state.finance.cash += effects.cash;
  if (effects.peer) state.peersPressure = clamp((state.peersPressure || 0) + effects.peer, 0, 0.45);
  if (effects.demand) state.ambient.demand = clamp((state.ambient.demand || 0) + effects.demand, -0.1, 0.1);
  if (effects.cost) state.ambient.cost = clamp((state.ambient.cost || 0) + effects.cost, -0.08, 0.08);
  if (effects.churn) v.churn = clamp((v.churn || 0.04) + effects.churn, 0.015, 0.2);
}

function rollBeats(data, state, rng) {
  ensureCast(data, state);
  const pool = (data.narrative.beats || []).filter((b) => beatOk(state, b));
  if (!pool.length) {
    state.lastBeats = [];
    return;
  }
  const count = rng.next() < 0.28 ? 2 : 1;
  const picked = [];
  let rest = pool.slice();
  for (let i = 0; i < count && rest.length; i++) {
    const b = pickWeighted(rng, rest, (x) => x.weight || 1);
    if (!b) break;
    picked.push(b);
    rest = rest.filter((x) => x.id !== b.id);
  }
  state.beatUntil = state.beatUntil || {};
  state.feed = state.feed || [];
  const beats = picked.map((b) => {
    applyBeatEffects(state, b.effects || {});
    state.beatUntil[b.id] = state.month + (b.cooldown || 4);
    const beat = {
      id: b.id,
      m: state.month,
      when: calendarLabel(state),
      subject: fillText(data, state, b.subject || ""),
      object: fillText(data, state, b.object || ""),
      text: fillText(data, state, b.text || ""),
      note: fillText(data, state, b.note || ""),
    };
    pushTimeline(state, beat.subject, `${beat.object}。${beat.text}`);
    return beat;
  });
  state.lastBeats = beats;
  state.feed.push(...beats);
  if (state.feed.length > 60) state.feed.splice(0, state.feed.length - 60);
}

export function chooseEvent(data, state, choiceId) {
  const ev = state.pendingEvent;
  if (!ev || state.phase !== "event") return { ok: false };
  const choice = ev.choices.find((c) => c.id === choiceId);
  if (!choice) return { ok: false };
  applyChoice(data, state, ev, choice);
  state.seen[ev.id] = true;
  state.cooldown[ev.id] = state.month + (ev.cooldown || 12);
  state.pendingEvent = null;
  state.lastMajorMonth = state.month;
  if (!state._cf && !state.firstMajor && ev.major !== false) {
    state.firstMajor = { event: ev.id, choice: choice.id, title: ev.title };
    state.counterfactual = runCounterfactual(data, state, ev, choice.id);
  }
  if (state.phase === "event") state.phase = "play";
  return { ok: true };
}

function applyChoice(data, state, ev, choice) {
  applyEffects(data, state, choice.effects || {}, ev);
  if (choice.drivers) {
    for (const [k, v] of Object.entries(choice.drivers)) state.drivers[k] = (state.drivers[k] || 0) + v;
  }
  if (choice.memory) award(data, state, choice.memory, 2);
  if (choice.commitment) {
    state.commitments.push({
      name: choice.commitment.name,
      monthsLeft: choice.commitment.months,
      total: choice.commitment.months,
      kind: choice.commitment.kind,
      payment: choice.commitment.kind === "debt" ? Math.abs(choice.effects?.debt || 1) / choice.commitment.months : 0,
    });
  }
  state.choices.push({ month: state.month, event: ev.id, choice: choice.id, grammar: ev.grammar, label: choice.label });
  pushTimeline(state, ev.title, choice.label);
  logEvent(state, "event_choice", { id: ev.id, choice: choice.id });
  if (choice.effects?.flags?.price_hold) state.counts.priceHold += 1;
  if (["hold", "keep"].includes(choice.id) && ["OPENING_DEMAND", "CUT_VARIABLE_COST", "COMPETITION"].includes(ev.grammar)) state.counts.priceHold += 1;
}

function applyEffects(data, state, effects, ev) {
  const v = state.venture;
  if (!v) return;
  const tail = state.mode === "hardcore" ? modeOf(data, state.mode).tail_risk || 1 : 1;
  const timed = {};
  const permanent = { ...effects };
  if (effects.for_months) {
    for (const key of ["price_mod", "revenue_mult", "cost_mod", "churn"]) {
      if (effects[key] != null) {
        timed[key] = effects[key];
        delete permanent[key];
      }
    }
    if (Object.keys(timed).length) {
      v.timed.push({
        months: effects.for_months,
        price: timed.price_mod || 0,
        cost: timed.cost_mod || 0,
        revenue: timed.revenue_mult || 1,
        churn: timed.churn || 0,
      });
    }
  }
  const cash = permanent.cash || 0;
  if (cash) {
    const scaled = cash < 0 ? cash * tail : cash;
    const healthy = state.finance.runway == null || state.finance.cash > 1.5;
    if (scaled < 0 && state.finance.cash + scaled < 0 && healthy && state.level !== "crit") {
      state.finance.cash = Math.max(0.3, state.last?.parts?.premises || 0.4);
    } else state.finance.cash += scaled;
  }
  if (permanent.debt) state.finance.debt = Math.max(0, state.finance.debt + permanent.debt);
  if (permanent.control) state.founder.control = clamp(state.founder.control + permanent.control, 0.05, 1);
  if (permanent.control_set != null) state.founder.control = permanent.control_set;
  if (permanent.control_to != null) {
    state.founder.control = state.founder.control > permanent.control_to
      ? permanent.control_to
      : clamp(state.founder.control - 0.2, 0.2, 1);
  }
  if (permanent.revenue_mult) v.perm.revenue *= permanent.revenue_mult;
  if (permanent.fixed_mult) v.perm.fixed *= permanent.fixed_mult;
  if (permanent.fixed_add) v.perm.fixedAdd += permanent.fixed_add;
  if (permanent.price_mod) v.perm.price += permanent.price_mod;
  if (permanent.cost_mod) v.perm.cost += permanent.cost_mod;
  if (permanent.platform_fee) v.perm.platform += permanent.platform_fee;
  if (permanent.royalty) v.perm.royalty = (v.perm.royalty || 0) + permanent.royalty;
  const bump = (key, delta, a, b) => {
    if (delta) v[key] = clamp((v[key] || 0) + delta, a, b);
  };
  bump("marketFit", permanent.market_fit, 0.05, 0.95);
  bump("quality", permanent.quality, 0.15, 0.98);
  bump("trust", permanent.trust, 0.05, 0.98);
  bump("brand", permanent.brand, 0.05, 0.98);
  if (permanent.will) state.founder.will = clamp(state.founder.will + permanent.will, 0, 1);
  if (permanent.health) state.founder.health = clamp(state.founder.health + permanent.health, 0.05, 1);
  if (permanent.hours) state.founder.hours = clamp(state.founder.hours + permanent.hours, 0.15, 1);
  if (permanent.hours_set != null) state.founder.hours = permanent.hours_set;
  if (permanent.morale) state.team.morale = clamp(state.team.morale + permanent.morale, 0.05, 0.98);
  if (permanent.concentration_set != null) v.concentration = permanent.concentration_set;
  if (permanent.ar_days != null) v.arDays = permanent.ar_days;
  if (permanent.churn && !effects.for_months) v.churn = clamp(v.churn + permanent.churn, 0.01, 0.25);
  if (permanent.headcount) hire(data, state, permanent.headcount);
  if (permanent.headcount_min) while (state.team.headcount < permanent.headcount_min) hire(data, state, 1);
  if (permanent.headcount_delta) {
    if (permanent.headcount_delta > 0) hire(data, state, permanent.headcount_delta);
    else fire(data, state, -permanent.headcount_delta);
  }
  if (permanent.fire_to != null) while (state.team.headcount > permanent.fire_to) fire(data, state, 1);
  if (permanent.guarantee) state.founder.guarantee += permanent.guarantee;
  if (permanent.complexity) v.complexity = clamp(v.complexity + permanent.complexity, 0, 8);
  if (permanent.peer_pressure) state.peersPressure = clamp((state.peersPressure || 0) + permanent.peer_pressure, 0, 0.5);
  if (permanent.investor) state.drivers.capital = (state.drivers.capital || 0) + permanent.investor * 10;
  if (permanent.key_dependency) v.keyDependency = clamp((v.keyDependency || 0.5) + permanent.key_dependency, 0.05, 0.95);
  if (permanent.subsidy != null) v.subsidyMonths = permanent.subsidy;
  if (permanent.subsidy_add) v.subsidyMonths = (v.subsidyMonths || 0) + permanent.subsidy_add;
  if (permanent.transformed) state.flags.transformed = true;
  if (permanent.core_kept) state.coreKept = true;
  if (permanent.core_drop) state.coreKept = false;
  if (permanent.board) v.board = true;
  if (permanent.audited) v.audited = true;
  if (permanent.mission_clause) state.flags.mission_clause = true;
  if (permanent.reputation) state.founder.reputation = clamp(state.founder.reputation + permanent.reputation, 0, 1);
  if (permanent.care) state.founder.care = clamp(state.founder.care + permanent.care, 0, 1);
  if (permanent.wage_mult) state.team.wageMult *= permanent.wage_mult;
  if (permanent.draw_zero) state.founder.drawPause = Math.max(state.founder.drawPause, permanent.draw_zero);
  if (permanent.draw_mult) state.founder.wantsDraw *= permanent.draw_mult;
  if (permanent.outside_set != null) {
    state.flags.outside_off = permanent.outside_set === 0;
    state.flags.outside_value = permanent.outside_set;
  }
  if (permanent.outside_mult) state.flags.outside_mult = permanent.outside_mult;
  if (permanent.returns) v.returnsRate = clamp(v.returnsRate + permanent.returns, 0, 0.4);
  if (permanent.inventory) v.inventory = clamp((v.inventory || 0) + permanent.inventory, 0, 2);
  if (permanent.trend_add) v.timedTrend = (v.timedTrend || 0) + permanent.trend_add;
  if (permanent.flags) {
    for (const [k, val] of Object.entries(permanent.flags)) state.flags[k] = val;
  }
  if (permanent.public_off) {
    v.public = false;
    v.redlineType = redlineType(state.shape, gapById(data, state.gapId), data, false);
  }
  if (permanent.try_ipo) attemptIpo(data, state);
  if (permanent.hostile_check) {
    if (state.founder.control < 0.34) {
      state.ending = { id: "hostile", month: state.month };
      state.phase = "ending";
    } else {
      state.drivers.governance = (state.drivers.governance || 0) + 1;
    }
  }
  if (permanent.compliance_city_check) {
    const city = cityById(data, state.cityId);
    if (city.license_strict >= 1.2 && !state.flags.compliance_ok) {
      state.ending = { id: "compliance", month: state.month };
      state.phase = "ending";
    } else {
      state.flags.compliance_risk = false;
      state.flags.compliance_ok = true;
    }
  }
  if (permanent.tax_hit) state.finance.cash -= v.audited ? 0.6 : 1.3;
  if (permanent.open_succession) {
    state.phase = "succession";
    logEvent(state, "founder_exit", { how: "planned" });
  }
  if (permanent.force_ending) {
    let id = permanent.force_ending;
    if (id === "voluntary" && state.flags.craft_handoff) id = "preserve_craft";
    if (id === "voluntary" && state.flags.family_first) id = "family_leave";
    if (id === "sale" && state.coreKept === false) id = "erased";
    state.ending = { id, month: state.month };
    state.phase = "ending";
    award(data, state, id === "sale" || id === "erased" ? "loi" : "shutter", 2);
    logEvent(state, "venture_exit", { ending: id });
  }
  v.perm.revenue = clamp(v.perm.revenue, 0.35, 3.2);
  v.perm.fixed = clamp(v.perm.fixed, 0.45, 2.4);
  state.finance.runway = runwayOf(data, state);
}

function hire(data, state, n) {
  const city = cityById(data, state.cityId);
  for (let i = 0; i < n; i++) {
    state.team.headcount += 1;
    const name = personName(data, city.country, state.seed + ":h" + state.month + ":" + state.team.headcount);
    state.team.names.push(name);
  }
  state.venture.keyDependency = clamp(state.venture.keyDependency - 0.08 * n, 0.1, 0.95);
}

function fire(data, state, n) {
  const city = cityById(data, state.cityId);
  for (let i = 0; i < n && state.team.headcount > 0; i++) {
    state.team.headcount -= 1;
    state.team.names.pop();
    state.finance.cash -= city.fire_penalty_months * 0.45;
  }
  state.team.morale = clamp(state.team.morale - 0.06, 0.05, 1);
}

function attemptIpo(data, state) {
  const v = state.venture;
  const checks = {
    可審計帳簿: !!v.audited,
    董事會或內控: !!v.board || state.team.headcount >= 8,
    獲利或成長紀錄: state.profitYears >= 2 || (v.marketFit > 0.62 && runwayOf(data, state) > 6),
    沒有未解的合規危機: !state.flags.compliance_risk && !state.flags.ip_risk,
    達到一定組織規模: state.team.headcount >= 8 || v.complexity >= 1.6 || !!state.flags.second_city,
  };
  const ok = Object.values(checks).every(Boolean);
  state.ipoChecks = checks;
  if (!ok) {
    state.finance.cash -= 0.5;
    award(data, state, "pulled_prospectus", 3);
    pushTimeline(state, "上市未成", "條件還沒有齊。這次沒有假裝成功。");
    return;
  }
  v.public = true;
  v.redlineType = "public";
  state.finance.cash += 6;
  state.founder.control = clamp(Math.min(state.founder.control - 0.22, 0.42), 0.12, 0.7);
  state.flags.public = true;
  award(data, state, "ipo_bell", 4);
  pushTimeline(state, "上市", "錢進來了。季度也進來了。");
  logEvent(state, "ipo_complete", {});
  state.spine.push({ id: "earnings", month: state.month + 6, tries: 0, done: false });
}

function runwayOf(data, state) {
  if (!state.venture) return 0;
  const rev = state.finance.lastRevenue || potentialRevenue(data, state, 0);
  const parts = costParts(data, state, rev, 0);
  const burn = parts.operating - (state.finance.lastCollected || parts.collectedNow);
  state.finance.runway = burn > 0.08 ? state.finance.cash / burn : 36;
  return state.finance.runway;
}

function tickPeers(state, rng) {
  if (!state.peers) return;
  let pressure = 0;
  for (const p of state.peers) {
    const n = rng.next();
    if (!p.alive) continue;
    if (p.personality === "growth") p.pressure += 0.01;
    if (p.personality === "spec" && n > 0.97) p.alive = false;
    if (p.personality === "cash") p.pressure *= 0.98;
    if (p.personality === "relation") p.pressure *= 0.99;
    p.cash += 0.05;
    pressure += p.pressure;
  }
  state.peersPressure = clamp(pressure / 3, 0, 0.45);
  if (state.month % 12 === 0 && state.far[0]) {
    state.far[0].months = state.month;
    state.far[0].cash += 0.4 - cityByIdSafe(state);
  }
}

function cityByIdSafe(state) {
  return 0.2;
}

export function runCounterfactual(data, state, ev, chosenId) {
  try {
    const other = ev.choices.find((c) => c.id !== chosenId);
    if (!other) return null;
    const ghost = structuredClone(state);
    ghost._cf = true;
    ghost.pendingEvent = ev;
    ghost.phase = "event";
    ghost.firstMajor = { skip: true };
    ghost.counterfactual = null;
    applyChoice(data, ghost, ev, other);
    if (ghost.phase === "event") ghost.phase = "play";
    let guard = 0;
    while (ghost.phase !== "ending" && ghost.month < state.month + 180 && guard < 200) {
      guard += 1;
      if (ghost.phase === "play") settleOne(data, ghost);
      else if (ghost.phase === "event") {
        const pick = heuristicChoice(ghost.pendingEvent, ghost);
        chooseEvent(data, ghost, pick);
      } else if (ghost.phase === "chapter" || ghost.phase === "summary") ghost.phase = "play";
      else if (ghost.phase === "laststand") {
        chooseRescue(data, ghost, "close");
      } else if (ghost.phase === "succession") {
        const opts = successorOptions(data, ghost);
        chooseSuccessor(data, ghost, opts[0]?.id || "close");
      } else break;
    }
    return {
      choice: other.label,
      months: ghost.month,
      ending: ghost.ending?.id || (ghost.finance.cash > 0 ? "仍可能在營業" : "可能已經停下"),
      cash: round2(ghost.finance.cash),
      alive: !ghost.ending && ghost.finance.cash > 0,
    };
  } catch {
    return null;
  }
}

export function suggestEventChoice(ev, state) {
  return heuristicChoice(ev, state);
}

function heuristicChoice(ev, state) {
  if (!ev?.choices?.length) return null;
  let best = ev.choices[0];
  let score = -999;
  for (const c of ev.choices) {
    let s = 0;
    const e = c.effects || {};
    s += (e.cash || 0) * 2;
    s += (e.trust || 0) * 3;
    s -= (e.concentration_set || 0) > 0.55 ? 2 : 0;
    if (e.force_ending) s -= 5;
    if ((state.finance?.cash || 0) < 1 && (e.cash || 0) > 0) s += 3;
    if (s > score) {
      score = s;
      best = c;
    }
  }
  return best.id;
}

export function continueChapter(state) {
  if (state.phase !== "chapter") return;
  if (state.queuedEvent) {
    state.pendingEvent = state.queuedEvent;
    state.queuedEvent = null;
    state.phase = "event";
    return;
  }
  state.phase = "play";
}

export function skipToEvent(data, state) {
  if (!["play", "chapter"].includes(state.phase)) return;
  if (state.phase === "chapter") continueChapter(state);
  const lines = [];
  let guard = 0;
  while (state.phase === "play" && guard < 36 && state.month < 1200) {
    const before = state.month;
    settleOne(data, state);
    if (state.last) {
      const beat = state.last.beat ? ` ${state.last.beat}` : "";
      lines.push({ m: state.last.month, line: `${state.last.line}${beat}`, cash: state.finance.cash, rev: state.last.revenue });
    }
    guard += 1;
    if (state.month === before) break;
  }
  const dest = state.phase;
  state.summary = {
    from: lines[0]?.m || state.month,
    to: lines[lines.length - 1]?.m || state.month,
    lines: lines.slice(-4),
    cash: state.finance.cash,
  };
  state.afterSummary = dest;
  state.phase = "summary";
  logEvent(state, "speed_change", { skip: guard });
}

export function ackSummary(state) {
  if (state.phase !== "summary") return;
  state.phase = state.afterSummary || "play";
  state.summary = null;
}

export function initiatives(data, state) {
  if (state.phase !== "play" || !state.venture) return [];
  const ready = state.month >= (state.initiativeReady || 0);
  const list = [];
  if (ready) {
    list.push({ id: "price_up", label: "加價約 8%", detail: "確定：價格係數上升。量可能下降。" });
    list.push({ id: "price_down", label: "降價約 8%", detail: "確定：價格下降，較容易成交。" });
    if (state.team.headcount < 12) list.push({ id: "hire", label: "聘一個人", detail: "確定：每月多一份薪。產能上升。" });
    if (state.team.headcount > 0) list.push({ id: "fire", label: "減少一個人", detail: "確定：支付這個城市的離職代價，收入能力下降。" });
    if (state.finance.cash > 0.6) list.push({ id: "market", label: "花一筆讓更多人知道", detail: "確定：現金減少，配合度上升一點。" });
    list.push({ id: "rest", label: "把時間收回一點", detail: "確定：收入略降，健康與意志回升。" });
    if (state.month > 18 && !state.flags.transformed) list.push({ id: "transform", label: "調整做法", detail: "確定：記為一次轉型。短期配合度下降。" });
    if (state.venture.marketFit > 0.5 && state.finance.cash > 2.5 && !state.flags.second_city) list.push({ id: "expand", label: "開第二個據點", detail: "確定：固定成本與複雜度上升，收入上限打開。" });
  }
  const close = { id: "close", label: "考慮結業", detail: "把結束當成一個決定，而不是一場意外。" };
  const merged = list.slice(0, 4);
  if (!merged.some((i) => i.id === "close")) merged.push(close);
  return merged;
}

export function actInitiative(data, state, id) {
  if (state.phase !== "play") return { ok: false };
  const I = econ(data).initiatives;
  const gapMonths = state.month < 60 ? econ(data).formula.initiative_cooldown_early : econ(data).formula.initiative_cooldown_late;
  if (id !== "close") state.initiativeReady = state.month + gapMonths;
  if (id === "price_up") {
    state.venture.perm.price += I.price_step;
    state.venture.marketFit = clamp(state.venture.marketFit - 0.02, 0, 1);
    state.counts.priceHold = Math.max(0, state.counts.priceHold - 1);
  } else if (id === "price_down") {
    state.venture.perm.price -= I.price_step;
    state.flags.discount = true;
    state.venture.marketFit = clamp(state.venture.marketFit + 0.03, 0, 1);
  } else if (id === "hire") hire(data, state, 1);
  else if (id === "fire") fire(data, state, 1);
  else if (id === "market") {
    state.finance.cash -= I.market_cost;
    state.venture.marketFit = clamp(state.venture.marketFit + I.market_fit, 0, 0.95);
  } else if (id === "rest") {
    state.founder.hours = clamp(state.founder.hours - 0.12, 0.3, 1);
    state.venture.perm.revenue *= 0.94;
    state.founder.health = clamp(state.founder.health + 0.04, 0, 1);
    state.founder.will = clamp(state.founder.will + 0.04, 0, 1);
  } else if (id === "transform") {
    state.flags.transformed = true;
    state.venture.marketFit = clamp(state.venture.marketFit - 0.06, 0, 1);
    state.venture.timedTrend = (state.venture.timedTrend || 0) + 0.035;
  } else if (id === "expand") {
    state.flags.second_city = true;
    state.venture.perm.fixedAdd += I.second_city_fixed;
    state.venture.perm.revenue *= I.second_city_revenue;
    state.venture.complexity += 0.8;
    hire(data, state, 1);
    award(data, state, "second_city_key", 2);
  } else if (id === "close") {
    state.phase = "closing";
    return { ok: true };
  }
  pushTimeline(state, "主動決定", id);
  logEvent(state, "event_choice", { id: "initiative", choice: id });
  if (state.finance.cash < 0) state.phase = "laststand";
  return { ok: true };
}

export function confirmClose(data, state, how) {
  if (how === "back") {
    state.phase = "play";
    return;
  }
  if (how === "shrink") {
    state.venture.perm.revenue *= 0.7;
    state.venture.perm.fixed *= 0.72;
    state.flags.shrunk = true;
    while (state.team.headcount > 1) fire(data, state, 1);
    state.phase = "play";
    return;
  }
  if (how === "craft") {
    if (state.finance.cash < 0.2) {
      closeBook(data, state, "liquidate");
      return;
    }
    state.flags.craft_handoff = true;
    award(data, state, "century_recipe", 3);
    closeBook(data, state, "preserve_craft");
    return;
  }
  const severance = (state.team?.headcount || 0) * 0.45;
  const solvent = state.finance.cash >= severance + 0.15 && state.phase !== "laststand";
  if (!solvent) {
    const form = econ(data).ownership[state.shape.ownership]?.form;
    if (form === "unlimited") state.personal.debt += Math.max(0, 0.35 - state.finance.cash);
    if (state.founder.guarantee > 0.4) state.personal.debt += state.founder.guarantee * 0.45;
    const ruin = state.personal.debt > 1.6 || state.founder.guarantee > 1.2;
    closeBook(data, state, ruin ? "guarantee_ruin" : "liquidate");
    return;
  }
  state.finance.cash -= severance;
  award(data, state, "closed_fair", 3);
  const ending = state.flags.craft_handoff && state.month < 72
    ? "preserve_craft"
    : state.flags.family_first
      ? "family_leave"
      : "voluntary";
  closeBook(data, state, ending);
}

export function chooseRescue(data, state, id) {
  if (state.phase !== "laststand") return { ok: false };
  const v = state.venture;
  let worked = false;
  if (id === "shrink") {
    v.perm.fixed *= 0.75;
    v.perm.revenue *= 0.82;
    if (state.team.headcount > 0) fire(data, state, 1);
    state.flags.shrunk = true;
    worked = true;
  } else if (id === "presell") {
    if (v.trust >= 0.38) {
      state.finance.cash += 1.15;
      v.timed.push({ months: 3, revenue: 0.9, price: 0, cost: 0 });
      worked = true;
    }
  } else if (id === "delay") {
    state.finance.cash += 0.85;
    v.trust = clamp(v.trust - 0.05, 0, 1);
    const c = state.commitments[0];
    if (c) c.monthsLeft += 2;
    worked = true;
  } else if (id === "asset") {
    if (v.capexBook > 0.3) {
      state.finance.cash += v.capexBook * 0.45;
      v.capexBook *= 0.45;
      v.perm.revenue *= 0.88;
      worked = true;
    }
  } else if (id === "borrow") {
    const city = cityById(data, state.cityId);
    if (state.finance.debt < 6 && !(city.credit_tight > 0.5 && state.founder.guarantee > 2)) {
      state.finance.cash += 2;
      state.finance.debt += 2;
      state.founder.guarantee += 1.4;
      state.commitments.push({ name: "救援借款", monthsLeft: 24, total: 24, kind: "debt", payment: 2 / 24 });
      award(data, state, "guarantee_chop", 2);
      worked = true;
    }
  } else if (id === "equity") {
    const gap = gapById(data, state.gapId);
    if (v.marketFit > 0.34 && (gap.trend > -0.045 || state.flags.transformed)) {
      state.finance.cash += 3.4;
      state.founder.control = clamp(state.founder.control - 0.16, 0.12, 1);
      v.board = true;
      worked = true;
    }
  } else if (id === "nodraw") {
    state.founder.drawPause = 4;
    state.founder.will = clamp(state.founder.will - 0.08, 0, 1);
    state.founder.health = clamp(state.founder.health - 0.03, 0, 1);
    state.finance.cash += state.founder.wantsDraw;
    worked = true;
  } else if (id === "process") {
    state.rescueLeft += 1;
    state.founder.reputation = clamp(state.founder.reputation - 0.08, 0, 1);
    worked = false;
  } else if (id === "close") {
    confirmClose(data, state, "voluntary");
    return { ok: true, closed: true };
  }
  if (worked) state.finance.cash = Math.max(state.finance.cash, 0.05);
  const proj = potentialRevenue(data, state, 0);
  const parts = costParts(data, state, proj, 0);
  const survive = state.finance.cash > 0.15 && (parts.collectedNow + state.finance.cash > parts.operating * 0.92);
  if (survive && id !== "process") {
    state.phase = "play";
    state.level = "warn";
    pushTimeline(state, "撐過救援", "公司還在，有些東西已經不在。");
    return { ok: true, survived: true };
  }
  state.rescueLeft -= id === "process" ? 0 : 1;
  if (state.rescueLeft <= 0) {
    const ruin = state.founder.guarantee > 0.6 || econ(data).ownership[state.shape.ownership].form === "unlimited";
    if (ruin) {
      state.personal.debt += Math.max(0, -state.finance.cash) * (econ(data).ownership[state.shape.ownership].form === "unlimited" ? 1 : 0.55);
      state.personal.debt += state.founder.guarantee * 0.5;
    }
    closeBook(data, state, ruin && state.personal.debt > 1 ? "guarantee_ruin" : "liquidate");
    return { ok: true, survived: false };
  }
  return { ok: true, survived: false, worked };
}

export function successorOptions(data, state) {
  const opts = [];
  if (state.flags.heir) opts.push({ id: "family", label: "家里的下一代", detail: "血緣在，能力要之後才知道。" });
  if (["partner", "family"].includes(state.shape.ownership)) opts.push({ id: "partner", label: "合夥人", detail: "已經在帳裡的人。" });
  if (state.team.headcount > 0 && state.month > 18) opts.push({ id: "employee", label: "長期員工", detail: "做得動日常的那個人。" });
  if (state.finance.cash > 1 || state.team.headcount >= 4) opts.push({ id: "pro", label: "專業經理人", detail: "貴，但不必是家人。" });
  if (["esop", "coop"].includes(state.shape.ownership)) opts.push({ id: "trust", label: "員工信託或合作社", detail: "控制權變成一套規則。" });
  if (state.flags.mission_clause || state.venture.positioning === "mission") opts.push({ id: "foundation", label: "基金會或使命架構", detail: "句子比股權難改。" });
  opts.push({ id: "sell", label: "不接班，出售", detail: "結束創辦人的位子，也結束這一局的獨立。" });
  return opts;
}

export function chooseSuccessor(data, state, id) {
  if (state.phase !== "succession") return;
  if (id === "sell" || id === "close") {
    closeBook(data, state, "sale");
    return;
  }
  const city = cityById(data, state.cityId);
  const name = id === "family" ? state.contacts[3]?.name : id === "partner" ? state.contacts[0]?.name : id === "employee" ? state.team.names[0] || personName(data, city.country, state.seed + ":op") : personName(data, city.country, state.seed + ":op" + state.successionCount);
  state.founder.exited = true;
  state.founder.exitReason = id;
  state.successionCount += 1;
  state.successors.push({ id, name, month: state.month });
  state.operator = { name, age: id === "family" ? 32 : 44, type: id };
  state.role = "企業守護者";
  state.founder.hours = 0.15;
  state.founder.wantsDraw = 0;
  if (id === "pro") state.finance.cash -= 0.8;
  if (id === "trust") {
    state.founder.control = Math.min(state.founder.control, 0.3);
    award(data, state, "employee_trust_doc", 3);
  }
  if (id === "foundation") {
    state.flags.mission_clause = true;
    state.founder.control = Math.min(state.founder.control, 0.25);
    award(data, state, "foundation_deed", 3);
  }
  if (id === "employee") state.venture.keyDependency = clamp(state.venture.keyDependency - 0.2, 0.1, 1);
  award(data, state, "founder_key", 4);
  award(data, state, "succession_minutes", 4);
  pushTimeline(state, "接班", `${name}坐下。你改為看著這間公司。`);
  logEvent(state, "succession", { type: id });
  state.flags.early_team_gone = state.month > 24;
  state.phase = "play";
}

function finishCentury(data, state) {
  const ok = state.finance.cash > 0.2 && state.finance.lastRevenue > 0.15 && state.successionCount >= 2 && state.flags.transformed && state.negStreakMax < 36 && state.coreKept !== false;
  if (ok) award(data, state, "hundred_charter", 6);
  else award(data, state, "century_sign", 2);
  closeBook(data, state, ok ? "century" : "ongoing");
}

export function closeBook(data, state, id) {
  let ending = id || inferEnding(data, state);
  if (ending === "voluntary" && state.flags.craft_handoff && state.month < 72) ending = "preserve_craft";
  if (ending === "sale" && state.coreKept === false) ending = "erased";
  state.ending = {
    id: ending,
    month: state.month,
    personalDebt: round2(state.personal.debt),
    control: round2(state.founder.control),
    core: state.coreKept ? state.venture?.core : null,
  };
  if (!state.memories.length && state.venture) award(data, state, "quiet_ledger", 1);
  state.phase = "ending";
  logEvent(state, "venture_exit", { ending });
  return state;
}

export function inferEnding(data, state) {
  if (!state.venture) return "return_to_job";
  if (state.month >= 1200 && state.finance.cash > 0 && state.successionCount >= 2 && state.flags.transformed && state.negStreakMax < 36 && state.coreKept !== false) return "century";
  if (state.flags.privatized) return "privatize";
  if (state.venture.public && state.finance.cash > 0) return "ipo_running";
  if (state.founder.exited) {
    const t = state.successors[state.successors.length - 1]?.id;
    if (t === "foundation") return "foundation";
    if (t === "trust") return "employee_trust";
    if (state.founder.health < 0.18) return "death_continue";
    return "succession";
  }
  if (state.flags.craft_handoff && state.month < 72) return "preserve_craft";
  if (state.flags.decline_preserve) return "decline_preserve";
  if (state.flags.mission_clause && state.venture.positioning === "mission") return "mission";
  if (state.flags.shrunk && state.finance.cash > 0) return "shrink_on";
  if ((state.finance.runway || 9) < 2.5 && state.level === "crit") return "ongoing_struggle";
  return "ongoing";
}

export function computeRedline(data, state) {
  if (!state.venture) return null;
  const v = state.venture;
  const type = v.public ? "public" : v.redlineType;
  const th = econ(data).redline_thresholds[type];
  const parts = state.last?.parts;
  const revenue = Math.max(0.05, state.finance?.lastRevenue || 0.05);
  let value = 0;
  let text = "";
  let level = "ok";
  if (type === "occupancy") {
    value = (parts?.premises || econ(data).venues[v.venue].fixed) / revenue;
    text = `場地成本約佔營業額 ${Math.round(value * 100)}%`;
    level = value >= th.crit ? "crit" : value >= th.warn ? "warn" : "ok";
  } else if (type === "saas") {
    value = v.churn;
    text = `月流失約 ${Math.round(value * 1000) / 10}%`;
    level = value >= th.crit ? "crit" : value >= th.warn ? "warn" : "ok";
  } else if (type === "platform") {
    value = v.unit;
    text = value >= 0 ? "單位交易仍有貢獻" : "每一筆交易還在補貼";
    level = value <= th.crit ? "crit" : value <= th.warn ? "warn" : "ok";
  } else if (type === "b2b") {
    value = v.concentration;
    text = `最大客戶約 ${Math.round(value * 100)}%，帳期約 ${Math.round(v.arDays)} 天`;
    level = value >= th.crit || v.arDays >= 90 ? "crit" : value >= th.warn || v.arDays >= 60 ? "warn" : "ok";
  } else if (type === "manufacturing") {
    value = v.utilization;
    text = `產能利用率約 ${Math.round(value * 100)}%`;
    level = value < th.crit_low || value > th.crit_high ? "crit" : value < th.warn_low || value > th.warn_high ? "warn" : "ok";
  } else if (type === "personal") {
    value = state.founder.exited ? v.keyDependency : clamp(state.founder.hours * (0.7 + v.utilization * 0.4), 0, 1.1);
    text = state.founder.exited ? "日常已不在創辦人身上" : `你的時間被營運佔去約 ${Math.round(value * 100)}%`;
    level = !state.founder.exited && value >= th.crit ? "crit" : !state.founder.exited && value >= th.warn ? "warn" : "ok";
  } else if (type === "ecommerce") {
    value = v.returnsRate;
    const plat = (parts?.platformRate || 0);
    text = `退貨約 ${Math.round(value * 100)}%，平台費率約 ${Math.round(plat * 100)}%`;
    level = value >= th.crit || plat >= 0.2 ? "crit" : value >= th.warn || plat >= th.platform_warn * 0.25 ? "warn" : "ok";
  } else {
    value = runwayOf(data, state);
    text = `現金大約還能支應 ${Math.round(value)} 個月`;
    level = value <= th.crit ? "crit" : value <= th.warn ? "warn" : "ok";
  }
  return { type, name: th.name, value, text, level };
}

export function symptomIds(data, state) {
  if (!state.venture) return ["calm_market", "calm_team", "calm_founder"];
  const v = state.venture;
  const market = [];
  const team = [];
  const founder = [];
  if (state.flags.discount) market.push("discount");
  if (v.arDays > 45) market.push("cash_lag");
  if (state.redlineSnap?.type === "occupancy" && state.redlineSnap.level !== "ok") market.push("rent");
  if (v.churn > 0.07) market.push("churn");
  if (v.concentration > 0.45) market.push("concentration");
  if ((state.last?.parts?.platform || 0) > (state.finance.lastRevenue || 1) * 0.12) market.push("platform");
  if (gapById(data, state.gapId).declining && !state.flags.transformed) market.push("decline");
  if (v.quality < 0.42) market.push("quality");
  if ((state.peersPressure || 0) > 0.18) market.push("peer");
  if (!market.length) market.push("calm_market");
  if (v.keyDependency < 0.45 && state.team.headcount >= 2) team.push("delegate");
  if (state.team.morale < 0.4) team.push("morale");
  if (state.team.headcount === 0 && state.month > 6) team.push("solo_team");
  if (state.flags.underpaid_key) team.push("underpay");
  if (state.team.headcount >= 2 && state.team.morale > 0.55 && v.keyDependency < 0.6) team.push("stable_team");
  if (!team.length) team.push("calm_team");
  if (!state.founder.exited && state.founder.hours > 0.9 && v.utilization > 0.82) founder.push("no_leave");
  if (v.board && (state.drivers.capital || 0) > 2 && !state.flags.margin_held) founder.push("board_grow");
  if (v.board && state.flags.margin_held) founder.push("board");
  if (state.founder.care > 0.3) founder.push("care");
  if (state.founder.health < 0.55) founder.push("health");
  if (state.flags.personal_strain) founder.push("strain");
  if (state.flags.compliance_risk) founder.push("compliance");
  if (state.founder.control < 0.5) founder.push("control");
  if (!founder.length) founder.push("calm_founder");
  return [market[0], team[0], founder[0]];
}

export function rescueOptions(data, state) {
  return [
    { id: "shrink", label: "縮規模", detail: "砍固定成本與人手。收入會一起變小。" },
    { id: "presell", label: "預售", detail: state.venture.trust >= 0.38 ? "信任還夠，可以先收一筆。" : "信任不夠，這一項做不到。" },
    { id: "delay", label: "談延期", detail: "把最近的承諾往後推，關係會損。" },
    { id: "asset", label: "出售資產", detail: state.venture.capexBook > 0.3 ? "設備或裝修還能換一點現金。" : "沒有夠大的資產可賣。" },
    { id: "borrow", label: "借款", detail: "現金進來。個人擔保也進來。" },
    { id: "equity", label: "引資", detail: "用控制權換跑道。衰退又沒有轉型時，對方不一定要。" },
    { id: "nodraw", label: "停發自己的錢", detail: "公司鬆一口。家里會緊。" },
    { id: "process", label: "申請程序", detail: "多一次行動。聲譽下降。問題本身還在。" },
    { id: "close", label: "主動結業", detail: "在這裡停，比拖到無選項時停更清楚。" },
  ];
}

export function topDrivers(state, sign) {
  const entries = Object.entries(state.drivers || {});
  const filtered = entries.filter(([, v]) => (sign > 0 ? v > 0 : v < 0));
  filtered.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return filtered.slice(0, 3).map(([k, v]) => ({ k, v }));
}

export function endingFlags(state) {
  return {
    low_concentration: (state.maxConcentration || 1) < 0.45,
    diluted: (state.founder?.control || 1) < 0.7,
    early_team_gone: !!state.flags.early_team_gone || state.successionCount > 0,
    price_holds: (state.counts?.priceHold || 0) >= 3,
    health_ignored: !!state.flags.health_ignored,
  };
}

export function describeWorld(data, state) {
  const city = cityById(data, state.cityId);
  const country = data.world.countries.find((c) => c.id === city.country);
  const gap = gapById(data, state.gapId);
  const fam = industry(data, gap.family);
  return { city, country, gap, fam };
}
