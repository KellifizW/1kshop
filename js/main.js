import * as Sim from "./sim.js";
import * as P from "./present.js";
import * as Stage from "./stage.js";
import * as Charts from "./charts.js";
import * as Story from "./story.js";
import { cashflowPulses } from "./cashflow.js";
import { paintCard, cardBlob, shareText } from "./share.js";

const app = document.querySelector("#app");
const statusEl = document.querySelector("#status");
const KEY = { run: "qf-run", settings: "qf-settings", archive: "qf-archive", eco: "qf-eco", recent: "qf-recent" };

let data = null;
const ui = {
  screen: "boot",
  run: null,
  drawer: null,
  settings: { speed: "standard", smart: false, autoplay: false, flow: true, still: false },
  draftName: "",
  mode: "story",
  quiet: 0,
  archiveId: null,
  commentAt: [],
  error: "",
  shareNote: "",
};

const $ = (s) => esc(s ?? "");

/** 舊存檔可能記著已經移除的模式，一律退回故事標準。 */
function modeOf(run) {
  return data?.economy?.modes?.[run?.mode] || data?.economy?.modes?.story || { rejects: 2, info: "full", dialogue: true, official: true };
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

function say(text) { if (statusEl) statusEl.textContent = text || ""; }

async function boot() {
  try {
    const files = ["world", "economy", "content", "events", "narrative", "life-events"];
    const loaded = await Promise.all(files.map(async (name) => {
      const res = await fetch(`data/${name}.json`);
      if (!res.ok) throw new Error(name);
      return res.json();
    }));
    data = {
      world: loaded[0], economy: loaded[1], content: loaded[2],
      events: [...loaded[3].events, ...loaded[5].events],
      narrative: { ...loaded[4], beats: [...loaded[4].beats, ...loaded[5].beats] },
    };
    const savedSettings = read(KEY.settings, {});
    ui.settings = { ...ui.settings, ...savedSettings };
    if (!savedSettings.flowVersion) {
      ui.settings.flow = true;
      ui.settings.flowVersion = 2;
      persistSettings();
    }
    document.documentElement.classList.toggle("still", ui.settings.still || matchMedia("(prefers-reduced-motion: reduce)").matches);
    const saved = read(KEY.run, null);
    if (saved && typeof saved.month === "number" && saved.phase) ui.saved = saved;
    else if (localStorage.getItem(KEY.run)) ui.corrupt = true;
    ui.screen = "title";
    render();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  } catch (err) {
    ui.screen = "error";
    ui.error = err?.message || "unknown";
    render();
  }
}

function render() {
  if (data && ui.run) {
    Sim.ensureCast(data, ui.run);
    Sim.ensureWork(data, ui.run);
    if (!ui.run.venture) Sim.ensureOpeningSupport(data, ui.run);
    // 舊存檔停在舊的三頁塑形；回到第一個還沒有答案的那一頁，不要留下空白的一頁。
    if (ui.screen === "shaping" && ui.run.phase === "shaping") syncShapeStep(ui.run);
  }
  const oldJournal = app.querySelector(".journal-list");
  const journalTop = oldJournal?.scrollTop || 0;
  const journalHeight = oldJournal?.scrollHeight || 0;
  app.innerHTML = views[ui.screen]?.() || views.error();
  const newJournal = app.querySelector(".journal-list");
  // 閱讀較早記錄時，季結插入新內容不應把讀者拉回最上方。
  if (newJournal && journalTop > 8) newJournal.scrollTop = journalTop + Math.max(0, newJournal.scrollHeight - journalHeight);
  const pendingAuto = ui.settings.autoplay ? autoTarget() : null;
  const focus = app.querySelector("[data-autofocus]");
  const quietTick = ui.tickAuto && ui.screen === "play" && ui.run?.phase === "play";
  if (focus && !quietTick && !pendingAuto) focus.focus();
  ui.tickAuto = false;
  ui.freshBeat = false;
  armFlow();
  armAuto();
}

const views = {
  error() {
    return sheet(`<p class="kicker">讀取失敗</p><h1>帳簿沒有打開</h1><p>資料${$(ui.error)}沒有載入。這不是你的經營問題。</p><button class="go" data-act="reload" data-autofocus>重試</button>`);
  },
  title() {
    const cont = ui.saved && ui.saved.phase !== "ending";
    return sheet(`
      <div class="hero"><div><p class="kicker">1 IN 1,000</p><h1>千分之一<br>的店</h1></div><div class="seal" aria-hidden="true">千分<br>之一</div></div>
      <p class="sub">你抽到的世界，你選擇的生意。</p>
      <p>你不能挑選完美的城市，但每個決定都可能打開新機會。管理風險、尋找轉機，決定這間公司能走多遠。</p>
      <button class="go" data-act="to-mode" data-autofocus>開始這一局</button>
      ${cont ? `<button class="alt" data-act="continue">繼續未合上的帳簿</button>` : `<p class="muted">沒有未完成的帳簿。</p>`}
      ${ui.corrupt ? `<button class="alt" data-act="drop-save">存檔對不上了。丟掉它，紀念館仍可保留。</button>` : ""}
      <button class="ghost" data-act="archive">紀念館</button>
      <button class="ghost" data-act="about">關於這本模擬</button>
      <button class="ghost" data-act="settings">速度與無障礙</button>`);
  },
  about() {
    return sheet(`<p class="kicker">聲明</p><h2>這不是建議</h2><p>${$(data.narrative.disclaimer)}</p>
      <p>城市的工資、租金、稅率與抽成是遊戲平衡參數，標示為估算，不稱作官方統計。</p>
      <p class="muted">版本 ${$(data.economy.meta.game_version)} · 模擬 ${$(data.economy.meta.simulation_version)} · 內容 ${$(data.economy.meta.content_version)}</p>
      <button class="go" data-act="title" data-autofocus>回到封面</button>`);
  },
  settings() {
    const s = ui.settings;
    const speeds = [["slow", "放慢 · 30 秒一季"], ["immerse", "沉浸 · 15 秒一季"], ["standard", "標準 · 10 秒一季"], ["fast", "快速 · 5 秒一季"], ["blitz", "狂飆 · 2 秒一季"]];
    return sheet(`<p class="kicker">設定</p><h2>時間怎麼走</h2>
      <p>季度會自己過去。預設每十秒一季，街上的小事會浮在帳簿上，並留下一點影響。重大決定會把時間按停。你仍可以跳到下一件要決定的事，或只推進一季。</p>
      <div class="stack">${speeds.map(([id, label]) => `<button class="choice" data-act="set-speed" data-id="${id}" ${s.speed === id ? "data-autofocus" : ""}><b>${label}</b></button>`).join("")}</div>
      <button class="alt" data-act="toggle" data-key="flow">${s.flow !== false ? "時間流動：開" : "時間流動：關"}</button>
      <button class="alt" data-act="toggle" data-key="smart">${s.smart ? "安靜時加快、危險時放慢：開" : "安靜時加快、危險時放慢：關"}</button>
      <button class="alt" data-act="toggle" data-key="still">${s.still ? "減少動效：開" : "減少動效：關"}</button>
      <button class="alt" data-act="toggle" data-key="autoplay">${s.autoplay ? "自動選擇：開" : "自動選擇：關"}</button>
      <p class="muted">打開之後，要拍板的選項會先亮三秒，時間走完才選上。這三秒可以改選，或把模式關掉。</p>
      <button class="go" data-act="title">完成</button>`);
  },
  mode() {
    // 只留下兩個正式模式。創作者沙盒還在，但收到頁尾的角落，不與正式模式並列。
    const modes = Object.entries(data.economy.modes).filter(([id]) => id !== "sandbox");
    return sheet(`<p class="kicker">模式</p><h2>這一局怎麼算</h2>
      <div class="stack">${modes.map(([id, m]) => `<button class="choice" data-act="pick-mode" data-id="${id}" ${id === "story" ? "data-autofocus" : ""}><b>${$(m.label)}</b><span>${$(m.blurb)}</span></button>`).join("")}</div>
      <div class="sheet-foot">
        <button class="ghost corner-link" data-act="to-sandbox">創作者沙盒</button>
        <button class="ghost corner-link" data-act="title">返回</button>
      </div>`);
  },
  sandbox() {
    const cities = data.world.cities.map((c) => `<option value="${c.id}">${$(c.name)}</option>`).join("");
    const gaps = data.content.gaps.map((g) => {
      const type = Sim.companyType(data, g.company_type);
      return `<option value="${$(g.id)}">${type ? `${$(type.name)} · ` : ""}${$(g.title)}</option>`;
    }).join("");
    return sheet(`<p class="kicker">創作者沙盒 · 不計入正式統計</p><h2>自訂這一局的條件</h2>
      <label>種子<input id="sb-seed" value="${$(ui.seedDraft || Math.floor(Math.random() * 1e6))}"></label>
      <label>城市<select id="sb-city"><option value="">由種子決定</option>${cities}</select></label>
      <label>市場缺口<select id="sb-gap"><option value="">由種子決定</option>${gaps}</select></label>
      <label>年齡<input id="sb-age" inputmode="numeric" placeholder="22–58"></label>
      <label>資產（月薪，可負）<input id="sb-assets" inputmode="numeric" placeholder="例如 8 或 -3"></label>
      <button class="go" data-act="start-sandbox" data-autofocus>用這些條件抽取</button>
      <p class="muted" id="sb-error"></p>
      <button class="ghost corner-link" data-act="to-mode">返回</button>`);
  },
  // 開場只有一頁：城市、你、你的工作、你抽到的生意，全部攤在同一張桌上。
  opening() {
    const run = ui.run;
    const w = P.worldLine(data, run);
    const mode = modeOf(run);
    const canReject = run.rejectsLeft > 0;
    const biz = P.business(data, run);
    const job = P.jobLine(data, run);
    const n = Math.max(1, run.perThousand);
    const origin = [
      `你向${biz.buyer}了解需要後，一位熟人願意支持你試做${biz.sells}。`,
      `過去認識的導師留意到「${w.gap.title}」，介紹支持者讓你試做${biz.sells}。`,
      `有人在這座城市也遇到「${w.gap.title}」，集合了一筆資源，支持你試做${biz.sells}。`,
    ][run.openingSupport?.source ?? 0];
    return sheet(`<p class="kicker">開局${run.rejected.length ? ` · 第 ${run.rejected.length + 1} 個機會` : ""}</p>
      <h1>${$(w.city.name)}</h1>
      <p class="muted">${$(w.country.name)} · 約每一千個開局，有 ${n} 局落在這座城市的「${$(w.gap.title)}」。</p>
      <ul class="symptoms">${w.city.diffs.map((d) => `<li>${$(d)}</li>`).join("")}</ul>

      <div class="dossier">
        <section class="fold">
          <p class="fold-k">你</p>
          <p><b>${run.founder.age} 歲</b> · ${$(P.householdLine(run))}做過 ${run.founder.experience} 年${$(P.fieldLabel(data, run.founder.field))}。</p>
          <p class="muted">${run.founder.matched ? "這段經驗和眼前的缺口是同一類型。" : "這段經驗屬於別的行業，但你仍要面對眼前的缺口。"}</p>
          <p>${$(run.founder.personalNote)}${job.has ? `你現在是${$(job.label)}，${$(job.hours)}。${job.learn ? `這份工作教會你${$(job.learn)}。` : ""}` : "你現在沒有正職。"}</p>
        </section>

        <section class="fold">
          <p class="fold-k">你抽到的生意 ${companyBadge(run)}</p>
          <h2>${$(biz.name)}</h2>
          <p class="muted">${biz.companyType ? `企業類型：${$(biz.companyType)} · ` : ""}${$(biz.company)} · 屬於${$(biz.industry)}行業</p>
          <p>${$(biz.does)}</p>
          <p>你賣的是<b>${$(biz.sells)}</b>，付錢的是${$(biz.buyer)}，一筆交易交付${$(biz.unit)}。</p>
          <p><b>怎麼長大：</b>${$(biz.scale)}${biz.hire ? `要長大，${$(biz.hire)}` : ""}</p>
        </section>

        <section class="fold">
          <p class="fold-k">街上的缺口</p>
          <p><b>「${$(w.gap.title)}」</b>：${$(w.gap.problem)}</p>
          <p>你還不知道的是：${$(biz.unknown)}</p>
          ${run.openingSupport ? `<p><b>創業契機 · ${$(run.openingSupport.label)}</b>：${$(origin)}開業時提供 ${$(P.money(data, run, run.openingSupport.cash))} 專作營運的啟動資金（不用償還）；前 ${run.openingSupport.quarters} 季補貼基本場地費的 ${Math.round(run.openingSupport.relief * 100)}%，之後恢復原價。其他成本仍要付。</p>` : ""}
          ${run.ecosystemHint ? `<p class="muted">這座城市還留著「${$(run.ecosystemHint.name || "一間舊店")}」的痕跡。</p>` : ""}
        </section>
      </div>

      <p class="sub">${$(P.rarityLine(n))}。機會本身不算最稀有，稀有的是你拿到之後怎麼經營它。</p>
      ${!run.official ? `<p class="muted">此局不計入正式統計。</p>` : ""}
      <p class="muted">可見的人：${run.contacts.filter((c) => c.known).map((c) => `${$(c.role)} ${$(c.name)}`).join("、") || "暫時沒有"}。其餘保持未知。工資與租金是遊戲估算，不是官方統計；${$(w.city.name)}的一單位約 ${$(P.money(data, run, 1))}。</p>
      <button class="go" data-act="accept" data-autofocus>接這個機會，開始塑形</button>
      ${canReject ? `<button class="alt" data-act="reject">拒絕。會經過 ${run.rejectPreview} 季，並付生活費。還剩 ${run.rejectsLeft} 次。</button>` : `<p class="muted">${mode.rejects ? "拒絕已經用完。" : "這個模式不能拒絕。"}</p>`}
      <button class="ghost" data-act="job">${job.has ? `不創業，回去做${$(job.label)}` : "不創業，先回去上班"}</button>`);
  },
  rejected() {
    const r = ui.run.rejectResult;
    return sheet(`<p class="kicker">時間過去</p><h2>${r.months} 季</h2>
      <p>生活費大約 ${$(P.money(data, ui.run, r.spent))}。世界沒有停。</p>
      <p>${r.taken ? `${$(r.peerName)}把你拒絕的機會接了過去。以後可能在同行圈子裡遇見。` : "那個機會暫時沒有人接。"}</p>
      <button class="go" data-act="after-reject" data-autofocus>看下一個機會</button>`);
  },
  shaping() {
    return shapingView();
  },
  // 開業前的數字與名字放在同一頁：結構已經定了，只剩把它寫上帳簿第一頁。
  naming() {
    const run = ui.run;
    const p = Sim.previewVenture(data, run);
    if (!p) return sheet(`<p>這組結構還算不出第一季。請回到上一步重選。</p><button class="ghost" data-act="shape-back">上一步</button>`);
    const rl = data.economy.redline_thresholds[p.redline];
    const names = Sim.nameOptions(run, data);
    const draft = ui.draftName || names[0] || "";
    const gapLine = p.personalGap > 0.05
      ? `生活費還差約 ${$(P.money(data, run, p.personalGap))}，會先從公司現金補。`
      : p.salaryKept > 0.05
        ? `生活費主要由你留下的薪水蓋過（約 ${$(P.money(data, run, p.salaryKept))}／季）。`
        : "生活費要靠公司提取蓋過。";
    return sheet(`${businessStrip(run)}<p class="kicker">開業之前</p><h2>這就是你的結構</h2>
      <p>公司現金大約 ${$(P.money(data, run, p.cash))}${p.severance > 0 ? `（含遣散費約 ${$(P.money(data, run, p.severance))}）` : ""}，債務 ${$(P.money(data, run, p.debt))}。你自己留下約 ${$(P.money(data, run, p.personalLeft))}。</p>
      <p>若第一季大致如此，帳面收入約 ${$(P.money(data, run, p.revenue))}，公司要付的約 ${$(P.money(data, run, p.costs))}。${gapLine}跑道大約 ${p.runway > 36 ? "很長" : Math.max(0, Math.round(p.runway)) + " 季"}。</p>
      ${run.openingSupport ? `<p>以上現金已計入契機的啟動資金；預算使用首季場地補貼。第 ${run.openingSupport.quarters + 1} 季起基本場地費恢復原價。</p>` : ""}
      <p>主要紅線會是：${$(rl.name)}。牌照大約 ${p.license} 季。</p>
      <p class="muted">這是確定會寫進結構的部分。市場結果仍是區間。外面的錢（天使、創投）不在開局選項裡，它們要等公司站穩之後才會上門。</p>


      <p class="fold-k">寫在帳簿第一頁的名字</p>
      <div class="custom-name-input">
        <input id="custom-name" value="${$(draft)}" placeholder="輸入你的公司名字" maxlength="16" aria-label="公司名字">
      </div>
      <div class="stack name-suggest">${names.map((n) => `<button class="choice${draft === n ? " is-on" : ""}" data-act="pick-name" data-name="${$(n)}" aria-pressed="${draft === n}"><b>${$(n)}</b><span>用這個名字</span></button>`).join("")}</div>
      <button class="go" data-act="open" data-autofocus>用「${$(draft)}」開業</button>
      <button class="ghost" data-act="shape-back">回到上一步</button>`);
  },
  play() { return playView(); },
  ending() { return endingView(); },
  diagnosis() { return diagnosisView(); },
  archive() { return archiveView(); },
  corrupt() {
    return sheet(`<p class="kicker">存檔</p><h2>這份存檔對不上了</h2><p>可以開始新局。紀念館裡還能辨認的紀錄仍在。</p>
      <button class="go" data-act="drop-save" data-autofocus>丟掉這份存檔</button>`);
  },
};

function sheet(inner, side = "") {
  const chrome = ui.screen === "settings" ? "" : autoChrome();
  return `<div class="shell ${side ? "with-side" : ""}"><article class="sheet">${chrome}${inner}</article>${side}</div>`;
}

// 塑形：一頁只問一件事。選完就換頁，不會在同一頁上一次回答幾個問題。
const SHAPE_STEPS = [
  {
    kicker: "塑形 1 / 6",
    title: "你怎麼投入",
    lead: "你已經決定要開這間公司。現在的問題只有一個：手上那份工作怎麼辦。",
    groups: [["style", "commitment_styles", "投入方式"]],
  },
  {
    kicker: "塑形 2 / 6",
    title: "在哪裡做",
    lead: "這一題只決定一件事：你的固定成本，以及客人會不會經過你門口。",
    groups: [["venue", "venues", "在哪裡做"]],
  },
  {
    kicker: "塑形 3 / 6",
    title: "東西怎麼交出去",
    lead: "品質是握在自己手上，還是交到別人手上，差別在這一題。",
    groups: [["fulfillment", "fulfillment", "東西怎麼交出去"]],
  },
  {
    kicker: "塑形 4 / 6",
    title: "錢怎麼進來",
    lead: "一次收、按季收、按案收，決定你的跑道有多可預期。",
    groups: [["revenue", "revenues", "錢怎麼進來"]],
  },
  {
    kicker: "塑形 5 / 6",
    title: "誰擁有它",
    lead: "控制權與帶進來的現金，只能從這一題裡挑一個比重。",
    groups: [["ownership", "ownership", "誰擁有它"]],
  },
  {
    kicker: "塑形 6 / 6",
    title: "你站在哪",
    lead: "最後一題：你要跟誰搶同一批客人，以及你用甚麼價格被認出來。",
    groups: [["positioning", "positioning", "你站在哪"]],
  },
];

function syncShapeStep(run) {
  const at = Math.max(0, Math.min(run.shapeStep || 0, SHAPE_STEPS.length - 1));
  const missing = SHAPE_STEPS.findIndex((step) => !run.shape[step.groups[0][0]]);
  if (missing !== -1 && missing < at) run.shapeStep = missing;
}

function shapingView() {
  const run = ui.run;
  const idx = Math.min(run.shapeStep || 0, SHAPE_STEPS.length - 1);
  const step = SHAPE_STEPS[idx];
  const [key, group, title] = step.groups[0];
  const picked = run.shape[key];
  const last = idx >= SHAPE_STEPS.length - 1;
  const showsJob = key === "style";
  const done = SHAPE_STEPS.filter((s2) => run.shape[s2.groups[0][0]]).length;
  return sheet(`<p class="kicker">${$(step.kicker)}</p><h2>${$(step.title)}</h2>
    <p class="sub">${$(step.lead)}</p>
    <div class="step-dots" aria-label="塑形進度">${SHAPE_STEPS.map((s2, i) => `<i class="${run.shape[s2.groups[0][0]] ? "done" : i === idx ? "here" : ""}" aria-hidden="true"></i>`).join("")}<span>已回答 ${done} / ${SHAPE_STEPS.length}</span></div>
    ${showsJob ? jobCardHtml(run) : ""}
    ${pickGroupHtml(run, key, group, title)}
    ${picked ? `<p class="muted">已選「${$(data.economy[group]?.[picked]?.label || picked)}」。要改就再點一次別的選項。</p>` : `<p class="muted">選一個就往下走。</p>`}
    <div class="step-actions">
      <button class="go" data-act="shape-next" ${picked ? "data-autofocus" : "disabled"}>${last ? "看開業前的數字" : "下一步"}</button>
      ${idx > 0 ? `<button class="ghost" data-act="shape-back">上一步</button>` : ""}
    </div>`);
}

function jobCardHtml(run) {
  const job = P.jobLine(data, run);
  if (!job.has) {
    return `<section class="fold jobcard"><p class="fold-k">你現在的工作</p>
      <p>你沒有正職。沒有薪水可以保留，也沒有遣散費可以拿——所有選項對你的差別，只在時間與精力。</p></section>`;
  }
  return `<section class="fold jobcard"><p class="fold-k">你現在的工作</p>
    <p><b>${$(job.label)}</b> · 月薪約 ${$(P.money(data, run, job.income))}（當地中位薪資約 ${$(P.money(data, run, 1))}）</p>
    <p class="muted">班表：${$(job.hours)}。要離開：${$(job.notice)}。在外開公司：${$(job.side)}。</p>
    <p class="muted">遣散費：約 ${$(P.money(data, run, job.severance * job.income))}。${$(job.ladder)}。</p></section>`;
}

function pickGroupHtml(run, key, group, title) {
  const dict = data.economy[group] || {};
  let entries = Object.entries(dict);
  // 緊扣公司類型：東西怎麼交出去 / 錢怎麼進來 需符合抽到的公司性質，過濾不合現實的選項
  if (key === "fulfillment") {
    const allowed = Sim.allowedFulfillment ? Sim.allowedFulfillment(data, run) : null;
    if (allowed && allowed.length) entries = entries.filter(([id]) => allowed.includes(id));
  }
  if (key === "revenue") {
    const allowed = Sim.allowedRevenue ? Sim.allowedRevenue(data, run) : null;
    if (allowed && allowed.length) entries = entries.filter(([id]) => allowed.includes(id));
  }
  const picked = run.shape[key];
  const buttons = entries.map(([id, obj], i) => {
    const on = picked === id;
    const auto = !picked && i === 0 ? " data-autofocus" : "";
    // 使用按公司類型客製的標籤，避免「自產」對配送公司不合現實
    let label = obj.label;
    if (key === "fulfillment" && Sim.fulfillmentLabel) label = Sim.fulfillmentLabel(data, run, id);
    if (key === "revenue" && Sim.revenueLabel) label = Sim.revenueLabel(data, run, id);
    return `<button class="choice${on ? " is-on" : ""}" data-act="shape-pick" data-key="${key}" data-value="${id}" aria-pressed="${on ? "true" : "false"}"${auto}><b>${$(label)}</b><span>${$(choiceBlurb(key, group, id, obj, label))}</span></button>`;
  }).join("");
  const gap = data.content.gaps.find(g=>g.id===run.gapId);
  const famNote = (key==="fulfillment"||key==="revenue") && gap ? `<p class="muted" style="margin-top:6px;">已按「${gap.title}」過濾為符合現實的 ${entries.length} 種做法。</p>` : "";
  return `<section class="pick-group"><p class="fold-k">${$(title)}</p><div class="stack">${buttons}</div>${famNote}</section>`;
}

/** 投入方式要把「你這份工作」換算成具體數字，否則玩家看不出自己在換甚麼。 */
function choiceBlurb(key, group, id, obj, customLabel) {
  if (key === "style") {
    const s = P.styleLine(data, ui.run, id);
    if (s) {
      const bits = [`${s.timePct}% 的時間給公司`];
      bits.push(s.salaryKept > 0 ? `月薪保留約 ${P.money(data, ui.run, s.salaryKept)}` : "這份薪水歸零");
      if (s.severance > 0) bits.push(`遣散費約 ${P.money(data, ui.run, s.severance)} 一次到手`);
      const base = `${obj.certain}（${bits.join("；")}）風險：${obj.risk}`;
      // 真實統計/冷知識：讓「你怎麼投入」每個選項都帶有研究數據
      const extra = obj.trivia ? `｜冷知識：${obj.trivia}` : "";
      const stat = obj.stat ? `｜數據：${obj.stat}` : "";
      return base + extra + stat;
    }
  }
  // 按公司類型客製的說明，避免不合現實的句子
  if (key === "fulfillment") {
    const fam = data.content.gaps.find(g=>g.id===ui.run.gapId)?.family || "";
    const realistic = {
      "logi": { "make": "自有車隊直送，品質與時效握在自己手上，但固定成本高。", "outsource": "外判車隊，彈性高但需管理服務品質。", "match": "撮合供需，輕資產但抽成與口碑風險。", "stock": "自營倉配，一次備貨降低單次運輸成本。" },
      "saas": { "digital": "自動化交付，邊際成本接近零，適合規模化。", "make": "自建團隊交付，品質可控但人力成本高。", "outsource": "外包開發與維運，速度快但依賴外部。", "match": "平台撮合買賣雙方，網絡效應是關鍵。" },
      "food": { "make": "自煮自製，口味與食安可控。", "stock": "備料庫存，周轉要快。", "order": "按單現做，新鮮但高峰會排隊。", "outsource": "中央廚房代工，降低店內人力但增加依賴。" }
    };
    if (realistic[fam]?.[id]) return realistic[fam][id];
  }
  if (key === "revenue") {
    const fam = data.content.gaps.find(g=>g.id===ui.run.gapId)?.family || "";
    const realisticR = {
      "logi": { "once": "單次運費，現金快但波動大。", "commission": "抽成制，隨交易量浮動。", "project": "合約專案，收入可預期但帳期長。", "sub": "季結合約，穩定現金流。", "wholesale": "整櫃批發，量大價低。" },
      "saas": { "sub": "季費訂閱，續費是關鍵。", "license": "授權費，一次性但需維護。", "ads": "廣告分潤，依流量變動。", "commission": "交易抽成，與平台共生。" },
      "food": { "once": "單次餐點，隨客流波動。", "sub": "季訂閱餐，鎖定常客。", "member": "會員儲值，預收現金。", "project": "包場專案，單價高但不穩定。" }
    };
    if (realisticR[fam]?.[id]) return realisticR[fam][id];
  }
  return obj.certain || obj.risk || shapeHint(group, obj, customLabel);
}

function shapeHint(group, obj, customLabel) {
  if (group === "venues") return `固定成本${obj.fixed > 0.4 ? "偏高" : obj.fixed < 0.15 ? "很低" : "中等"}，人流${obj.traffic > 1.2 ? "較旺" : "要自己找"}。`;
  if (group === "revenues") return obj.recurring ? "收入較可預期，要守住留存。" : `帳期大約 ${obj.ar || 0} 天。`;
  if (group === "fulfillment") {
    if (customLabel && customLabel !== obj.label) return `「${customLabel}」：` + (obj.dependency > 0.4 ? "你會依賴外部把東西交出，管理是關鍵。" : "品質與時效比較握在自己手上。");
    return obj.dependency > 0.4 ? "你會依賴別人把東西交出。" : "品質比較握在自己手上。";
  }
  if (group === "ownership") return `控制權約 ${Math.round((obj.control || 1) * 100)}%，帶進約 ${obj.cash || 0} 單位現金。外面的錢（天使、創投）之後才會上門。`;
  if (group === "positioning") return obj.price > 1.3 ? "客單高，成交慢。" : "較容易成交，毛利要看緊。";
  return "";
}

function playView() {
  const run = ui.run;
  if (run.phase === "event") return eventView();
  if (run.phase === "laststand") return lastView();
  if (run.phase === "succession") return successionView();
  if (run.phase === "chapter") return chapterView();
  if (run.phase === "summary") return summaryView();
  if (run.phase === "closing") return closeView();
  const w = P.worldLine(data, run);
  const rl = P.redlineView(data, run) || { name: "尚未結算", text: "結算第一季之後，紅線才有數字。", level: "ok", mark: "穩" };
  const fc = run.month >= 0 && run.phase === "play" ? Sim.forecast(data, run) : null;
  const last = run.last;
  const drawer = ui.drawer === "initiative" ? initiativeModal(run) : ui.drawer ? drawerHtml() : "";
  const biz = P.business(data, run);
  const from = P.calendarLabel(run);
  const to = P.calendarLabel(run, 1);
  const mode = modeOf(run);
  const kpis = Story.quickMetrics(data, run);
  const story = last ? Story.monthStory(data, run) : [];
  const mult = paceMult(run);
  const healthPct = Math.round(run.founder.health * 100);
  const willPct = Math.round(run.founder.will * 100);
  const controlPct = Math.round(run.founder.control * 100);
  const note = pauseNote(run);
  const crisisNote = note ? `<p class="crisis-note">${$(note)}</p>` : "";

  return `<div class="shell play-shell"><article class="sheet play-sheet">
    <header class="worldbar">
      <div><p class="kicker">${$(w.city.name)} · ${$(P.stageName(data, run))} · ${$(run.role)}</p>
      <h2 id="pass-title">${$(run.venture?.name || "還沒有開始")} ${run.venture ? companyBadge(run) : ""}</h2>
      <p class="muted">${$(from)} → ${$(to)} · ${$(P.whenLabel(run))}</p></div>
      <div class="pace" role="group" aria-label="時間速度">
        ${[1, 3, 10].map((m) => `<button class="pill ${mult === m ? "on" : ""}" data-act="pace" data-mult="${m}" aria-pressed="${mult === m}">${m}×</button>`).join("")}
        <button class="pill" data-act="month-end">直接到季末</button>
        <button class="pill" data-act="flow-toggle">${flowOn() ? "⏸ 按停" : "▶ 讓它跑"}</button>
        <button class="pill ghost-pill" data-act="speed-slower">${$(speedLabel())}</button>
      </div>
    </header>
    ${autoChrome()}
    ${crisisNote}
    ${outcomeBanner(run)}
    <div class="play-grid">
      <div class="stage-col">
        ${Stage.stageHtml(data, run)}
        <section class="passage" aria-label="這季的時間">
          ${flowOn() ? `<div class="passage-months"><span id="pass-from">${$(from)}</span><div class="passage-track"><i id="pass-marker"></i></div><span id="pass-to">${$(to)}</span></div>
          <p id="pass-day">第 1 日 / 90 · ${$(biz.name)}</p>
          <p id="pass-pulse" class="sub-text">${$(biz.revenueLabel ? biz.revenueLabel + "：" + biz.pulse : "入帳")}會在這季裡跳動。重大的事才把日子按停。</p>
          <div id="live-feed" class="feed" aria-live="polite" aria-label="這季出現的小事"></div>`
          : `<p class="sub-text">時間按停。可以按「直接到季末」，或按「讓它跑」看這季怎麼走。</p>`}
        </section>
        ${journalHtml(run, story)}
      </div>
      <aside class="rail" aria-label="快速狀態與操作">
        <section class="rail-kpis">${kpis.map((m) => `<div class="kpi ${m.level}" data-id="${m.id}">
            <span class="kpi-label">${$(m.label)}</span>
            <b class="kpi-value" id="kpi-${m.id}">${$(m.value)}</b>
            <small class="kpi-note" id="kpi-${m.id}-note">${$(m.note)}</small>
          </div>`).join("")}</section>
        ${Charts.cashflowPanel(data, run, fc)}
        <p class="rail-self">你自己：健康 ${healthPct}% · 意志 ${willPct}% · 控制權 ${controlPct}%<br>個人現金 ${$(P.money(data, run, run.personal?.cash || 0))} · 個人債務 ${$(P.money(data, run, run.personal?.debt || 0))}${run.personal?.lastDebtPayment > 0.01 ? `（上季還款 ${$(P.money(data, run, run.personal.lastDebtPayment))}）` : ""}</p>
        <section class="rail-card redline-card ${rl.level}">
          <p class="fold-k">結構紅線</p>
          <p><b class="redline-icon">${$(rl.mark)}</b> ${$(rl.name || "尚未結算")}</p>
          <p class="small">${$(rl.text || "結算第一季之後，紅線才有數字。")}</p>
        </section>
        ${Charts.runwayView(data, run, { debt: true, forecast: fc })}
        <details class="rail-card rail-forecast" ${ui.forecastOpen === false ? "" : "open"}>
          <summary>季初：預測與部署</summary>
          ${fc ? Charts.forecastPanel(data, run, fc) : `<p class="muted">結算第一季之後，這裡會有區間預測。</p>`}
        </details>
        ${run.openingSupport && run.month < run.openingSupport.quarters ? `<p class="small">契機支援：基本場地費減 ${Math.round(run.openingSupport.relief * 100)}%，到第 ${run.openingSupport.quarters} 季結束；第 ${run.openingSupport.quarters + 1} 季恢復原價。</p>` : ""}
        <section class="rail-card rail-decisions">
          <p class="fold-k">經營公司</p>
          <p class="small">時間會自己走。需要調整時，打開行動選單；選擇期間時間會暫停。</p>
          <button class="go initiative-trigger" data-act="initiative-open" aria-haspopup="dialog">經營行動 <span aria-hidden="true">↗</span></button>
        </section>
        <nav class="dock" aria-label="抽屜">
          <button data-act="drawer" data-id="ledger">帳簿</button>
          <button data-act="drawer" data-id="charts">圖表</button>
          <button data-act="drawer" data-id="crew">團隊</button>
          <button data-act="drawer" data-id="peers">同行</button>
          <button data-act="drawer" data-id="commits">承諾</button>
          <button data-act="drawer" data-id="time">時間</button>
        </nav>
      </aside>
    </div>
    ${drawer}
  </article></div>`;
}

/** 大事、小事及結算都留在同一條可回看的時間線。 */
function journalHtml(run, story) {
  const entries = (run.timeline || []).slice(-60).reverse();
  const rows = entries.map((item) => {
    const kind = item.kind || "history";
    const label = { beat: "日常", decision: "決定", quarter: "季結", history: "紀錄" }[kind] || "紀錄";
    const financial = kind === "quarter" && Number.isFinite(item.cash)
      ? `<p class="journal-numbers">收款 ${$(P.money(data, run, item.collected))} · 支出 ${$(P.money(data, run, item.out))} · 結算時現金 ${$(P.money(data, run, item.cash))}</p>` : "";
    return `<li class="journal-entry" data-kind="${$(kind)}">
      <div class="journal-meta"><span class="journal-tag">${label}</span><time>第 ${item.m} 季${item.when ? ` · ${$(item.when)}` : ""}</time></div>
      <h4>${$(item.title)}</h4>
      ${item.subject && item.subject !== item.title ? `<p class="journal-subject">${$(item.subject)}</p>` : ""}
      ${item.text ? `<p>${$(item.text)}</p>` : ""}
      ${item.choice ? `<p class="journal-choice">你的決定：${$(item.choice)}</p>` : ""}
      ${item.note ? `<p class="journal-note">${$(item.note)}</p>` : ""}${financial}
    </li>`;
  }).join("");
  return `<section class="company-journal" aria-label="公司生活紀錄">
    <header class="journal-head"><div><p class="fold-k">COMPANY JOURNAL</p><h3>公司生活紀錄</h3><p>日常、決定與收支，按時間留下。</p></div><button class="ghost" data-act="drawer" data-id="time">較早紀錄</button></header>
    ${story.length ? `<div class="journal-recap"><b>上季一瞥</b><ul>${story.map((line) => `<li>${$(line)}</li>`).join("")}</ul></div>` : `<p class="muted journal-empty">開業了。第一季的小事和決定會從這裡開始。</p>`}
    ${entries.length ? `<ol class="journal-list">${rows}</ol>` : ""}
    ${(run.timeline || []).length > 60 ? `<p class="small">這裡顯示最近 60 則；較早紀錄可在時間線查看。</p>` : ""}
  </section>`;
}

/** 以 modal 集中所有行動；不刪減可用選項。 */
function initiativeModal(run) {
  const list = Sim.initiatives(data, run);
  const items = list.map((it) => `<button class="choice${it.id === "close" ? " warn" : ""}" data-act="initiative" data-id="${$(it.id)}" ${it.disabled ? "disabled" : ""}>
    <b>${$(it.label)}${it.disabled ? " · 現金不足" : ""}</b><span>${$(it.detail)}</span>
    ${it.chance != null ? `<span class="brief"><i class="b-likely">成功 ${Math.round(it.chance * 100)}%</i>${$(it.success)}</span><span class="brief"><i class="b-down">受挫</i>${$(it.setback)}</span>` : ""}
  </button>`).join("");
  return `<div class="initiative-overlay">
    <button class="initiative-backdrop" data-act="close-drawer" aria-label="關閉經營行動"></button>
    <section class="initiative-dialog" role="dialog" aria-modal="true" aria-labelledby="initiative-title" tabindex="-1">
      <header class="initiative-head"><div><p class="fold-k">時間已暫停 · 第 ${run.month} 季</p><h2 id="initiative-title">經營行動</h2><p>選擇一項行動，或關閉後繼續觀察。</p></div><button class="modal-close" data-act="close-drawer" aria-label="關閉經營行動" data-autofocus>✕</button></header>
      <p class="small">成功機率是遊戲內估算，會受配合度、信任和現金影響；實際收入仍受需求及產能限制。</p>
      <div class="initiative-list stack">${items || `<p>目前沒有可執行的行動。</p>`}</div>
    </section>
  </div>`;
}

function outcomeBanner(run) {
  const result = run.lastOutcome;
  if (!result || result.month !== run.month) return "";
  return `<p class="opportunity-result ${result.success ? "success" : "setback"}" role="status"><b>${result.success ? "機會開花" : "這次未如預期"}</b> · ${$(result.text)}</p>`;
}

/** 時間按停的原因。事件不是隨機跳出來的，它要講得出是哪一件事引來的。 */
function pauseNote(run) {
  if (!run) return "";
  if (run.phase === "laststand") return `時間按停。現金付不出這一輪。以日計大約還有 ${run.rescueDays || 0} 天，行動還剩 ${run.rescueLeft || 0} 次。`;
  if (run.phase === "succession") return "時間按停。你不再坐在日常裡，要決定誰接手。";
  if (run.phase === "event") {
    const ev = run.pendingEvent || {};
    const cause = ev.chainCause;
    if (cause) return `時間按停。這件事不是隨機的：它是第 ${cause.causeMonth} 季你選「${cause.choice}」之後，走到這裡的。`;
    if (ev.major) return "時間按停。這是重大事件。第一次發生時，遊戲會等你，不會替你選。";
    return "時間按停。有一件要決定的事。";
  }
  return "";
}

function companyBadge(run) {
  const gap = data.content.gaps.find(g=>g.id===run.gapId);
  const fam = gap ? (data.content.industries.find(i=>i.id===gap.family)?.name || gap.family) : "";
  const title = gap ? (Sim.companyType(data, gap.company_type)?.name || gap.title) : "未定";
  return `<span class="company-badge" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#f4efe4;border:1px solid #d8c9b4;font-size:12px;"><i style="width:8px;height:8px;border-radius:50%;background:#8f2d2d;display:inline-block;"></i>${$(title)}${fam ? " · " + $(fam) : ""} ${gap?.declining ? "<small style='color:#8f2d2d;'>衰退中</small>" : ""}</span>`;
}
function businessStrip(run) {
  const b = P.business(data, run);
  const pay = b.revenueLabel ? `收入方式是${b.revenueLabel}，畫面上會按「${b.pulse}」的頻率跳動。` : "開業之後，進帳會按你選的方式跳動。";
  return `<section class="trade"><p class="kicker">你的企業 ${companyBadge(run)}</p><h2>${$(b.name)}</h2><p>${$(b.does)}</p><p class="muted">${b.companyType ? `企業類型：${$(b.companyType)} · ` : ""}客群：${$(b.buyer)} · 交易單位：${$(b.unit)} · 行業：${$(b.industry)}。${$(pay)}</p></section>`;
}

function speedLabel() {
  const names = { slow: "放慢", immerse: "沉浸", standard: "標準", fast: "快速", blitz: "狂飆" };
  const id = ui.run?.speed || ui.settings.speed || "standard";
  if (!flowOn()) return "時間暫停";
  const sec = data ? paceSeconds(ui.run) : 10;
  return `${names[id] || "標準"} · ${sec} 秒／季`;
}

function feedHtml(run) {
  const items = (run.feed || []).slice(-5).reverse();
  const piled = P.ambientLine(run);
  if (!items.length) {
    return `<section class="feed"><p class="kicker">時間裡的小事</p><p class="muted">季度開始走之後，客人、供應商、家里的人會從這裡經過。這些句子會留下，並改動後面的帳。</p></section>`;
  }
  return `<section class="feed" aria-live="polite" aria-label="時間裡的小事"><p class="kicker">時間裡的小事</p>${items.map((b, i) => {
    const fresh = ui.freshBeat && i === 0 ? "beat-new" : "";
    return `<article class="beat ${fresh}"><p class="when muted">第 ${b.m} 季 · ${$(b.when || "")}</p><p><b>${$(b.subject)}</b> · ${$(b.object)}</p><p>${$(b.text)}</p>${b.note ? `<p class="muted">${$(b.note)}</p>` : ""}</article>`;
  }).join("")}${piled ? `<p class="muted">${$(piled)}</p>` : ""}</section>`;
}

function feedHtmlDash(run) {
  const items = (run.feed || []).slice(-3).reverse();
  if (!items.length) return "";
  return `<section class="dash-card dash-full" aria-live="polite" aria-label="時間裡的小事">
    <h3>📬 時間裡的小事</h3>
    ${items.map((b, i) => {
      const fresh = ui.freshBeat && i === 0 ? "beat-new" : "";
      return `<article class="beat ${fresh}" style="margin-bottom:8px;"><p class="when muted">第 ${b.m} 季 · ${$(b.when || "")}</p><p><b>${$(b.subject)}</b> · ${$(b.object)}</p>${b.note ? `<p class="muted">${$(b.note)}</p>` : ""}</article>`;
    }).join("")}
  </section>`;
}

function sidePanel() {
  const run = ui.run;
  const pts = (run.series || []).slice(-24);
  const max = Math.max(1, ...pts.map((p) => Math.abs(p.cash)));
  const d = pts.map((p, i) => {
    const x = pts.length < 2 ? 0 : (i / (pts.length - 1)) * 260;
    const y = 70 - ((p.cash / max) * 28 + 36);
    return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const lastPt = pts[pts.length - 1];
  const cashStr = lastPt ? P.money(data, run, lastPt.cash) : "—";
  const runway = run.finance?.runway ? Math.round(run.finance.runway) : "—";
  return `<aside class="side">
    <div class="side-card">
      <h3>📈 現金曲線</h3>
      ${pts.length ? `<svg class="spark" viewBox="0 0 260 80" role="img" aria-label="最近現金曲線"><path d="${d}" fill="none" stroke="#e7d7c4" stroke-width="2"/></svg>` : `<p>結算之後這裡會有一條線。</p>`}
      <div style="display:flex; justify-content:space-between; margin-top:8px;">
        <span style="font-size:13px; color:#b8a890;">最新</span>
        <span class="side-value">${cashStr}</span>
      </div>
    </div>
    <div class="side-card">
      <h3>🏪 身邊的同行</h3>
      ${(run.peers || []).map((p) => `<div class="peer"><b>${$(p.name)}</b><br>${$(p.label)} · ${p.alive ? "仍在" : "已退出"}</div>`).join("") || `<p style="font-size:14px; color:#b8a890;">街上還沒有同行。</p>`}
    </div>
    <div class="side-card">
      <h3>📅 跑道</h3>
      <div class="side-value">${typeof runway === "number" ? runway + " 季" : runway}</div>
    </div>
    <p class="muted" style="font-size:12px;">看不見的同行在結局才對照。</p>
  </aside>`;
}

function drawerHtml() {
  const run = ui.run;
  const id = ui.drawer;
  let body = "";
  if (id === "ledger") {
    const rows = (run.factors || []).map(([k, v]) => `<tr><th>${$(k)}</th><td>${$(v)}</td></tr>`).join("");
    body = `<h2>詳細帳簿</h2><p>公司現金 ${$(P.money(data, run, run.finance.cash))} · 公司債務 ${$(P.money(data, run, run.finance.debt))}</p>
      <p>個人現金 ${$(P.money(data, run, run.personal?.cash || 0))} · 個人債務 ${$(P.money(data, run, run.personal?.debt || 0))}。生活費付清並預留一季生活費後，個人盈餘的一半會用來還個人債務，不計入公司支出。</p>
      <p>法律形式：${$(P.legalLabel(data, run))}。這是遊戲規則，不是法律意見。</p>
      <table>${rows || `<tr><td>結算一次之後，這裡會列出收入怎麼來。</td></tr>`}</table>
      ${sparkTable()}`;
  } else if (id === "peers") {
    body = `<h2>身邊的同行與看不見的同行</h2>${run.peers?.length ? run.peers.map((p) => `<p><b>${$(p.name)}</b> ${$(p.label)}<br>${$(p.note)} 壓力 ${Math.round(p.pressure * 100)}。</p>`).join("") : `<p>等你決定企業的樣子，街上才會出現鄰居。</p>`}
      ${(run.far || []).map((f) => `<p><b>${$(f.kind)}</b> ${$(f.name)}<br>${$(f.note)}</p>`).join("")}`;
  } else if (id === "commits") {
    const list = run.commitments || [];
    body = `<h2>承諾</h2>${list.length ? `<ul class="symptoms">${list.map((c) => `<li>${$(c.name)} · 剩 ${c.monthsLeft} 季</li>`).join("")}</ul>` : `<p>你還沒有簽下不能隨便反悔的東西。</p>`}`;
  } else if (id === "time") {
    const items = (run.timeline || []).slice().reverse();
    body = `<h2>時間線</h2><p class="small">按時間保留最多約 180 則紀錄。</p>${items.length ? `<ul class="symptoms">${items.map((t) => `<li>第 ${t.m} 季 · ${$(t.title)}。${$(t.text)}${t.choice ? ` · 你的決定：${$(t.choice)}` : ""}</li>`).join("")}</ul>` : `<p>歷史會從第一個選擇開始，不能改寫。</p>`}
      <button class="alt" data-act="drawer" data-id="analysis">看徵兆怎麼來</button>`;
  } else if (id === "analysis") {
    const sym = P.symptomTexts(data, run);
    body = `<h2>分析</h2><p>主畫面不放條。這裡是句子背後的構成。</p><ul class="symptoms">${sym.map((s) => `<li>${$(s)}</li>`).join("")}</ul>
      <p>配合度 ${Math.round((run.venture?.marketFit || 0) * 100)}。品質 ${Math.round((run.venture?.quality || 0) * 100)}。信任 ${Math.round((run.venture?.trust || 0) * 100)}。</p>
      <p>健康 ${Math.round(run.founder.health * 100)}。意志 ${Math.round(run.founder.will * 100)}。控制權 ${Math.round(run.founder.control * 100)}%。</p>
      <p class="muted">人物會不會答應、市場會不會買單，仍不給假精確機率。</p>`;
  } else if (id === "charts") {
    body = `<h2>五張圖</h2>
      <p class="muted">這些圖不是報表的裝飾。破產之後，你要能從這裡看出是哪一層先壞掉。</p>
      <div class="chart-stack">
        ${Charts.runwayView(data, run, { debt: true })}
        ${Charts.waterfall(data, run)}
        ${Charts.funnel(data, run)}
        ${Charts.bottleneck(data, run)}
        ${Charts.decisionLine(data, run)}
      </div>`;
  } else if (id === "crew") {
    const list = Story.crewRoster(data, run);
    body = `<h2>團隊</h2>
      ${list.length ? `<ul class="crew-list">${list.map((m) => `<li class="crew-row ${m.gone ? "gone" : ""}">
          <span class="crew-face" aria-hidden="true">${$(m.name.slice(0, 1))}</span>
          <div class="crew-main">
            <b>${$(m.name)}</b><span class="crew-role">${$(m.role)} · ${m.age} 歲 · ${$(m.traitLabel)}</span>
            <p class="small">${$(m.traitNote || "")}</p>
            <p class="small">${$(m.line)}</p>
            ${m.need ? `<p class="small crew-need">他需要的是：${$(m.need)}</p>` : ""}
            <div class="crew-bars">
              <span class="bar" data-k="壓力" style="--v:${m.stressPct}%"><i></i></span>
              <span class="bar" data-k="忠誠" style="--v:${m.loyaltyPct}%"><i></i></span>
              <span class="bar" data-k="能力" style="--v:${m.skillPct}%"><i></i></span>
            </div>
            <p class="small">${$(m.state)} · 做了 ${m.tenure} 季 · 加班 ${m.overtimeDays} 天 · 加薪 ${m.raises} 次${m.promoted ? " · 已經能替你做決定" : ""}</p>
          </div>
        </li>`).join("")}</ul>` : `<p>還沒有請人。所有的事都是你一個人做。</p>`}
      <p class="muted">${$(Story.marksLine(data, run))}</p>`;
  }
  return `<section class="drawer" role="dialog" aria-label="細節"><button class="ghost" data-act="close-drawer">收起</button>${body}</section>`;
}

function sparkTable() {
  const rows = (ui.run.series || []).slice(-12);
  if (!rows.length) return `<p>曲線會在結算後出現。沒有季度時，這裡是空的。</p>`;
  const max = Math.max(...rows.map((r) => r.cash), 0.01);
  const min = Math.min(...rows.map((r) => r.cash), 0);
  const w = 280, h = 80;
  const d = rows.map((r, i) => {
    const x = (i / Math.max(1, rows.length - 1)) * w;
    const y = h - ((r.cash - min) / (max - min || 1)) * (h - 8) - 4;
    return `${i ? "L" : "M"}${x},${y}`;
  }).join(" ");
  return `<div class="chartwrap"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="現金曲線"><path d="${d}" fill="none" stroke="#8f2d2d" stroke-width="2"/></svg>
    <table><caption class="sr">近期公司現金收支</caption><thead><tr><th>季</th><th>期末現金</th><th>入帳</th><th>流出</th></tr></thead><tbody>
    ${rows.map((r) => {
      const collected = r.collected ?? (r.m === ui.run.last?.month ? ui.run.last.collected : null);
      const cashOut = r.cashOut ?? r.cost;
      return `<tr><td>${r.m}</td><td>${$(P.money(data, ui.run, r.cash))}</td><td>${collected == null ? "未記錄" : $(P.money(data, ui.run, collected))}</td><td>${$(P.money(data, ui.run, cashOut))}</td></tr>`;
    }).join("")}
    </tbody></table></div>`;
}

function eventView() {
  const run = ui.run;
  const ev = run.pendingEvent;
  const cause = ev.chainCause;
  const firstAvailable = ev.choices.findIndex((c) => !Sim.eventChoiceDisabled(data, run, c));
  const choices = ev.choices.map((c, i) => {
    const b = Story.choiceBrief(data, run, ev, c);
    const disabled = Sim.eventChoiceDisabled(data, run, c);
    return `<button class="choice ${c.effects?.force_ending ? "warn" : ""}" data-act="choice" data-id="${$(c.id)}" ${i === firstAvailable ? "data-autofocus" : ""} ${disabled ? "disabled" : ""}>
      <b><span class="mark">${i + 1}</span>${$(c.label)}${disabled ? " · 現金不足" : ""}</b>
      <span>${$(c.detail)}</span>
      ${c.outcome ? `<span class="brief"><i class="b-likely">成功 ${Math.round(Sim.boldChance(data, run, c.outcome.base_chance) * 100)}%</i>${$(c.outcome.success.text)}</span><span class="brief"><i class="b-down">受挫</i>${$(c.outcome.setback.text)}</span>` : ""}
      <span class="brief"><i class="b-likely">最可能</i>${$(b.likely)}</span>
      <span class="brief"><i class="b-down">最壞</i>${$(b.downside)}</span>
      <span class="brief"><i class="b-who">影響</i>${$(b.affects)}</span>
    </button>`;
  }).join("");
  const who = ev.subject && ev.object ? `<div class="who"><span>誰</span><b>${$(ev.subject)}</b><span>什麼事</span><b>${$(ev.object)}</b></div>` : "";
  const banner = cause
    ? `<p class="chain-banner">這不是隨機事件。第 ${cause.causeMonth} 季你選了「${$(cause.choice)}」（${$(cause.event)}），它走到今天。</p>`
    : ev.major && !ui.seenMajor
      ? `<p class="chain-banner first">第一次出大事，時間會按停，遊戲不會替你選。</p>`
      : "";
  return sheet(`${businessStrip(run)}<p class="kicker">要決定 · 第 ${run.month} 季 · 時間按停</p>${banner}<h2>${$(ev.title)}</h2>
    ${who}
    ${ev.omen ? `<p class="muted">事前的徵兆：${$(ev.omen)}</p>` : ""}
    <p>${$(ev.body)}</p><div class="stack">${choices}</div>
    <p class="small">確定的合約成本會照付；有標示機率的結果由本局種子決定，並受配合度、信任和現金影響。這是遊戲機率，不是現實成功率。</p>`);
}

function lastView() {
  const run = ui.run;
  const opts = Sim.rescueOptions(data, run);
  return sheet(`${businessStrip(run)}<p class="kicker">最後階段</p><h2>現金不夠付這一輪</h2>
    ${outcomeBanner(run)}
    <p>帳上 ${$(P.money(data, run, run.finance.cash))}。以日計，這個模式大約還有 ${run.rescueDays} 天的緩衝，行動還剩 ${run.rescueLeft} 次。</p>
    <p>短期周轉只是爭取時間；長期重整才有機會改善每季的收支。重整不能憑空填補眼前欠款，選錯仍可能倒閉。</p>
    <div class="stack">${opts.map((o) => `<button class="choice ${o.id === "close" ? "warn" : ""}" data-act="rescue" data-id="${o.id}">
        <b>${$(o.label)}</b><span>${$(o.detail)}</span>
        ${o.likely ? `<span class="brief"><i class="b-likely">最可能</i>${$(o.likely)}</span>` : ""}
        ${o.downside ? `<span class="brief"><i class="b-down">最壞</i>${$(o.downside)}</span>` : ""}
        ${o.affects ? `<span class="brief"><i class="b-who">影響</i>${$(o.affects)}</span>` : ""}
      </button>`).join("")}</div>`);
}

function successionView() {
  const opts = Sim.successorOptions(data, ui.run);
  return sheet(`<p class="kicker">接班</p><h2>創辦人不再坐在日常裡</h2>
    <p>同一個人不會不合理地經營一百年。你之後以企業守護者的身分看這間公司。</p>
    <div class="stack">${opts.map((o, i) => `<button class="choice" data-act="successor" data-id="${o.id}" ${i === 0 ? "data-autofocus" : ""}><b>${$(o.label)}</b><span>${$(o.detail)}</span></button>`).join("")}</div>`);
}

function chapterView() {
  const run = ui.run;
  const mem = run.memories[run.memories.length - 1];
  const big = (run.commitments || [])[0];
  const life = Story.evaluateLife(data, run);
  return sheet(`${businessStrip(run)}<p class="kicker">第 ${run.chapter} 章</p><h2>${$(P.whenLabel(run))}</h2>
    ${Stage.stageHtml(data, run)}
    <p class="chapter-story">${$(mem ? `${mem.name}。${mem.blurb}` : "這一章沒有新的物件。")}</p>
    <p>現金 ${$(P.money(data, run, run.finance.cash))}。這一章最大的承諾：${big ? $(big.name) : "沒有新的鎖。"}</p>
    <p class="muted">到現在為止，這一局是「${$(life.title)}」的走法：${$(life.cause)}</p>
    <div class="chart-stack">${Charts.decisionLine(data, run)}${Charts.runwayView(data, run, { debt: true })}</div>
    <p class="muted">${$(run.role)}仍在。合上帳簿不會刪掉公司，只是這一局先停。</p>
    <button class="go" data-act="chapter-go" data-autofocus>繼續經營</button>
    ${run.month >= 12 ? `<button class="alt" data-act="close-book">合上這一本</button>` : ""}
    <button class="ghost" data-act="pause">先存起來</button>`);
}

function summaryView() {
  const run = ui.run;
  const s = run.summary || { lines: [], from: 0, to: 0 };
  return sheet(`<p class="kicker">摘要 · 第 ${s.from} 季到第 ${s.to} 季</p><h2>這段時間發生的事</h2>
    <ol class="story-lines">${(s.lines || []).map((l) => `<li><span class="story-when">第 ${l.m} 季</span>${$(l.line)}</li>`).join("") || "<li>這段時間沒有句子。</li>"}</ol>
    <p>現金現在是 ${$(P.money(data, run, run.finance.cash))}。</p>
    ${Charts.waterfall(data, run)}
    <button class="go" data-act="ack-summary" data-autofocus>看下一件要決定的事</button>`);
}

function closeView() {
  return sheet(`<p class="kicker">結業</p><h2>要怎樣結束</h2>
    <button class="choice" data-act="do-close" data-how="back"><b>還不結束</b><span>回到這季。</span></button>
    <button class="choice" data-act="do-close" data-how="shrink"><b>縮小到還做得動</b><span>公司繼續，尺寸變小。</span></button>
    <button class="choice" data-act="do-close" data-how="craft"><b>把方法交給下一個人再結束</b><span>若現金還允許，這可以是手藝移交。</span></button>
    <button class="choice warn" data-act="do-close" data-how="voluntary" data-autofocus><b>正式結業</b><span>付得起離職與帳，就是主動結業。付不起，就是清算。</span></button>`);
}

function endingView() {
  const run = ui.run;
  const end = P.endingView(data, run);
  const life = Story.evaluateLife(data, run);
  const m = Story.memorial(data, run, life);
  const obit = Story.obituary(data, run, m);
  const scores = Story.SCORE_LABELS.map(([k, label]) => `<li><span>${$(label)}</span><span class="score-bar" style="--v:${Math.round(life.scores[k] * 100)}%"><i></i></span><b>${Math.round(life.scores[k] * 100)}</b></li>`).join("");
  return sheet(`<div class="stage-wrap closing" aria-label="結業">
      ${Stage.stageHtml(data, run)}
      <p class="closing-line">燈是一盞一盞關的。招牌還在，裡面已經沒有東西了。</p>
    </div>
    <p class="kicker">${$(end.stamp)} · ${$(m.years)}</p>
    <h1>${$(m.name)}</h1>
    <p class="sub">${$(life.title)}</p>
    <p class="epitaph">${$(m.epitaph)}</p>
    <section class="obituary" aria-label="創業訃告">
      ${obit.map((line) => `<p>${$(line)}</p>`).join("")}
    </section>
    <section class="card-stats" aria-label="這一局的數字">
      <div><span>撐了</span><b>${$(m.life)}</b></div>
      <div><span>服務過</span><b>${$(m.customers.toLocaleString("zh-Hant"))} 人</b></div>
      <div><span>最多時</span><b>${m.peakCrew} 個人</b></div>
      <div><span>累計營業額</span><b>${$(P.money(data, run, m.revenueTotal))}</b></div>
      <div><span>虧損季數</span><b>${m.lossMonths} 季</b></div>
      <div><span>據點</span><b>${m.branches} 個</b></div>
    </section>
    <p class="percentile">以同樣的開局條件看，你走得比 <b>${m.percentile}%</b> 的創業者久、或走得比他們清楚。這是遊戲內分布，不是現實統計。</p>
    <p>${$(P.rarityLine(end.prior))}。若按這套規則長期來看，這種結局大約每一千局有 ${end.prior} 局。</p>
    <hr class="cardline">
    <section class="scores" aria-label="八個軸"><p class="fold-k">這一局在八個軸上的位置</p><ul>${scores}</ul></section>
    <section class="marks-line"><p class="fold-k">你是怎麼經營的</p><p>${$(Story.marksLine(data, run))}</p></section>
    <p>${$(end.fact)}</p>
    <p>${$(end.cost)}</p>
    <p>留下：${end.featured ? $(end.featured.name) : "一本合上的帳簿"}。</p>
    ${end.memories.length > 5 ? `<p>選五件放進紀念館。</p><div class="memories">${end.memories.map((mm) => `<button class="alt" data-act="mem" data-id="${$(mm.id)}" aria-pressed="${ui.picked?.includes(mm.id) ? "true" : "false"}">${$(mm.name)}</button>`).join("")}</div>` : ""}
    <div class="chart-stack">${Charts.waterfall(data, run)}${Charts.decisionLine(data, run)}</div>
    <button class="go" data-act="share" data-autofocus>做成一張可以分享的紀念卡</button>
    <p class="muted">${$(ui.shareNote)}</p>
    <button class="alt" data-act="to-diagnosis">看診斷：為什麼是這個結果</button>
    <button class="alt" data-act="archive-this">放入紀念館</button>
    <button class="ghost" data-act="again">再一局</button>
    <canvas id="card" hidden></canvas>`);
}

function shopSvg(digital, century, closed) {
  if (digital) {
    return `<svg viewBox="0 0 360 140"><rect x="40" y="24" width="280" height="96" rx="8" fill="#1c1612"/><text x="58" y="78" fill="#f4efe4" font-size="18">${century ? "仍在編譯" : closed ? "程序已停止" : "終端還亮著"}</text></svg>`;
  }
  return `<svg viewBox="0 0 360 140"><rect x="70" y="48" width="220" height="72" fill="#1c1612"/><polygon points="60,48 180,16 300,48" fill="#8f2d2d"/><rect x="158" y="78" width="44" height="42" fill="${closed ? "#1c1612" : "#f4efe4"}" stroke="#f4efe4"/>${century ? `<text x="180" y="42" text-anchor="middle" fill="#f4efe4" font-size="12">一百年</text>` : ""}</svg>`;
}

function diagnosisView() {
  const run = ui.run;
  const end = P.endingView(data, run);
  const life = Story.evaluateLife(data, run);
  const cf = run.counterfactual;
  const peers = (run.peers || []).map((p) => `${p.name}（${p.label}）${p.alive ? "還在" : "已不在"}`).join("。");
  return sheet(`<p class="kicker">診斷</p><h2>若重來，節點在選擇裡</h2>
    <p class="diagnosis-cause">死因／成就：<b>${$(life.title)}</b>。${$(life.cause)}</p>
    <div class="chart-stack">
      ${Charts.runwayView(data, run, { debt: true })}
      ${Charts.waterfall(data, run)}
      ${Charts.funnel(data, run)}
      ${Charts.bottleneck(data, run)}
      ${Charts.decisionLine(data, run)}
    </div>
    <p>推著它的：${end.pos.length ? $(end.pos.join("、")) : "開局條件本身"}。</p>
    <p>消耗它的：${end.neg.length ? $(end.neg.join("、")) : "時間與固定的帳"}。</p>
    <p>身邊的同行：${$(peers || "沒有形成。")}</p>
    <p>看不見的同行：${(run.far || []).map((f) => `${$(f.kind)} ${$(f.name)}`).join("。") || "沒有。"}</p>
    <p>${cf ? `若第一個重大選擇改成「${$(cf.choice)}」，那間公司可能走到第 ${cf.months} 季，結局傾向「${$(cf.ending)}」。這是可能，不是保證。` : "這局還沒有足夠的分岔可以對照。"}</p>
    <p>種子 ${$(run.seed)}。在沙盒輸入同一種子且不改條件，世界會重現。選擇仍由你決定。</p>
    <p class="muted">${$(data.narrative.disclaimer)}</p>
    <button class="go" data-act="back-ending" data-autofocus>回到結局</button>`);
}

function archiveView() {
  const list = read(KEY.archive, []);
  if (ui.archiveId) {
    const item = list.find((a) => a.id === ui.archiveId);
    if (!item) return sheet(`<p>這一頁已經不在。</p><button class="go" data-act="archive">返回</button>`);
    const comments = (item.comments || []).filter((c) => !c.hidden);
    return sheet(`<p class="kicker">檔案</p><h2>${$(item.name)}</h2><p>${$(item.fact)}</p><p>${$(item.cost)}</p>
      <p class="muted">${item.official ? "正式紀錄" : "沙盒，不計入正式統計"} · 種子 ${$(item.seed)}</p>
      <h3>留言</h3>
      ${comments.length ? comments.map((c, i) => `<p>${$(c.role)}：${$(c.text)} <button data-act="report" data-i="${i}">隱藏</button></p>`).join("") : `<p>還沒有留言。</p>`}
      <div class="stack">${data.narrative.comments.map((c) => `<button class="alt" data-act="comment" data-role="${$(c.role)}" data-text="${$(c.text)}">以${$(c.role)}的身份留一句</button>`).join("")}</div>
      <p class="small">自由長文需要登入與審核，這一版只提供系統短句。一小時最多三則。</p>
      <button class="ghost" data-act="delete-archive">刪除這一頁</button>
      <button class="go" data-act="archive">返回列表</button>`);
  }
  if (!list.length) {
    return sheet(`<p class="kicker">紀念館</p><h2>還沒有企業</h2><p>完成一局之後，你可以決定要不要把這間店留下。預設匿名。</p><button class="go" data-act="title" data-autofocus>回到封面</button>`);
  }
  return sheet(`<p class="kicker">紀念館</p><h2>留下的店</h2><div class="stack">${list.map((a) => `<button class="choice" data-act="open-archive" data-id="${$(a.id)}"><b>${$(a.name)}</b><span>${$(a.city)} · ${$(a.ending)} · ${$(a.life)}</span></button>`).join("")}</div><button class="ghost" data-act="title">回到封面</button>`);
}

app.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-act]");
  if (!el || !app.contains(el)) return;
  act(el.dataset.act, el.dataset);
});

document.addEventListener("visibilitychange", () => {
  if (!ui.auto) return;
  if (document.hidden) {
    if (!ui.auto.pausedAt) ui.auto.pausedAt = performance.now();
    stopAutoPaint();
    return;
  }
  armAuto();
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && ui.drawer) { ev.preventDefault(); closeDrawer(); return; }
  if (ev.key === "Tab" && ui.drawer === "initiative") {
    const dialog = app.querySelector(".initiative-dialog");
    const focusable = [...(dialog?.querySelectorAll("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])") || [])];
    if (!focusable.length) { ev.preventDefault(); dialog?.focus(); return; }
    const i = focusable.indexOf(document.activeElement);
    if (ev.shiftKey && i <= 0) { ev.preventDefault(); focusable.at(-1).focus(); }
    else if (!ev.shiftKey && (i < 0 || i === focusable.length - 1)) { ev.preventDefault(); focusable[0].focus(); }
    return;
  }
  const n = Number(ev.key);
  if (n >= 1 && n <= 4 && ui.run?.phase === "event") {
    const choice = ui.run.pendingEvent?.choices[n - 1];
    if (choice) { ev.preventDefault(); act("choice", { id: choice.id }); }
  }
  if (ev.key === "Enter" && ui.run?.phase === "play" && ui.screen === "play" && document.activeElement?.dataset?.act !== "settle") {
    const go = app.querySelector("[data-act='settle']");
    if (go && document.activeElement === document.body) act("settle");
  }
});

function modalTransition(update) {
  // 不支援 View Transition 或要求減少動效時，仍立即切換；CSS 有入場 fallback。
  if (!ui.settings.still && !matchMedia("(prefers-reduced-motion: reduce)").matches && document.startViewTransition) {
    document.startViewTransition(update);
  } else update();
}
function closeDrawer() {
  const wasInitiative = ui.drawer === "initiative";
  const update = () => {
    ui.drawer = null;
    render();
    if (wasInitiative) app.querySelector('[data-act="initiative-open"]')?.focus();
  };
  if (wasInitiative) modalTransition(update); else update();
}

function act(name, ds = {}) {
  if (!autoCommit) cancelAuto();
  const run = ui.run;
  if (name === "reload") return location.reload();
  if (name === "title") { ui.screen = "title"; ui.drawer = null; return render(); }
  if (name === "about") { ui.screen = "about"; return render(); }
  if (name === "settings") { ui.screen = "settings"; return render(); }
  if (name === "to-mode") { ui.screen = "mode"; return render(); }
  if (name === "archive") { ui.screen = "archive"; ui.archiveId = null; return render(); }
  if (name === "set-speed") { ui.settings.speed = ds.id; if (run) run.speed = ds.id; persistSettings(); if (run) saveRun(); return render(); }
  if (name === "toggle") {
    ui.settings[ds.key] = !ui.settings[ds.key];
    if (ds.key === "still") document.documentElement.classList.toggle("still", ui.settings.still);
    if (ds.key === "smart" && run) run.smart = ui.settings.smart;
    if (ds.key === "autoplay" && run) run.autoplay = !!ui.settings.autoplay;
    persistSettings();
    return render();
  }
  if (name === "pick-mode") {
    ui.mode = ds.id;
    return beginRun();
  }
  if (name === "to-sandbox") { ui.screen = "sandbox"; return render(); }
  if (name === "start-sandbox") return startSandbox();
  if (name === "accept") {
    Sim.acknowledgeReveal(run);
    Sim.acceptOpportunity(run);
    ui.screen = "shaping";
    saveRun();
    return render();
  }
  if (name === "reject") {
    Sim.acknowledgeReveal(run);
    const res = Sim.rejectOpportunity(data, run);
    if (!res.ok) { say(res.reason); return; }
    ui.screen = "rejected"; saveRun(); return render();
  }
  if (name === "after-reject") { Sim.finishReject(run); ui.screen = "opening"; saveRun(); return render(); }
  if (name === "job") { Sim.returnToJob(data, run); ui.screen = "ending"; finishWorld(); saveRun(); return render(); }
  if (name === "shape-pick") {
    const first = !run.shape[ds.key];
    const step = SHAPE_STEPS[Math.min(run.shapeStep || 0, SHAPE_STEPS.length - 1)];
    const group = step.groups[0];
    Sim.setShape(run, ds.key, ds.value);
    const label = data.economy[group[1]]?.[ds.value]?.label || ds.value;
    // 一頁只問一件事：第一次回答就換到下一題；回頭改答案則留在這一頁。
    if (first && (run.shapeStep || 0) < SHAPE_STEPS.length - 1) run.shapeStep = (run.shapeStep || 0) + 1;
    saveRun();
    say(first ? `已選「${label}」。` : `改成「${label}」。`);
    return render();
  }
  if (name === "shape-next") {
    const step = SHAPE_STEPS[Math.min(run.shapeStep || 0, SHAPE_STEPS.length - 1)];
    if (step.groups.some(([k]) => !run.shape[k])) { say("這一頁還有一個問題沒有回答。"); return; }
    if ((run.shapeStep || 0) < SHAPE_STEPS.length - 1) {
      run.shapeStep = (run.shapeStep || 0) + 1;
      saveRun();
      return render();
    }
    const res = Sim.confirmShape(data, run);
    if (!res.ok) { say(res.reason); return; }
    ui.draftName = "";
    ui.screen = "naming";
    saveRun();
    return render();
  }
  if (name === "shape-back") {
    if (ui.screen === "naming") { if (!Sim.undoShape(run)) run.phase = "shaping"; run.shapeStep = Math.max(0, SHAPE_STEPS.length - 1); ui.screen = "shaping"; return render(); }
    run.shapeStep = Math.max(0, (run.shapeStep || 0) - 1);
    return render();
  }
  if (name === "pick-name") { ui.draftName = ds.name; return render(); }
  if (name === "open") {
    const input = document.querySelector("#custom-name");
    const typed = input?.value?.trim();
    const finalName = typed || ui.draftName || Sim.nameOptions(run, data)[0];
    if (!finalName) { say("請先給公司一個名字。"); return; }
    Sim.confirmName(run, finalName);
    run.speed = ui.settings.speed; run.smart = ui.settings.smart;
    ui.screen = "play"; saveRun(); say(`${run.venture.name}開業。`);
    return render();
  }
  if (name === "settle") { ui.clock = null; return doSettle(false); }
  if (name === "month-end") { ui.clock = null; ui.preview = null; return doSettle(false); }
  if (name === "pace") {
    const m = [1, 3, 10].includes(Number(ds.mult)) ? Number(ds.mult) : 1;
    if (run) run.paceMult = m;
    ui.settings.paceMult = m;
    persistSettings();
    ui.clock = null;
    saveRun();
    return render();
  }
  if (name === "choice") {
    if (run.pendingEvent?.major) ui.seenMajor = true;
    const result = Sim.chooseEvent(data, run, ds.id);
    ui.quiet = 0;
    afterStep();
    if (result.message) say(result.message);
    return;
  }
  if (name === "rescue") {
    Sim.chooseRescue(data, run, ds.id);
    afterStep();
    if (run.lastOutcome?.month === run.month) say(run.lastOutcome.text);
    return;
  }
  if (name === "successor") { Sim.chooseSuccessor(data, run, ds.id); afterStep(); return; }
  if (name === "chapter-go") { Sim.continueChapter(run); ui.screen = "play"; saveRun(); return render(); }
  if (name === "ack-summary") { Sim.ackSummary(run); ui.screen = "play"; saveRun(); return render(); }
  if (name === "skip") { ui.clock = null; ui.preview = null; Sim.skipToEvent(data, run); ui.quiet = 0; ui.screen = "play"; saveRun(); return render(); }
  if (name === "drawer") { ui.drawer = ds.id; if (ds.id === "ledger") log(run, "ledger_open"); return render(); }
  if (name === "close-drawer") return closeDrawer();
  if (name === "initiative-open") return modalTransition(() => { ui.drawer = "initiative"; render(); });
  if (name === "initiative") {
    const result = Sim.actInitiative(data, run, ds.id);
    if (!result.ok) { say("這項行動現在不能執行。"); return; }
    ui.preview = null; // 行動改變財務或營運，舊的本季預演不能再使用。
    return modalTransition(() => {
      ui.drawer = null;
      afterStep();
      if (result.message) say(result.message);
      if (run.phase === "play") app.querySelector('[data-act="initiative-open"]')?.focus();
    });
  }
  if (name === "do-close") { Sim.confirmClose(data, run, ds.how); afterStep(); return; }
  if (name === "close-book") { Sim.closeBook(data, run); ui.screen = "ending"; finishWorld(); saveRun(); return render(); }
  if (name === "pause") { saveRun(); ui.screen = "title"; say("這一章已留下。"); return render(); }
  if (name === "continue") { ui.run = ui.saved; ui.screen = ui.saved.venture ? "play" : screenFor(ui.saved); return render(); }
  if (name === "drop-save") { localStorage.removeItem(KEY.run); ui.saved = null; ui.corrupt = false; ui.screen = "title"; return render(); }
  if (name === "speed-slower" || name === "speed-faster" || name === "cycle-speed") {
    const order = ["slow", "immerse", "standard", "fast", "blitz"];
    const i = Math.max(0, order.indexOf(run.speed || ui.settings.speed || "standard"));
    const next = name === "speed-slower" ? Math.max(0, i - 1) : name === "speed-faster" ? Math.min(order.length - 1, i + 1) : (i + 1) % order.length;
    run.speed = order[next];
    ui.settings.speed = run.speed;
    persistSettings(); log(run, "speed_change"); saveRun(); return render();
  }
  if (name === "flow-toggle") {
    ui.settings.flow = ui.settings.flow === false;
    ui.settings.flowVersion = 2;
    persistSettings();
    return render();
  }
  if (name === "auto-toggle") {
    ui.settings.autoplay = !ui.settings.autoplay;
    if (run) run.autoplay = !!ui.settings.autoplay;
    persistSettings();
    return render();
  }
  if (name === "share") return share();
  if (name === "to-diagnosis") { ui.screen = "diagnosis"; log(run, "ending_share"); return render(); }
  if (name === "back-ending") { ui.screen = "ending"; return render(); }
  if (name === "mem") {
    ui.picked = ui.picked || [];
    if (ui.picked.includes(ds.id)) ui.picked = ui.picked.filter((x) => x !== ds.id);
    else if (ui.picked.length < 5) ui.picked.push(ds.id);
    return render();
  }
  if (name === "archive-this") return archiveThis();
  if (name === "again") { ui.run = null; ui.screen = "mode"; return render(); }
  if (name === "open-archive") { ui.archiveId = ds.id; return render(); }
  if (name === "comment") return addComment(ds.role, ds.text);
  if (name === "report") return hideComment(Number(ds.i));
  if (name === "delete-archive") return deleteArchive();
}

function screenFor(run) {
  if (run.phase === "reveal" || run.phase === "opportunity") return "opening";
  if (run.phase === "rejected") return "rejected";
  if (run.phase === "shaping") return "shaping";
  if (run.phase === "naming") return "naming";
  if (run.phase === "ending") return "ending";
  return "play";
}

function beginRun() {
  const recent = read(KEY.recent, { cities: [], families: [], gaps: [] });
  for (const key of ["cities", "families", "gaps"]) if (!Array.isArray(recent[key])) recent[key] = [];
  let seed = String(Math.floor(Math.random() * 1e9));
  if (ui.mode === "daily") {
    const d = new Date();
    seed = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}:${data.economy.meta.content_version}`;
  }
  if (ui.mode === "sandbox" && ui.sandbox) seed = ui.sandbox.seed || seed;
  const run = Sim.createRun(data, {
    mode: ui.mode,
    seed,
    history: ui.mode === "daily" || ui.mode === "sandbox" ? { cities: [], families: [], gaps: [] } : recent,
    sandbox: ui.mode === "sandbox" ? ui.sandbox : null,
    year: new Date().getFullYear(),
  });
  const eco = read(KEY.eco, {});
  if (eco[run.cityId]?.[0]) run.ecosystemHint = eco[run.cityId][0];
  recent.cities = [run.cityId, ...recent.cities.filter((c) => c !== run.cityId)].slice(0, 3);
  const gap = data.content.gaps.find((g) => g.id === run.gapId);
  recent.gaps = [run.gapId, ...recent.gaps.filter((g) => g !== run.gapId)].slice(0, 3);
  recent.families = [gap.family, ...recent.families.filter((f) => f !== gap.family)].slice(0, 3);
  write(KEY.recent, recent);
  run.speed = ui.settings.speed;
  run.smart = ui.settings.smart;
  run.autoplay = !!ui.settings.autoplay;
  ui.run = run;
  ui.draftName = "";
  ui.screen = "opening";
  ui.picked = [];
  saveRun();
  render();
}

function startSandbox() {
  const seed = document.querySelector("#sb-seed")?.value?.trim();
  if (seed && !/^[\w\-:.]+$/.test(seed)) {
    const el = document.querySelector("#sb-error");
    if (el) el.textContent = "這組種子無法還原成世界。請用數字或簡單文字。";
    return;
  }
  const age = document.querySelector("#sb-age")?.value;
  const assets = document.querySelector("#sb-assets")?.value;
  ui.sandbox = {
    seed: seed || String(Date.now() % 1e9),
    city: document.querySelector("#sb-city")?.value || null,
    gap: document.querySelector("#sb-gap")?.value || null,
    age: age ? clampAge(age) : null,
    assets: assets === "" ? null : Number(assets),
  };
  if (age && ui.sandbox.age == null) {
    document.querySelector("#sb-error").textContent = "年齡請落在 22 到 58。";
    return;
  }
  ui.mode = "sandbox";
  beginRun();
}
function clampAge(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 22 || n > 58) return null;
  return Math.round(n);
}

function doSettle(auto = false) {
  const run = ui.run;
  if (!run || run.phase !== "play") return;
  const before = run.month;
  ui.clock = null;
  ui.preview = null;
  Sim.settle(data, run);
  if (run.phase === "play") ui.quiet += 1; else ui.quiet = 0;
  ui.tickAuto = !!auto;
  ui.freshBeat = !!(run.lastBeats || []).length;
  const beat = run.lastBeats?.[run.lastBeats.length - 1];
  say(beat?.text || run.last?.line || "這季過去了。");
  if (before === run.month && run.phase === "play") say("這季沒有推進。");
  afterStep();
}

function afterStep() {
  const run = ui.run;
  if (!run) return;
  if (run.phase === "ending") { ui.screen = "ending"; finishWorld(); }
  else ui.screen = "play";
  saveRun();
  render();
}

function finishWorld() {
  const run = ui.run;
  if (!run?.cityId || run._remembered) return;
  run._remembered = true;
  const eco = read(KEY.eco, {});
  const type = run.flags?.compliance_risk ? "scandal" : run.shape?.venue === "street" ? "vacant" : run.shape?.venue === "factory" ? "equipment" : (run.team?.headcount || 0) > 2 ? "people" : run.coreKept ? "memory" : "brand";
  eco[run.cityId] = [{ name: run.venture?.name, ending: run.ending?.id, type, at: Date.now() }, ...(eco[run.cityId] || [])].slice(0, 8);
  write(KEY.eco, eco);
}

function saveRun() {
  if (!ui.run) return;
  if (ui.run.mode === "story") {
    const recent = read(KEY.recent, {});
    const addRecent = (list, ids, max) => {
      const result = Array.isArray(list) ? list.slice() : [];
      for (const id of ids) {
        if (!id) continue;
        const i = result.indexOf(id);
        if (i >= 0) result.splice(i, 1);
        result.unshift(id);
      }
      return result.slice(0, max);
    };
    // 只寫尚未記錄過的事件；重新 render 或讀檔不改變排序。
    const choiceN = ui.run.recentChoiceN || 0;
    const beatN = ui.run.recentBeatSerial || 0;
    const choices = (ui.run.choices || []).slice(choiceN);
    const beats = (ui.run.feed || []).filter((b) => (b.serial || 0) > beatN);
    recent.events = addRecent(recent.events, choices.map((c) => c.event), 30);
    recent.beats = addRecent(recent.beats, beats.map((b) => b.id), 30);
    ui.run.recentChoiceN = (ui.run.choices || []).length;
    ui.run.recentBeatSerial = ui.run.beatSerial || beatN;
    write(KEY.recent, recent);
  }
  const ok = write(KEY.run, ui.run);
  if (!ok) say("這台裝置寫不進存檔。這一局仍可繼續，但重新整理會消失。");
  ui.saved = ui.run;
}
function persistSettings() { write(KEY.settings, ui.settings); }
function log(run, name) { if (run) run.analytics = [...(run.analytics || []), { e: name, m: run.month }]; }

let timer = 0;
let raf = 0;
let autoRaf = 0;
let autoCommit = false;
const AUTO_MS = 3000;

function flowOn() {
  return ui.settings.flow !== false;
}

function stopFlow() {
  clearTimeout(timer);
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

function monthPreview(run) {
  const key = `${run.month}:${run.rngState}`;
  if (ui.preview?.key === key) return ui.preview;
  let raw = null;
  try { raw = Sim.previewMonth(data, run); } catch { raw = null; }
  if (!raw) return null;
  const biz = P.business(data, run);
  const beats = (raw.beats || []).map((beat, i, arr) => ({
    ...beat,
    at: arr.length === 1 ? 0.42 : 0.28 + (0.46 * i) / Math.max(1, arr.length - 1),
  }));
  ui.preview = {
    key,
    ...raw,
    beats,
    pulses: cashflowPulses(run.finance.cash, raw.cash, raw, biz),
    startCash: run.finance.cash,
  };
  return ui.preview;
}

function paintPassage(run, preview, t) {
  const marker = document.querySelector("#pass-marker");
  const day = document.querySelector("#pass-day");
  const cashEl = document.querySelector("#kpi-cash");
  const pulseEl = document.querySelector("#pass-pulse");
  const live = document.querySelector("#live-feed");
  if (!marker || !day || !preview) return;
  const biz = P.business(data, run);
  const dayN = Math.min(90, Math.max(1, Math.floor(Math.min(t, 0.999) * 90) + 1));
  marker.style.left = `${Math.min(100, t * 100)}%`;
  day.textContent = `第 ${dayN} 日 / 90 · ${biz.name} · 走向${preview.when}`;
  let shown = preview.startCash;
  let received = 0;
  let paid = 0;
  let last = null;
  let n = 0;
  for (const p of preview.pulses) {
    if (p.at <= t + 0.0001) {
      shown += p.amount;
      if (p.amount > 0) received += p.amount;
      else paid -= p.amount;
      last = p;
      n += 1;
    }
  }
  const fresh = !!(ui.clock && last && n !== ui.clock.pulseN);
  if (cashEl) {
    cashEl.textContent = P.money(data, run, shown);
    cashEl.classList.toggle("tick-up", !!(last && last.amount > 0));
    cashEl.classList.toggle("tick-down", !!(last && last.amount < 0));
  }
  if (pulseEl && fresh) {
    ui.clock.pulseN = n;
    const sign = last.amount >= 0 ? "入帳" : "支出";
    pulseEl.textContent = `${sign} ${P.money(data, run, last.amount)} · ${last.label}`;
    pulseEl.classList.remove("pulse-pop");
    void pulseEl.offsetWidth;
    pulseEl.classList.add("pulse-pop");
  }
  const cashflowIn = document.querySelector("#cashflow-live-in");
  const cashflowOut = document.querySelector("#cashflow-live-out");
  if (cashflowIn) {
    const text = P.money(data, run, received);
    if (cashflowIn.textContent !== text) cashflowIn.textContent = text;
  }
  if (cashflowOut) {
    const text = P.money(data, run, -paid);
    if (cashflowOut.textContent !== text) cashflowOut.textContent = text;
  }
  const due = (preview.beats || []).filter((b) => (b.at ?? 1) <= t + 0.0001);
  if (live && ui.clock && due.length !== ui.clock.beatN) {
    ui.clock.beatN = due.length;
    live.innerHTML = due.length
      ? due.slice().reverse().map((b, i) => `<article class="beat ${i === 0 ? "beat-new" : ""}"><p><b>${$(b.subject)}</b> · ${$(b.object)}</p><p>${$(b.text)}</p>${b.note ? `<p class="muted">${$(b.note)}</p>` : ""}</article>`).join("")
      : `<p class="muted">這季的小事會在日子走到時出現。</p>`;
  }
  // 舞台跟著日子走：人進出、單堆起來、燈暗一點、金額浮出來
  const day0 = Stage.liveDay(data, run, dayN, t);
  Stage.paintStage(run, {
    day: dayN,
    cashText: P.money(data, run, shown),
    crowd: day0.crowd,
    backlog: day0.backlog,
    light: day0.light,
    weatherText: run.weather ? `${run.weather.label}${run.weather.days ? ` · ${run.weather.days} 天` : ""}` : "天氣正常",
    pulse: fresh ? {
      text: `${last.amount >= 0 ? "＋" : "－"}${P.money(data, run, Math.abs(last.amount))} · ${last.shortLabel || last.label}`,
      amount: last.amount,
    } : null,
  });
}

function paceMult(run) {
  const m = Number(run?.paceMult || ui.settings.paceMult || 1);
  return [1, 3, 10].includes(m) ? m : 1;
}

function paceSeconds(run) {
  const table = data?.economy?.speeds_seconds || { slow: 30, immerse: 15, standard: 10, fast: 5, blitz: 2 };
  let sec = table[run?.speed || ui.settings.speed] || table.standard || 10;
  if (ui.settings.smart && ui.quiet >= 2 && run?.level !== "crit") sec = table.blitz || 2;
  if (run && (run.level === "crit" || run.founder?.health < 0.4)) sec = Math.max(sec, table.immerse || 15);
  // 倍率讓一季可以在兩三秒內跑完。出事的時候仍然會按停。
  return Math.max(0.6, sec / paceMult(run));
}

function autoToggleButton() {
  const on = !!ui.settings.autoplay;
  return `<button class="pill" data-act="auto-toggle" aria-pressed="${on ? "true" : "false"}">${on ? "自動選擇：開" : "自動選擇：關"}</button>`;
}

function autoChrome() {
  const on = !!ui.settings.autoplay;
  return `<div class="auto-bar">${autoToggleButton()}<p class="auto-hint" id="auto-hint"${on ? "" : " hidden"}>開著。輪到店裡的決定時，會先把要選的那項亮三秒。</p></div>`;
}

function attrSel(act, extra = {}) {
  let sel = `[data-act="${act}"]`;
  for (const [k, v] of Object.entries(extra)) sel += `[data-${k}="${CSS.escape(String(v))}"]`;
  return sel;
}

function preferKey(order, dict) {
  return (order || []).find((id) => dict?.[id]) || Object.keys(dict || {})[0] || "";
}

function shapeTarget(run) {
  const idx = Math.min(run.shapeStep || 0, SHAPE_STEPS.length - 1);
  const step = SHAPE_STEPS[idx];
  const missing = step.groups.find(([k]) => !run.shape[k]);
  if (!missing) {
    const label = idx >= SHAPE_STEPS.length - 1 ? "看開業前的數字" : "下一步";
    return { key: `shape:next:${idx}`, act: "shape-next", sel: '[data-act="shape-next"]', label };
  }
  const [key, group] = missing;
  const dict = data.economy[group] || {};
  const poor = (run.personal?.cash ?? run.founder?.assetMonths ?? 0) < 1;
  const prefer = {
    style: poor ? ["keep", "part", "test", "handover", "leave", "intra", "quit"] : ["part", "test", "leave", "keep", "quit", "intra", "handover"],
    venue: poor ? ["home", "online", "mobile", "studio", "shared"] : ["studio", "home", "online", "shared", "street"],
    revenue: ["once", "member", "project", "sub"],
    fulfillment: ["order", "make", "digital", "resell"],
    ownership: poor ? ["partner", "family", "coop", "sole"] : ["sole", "partner", "family"],
    positioning: ["easy", "relation", "efficient", "pro"],
  };
  const allowed = key === "revenue" ? Sim.allowedRevenue(data, run)
    : key === "fulfillment" ? Sim.allowedFulfillment(data, run) : null;
  const available = allowed ? Object.fromEntries(Object.entries(dict).filter(([id]) => allowed.includes(id))) : dict;
  const id = preferKey(prefer[key], available);
  if (!id) return null;
  return {
    key: `shape:${idx}:${key}:${id}`,
    act: "shape-pick",
    ds: { key, value: id },
    sel: attrSel("shape-pick", { key, value: id }),
    label: dict[id]?.label || id,
  };
}

function suggestRescueId(run, opts) {
  const trust = run.venture?.trust || 0;
  const order = [];
  order.push("collect_early", "bridge_support", "equity");
  if (trust >= 0.38) order.push("presell");
  order.push("delay");
  if ((run.finance?.debt || 0) < 6) order.push("borrow");
  if ((run.venture?.capexBook || 0) > 0.3) order.push("asset");
  order.push("turnaround_lean", "shrink", "nodraw");
  return order.find((id) => opts.some((o) => o.id === id)) || opts.find((o) => o.id !== "close")?.id || opts[0]?.id;
}

function autoTarget() {
  const run = ui.run;
  const screen = ui.screen;
  if (!run || !data) return null;
  if (screen === "opening") {
    return { key: `opp:${run.rejected?.length || 0}:${run.gapId}`, act: "accept", sel: '[data-act="accept"]', label: "接這個機會" };
  }
  if (screen === "rejected") {
    return { key: `rejected:${run.rejected?.length || 0}`, act: "after-reject", sel: '[data-act="after-reject"]', label: "看下一個機會" };
  }
  if (screen === "shaping") return shapeTarget(run);
  if (screen === "naming") {
    const name = ui.draftName || Sim.nameOptions(run, data)[0];
    return { key: `open:${run.gapId}:${name}`, act: "open", sel: '[data-act="open"]', label: `用「${name}」開業` };
  }
  if (screen !== "play") return null;
  if (ui.drawer && run.phase === "play") return null;
  if (run.phase === "event" && run.pendingEvent?.choices?.length) {
    const id = Sim.suggestEventChoice(run.pendingEvent, run, data);
    const choice = run.pendingEvent.choices.find((c) => c.id === id) || run.pendingEvent.choices[0];
    if (!choice) return null;
    return { key: `event:${run.pendingEvent.id}:${run.month}`, act: "choice", ds: { id: choice.id }, sel: attrSel("choice", { id: choice.id }), label: choice.label };
  }
  if (run.phase === "laststand") {
    const opts = Sim.rescueOptions(data, run);
    const id = suggestRescueId(run, opts);
    const opt = opts.find((o) => o.id === id);
    if (!opt) return null;
    return { key: `rescue:${run.month}:${run.rescueLeft}`, act: "rescue", ds: { id: opt.id }, sel: attrSel("rescue", { id: opt.id }), label: opt.label };
  }
  if (run.phase === "succession") {
    const opts = Sim.successorOptions(data, run);
    const opt = opts.find((o) => o.id !== "sell") || opts[0];
    if (!opt) return null;
    return { key: `succ:${run.month}:${run.successionCount}`, act: "successor", ds: { id: opt.id }, sel: attrSel("successor", { id: opt.id }), label: opt.label };
  }
  if (run.phase === "chapter") {
    return { key: `chapter:${run.chapter}:${run.month}`, act: "chapter-go", sel: '[data-act="chapter-go"]', label: "繼續經營" };
  }
  if (run.phase === "summary") {
    const s = run.summary || {};
    return { key: `summary:${s.from}:${s.to}`, act: "ack-summary", sel: '[data-act="ack-summary"]', label: "看下一件要決定的事" };
  }
  if (run.phase === "closing") {
    return { key: `close:${run.month}`, act: "do-close", ds: { how: "back" }, sel: attrSel("do-close", { how: "back" }), label: "還不結束" };
  }
  return null;
}

function cancelAuto() {
  ui.auto = null;
  stopAutoPaint();
}

function stopAutoPaint() {
  if (autoRaf) cancelAnimationFrame(autoRaf);
  autoRaf = 0;
}

function armAuto() {
  stopAutoPaint();
  if (!ui.settings.autoplay) {
    ui.auto = null;
    return;
  }
  const target = autoTarget();
  if (!target) {
    ui.auto = null;
    return;
  }
  const now = performance.now();
  if (!ui.auto || ui.auto.key !== target.key) {
    ui.auto = { ...target, ds: target.ds || {}, started: now, pausedAt: 0, needsFocus: true };
    say(`三秒後將選擇：${target.label}`);
  } else {
    ui.auto.sel = target.sel;
    ui.auto.act = target.act;
    ui.auto.ds = target.ds || {};
    ui.auto.label = target.label;
    if (ui.auto.pausedAt) {
      ui.auto.started += now - ui.auto.pausedAt;
      ui.auto.pausedAt = 0;
    }
    if (!app.querySelector(target.sel)?.classList.contains("auto-pick")) ui.auto.needsFocus = true;
  }
  const token = ui.auto;
  const tick = () => {
    if (ui.auto !== token || !ui.settings.autoplay) return;
    if (document.hidden) {
      if (!token.pausedAt) token.pausedAt = performance.now();
      return;
    }
    const el = app.querySelector(token.sel);
    if (!el) {
      ui.auto = null;
      return;
    }
    el.classList.add("auto-pick");
    el.setAttribute("aria-describedby", "auto-hint");
    if (!el.querySelector(":scope > .auto-fill")) {
      const fill = document.createElement("span");
      fill.className = "auto-fill";
      fill.setAttribute("aria-hidden", "true");
      el.prepend(fill);
    }
    const t = Math.min(1, (performance.now() - token.started) / AUTO_MS);
    el.style.setProperty("--auto", t.toFixed(4));
    el.dataset.autoProgress = t.toFixed(3);
    const hint = document.querySelector("#auto-hint");
    if (hint) {
      hint.hidden = false;
      hint.classList.add("is-live");
      const left = Math.max(1, Math.ceil((1 - t) * 3));
      if (hint.dataset.left !== String(left) || hint.dataset.for !== token.key) {
        hint.dataset.left = String(left);
        hint.dataset.for = token.key;
        hint.textContent = `即將選擇「${token.label}」。還有 ${left} 秒。這段時間只把該選項高亮，你仍可改選或關掉。`;
      }
    }
    if (token.needsFocus) {
      token.needsFocus = false;
      el.focus();
      el.scrollIntoView({ block: "nearest" });
    }
    if (t >= 1) {
      ui.auto = null;
      stopAutoPaint();
      autoCommit = true;
      try { act(token.act, token.ds || {}); }
      finally { autoCommit = false; }
      return;
    }
    autoRaf = requestAnimationFrame(tick);
  };
  tick();
}

function armFlow() {
  stopFlow();
  const run = ui.run;
  const can = flowOn() && run && ui.screen === "play" && run.phase === "play" && !ui.drawer;
  if (!can) {
    if (ui.clock && ui.screen === "play" && run?.phase === "play" && !ui.clock.pausedAt) ui.clock.pausedAt = performance.now();
    return;
  }
  const duration = paceSeconds(run) * 1000;
  if (!ui.clock) ui.clock = { started: performance.now(), duration, pulseN: 0, beatN: -1, pausedAt: 0 };
  else {
    if (ui.clock.pausedAt) {
      ui.clock.started += performance.now() - ui.clock.pausedAt;
      ui.clock.pausedAt = 0;
    }
    if (ui.clock.duration !== duration) {
      const frac = Math.min(1, Math.max(0, (performance.now() - ui.clock.started) / ui.clock.duration));
      ui.clock.started = performance.now() - frac * duration;
      ui.clock.duration = duration;
    }
  }
  const preview = monthPreview(run);
  ui.clock.beatN = -1;
  ui.clock.pulseN = -1;
  const frame = () => {
    if (!ui.clock || !flowOn() || ui.drawer || ui.screen !== "play" || ui.run?.phase !== "play") return;
    const t = Math.min(1, (performance.now() - ui.clock.started) / ui.clock.duration);
    if (preview) paintPassage(ui.run, preview, t);
    if (t >= 1) {
      ui.clock = null;
      ui.preview = null;
      doSettle(true);
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  if (!preview) {
    timer = setTimeout(() => {
      if (ui.run?.phase === "play" && ui.screen === "play" && flowOn() && !ui.drawer) doSettle(true);
    }, Math.max(40, duration - (performance.now() - ui.clock.started)));
    return;
  }
  frame();
}

async function share() {
  const run = ui.run;
  const ending = P.endingView(data, run);
  const life = Story.evaluateLife(data, run);
  const mem = Story.memorial(data, run, life);
  const canvas = document.querySelector("#card") || document.createElement("canvas");
  try {
    await paintCard(canvas, data, run, ending, mem);
    const blob = await cardBlob(canvas);
    const slug = (run.venture?.name || "qianfen").replace(/[\s/\\:*?"<>|]/g, "");
    const file = new File([blob], `${slug}-紀念卡.png`, { type: "image/png" });
    const text = shareText(data, run, ending, mem);
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text, title: "千分之一的店" });
      ui.shareNote = "已送出。";
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = file.name; a.click();
      ui.shareNote = "這台裝置沒有系統分享。圖已下載，你也可以自己傳。";
    }
    log(run, "ending_share");
  } catch {
    ui.shareNote = "這張圖沒有送出去。你可以再試，或先看診斷。";
  }
  render();
}

function archiveThis() {
  const run = ui.run;
  const end = P.endingView(data, run);
  let memories = end.memories;
  if (memories.length > 5) {
    const picked = new Set(ui.picked || []);
    if (picked.size === 0) memories = memories.slice(0, 5);
    else memories = memories.filter((m) => picked.has(m.id)).slice(0, 5);
  }
  const list = read(KEY.archive, []);
  list.unshift({
    id: `${Date.now()}`,
    seed: run.seed,
    name: run.venture?.name || "未開的店",
    city: P.worldLine(data, run).city.name,
    ending: end.title,
    life: P.monthsLabel(run.ending?.month || run.month),
    fact: end.fact,
    cost: end.cost,
    memory: memories[0]?.name || "",
    official: run.official !== false,
    comments: [],
    at: Date.now(),
  });
  write(KEY.archive, list.slice(0, 40));
  ui.shareNote = run.official === false ? "已放入紀念館，並標成非正式紀錄。" : "已匿名放入紀念館。";
  render();
}

function addComment(role, text) {
  const now = Date.now();
  ui.commentAt = (ui.commentAt || []).filter((t) => now - t < 3600000);
  if (ui.commentAt.length >= 3) { say("這一小時的短句已經留完。"); return; }
  const list = read(KEY.archive, []);
  const item = list.find((a) => a.id === ui.archiveId);
  if (!item) return;
  item.comments = item.comments || [];
  item.comments.push({ role, text, hidden: false });
  ui.commentAt.push(now);
  write(KEY.archive, list);
  render();
}
function hideComment(i) {
  const list = read(KEY.archive, []);
  const item = list.find((a) => a.id === ui.archiveId);
  if (item?.comments?.[i]) item.comments[i].hidden = true;
  write(KEY.archive, list);
  render();
}
function deleteArchive() {
  const list = read(KEY.archive, []).filter((a) => a.id !== ui.archiveId);
  write(KEY.archive, list);
  ui.archiveId = null;
  render();
}

boot();
