/**
 * 活的店舖舞台。
 *
 * 這裡不放報表。這裡放的是「經營狀況的視覺輸出」：
 * 客流、積壓訂單、員工疲勞、貨架空不空、設備有沒有修、帳單堆多高、
 * 招牌新不新、外面在下甚麼雨、燈還亮不亮。
 *
 * 做法：分層 DOM + inline SVG。場景背景依經營性質挑一個（八種），
 * 上面疊十五個狀態圖層，人用 CSS 動畫走動，不用逐個真實模擬。
 * 全部是 transform / opacity / filter，靜態網頁與 ES module 就能跑。
 */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ── 場景怎麼挑：不是看行業名字，是看這門生意實際上怎麼運作 ── */

const SCENES = {
  street: { label: "街舖", indoor: true, street: true },
  mall: { label: "商場舖位", indoor: true, street: false },
  studio: { label: "工作室", indoor: true, street: false },
  office: { label: "辦公室", indoor: true, street: false },
  home: { label: "家里的一張桌子", indoor: true, street: false },
  mobile: { label: "流動攤車", indoor: false, street: true },
  onsite: { label: "上門服務", indoor: false, street: true },
  online: { label: "網店的出貨桌", indoor: true, street: true },
  digital: { label: "雲端服務", indoor: true, street: false },
  factory: { label: "工場", indoor: true, street: false },
  shared: { label: "共享設施", indoor: true, street: false },
};

export function sceneOf(data, run) {
  const v = run.venture || {};
  const venue = v.venue || run.shape?.venue || "street";
  const fam = v.family || "";
  const digitalFam = ["saas", "enterprise", "fin", "platform"].includes(fam);
  let kind = "street";
  if (venue === "factory" || fam === "mfg") kind = "factory";
  else if (venue === "online") kind = digitalFam ? "digital" : "online";
  else if (venue === "home") kind = "home";
  else if (venue === "mobile") kind = "mobile";
  else if (venue === "onsite") kind = "onsite";
  else if (venue === "shared") kind = "shared";
  else if (venue === "mall") kind = "mall";
  else if (venue === "studio") kind = digitalFam ? "office" : "studio";
  else if (digitalFam) kind = "digital";
  else if (venue === "street") kind = "street";
  return kind;
}

/* ── 把經營狀況讀成場景參數 ── */

export function stageState(data, run, live) {
  const cfg = data.economy.life?.stage || {};
  const tiers = cfg.crowd_tiers || [0, 3, 6, 10, 15];
  const v = run.venture || {};
  const ops = live?.ops || run.last?.ops || run.lastOps || null;
  const crew = (run.crew || []).filter((c) => !c.gone);
  const cash = num(live?.cash ?? run.finance?.cash, 0);
  const util = num(live?.utilization ?? v.utilization, 0.5);
  const trust = num(v.trust, 0.4);
  const brand = num(v.brand, 0.35);
  const quality = num(v.quality, 0.5);
  const debt = num(run.finance?.debt, 0);
  const runway = num(run.finance?.runway, 9);
  const level = run.level || run.redlineSnap?.level || "ok";
  const health = num(run.founder?.health, 0.8);
  const stress = num(run.crewStress, crew.length ? crew.reduce((s, c) => s + num(c.stress, 0), 0) / crew.length : 0);
  const weather = live?.weather || run.weather || null;

  // 客流不逐個真實模擬：映射成 0 / 3 / 6 / 10 / 15 人等級
  const demandLevel = clamp(ops ? num(ops.entered, 0) / 8 : util * 12, 0, 22);
  let crowd = tiers[0];
  for (const t of tiers) if (demandLevel >= t * 0.72) crowd = t;
  if (level === "crit") crowd = Math.min(crowd, 3);
  if (run.phase === "ending" || run.ending) crowd = 0;

  const backlogTiers = cfg.backlog_tiers || [0, 2, 5, 9];
  const lost = ops ? num(ops.backlog, 0) : 0;
  let backlog = 0;
  for (const t of backlogTiers) if (lost >= t * 0.8 && t > 0) backlog = t;
  if (util > 1.02) backlog = Math.max(backlog, backlogTiers[1] || 2);

  // 貨架：庫存、品質、現金三件事一起決定它有多空
  const stock = clamp(0.35 + num(v.inventory, 0.4) * 0.3 + quality * 0.25 + (cash > 0.6 ? 0.2 : cash < 0.2 ? -0.25 : 0), 0.05, 1);

  const mood = run.ending || run.phase === "ending"
    ? "closed"
    : level === "crit" || runway < 2.5 || health < 0.25
      ? "crisis"
      : level === "warn" || runway < 5 || stress > 0.7
        ? "tense"
        : "healthy";

  const eraMonths = num(cfg.era_months, 180);
  const era = clamp(Math.floor(run.month / eraMonths), 0, num(cfg.era_max, 4));

  const brandTiers = cfg.brand_tiers || [0.34, 0.5, 0.66, 0.8];
  let brandTier = 0;
  brandTiers.forEach((t, i) => { if (brand >= t) brandTier = i + 1; });

  const light = mood === "closed" ? 0.12 : mood === "crisis" ? num(cfg.light_crit, 0.3) : mood === "tense" ? num(cfg.light_warn, 0.62) : 1;

  return {
    kind: sceneOf(data, run),
    scene: SCENES[sceneOf(data, run)] || SCENES.street,
    mood, era, crowd, backlog, stock, light, brandTier,
    stress, crew, weather, cash, util, trust, brand, quality, debt, runway, level, health,
    reviews: badReviewCount(run),
    kol: !!run.flags.kol_active || (run.lastBeats || []).some((b) => b.id === "crew_kol"),
    equipment: !!run.flags.equipment_damage,
    bills: debt > 1.2 || runway < 3 ? 2 : debt > 0.4 ? 1 : 0,
    closing: mood === "closed",
    day: live?.day ?? 30,
    name: v.name || run.work?.name || "這間店",
  };
}

function badReviewCount(run) {
  const trust = num(run.venture?.trust, 0.5);
  const q = num(run.venture?.quality, 0.5);
  if (q < 0.4 || trust < 0.3) return 3;
  if (q < 0.52 || trust < 0.42) return 2;
  if (trust < 0.55) return 1;
  return 0;
}

/* ── 背景：八種場景，共用一套座標（400 × 220） ── */

const C = {
  ink: "#1c1612", wall: "#e7dccb", wall2: "#d8c9b4", wood: "#b98b5e", wood2: "#8f6842",
  floor: "#c9a87c", glass: "#cfe0e4", seal: "#8f2d2d", plant: "#2a6a4a", warm: "#ffd9a0",
  steel: "#8d949a", dark: "#2a241f",
};

function signBlock(st, x, y, w, h) {
  const tier = st.brandTier;
  const fill = tier >= 4 ? "#2b2118" : tier >= 3 ? C.seal : tier >= 2 ? C.wood2 : "#6f6255";
  const glow = tier >= 3 ? `<rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="6" fill="${C.warm}" opacity="0.28"/>` : "";
  const neon = tier >= 4 ? `<rect x="${x + 4}" y="${y + h - 5}" width="${w - 8}" height="2" fill="${C.warm}" opacity="0.85"/>` : "";
  return `<g class="ly-sign" data-tier="${tier}">${glow}
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="${C.ink}" stroke-opacity="0.35"/>
    <text x="${x + w / 2}" y="${y + h / 2 + 5}" text-anchor="middle" font-size="${tier >= 3 ? 13 : 11}" fill="${tier >= 2 ? "#f4efe4" : "#e7dccb"}" letter-spacing="1">${esc(st.name.slice(0, 9))}</text>
    ${neon}</g>`;
}

function shelves(st, x, y, w, h, rows = 3) {
  const items = [];
  const per = 7;
  for (let r = 0; r < rows; r++) {
    const yy = y + (h / rows) * r + 4;
    items.push(`<rect x="${x}" y="${yy + h / rows - 6}" width="${w}" height="3" fill="${C.wood2}"/>`);
    for (let i = 0; i < per; i++) {
      const on = (r * per + i) / (rows * per) < st.stock;
      const bw = w / per - 4;
      items.push(`<rect class="stock-item${on ? "" : " is-empty"}" x="${x + 2 + i * (w / per)}" y="${yy + h / rows - 6 - 12}" width="${bw}" height="12" rx="1.5" fill="${on ? ["#c96f4a", "#7a8f5a", "#b98b5e", "#8a6a9a"][i % 4] : "#000"}" opacity="${on ? 0.92 : 0}"/>`);
    }
  }
  return `<g class="ly-stock" data-stock="${st.stock.toFixed(2)}"><rect x="${x - 3}" y="${y}" width="${w + 6}" height="${h}" rx="2" fill="${C.wood}" opacity="0.55"/>${items.join("")}</g>`;
}

function counter(x, y, w) {
  return `<g class="counter"><rect x="${x}" y="${y}" width="${w}" height="26" rx="3" fill="${C.wood}"/>
    <rect x="${x}" y="${y}" width="${w}" height="6" rx="3" fill="${C.wood2}"/>
    <rect x="${x + w - 26}" y="${y - 12}" width="20" height="12" rx="2" fill="${C.dark}"/>
    <rect x="${x + w - 24}" y="${y - 10}" width="16" height="6" fill="#7fb08a" opacity="0.8"/></g>`;
}

function tickets(n, x, y) {
  if (!n) return "";
  const out = [];
  for (let i = 0; i < Math.min(9, n); i++) {
    out.push(`<rect class="ticket" x="${x + (i % 3) * 11}" y="${y - Math.floor(i / 3) * 9}" width="9" height="12" rx="1" fill="#fffdf8" stroke="${C.seal}" stroke-width="0.6" transform="rotate(${(i % 3) - 1} ${x + i * 4} ${y})"/>`);
  }
  return `<g class="ly-backlog" data-n="${n}">${out.join("")}</g>`;
}

function machine(x, y, broken) {
  return `<g class="ly-equipment${broken ? " is-broken" : ""}">
    <rect x="${x}" y="${y}" width="46" height="42" rx="4" fill="${C.steel}" stroke="${C.ink}" stroke-opacity="0.3"/>
    <rect x="${x + 6}" y="${y + 6}" width="34" height="14" rx="2" fill="${broken ? "#4a3a34" : "#2f4a44"}"/>
    <circle cx="${x + 12}" cy="${y + 30}" r="5" fill="${broken ? C.seal : "#7fb08a"}"/>
    <rect x="${x + 24}" y="${y + 26}" width="16" height="8" rx="2" fill="${C.dark}" opacity="0.5"/>
    ${broken ? `<g class="spark"><path d="M${x + 40} ${y + 2} l6 -8 l-3 8 l6 -3 l-9 10z" fill="${C.warm}"/></g><text x="${x + 23}" y="${y - 6}" text-anchor="middle" font-size="11" fill="${C.seal}">✕</text>` : ""}
  </g>`;
}

function desk(x, y, lit) {
  return `<g class="desk"><rect x="${x}" y="${y}" width="64" height="6" rx="2" fill="${C.wood}"/>
    <rect x="${x + 4}" y="${y + 6}" width="5" height="26" fill="${C.wood2}"/>
    <rect x="${x + 55}" y="${y + 6}" width="5" height="26" fill="${C.wood2}"/>
    <rect x="${x + 16}" y="${y - 20}" width="32" height="20" rx="2" fill="${C.dark}"/>
    <rect x="${x + 18}" y="${y - 18}" width="28" height="16" fill="${lit ? "#8fd0c0" : "#3a4a48"}" opacity="${lit ? 0.9 : 0.5}"/></g>`;
}

function plant(x, y, s = 1) {
  return `<g class="plant" transform="translate(${x},${y}) scale(${s})"><rect x="-6" y="0" width="12" height="12" rx="2" fill="#9a6a4a"/>
    <path d="M0 0 C -10 -8 -12 -20 -4 -22 C -2 -14 -1 -8 0 0Z" fill="${C.plant}"/>
    <path d="M0 0 C 10 -10 14 -20 5 -24 C 3 -15 1 -8 0 0Z" fill="#3a7a58"/></g>`;
}

function bills(n, x, y) {
  if (!n) return "";
  const out = [];
  for (let i = 0; i < n * 2; i++) {
    out.push(`<rect x="${x + (i % 2) * 4}" y="${y - i * 3}" width="26" height="16" rx="1" fill="#fffdf8" stroke="${C.seal}" stroke-opacity="0.5" stroke-width="0.7" transform="rotate(${i % 2 ? 3 : -2} ${x} ${y})"/>`);
  }
  out.push(`<text x="${x + 13}" y="${y - n * 6 - 4}" text-anchor="middle" font-size="9" fill="${C.seal}">催款</text>`);
  return `<g class="ly-bills" data-n="${n}">${out.join("")}</g>`;
}

function notice(kind, text) {
  return `<g class="ly-notice notice-${kind}"><rect x="0" y="0" width="72" height="26" rx="2" fill="#fffdf8" stroke="${C.ink}" stroke-opacity="0.4"/>
    <text x="36" y="17" text-anchor="middle" font-size="11" fill="${kind === "closing" ? C.seal : C.ink}">${esc(text)}</text></g>`;
}

function skyBand(st) {
  const wx = st.weather?.stage || "clear";
  const outside = wx === "storm" ? "#4a5560" : wx === "rain" ? "#6d7a83" : wx === "snow" ? "#aebcc6" : wx === "heat" ? "#e8c48a" : "#a8c4d0";
  const night = st.mood === "closed" ? 0.55 : 0;
  return `<g class="sky-band" data-wx="${wx}">
    <rect x="0" y="0" width="400" height="54" fill="${outside}"/>
    <rect x="0" y="0" width="400" height="54" fill="${C.ink}" opacity="${night}"/>
    ${wx === "heat" ? `<circle cx="356" cy="16" r="12" fill="#f6e0a8" opacity="0.95"/>` : ""}
    <g class="skyline" opacity="0.55">
      <rect x="6" y="20" width="26" height="34" fill="#3d4a52"/><rect x="38" y="12" width="18" height="42" fill="#37434a"/>
      <rect x="330" y="16" width="30" height="38" fill="#3d4a52"/><rect x="366" y="26" width="26" height="28" fill="#37434a"/>
    </g>
    ${st.era >= 2 ? `<g class="era-props" opacity="0.7"><rect x="70" y="34" width="34" height="14" rx="3" fill="#2f3a40"/><circle cx="78" cy="50" r="4" fill="#22292d"/><circle cx="96" cy="50" r="4" fill="#22292d"/></g>` : ""}
    ${st.era >= 4 ? `<g class="era-props" opacity="0.8"><rect x="120" y="8" width="20" height="8" rx="4" fill="#cfd8dc"/><rect x="128" y="16" width="3" height="10" fill="#cfd8dc"/></g>` : ""}
  </g>`;
}

function backWall(st, opts = {}) {
  const { window: hasWindow = true, wallColor = C.wall } = opts;
  return `<g class="back-wall">
    <rect x="0" y="46" width="400" height="112" fill="${wallColor}"/>
    <rect x="0" y="46" width="400" height="112" fill="${C.ink}" opacity="${0.35 - st.light * 0.3}"/>
    <rect x="0" y="152" width="400" height="6" fill="${C.wood2}" opacity="0.6"/>
    ${hasWindow ? `<g class="window"><rect x="286" y="58" width="98" height="62" rx="3" fill="${C.glass}" opacity="0.85" stroke="${C.wood2}" stroke-width="3"/>
      <line x1="335" y1="58" x2="335" y2="120" stroke="${C.wood2}" stroke-width="2"/></g>` : ""}
    ${st.weather?.stage === "storm" ? `<g class="boards"><rect x="284" y="66" width="102" height="9" fill="${C.wood}" transform="rotate(-6 335 70)"/><rect x="284" y="92" width="102" height="9" fill="${C.wood}" transform="rotate(4 335 96)"/></g>` : ""}
  </g>`;
}

function floorBand(color = C.floor) {
  return `<g class="floor"><rect x="0" y="158" width="400" height="62" fill="${color}"/>
    <rect x="0" y="158" width="400" height="4" fill="${C.ink}" opacity="0.12"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="${i * 70}" y1="162" x2="${i * 70 - 20}" y2="220" stroke="${C.ink}" stroke-opacity="0.07" stroke-width="2"/>`).join("")}
  </g>`;
}

const SCENE_ART = {
  street(st) {
    return `${skyBand(st)}${backWall(st)}
      ${signBlock(st, 96, 8, 208, 30)}
      <g class="awning"><path d="M60 46 L340 46 L330 62 L70 62 Z" fill="${C.seal}" opacity="0.9"/>
        ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${70 + i * 37}" y="46" width="18" height="16" fill="#f4efe4" opacity="0.28"/>`).join("")}</g>
      ${shelves(st, 22, 74, 108, 62, 3)}
      ${machine(148, 96, st.equipment)}
      <g class="menu-board"><rect x="196" y="66" width="72" height="46" rx="2" fill="${C.dark}"/>
        ${[0, 1, 2, 3].map((i) => `<rect x="202" y="${74 + i * 10}" width="${48 - i * 6}" height="3" fill="${C.warm}" opacity="${0.5 + i * 0.1}"/>`).join("")}</g>
      ${plant(280, 150, 1.1)}
      ${floorBand()}
      ${counter(30, 168, 120)}
      ${tickets(st.backlog, 128, 176)}
      ${bills(st.bills, 200, 190)}
      <g class="table-set"><rect x="230" y="176" width="52" height="5" rx="2" fill="${C.wood}"/>
        <rect x="252" y="181" width="6" height="26" fill="${C.wood2}"/>
        <rect x="300" y="176" width="52" height="5" rx="2" fill="${C.wood}"/>
        <rect x="322" y="181" width="6" height="26" fill="${C.wood2}"/></g>
      ${st.closing ? `<g transform="translate(164,120)">${notice("closing", "結業")}</g>` : ""}
      ${st.reviews ? `<g transform="translate(250,96)" class="ly-review">${notice("review", `${st.reviews} 則負評`)}</g>` : ""}`;
  },
  mall(st) {
    return `${backWall(st, { window: false, wallColor: "#ded3c4" })}
      <g class="mall-atrium"><rect x="0" y="0" width="400" height="48" fill="#cfc3b2"/>
        ${[0, 1, 2, 3, 4].map((i) => `<circle cx="${40 + i * 80}" cy="18" r="9" fill="${C.warm}" opacity="0.55"/>`).join("")}
        <rect x="0" y="40" width="400" height="8" fill="${C.wood2}" opacity="0.4"/></g>
      ${signBlock(st, 120, 4, 160, 28)}
      ${shelves(st, 16, 70, 120, 68, 4)}
      ${shelves(st, 264, 70, 120, 68, 4)}
      ${machine(160, 92, st.equipment)}
      ${floorBand("#d6c3a6")}
      ${counter(150, 170, 100)}
      ${tickets(st.backlog, 232, 178)}
      ${bills(st.bills, 300, 192)}
      ${plant(30, 152, 1)}${plant(370, 152, 1)}
      ${st.closing ? `<g transform="translate(164,120)">${notice("closing", "結束營業")}</g>` : ""}
      ${st.reviews ? `<g transform="translate(150,66)" class="ly-review">${notice("review", `${st.reviews} 則負評`)}</g>` : ""}`;
  },
  studio(st) {
    return `${backWall(st, { window: true, wallColor: "#e3d9c8" })}
      <g class="rail"><rect x="0" y="0" width="400" height="46" fill="#d9cdb9"/>
        <rect x="24" y="10" width="120" height="26" rx="2" fill="#fffdf8" opacity="0.7"/>
        <text x="84" y="28" text-anchor="middle" font-size="11" fill="${C.ink}" opacity="0.7">${esc(st.name.slice(0, 8))}</text></g>
      ${signBlock(st, 250, 6, 130, 26)}
      <g class="bench"><rect x="24" y="96" width="200" height="10" rx="2" fill="${C.wood}"/>
        <rect x="34" y="106" width="8" height="44" fill="${C.wood2}"/><rect x="206" y="106" width="8" height="44" fill="${C.wood2}"/>
        ${[0, 1, 2, 3, 4].map((i) => `<rect x="${40 + i * 36}" y="${84 - (i % 2) * 4}" width="16" height="12" rx="2" fill="${i < Math.ceil(st.stock * 5) ? "#c96f4a" : "#b6a894"}" opacity="${i < Math.ceil(st.stock * 5) ? 0.95 : 0.4}"/>`).join("")}</g>
      ${machine(248, 92, st.equipment)}
      <g class="tools">${[0, 1, 2, 3].map((i) => `<rect x="${310 + i * 14}" y="${60 + (i % 2) * 6}" width="6" height="26" rx="2" fill="${C.steel}"/>`).join("")}</g>
      ${floorBand("#cbb18c")}
      ${counter(280, 172, 96)}
      ${tickets(st.backlog, 300, 178)}
      ${bills(st.bills, 190, 192)}
      ${plant(20, 152, 1)}
      ${st.closing ? `<g transform="translate(160,120)">${notice("closing", "不再接案")}</g>` : ""}`;
  },
  office(st) {
    return `${backWall(st, { window: true, wallColor: "#dfe0dc" })}
      <g class="ceiling">${[0, 1, 2].map((i) => `<rect x="${60 + i * 120}" y="16" width="70" height="8" rx="2" fill="${C.warm}" opacity="${0.3 + st.light * 0.5}"/>`).join("")}</g>
      ${signBlock(st, 16, 4, 130, 24)}
      <g class="whiteboard"><rect x="248" y="52" width="86" height="52" rx="2" fill="#fffdf8" stroke="${C.steel}"/>
        ${[0, 1, 2].map((i) => `<polyline points="${256 + i * 4},${92 - i * 6} ${272 + i * 6},${80 - i * 8} ${292},${70 + i * 6}" fill="none" stroke="${i === 0 ? C.seal : C.plant}" stroke-width="1.6" opacity="${0.4 + st.quality * 0.5}"/>`).join("")}</g>
      ${desk(24, 110, st.light > 0.5)}${desk(112, 110, st.light > 0.5)}
      ${machine(348, 100, st.equipment)}
      ${floorBand("#c3b7a4")}
      ${counter(250, 176, 110)}
      ${tickets(st.backlog, 300, 182)}
      ${bills(st.bills, 200, 194)}
      ${plant(210, 150, 1.2)}
      ${st.closing ? `<g transform="translate(160,120)">${notice("closing", "停止營運")}</g>` : ""}`;
  },
  home(st) {
    return `${backWall(st, { window: true, wallColor: "#e9dcc6" })}
      <g class="home-band"><rect x="0" y="0" width="400" height="46" fill="#d9c7ab"/>
        <rect x="286" y="8" width="98" height="34" fill="${C.glass}" opacity="0.6" stroke="${C.wood2}" stroke-width="3"/></g>
      <g class="home-sign"><rect x="20" y="8" width="120" height="26" rx="3" fill="#fffdf8" opacity="0.85"/>
        <text x="80" y="26" text-anchor="middle" font-size="11" fill="${C.ink}">${esc(st.name.slice(0, 9))}</text></g>
      <g class="kitchen"><rect x="20" y="86" width="120" height="52" rx="3" fill="${C.wall2}"/>
        <rect x="28" y="94" width="30" height="20" rx="2" fill="${C.dark}" opacity="0.6"/>
        <circle cx="86" cy="104" r="8" fill="${C.steel}"/><circle cx="112" cy="104" r="8" fill="${C.steel}"/></g>
      ${shelves(st, 158, 78, 92, 52, 3)}
      <g class="laundry"><rect x="262" y="96" width="42" height="44" rx="4" fill="#f0ece2" stroke="${C.steel}"/>
        <circle cx="283" cy="118" r="12" fill="${C.glass}" opacity="0.8"/></g>
      ${machine(320, 96, st.equipment)}
      ${floorBand("#cdb28c")}
      ${desk(40, 176, true)}
      ${tickets(st.backlog, 130, 182)}
      ${bills(st.bills, 240, 194)}
      ${plant(360, 152, 1)}
      ${st.closing ? `<g transform="translate(150,120)">${notice("closing", "桌子清空了")}</g>` : ""}`;
  },
  mobile(st) {
    return `${skyBand(st)}
      <g class="street"><rect x="0" y="46" width="400" height="112" fill="#cbbfae"/>
        <rect x="0" y="120" width="400" height="38" fill="#9a9184"/>
        ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${10 + i * 70}" y="136" width="34" height="4" fill="#f4efe4" opacity="0.5"/>`).join("")}</g>
      <g class="cart"><rect x="70" y="70" width="200" height="72" rx="6" fill="${C.wood}" stroke="${C.ink}" stroke-opacity="0.3"/>
        <rect x="70" y="58" width="200" height="14" rx="4" fill="${C.seal}"/>
        <rect x="86" y="84" width="72" height="34" rx="2" fill="${C.glass}" opacity="0.7"/>
        <rect x="176" y="84" width="78" height="20" rx="2" fill="${C.dark}" opacity="0.65"/>
        <circle cx="110" cy="152" r="14" fill="${C.dark}"/><circle cx="110" cy="152" r="6" fill="${C.steel}"/>
        <circle cx="234" cy="152" r="14" fill="${C.dark}"/><circle cx="234" cy="152" r="6" fill="${C.steel}"/></g>
      ${signBlock(st, 96, 22, 148, 28)}
      ${shelves(st, 178, 86, 74, 30, 2)}
      ${machine(290, 96, st.equipment)}
      ${tickets(st.backlog, 268, 116)}
      ${bills(st.bills, 320, 120)}
      ${floorBand("#9a9184")}
      ${plant(24, 150, 0.9)}
      ${st.closing ? `<g transform="translate(150,86)">${notice("closing", "車不再出來")}</g>` : ""}`;
  },
  onsite(st) {
    return `${skyBand(st)}
      <g class="street"><rect x="0" y="46" width="400" height="112" fill="#cfc3b0"/>
        <rect x="0" y="126" width="400" height="32" fill="#a2988a"/></g>
      <g class="doorway"><rect x="240" y="56" width="120" height="102" fill="#bfae94" stroke="${C.wood2}" stroke-width="3"/>
        <rect x="264" y="76" width="72" height="82" rx="2" fill="${C.wood}"/>
        <circle cx="326" cy="120" r="3" fill="${C.warm}"/>
        <rect x="252" y="64" width="30" height="12" rx="1" fill="#fffdf8" opacity="0.8"/></g>
      <g class="van"><rect x="30" y="86" width="170" height="60" rx="8" fill="#e7dccb" stroke="${C.ink}" stroke-opacity="0.3"/>
        <rect x="150" y="96" width="40" height="24" rx="3" fill="${C.glass}" opacity="0.8"/>
        <circle cx="70" cy="152" r="13" fill="${C.dark}"/><circle cx="170" cy="152" r="13" fill="${C.dark}"/>
        <rect x="42" y="98" width="96" height="18" rx="2" fill="${C.seal}" opacity="0.85"/>
        <text x="90" y="112" text-anchor="middle" font-size="10" fill="#f4efe4">${esc(st.name.slice(0, 8))}</text></g>
      <g class="tools">${[0, 1, 2, 3].map((i) => `<rect x="${206 + i * 10}" y="${132 - (i % 2) * 4}" width="6" height="22" rx="1" fill="${C.steel}"/>`).join("")}
        <rect x="200" y="150" width="46" height="10" rx="2" fill="${C.wood2}"/></g>
      ${tickets(st.backlog, 208, 176)}
      ${bills(st.bills, 300, 190)}
      ${floorBand("#a2988a")}
      ${st.equipment ? `<g transform="translate(40,60)">${notice("broken", "工具壞了")}</g>` : ""}
      ${st.closing ? `<g transform="translate(60,60)">${notice("closing", "不再上門")}</g>` : ""}`;
  },
  online(st) {
    return `${backWall(st, { window: false, wallColor: "#e2dbcf" })}
      <g class="rollup"><rect x="0" y="0" width="400" height="46" fill="#cfc6b6"/>
        <rect x="16" y="6" width="150" height="30" rx="3" fill="${C.dark}"/>
        <text x="91" y="26" text-anchor="middle" font-size="12" fill="${C.warm}">${esc(st.name.slice(0, 10))} · 出貨中</text>
        <rect x="300" y="10" width="80" height="24" rx="3" fill="#fffdf8" opacity="0.75"/>
        <text x="340" y="27" text-anchor="middle" font-size="10" fill="${C.ink}">今日訂單 ${Math.max(0, Math.round(st.util * 40))}</text></g>
      ${shelves(st, 16, 66, 150, 74, 4)}
      <g class="pack-table"><rect x="188" y="104" width="150" height="10" rx="2" fill="${C.wood}"/>
        <rect x="196" y="114" width="8" height="38" fill="${C.wood2}"/><rect x="322" y="114" width="8" height="38" fill="${C.wood2}"/>
        ${[0, 1, 2].map((i) => `<rect class="parcel${i < Math.ceil(st.stock * 3) ? "" : " is-empty"}" x="${204 + i * 42}" y="${82 + (i % 2) * 4}" width="30" height="22" rx="2" fill="#c8a97e" stroke="${C.wood2}" opacity="${i < Math.ceil(st.stock * 3) ? 0.95 : 0.25}"/>`).join("")}
        <rect x="300" y="86" width="26" height="18" rx="2" fill="${C.dark}"/><rect x="302" y="88" width="22" height="12" fill="#8fd0c0" opacity="0.85"/></g>
      ${machine(348, 96, st.equipment)}
      ${floorBand("#cdbfa6")}
      ${tickets(st.backlog, 200, 176)}
      ${bills(st.bills, 300, 190)}
      <g class="courier-zone"><rect x="20" y="166" width="90" height="44" rx="4" fill="${C.ink}" opacity="0.08"/>
        <text x="65" y="192" text-anchor="middle" font-size="10" fill="${C.ink}" opacity="0.6">取件區</text></g>
      ${plant(370, 152, 1)}
      ${st.closing ? `<g transform="translate(160,120)">${notice("closing", "商店已下架")}</g>` : ""}
      ${st.reviews ? `<g transform="translate(210,52)" class="ly-review">${notice("review", `${st.reviews} 則負評`)}</g>` : ""}`;
  },
  digital(st) {
    return `${backWall(st, { window: false, wallColor: "#20262b" })}
      <g class="server-room"><rect x="0" y="0" width="400" height="158" fill="#1b2126"/>
        ${[0, 1, 2].map((i) => `<g class="rack${st.equipment && i === 1 ? " is-broken" : ""}"><rect x="${20 + i * 128}" y="30" width="96" height="112" rx="4" fill="#2c343a" stroke="#3d474e"/>
          ${[0, 1, 2, 3, 4].map((r) => `<rect x="${28 + i * 128}" y="${40 + r * 20}" width="80" height="12" rx="2" fill="#222a2f"/>
            <circle cx="${34 + i * 128}" cy="${46 + r * 20}" r="2.4" fill="${st.equipment && i === 1 && r === 2 ? C.seal : "#7fb08a"}" opacity="${0.4 + st.light * 0.6}"/>
            <rect x="${44 + i * 128}" y="${44 + r * 20}" width="${20 + ((r * 13 + i * 7) % 34)}" height="4" fill="#4a5a63" opacity="0.8"/></g>`).join("")}
        </g>`).join("")}
        <text x="200" y="20" text-anchor="middle" font-size="12" fill="${C.warm}" opacity="0.85">${esc(st.name.slice(0, 14))}</text>
        <g class="dash-tiles">${[0, 1, 2, 3].map((i) => `<rect x="${24 + i * 92}" y="148" width="80" height="4" rx="2" fill="${i < Math.ceil(st.brand * 4) ? "#7fb08a" : "#3a444a"}"/>`).join("")}</g>
      </g>
      ${floorBand("#2a3238")}
      <g class="ops-desk">${desk(20, 186, st.light > 0.4)}${desk(160, 186, st.light > 0.4)}${desk(300, 186, st.light > 0.4)}</g>
      ${tickets(st.backlog, 268, 176)}
      ${bills(st.bills, 120, 196)}
      ${st.reviews ? `<g transform="translate(250,120)" class="ly-review">${notice("review", `${st.reviews} 則負評`)}</g>` : ""}
      ${st.closing ? `<g transform="translate(150,90)">${notice("closing", "服務已停止")}</g>` : ""}`;
  },
  factory(st) {
    return `${backWall(st, { window: true, wallColor: "#d5d2cc" })}
      <g class="roof"><path d="M0 0 L400 0 L400 46 L0 46 Z" fill="#b9b3a8"/>
        ${[0, 1, 2, 3].map((i) => `<path d="M${i * 100} 46 L${i * 100 + 50} 16 L${i * 100 + 100} 46 Z" fill="#a8a296"/>`).join("")}</g>
      ${signBlock(st, 140, 2, 120, 22)}
      ${machine(24, 76, st.equipment)}${machine(84, 76, false)}
      <g class="line"><rect x="20" y="130" width="360" height="12" rx="3" fill="${C.steel}"/>
        ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect class="belt-item" x="${28 + i * 44}" y="120" width="18" height="12" rx="2" fill="${i < Math.ceil(st.util * 8) ? "#c96f4a" : "#8d949a"}" opacity="${i < Math.ceil(st.util * 8) ? 0.95 : 0.35}"/>`).join("")}</g>
      ${shelves(st, 250, 66, 130, 54, 3)}
      <g class="pallets">${[0, 1].map((i) => `<rect x="${300 + i * 46}" y="146" width="40" height="14" fill="${C.wood}" opacity="${0.4 + st.stock * 0.5}"/>`).join("")}</g>
      ${floorBand("#b7b0a4")}
      ${tickets(st.backlog, 190, 176)}
      ${bills(st.bills, 320, 190)}
      ${st.closing ? `<g transform="translate(150,96)">${notice("closing", "停產")}</g>` : ""}`;
  },
  shared(st) {
    return `${backWall(st, { window: false, wallColor: "#e0d8ca" })}
      <g class="shared-band"><rect x="0" y="0" width="400" height="46" fill="#d3c9b8"/>
        ${[0, 1, 2].map((i) => `<rect x="${16 + i * 130}" y="10" width="110" height="26" rx="3" fill="#fffdf8" opacity="${i === 1 ? 0.95 : 0.5}"/>
          <text x="${71 + i * 130}" y="28" text-anchor="middle" font-size="10" fill="${C.ink}" opacity="${i === 1 ? 1 : 0.5}">${i === 1 ? esc(st.name.slice(0, 8)) : "其他單位"}</text>`).join("")}</g>
      ${shelves(st, 20, 70, 110, 64, 3)}
      ${machine(150, 92, st.equipment)}${machine(206, 92, false)}
      <g class="shared-sink"><rect x="272" y="96" width="108" height="42" rx="3" fill="${C.steel}" opacity="0.7"/>
        <rect x="284" y="104" width="38" height="26" rx="2" fill="#cfe0e4"/></g>
      ${floorBand("#c8bda6")}
      ${counter(30, 172, 120)}
      ${tickets(st.backlog, 160, 178)}
      ${bills(st.bills, 280, 192)}
      ${plant(370, 152, 1)}
      ${st.closing ? `<g transform="translate(160,120)">${notice("closing", "單位已退租")}</g>` : ""}`;
  },
};

/* ── 人。不是逐個模擬，是等級＋CSS 動畫。 ── */

function person(i, opts = {}) {
  const { kind = "pax", hue = 0, delay = 0, dur = 9, lane = 0, tired = false, uniform = false } = opts;
  const coats = ["#7a5c4a", "#4a5f6a", "#6a4a52", "#5a6a4a", "#8a6a3a", "#4a4a5f", "#7a4a3a", "#3f5a52"];
  const coat = uniform ? "#2f4a5a" : coats[(hue + i) % coats.length];
  return `<i class="agent ${kind}${tired ? " is-tired" : ""}" data-i="${i}" style="--coat:${coat};--delay:${delay.toFixed(2)}s;--dur:${dur.toFixed(1)}s;--lane:${lane};left:${(6 + ((i * 37) % 84)).toFixed(1)}%">
    <b></b><u></u>${tired ? '<s>💤</s>' : ""}${kind === "rider" ? "<em></em>" : ""}
  </i>`;
}

function peopleLayer(st) {
  const out = [];
  const crowd = st.crowd;
  for (let i = 0; i < 15; i++) {
    const on = i < crowd;
    const kind = st.kind === "online" ? (i % 4 === 3 ? "rider" : "pax") : st.kind === "digital" ? "ping" : st.kind === "onsite" ? (i % 3 === 0 ? "rider" : "pax") : "pax";
    out.push(`<span class="slot${on ? " on" : ""}">${person(i, { kind, hue: i * 3, delay: -(i * 1.37) % 9, dur: 8 + (i % 5) * 1.6, lane: i % 3, tired: false })}</span>`);
  }
  const crew = st.crew.slice(0, 7);
  const staff = crew.map((m, i) => `<span class="slot staff on">${person(i, {
    kind: "staff",
    hue: i * 5 + 2,
    delay: -(i * 2.1) % 7,
    dur: 6 + (i % 3) * 2,
    lane: 1,
    tired: num(m.stress, 0) > 0.78,
    uniform: st.brandTier >= 2,
  })}<b class="tag" data-name="${esc(m.name)}">${esc(m.name.slice(0, 3))}</b></span>`).join("");
  const queue = crowd >= 10 ? `<span class="queue" data-n="${Math.min(6, crowd - 8)}">${[0, 1, 2, 3].map((i) => person(i + 20, { kind: "pax", hue: i + 9, delay: -i * 0.4, dur: 20, lane: 0 })).join("")}</span>` : "";
  const kol = st.kol ? `<span class="kol">${person(30, { kind: "kol", hue: 4, delay: 0, dur: 14, lane: 1 })}</span>` : "";
  return `<div class="ly-people" data-crowd="${crowd}">${out.join("")}${staff}${queue}${kol}</div>`;
}

function weatherLayer(st) {
  const wx = st.weather?.stage || "clear";
  if (wx === "clear") return `<div class="ly-weather wx-clear"></div>`;
  if (wx === "rain") return `<div class="ly-weather wx-rain"><i></i><i></i><i></i></div>`;
  if (wx === "storm") return `<div class="ly-weather wx-storm"><i class="flash"></i><i class="wind"></i><i class="wind w2"></i></div>`;
  if (wx === "snow") return `<div class="ly-weather wx-snow">${[0, 1, 2, 3, 4, 5].map((i) => `<i style="--sx:${i * 17}%"></i>`).join("")}</div>`;
  if (wx === "heat") return `<div class="ly-weather wx-heat"><i class="shimmer"></i></div>`;
  if (wx === "cold") return `<div class="ly-weather wx-cold"></div>`;
  return `<div class="ly-weather"></div>`;
}

/** 整個舞台。data-* 是狀態，CSS 負責把它畫出來。 */
export function stageHtml(data, run, live) {
  const st = stageState(data, run, live);
  const art = (SCENE_ART[st.kind] || SCENE_ART.street)(st);
  const wxLabel = st.weather ? `${st.weather.label}${st.weather.days ? ` · ${st.weather.days} 天` : ""}` : "";
  return `<div class="stage" data-kind="${st.kind}" data-mood="${st.mood}" data-era="${st.era}" data-brand="${st.brandTier}" data-crowd="${st.crowd}" data-backlog="${st.backlog}" data-light="${st.light.toFixed(2)}" data-bills="${st.bills}" data-reviews="${st.reviews}" data-stress="${Math.round(st.stress * 100)}" data-wx="${st.weather?.stage || "clear"}" data-scene-label="${esc(st.scene.label)}" role="img" aria-label="${esc(ariaFor(st))}">
    <svg class="stage-scene" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${art}</svg>
    ${weatherLayer(st)}
    ${peopleLayer(st)}
    <div class="ly-light" style="--light:${st.light.toFixed(2)}"></div>
    <div class="stage-hud">
      <span class="chip chip-wx" id="stage-wx">${esc(wxLabel || "天氣正常")}</span>
      <span class="chip chip-day" id="stage-day">第 ${st.day} 日 / 30</span>
      <span class="chip chip-crowd" id="stage-crowd">店內 ${st.crowd} 人</span>
      <span class="chip chip-cash" id="stage-cash">—</span>
    </div>
    <div class="stage-alerts" id="stage-alerts"></div>
    <p class="stage-caption">${esc(captionFor(st))}</p>
  </div>`;
}

function ariaFor(st) {
  const bits = [`${st.scene.label}場景`, `店內約 ${st.crowd} 人`, st.weather ? `天氣${st.weather.label}` : "天氣正常"];
  if (st.backlog) bits.push(`${st.backlog} 張單積壓`);
  if (st.crew.length) bits.push(`${st.crew.length} 位員工在場`);
  if (st.equipment) bits.push("有設備損壞未修");
  if (st.mood === "crisis") bits.push("燈光變暗，接近結業");
  if (st.mood === "closed") bits.push("已經結業");
  return bits.join("，") + "。";
}

/** 一句話，讓不讀報表的人也看得出這間店現在怎麼樣。 */
export function captionFor(st) {
  if (st.closing) return "燈一盞一盞關掉。招牌還在，裡面已經沒有東西了。";
  if (st.mood === "crisis") return st.bills ? "帳單堆在桌上，貨架開始空，燈沒有全開。" : "貨架空了一半。你看得出來，客人也看得出來。";
  if (st.backlog >= 5) return `櫃檯上積了 ${st.backlog} 張單。有人在等，有人轉身走了。`;
  if (st.stress > 0.75) return "人的動作變慢了。有人坐下來休息，然後又站起來。";
  if (st.equipment) return "那台機器還是壞的。每個月的固定帳裡多了一行。";
  if (st.crowd >= 10) return "門口開始排隊。這是好問題，但也是問題。";
  if (st.mood === "tense") return "還撐得住。數字比上個月緊一點，燈也暗一點。";
  if (st.brandTier >= 3) return "招牌換過了，制服也換了。有人開始認得這個樣子。";
  if (st.crowd === 0) return "這個時段沒有人。帳簿還是要記。";
  return `${st.scene.label}。客人在進出，人在做事，數字在跳。`;
}

/** 每個月推進時更新舞台。只在值改變時寫 DOM。 */
export function paintStage(run, live) {
  const root = document.querySelector(".stage");
  if (!root) return;
  const set = (sel, text) => {
    const el = root.querySelector(sel);
    if (el && el.textContent !== text) el.textContent = text;
  };
  if (live?.day != null) set("#stage-day", `第 ${live.day} 日 / 30`);
  if (live?.cashText != null) set("#stage-cash", live.cashText);
  const crowd = live?.crowd;
  if (crowd != null && root.dataset.crowd !== String(crowd)) {
    root.dataset.crowd = String(crowd);
    const slots = root.querySelectorAll(".ly-people > .slot:not(.staff)");
    slots.forEach((s, i) => s.classList.toggle("on", i < crowd));
    set("#stage-crowd", `店內 ${crowd} 人`);
  }
  if (live?.backlog != null && root.dataset.backlog !== String(live.backlog)) root.dataset.backlog = String(live.backlog);
  if (live?.light != null) {
    root.style.setProperty("--live-light", live.light.toFixed(2));
    root.querySelector(".ly-light")?.style.setProperty("--light", live.light.toFixed(2));
  }
  if (live?.pulse) {
    const box = root.querySelector("#stage-alerts");
    if (box) {
      const el = document.createElement("span");
      el.className = `float-chip ${live.pulse.amount >= 0 ? "in" : "out"}`;
      el.textContent = live.pulse.text;
      box.appendChild(el);
      setTimeout(() => el.remove(), 1600);
      while (box.children.length > 4) box.firstChild.remove();
    }
  }
  if (live?.weatherText != null) set("#stage-wx", live.weatherText);
}

/** 這一個月的高峰時刻：給營業演出用。 */
export function liveCrowd(st, t) {
  const tiers = [0, 3, 6, 10, 15];
  const base = st.crowd;
  if (!base) return 0;
  const i = Math.max(0, tiers.indexOf(base));
  const lower = tiers[Math.max(0, i - 1)];
  const wave = Math.abs(Math.sin(t * Math.PI * 3 + 0.6));
  return wave > 0.42 ? base : lower;
}

/**
 * 營業演出：把一個月切成三十天，回傳那一天舞台該長甚麼樣子。
 * 客流有尖峰與離峰，積壓的單在月中堆起來，月底燈會暗一點。
 */
export function liveDay(data, run, day, prog) {
  const base = stageState(data, run);
  const crowd = liveCrowd(base, prog);
  // 積壓的單也是等級，不是連續數字：月初少、月中堆起來、月底清掉一些
  const tiers = data.economy.life?.stage?.backlog_tiers || [0, 2, 5, 9];
  let backlog = 0;
  if (base.backlog) {
    const want = base.backlog * (day < 10 ? 0.35 : day < 22 ? 1 : 0.75);
    for (const t of tiers) if (want >= t * 0.8 && t > 0) backlog = t;
  }
  const light = clamp(base.light + (day > 24 ? -0.08 : day < 7 ? 0.04 : 0), 0.1, 1);
  return { crowd, backlog, light, base };
}

export { SCENES, SCENE_ART };
