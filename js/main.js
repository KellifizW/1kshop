import * as Sim from "./sim.js";
import * as P from "./present.js";
import { paintCard, cardBlob } from "./share.js";

const app = document.querySelector("#app");
const statusEl = document.querySelector("#status");
const KEY = { run: "qf-run", settings: "qf-settings", archive: "qf-archive", eco: "qf-eco", recent: "qf-recent" };

let data = null;
const ui = {
  screen: "boot",
  run: null,
  drawer: null,
  settings: { speed: "standard", smart: true, autoplay: false, still: false },
  prologue: 0,
  reveal: 0,
  mode: "story",
  challenge: null,
  quiet: 0,
  archiveId: null,
  commentAt: [],
  error: "",
  shareNote: "",
};

const $ = (s) => esc(s ?? "");
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
    const files = ["world", "economy", "content", "events", "narrative"];
    const loaded = await Promise.all(files.map(async (name) => {
      const res = await fetch(`data/${name}.json`);
      if (!res.ok) throw new Error(name);
      return res.json();
    }));
    data = {
      world: loaded[0], economy: loaded[1], content: loaded[2],
      events: loaded[3].events, narrative: loaded[4],
    };
    ui.settings = { ...ui.settings, ...read(KEY.settings, {}) };
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
  app.innerHTML = views[ui.screen]?.() || views.error();
  const focus = app.querySelector("[data-autofocus]");
  if (focus) focus.focus();
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
      <p>大多數店撐不過第一個租約。你不能挑選完美的城市。你能決定它成為甚麼，以及最後留下甚麼。</p>
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
    const speeds = [["immerse", "沉浸 15 秒"], ["standard", "標準 10 秒"], ["fast", "快速 5 秒"], ["blitz", "狂飆 2 秒"]];
    return sheet(`<p class="kicker">設定</p><h2>時間怎麼走</h2>
      <p>預設是你按一下，才進入下一個月。自動播放時，間隔用上面的秒數。連續安靜會加快；紅線進入危險會放慢。可以關掉。</p>
      <div class="stack">${speeds.map(([id, label]) => `<button class="choice" data-act="set-speed" data-id="${id}" ${s.speed === id ? "data-autofocus" : ""}><b>${label}</b></button>`).join("")}</div>
      <button class="alt" data-act="toggle" data-key="autoplay">${s.autoplay ? "自動播放：開" : "自動播放：關"}</button>
      <button class="alt" data-act="toggle" data-key="smart">${s.smart ? "智能變速：開" : "智能變速：關"}</button>
      <button class="alt" data-act="toggle" data-key="still">${s.still ? "減少動效：開" : "減少動效：關"}</button>
      <button class="go" data-act="title">完成</button>`);
  },
  mode() {
    const modes = data.economy.modes;
    return sheet(`<p class="kicker">模式</p><h2>這一局怎麼算</h2>
      <div class="stack">${Object.entries(modes).map(([id, m]) => `<button class="choice" data-act="pick-mode" data-id="${id}" ${id === "story" ? "data-autofocus" : ""}><b>${$(m.label)}</b><span>${$(m.blurb)}</span></button>`).join("")}</div>
      <button class="ghost" data-act="title">返回</button>`);
  },
  challenge() {
    return sheet(`<p class="kicker">挑戰包</p><h2>指定一種難局</h2>
      <div class="stack">${data.economy.challenges.map((c) => `<button class="choice" data-act="pick-challenge" data-id="${c.id}"><b>${$(c.label)}</b><span>${$(c.blurb)}</span></button>`).join("")}</div>
      <button class="ghost" data-act="to-mode">返回</button>`);
  },
  sandbox() {
    const cities = data.world.cities.map((c) => `<option value="${c.id}">${$(c.name)}</option>`).join("");
    const gaps = data.content.gaps.map((g) => `<option value="${g.id}">${$(g.title)}</option>`).join("");
    return sheet(`<p class="kicker">沙盒 · 不計入正式統計</p><h2>自訂這一局的條件</h2>
      <label>種子<input id="sb-seed" value="${$(ui.seedDraft || Math.floor(Math.random() * 1e6))}"></label>
      <label>城市<select id="sb-city"><option value="">由種子決定</option>${cities}</select></label>
      <label>市場缺口<select id="sb-gap"><option value="">由種子決定</option>${gaps}</select></label>
      <label>年齡<input id="sb-age" inputmode="numeric" placeholder="22–58"></label>
      <label>資產（月薪，可負）<input id="sb-assets" inputmode="numeric" placeholder="例如 8 或 -3"></label>
      <button class="go" data-act="start-sandbox" data-autofocus>用這些條件抽取</button>
      <p class="muted" id="sb-error"></p>
      <button class="ghost" data-act="to-mode">返回</button>`);
  },
  prologue() {
    const lines = [
      "大多數店，撐不過第一個租約。",
      "你抽不到完美的城市，也選不了完美的時機。",
      "你能決定的，是它成為甚麼，以及最後留下甚麼。",
    ];
    const i = Math.min(ui.prologue, lines.length - 1);
    return sheet(`<p class="kicker">開場</p><h1>${$(lines[i])}</h1>
      <button class="go" data-act="prologue" data-autofocus>${i < lines.length - 1 ? "繼續" : "抽取你的世界"}</button>`);
  },
  reveal() {
    const run = ui.run;
    const w = P.worldLine(data, run);
    const steps = [
      `<p class="kicker">城市</p><h1>${$(w.city.name)}</h1><p>${$(w.country.name)}</p><ul class="symptoms">${w.city.diffs.map((d) => `<li>${$(d)}</li>`).join("")}</ul>`,
      `<p class="kicker">你</p><h1>${run.founder.age} 歲</h1><p>${$(P.familyLabel(run.founder.family))}。做過 ${run.founder.experience} 年${$(P.fieldLabel(data, run.founder.field))}。</p><p>${run.founder.matched ? "這段經驗，和眼前的缺口是同一類。" : "這段經驗在別的行業。缺口仍是這個。"}</p>`,
      `<p class="kicker">口袋</p><h1>${$(run.founder.personalNote)}</h1><p class="muted">工資水準是遊戲估算，不是官方統計。${$(w.city.name)}的一單位約 ${$(P.money(data, run, 1))}。</p>`,
      `<p class="kicker">缺口</p><h2>${$(w.gap.title)}</h2><p>${$(w.gap.problem)}</p><p class="muted">${$(w.gap.quadrant)}。趨勢大約一年 ${w.gap.trend >= 0 ? "多" : "少"} ${Math.abs(Math.round(w.gap.trend * 100))}% 上下，這是區間，不是預言。</p>`,
      `<p class="kicker">條件</p><h2>和你相近的開局</h2><p class="sub">${$(P.rarityLine(Math.max(1, run.perThousand)))}</p><p>約每一千個開局，有 ${run.perThousand} 局落在${$(w.city.name)}的「${$(w.gap.title)}」。</p><p>機會本身不算最稀有。稀有的是你之後怎麼對它。</p>${run.ecosystemHint ? `<p>這座城市還留著「${$(run.ecosystemHint.name || "一間舊店")}」的痕跡。</p>` : ""}`,
    ];
    const i = Math.min(ui.reveal, steps.length - 1);
    return sheet(`${steps[i]}<button class="go" data-act="reveal-next" data-autofocus>${i < steps.length - 1 ? "繼續" : "看這個機會"}</button>`);
  },
  opportunity() {
    const run = ui.run;
    const w = P.worldLine(data, run);
    const mode = data.economy.modes[run.mode];
    const canReject = run.rejectsLeft > 0;
    return sheet(`<p class="kicker">機會 ${run.rejected.length + 1}</p><h2>${$(w.gap.title)}</h2>
      <p>因為你做過${$(P.fieldLabel(data, run.founder.field))}，而${$(w.city.name)}有這個缺口：${$(w.gap.problem)}</p>
      <p>你還不知道的是：${$(w.gap.unknown)}</p>
      <p class="muted">可見的人：${run.contacts.filter((c) => c.known).map((c) => `${$(c.role)} ${$(c.name)}`).join("、") || "暫時沒有"}。其餘保持未知。</p>
      <button class="go" data-act="accept" data-autofocus>接這個機會</button>
      ${canReject ? `<button class="alt" data-act="reject">拒絕。會經過 ${run.rejectPreview} 個月，並付生活費。還剩 ${run.rejectsLeft} 次。</button>` : `<p class="muted">${mode.rejects ? "拒絕已經用完。" : "這個模式不能拒絕。"}</p>`}
      <button class="ghost" data-act="job">不創業，返回上班</button>`);
  },
  rejected() {
    const r = ui.run.rejectResult;
    return sheet(`<p class="kicker">時間過去</p><h2>${r.months} 個月</h2>
      <p>生活費大約 ${$(P.money(data, ui.run, r.spent))}。世界沒有停。</p>
      <p>${r.taken ? `${$(r.peerName)}把你拒絕的機會接了過去。以後可能在近場遇見。` : "那個機會暫時沒有人接。"}</p>
      <button class="go" data-act="after-reject" data-autofocus>看下一個機會</button>`);
  },
  shaping() {
    return shapingView();
  },
  naming() {
    const names = Sim.nameOptions(ui.run, data);
    return sheet(`<p class="kicker">名字</p><h2>寫在帳簿第一頁</h2><p>名字不改變數字。</p>
      <div class="stack">${names.map((n, i) => `<button class="choice" data-act="name" data-name="${$(n)}" ${i === 0 ? "data-autofocus" : ""}><b>${$(n)}</b></button>`).join("")}</div>`);
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
  return `<div class="shell ${side ? "with-side" : ""}"><article class="sheet">${inner}</article>${side}</div>`;
}

function shapingView() {
  const steps = [
    ["style", "你怎麼投入", "commitment_styles"],
    ["venue", "在哪裡做", "venues"],
    ["revenue", "錢怎麼進來", "revenues"],
    ["fulfillment", "東西怎麼交出去", "fulfillment"],
    ["ownership", "誰擁有它", "ownership"],
    ["positioning", "你站在哪", "positioning"],
  ];
  const i = ui.run.shapeStep || 0;
  if (i >= steps.length) {
    const p = Sim.previewVenture(data, ui.run);
    if (!p) return sheet(`<p>這組結構還算不出第一個月。請回到上一步重選。</p><button class="ghost" data-act="shape-back">上一步</button>`);
    const rl = data.economy.redline_thresholds[p.redline];
    return sheet(`<p class="kicker">開業之前</p><h2>這就是你的結構</h2>
      <p>公司現金大約 ${$(P.money(data, ui.run, p.cash))}，債務 ${$(P.money(data, ui.run, p.debt))}。你自己留下約 ${$(P.money(data, ui.run, p.personalLeft))}。</p>
      <p>若第一個月大致如此，帳面收入約 ${$(P.money(data, ui.run, p.revenue))}，公司要付的約 ${$(P.money(data, ui.run, p.costs))}。${p.personalGap > 0.05 ? `生活費還差約 ${$(P.money(data, ui.run, p.personalGap))}，會先從公司現金補。` : "生活費大致由薪資或公司提取蓋過。"}跑道大約 ${p.runway > 36 ? "很長" : Math.max(0, Math.round(p.runway)) + " 個月"}。</p>
      <p>主要紅線會是：${$(rl.name)}。牌照大約 ${p.license} 個月。</p>
      <p class="muted">這是確定會寫進結構的部分。市場結果仍是區間。</p>
      <button class="go" data-act="lock-shape" data-autofocus>用這個結構開業</button>
      <button class="ghost" data-act="shape-back">回到上一步</button>`);
  }
  const [key, title, group] = steps[i];
  const dict = data.economy[group];
  const buttons = Object.entries(dict).map(([id, obj]) => {
    const blurb = obj.certain || obj.risk || shapeHint(group, obj);
    return `<button class="choice" data-act="shape" data-key="${key}" data-value="${id}"><b>${$(obj.label)}</b><span>${$(blurb)}</span></button>`;
  }).join("");
  return sheet(`<p class="kicker">塑形 ${i + 1} / 6</p><h2>${$(title)}</h2><div class="stack">${buttons}</div>
    ${i > 0 ? `<button class="ghost" data-act="shape-back">上一步</button>` : ""}`);
}

function shapeHint(group, obj) {
  if (group === "venues") return `固定成本${obj.fixed > 0.4 ? "偏高" : obj.fixed < 0.15 ? "很低" : "中等"}，人流${obj.traffic > 1.2 ? "較旺" : "要自己找"}。`;
  if (group === "revenues") return obj.recurring ? "收入較可預期，要守住留存。" : `帳期大約 ${obj.ar || 0} 天。`;
  if (group === "fulfillment") return obj.dependency > 0.4 ? "你會依賴別人把東西交出。" : "品質比較握在自己手上。";
  if (group === "ownership") return obj.cash > 2 ? "錢進來，控制權出去一截。" : "控制權較完整，跑道靠你自己。";
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
  const rl = P.redlineView(data, run) || { name: "尚未結算", text: "結算第一個月之後，紅線才有數字。", level: "ok", mark: "穩" };
  const sym = run.month ? P.symptomTexts(data, run) : ["開業之前，市場還沒有句子。", "團隊一欄是空的。", "你還睡得著。"];
  const fc = run.month >= 0 && run.phase === "play" ? Sim.forecast(data, run) : null;
  const last = run.last;
  const info = data.economy.modes[run.mode].info;
  const band = fc && info === "full"
    ? `若沒有新決定，帳面收入大約 ${P.money(data, run, fc.revenue[0])} 到 ${P.money(data, run, fc.revenue[1])}。`
    : fc ? "硬核不把區間收窄。你看得到合約，看不到顧問的表。" : "";
  const side = sidePanel();
  const drawer = ui.drawer ? drawerHtml() : "";
  return `<div class="shell with-side"><article class="sheet">
    <header class="worldbar"><div><p class="kicker">${$(w.city.name)} · ${$(P.stageName(data, run))} · ${$(run.role)}</p><h2>${$(P.whenLabel(run))}</h2><p class="muted">${$(P.calendarLabel(run))} · ${$(run.venture.name)}</p></div>
    <button class="pill" data-act="cycle-speed">${$(speedLabel())}</button></header>
    <section class="ledger" aria-label="本期帳簿">
      <div class="row"><span>帳面收入</span><strong>${last ? $(P.money(data, run, last.revenue)) : "—"}</strong></div>
      <div class="row"><span>實際進帳</span><strong>${last ? $(P.money(data, run, last.collected)) : "—"}</strong></div>
      <div class="row"><span>本月成本</span><strong>${last ? $(P.money(data, run, last.cost)) : "—"}</strong></div>
      <div class="row"><span>期末現金</span><strong>${$(P.money(data, run, run.finance.cash))}</strong></div>
    </section>
    <p class="${(last?.revenue || 0) >= (last?.cost || 0) ? "delta up" : "delta down"}">${last ? $(last.line) : "名字已經寫上。第一個月還沒結算。"}</p>
    ${last?.aside && data.economy.modes[run.mode].dialogue ? `<p class="muted">${$(last.aside)}</p>` : ""}
    <section class="redline ${rl.level}"><p class="kicker">結構紅線</p><p><span class="mark">${$(rl.mark)}</span>${$(rl.name || "")}</p><p>${$(rl.text || "")}</p></section>
    <ul class="symptoms">${sym.map((s) => `<li>${$(s)}</li>`).join("")}</ul>
    <p>${$(P.commitmentLine(run))}</p>
    <p class="muted">${$(band)}</p>
    <button class="go" data-act="settle" data-autofocus>進入下一個月</button>
    <button class="alt" data-act="skip">跳到下一件要決定的事</button>
    <button class="ghost" data-act="initiative-open">主動做一件事</button>
    <nav class="dock" aria-label="帳簿分頁">
      <button data-act="drawer" data-id="ledger">帳簿</button>
      <button data-act="drawer" data-id="peers">近場</button>
      <button data-act="drawer" data-id="commits">承諾</button>
      <button data-act="drawer" data-id="time">時間</button>
    </nav>
    ${drawer}
  </article>${side}</div>`;
}

function speedLabel() {
  return { immerse: "沉浸", standard: "標準", fast: "快速", blitz: "狂飆" }[ui.run?.speed || ui.settings.speed] || "標準";
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
  return `<aside class="side"><h3>現金</h3>${pts.length ? `<svg class="spark" viewBox="0 0 260 80" role="img" aria-label="最近現金曲線"><path d="${d}" fill="none" stroke="#e7d7c4" stroke-width="2"/></svg>` : `<p>結算之後這裡會有一條線。</p>`}
    <h3>近場</h3>${(run.peers || []).map((p) => `<div class="peer"><b>${$(p.name)}</b><br>${$(p.label)} · ${p.alive ? "仍在" : "已退出"}</div>`).join("") || `<p>近場還沒形成。</p>`}
    <p class="muted">遠場在結局才對照。桌面上看得到這欄，手機上在近場抽屜。</p></aside>`;
}

function drawerHtml() {
  const run = ui.run;
  const id = ui.drawer;
  let body = "";
  if (id === "ledger") {
    const rows = (run.factors || []).map(([k, v]) => `<tr><th>${$(k)}</th><td>${$(v)}</td></tr>`).join("");
    const info = data.economy.modes[run.mode].info;
    body = `<h2>詳細帳簿</h2><p>現金 ${$(P.money(data, run, run.finance.cash))} · 債務 ${$(P.money(data, run, run.finance.debt))}</p>
      <p>法律形式：${$(P.legalLabel(data, run))}。這是遊戲規則，不是法律意見。</p>
      ${info === "sparse" ? `<p>硬核把顧問收起來。下面仍是公式，因為合約與結算必須對得上。</p>` : ""}
      <table>${rows || `<tr><td>結算一次之後，這裡會列出收入怎麼來。</td></tr>`}</table>
      ${sparkTable()}`;
  } else if (id === "peers") {
    body = `<h2>近場與遠場</h2>${run.peers?.length ? run.peers.map((p) => `<p><b>${$(p.name)}</b> ${$(p.label)}<br>${$(p.note)} 壓力 ${Math.round(p.pressure * 100)}。</p>`).join("") : `<p>等你決定企業的樣子，街上才會出現鄰居。</p>`}
      ${(run.far || []).map((f) => `<p><b>${$(f.kind)}</b> ${$(f.name)}<br>${$(f.note)}</p>`).join("")}`;
  } else if (id === "commits") {
    const list = run.commitments || [];
    body = `<h2>承諾</h2>${list.length ? `<ul class="symptoms">${list.map((c) => `<li>${$(c.name)} · 剩 ${c.monthsLeft} 個月</li>`).join("")}</ul>` : `<p>你還沒有簽下不能隨便反悔的東西。</p>`}`;
  } else if (id === "time") {
    const items = (run.timeline || []).slice().reverse().slice(0, 30);
    body = `<h2>時間線</h2>${items.length ? `<ul class="symptoms">${items.map((t) => `<li>第 ${t.m} 月 · ${$(t.title)}。${$(t.text)}</li>`).join("")}</ul>` : `<p>歷史會從第一個選擇開始，不能改寫。</p>`}
      <button class="alt" data-act="drawer" data-id="analysis">看徵兆怎麼來</button>`;
  } else if (id === "analysis") {
    const sym = P.symptomTexts(data, run);
    body = `<h2>分析</h2><p>主畫面不放條。這裡是句子背後的構成。</p><ul class="symptoms">${sym.map((s) => `<li>${$(s)}</li>`).join("")}</ul>
      <p>配合度 ${Math.round((run.venture?.marketFit || 0) * 100)}。品質 ${Math.round((run.venture?.quality || 0) * 100)}。信任 ${Math.round((run.venture?.trust || 0) * 100)}。</p>
      <p>健康 ${Math.round(run.founder.health * 100)}。意志 ${Math.round(run.founder.will * 100)}。控制權 ${Math.round(run.founder.control * 100)}%。</p>
      <p class="muted">人物會不會答應、市場會不會買單，仍不給假精確機率。</p>`;
  } else if (id === "initiative") {
    const list = Sim.initiatives(data, run);
    body = `<h2>主動做一件事</h2><div class="stack">${list.map((it) => `<button class="choice" data-act="initiative" data-id="${it.id}"><b>${$(it.label)}</b><span>${$(it.detail)}</span></button>`).join("")}</div>`;
  }
  return `<section class="drawer" role="dialog" aria-label="細節"><button class="ghost" data-act="close-drawer">收起</button>${body}</section>`;
}

function sparkTable() {
  const rows = (ui.run.series || []).slice(-12);
  if (!rows.length) return `<p>曲線會在結算後出現。沒有月份時，這裡是空的。</p>`;
  const max = Math.max(...rows.map((r) => r.cash), 0.01);
  const min = Math.min(...rows.map((r) => r.cash), 0);
  const w = 280, h = 80;
  const d = rows.map((r, i) => {
    const x = (i / Math.max(1, rows.length - 1)) * w;
    const y = h - ((r.cash - min) / (max - min || 1)) * (h - 8) - 4;
    return `${i ? "L" : "M"}${x},${y}`;
  }).join(" ");
  return `<div class="chartwrap"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="現金曲線"><path d="${d}" fill="none" stroke="#8f2d2d" stroke-width="2"/></svg>
    <table><caption class="sr">近期現金</caption><thead><tr><th>月</th><th>現金</th><th>收入</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${r.m}</td><td>${$(P.money(data, ui.run, r.cash))}</td><td>${$(P.money(data, ui.run, r.rev))}</td></tr>`).join("")}
    </tbody></table></div>`;
}

function eventView() {
  const ev = ui.run.pendingEvent;
  const choices = ev.choices.map((c, i) => `<button class="choice ${c.effects?.force_ending ? "warn" : ""}" data-act="choice" data-id="${$(c.id)}" ${i === 0 ? "data-autofocus" : ""}><b><span class="mark">${i + 1}</span>${$(c.label)}</b><span>${$(c.detail)}</span><span>未知：${$(c.risk || "沒有額外未知。")}</span></button>`).join("");
  return sheet(`<p class="kicker">要決定 · 第 ${ui.run.month} 個月</p><h2>${$(ev.title)}</h2>
    ${ev.omen ? `<p class="muted">事前的徵兆：${$(ev.omen)}</p>` : ""}
    <p>${$(ev.body)}</p><div class="stack">${choices}</div>
    <p class="small">數字是這張合約寫死的部分。人物與市場的未知，不換成機率。</p>`);
}

function lastView() {
  const run = ui.run;
  const opts = Sim.rescueOptions(data, run);
  return sheet(`<p class="kicker">最後階段</p><h2>現金不夠付這一輪</h2>
    <p>帳上 ${$(P.money(data, run, run.finance.cash))}。以日計，這個模式大約還有 ${run.rescueDays} 天的緩衝，行動還剩 ${run.rescueLeft} 次。</p>
    <p>你通常不能同時保住公司、員工、家庭與控制權。</p>
    <div class="stack">${opts.map((o) => `<button class="choice" data-act="rescue" data-id="${o.id}"><b>${$(o.label)}</b><span>${$(o.detail)}</span></button>`).join("")}</div>`);
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
  return sheet(`<p class="kicker">第 ${run.chapter} 章</p><h2>${$(P.whenLabel(run))}</h2>
    <p>現金 ${$(P.money(data, run, run.finance.cash))}。這一章最大的承諾：${big ? $(big.name) : "沒有新的鎖。"}</p>
    <p>${mem ? `留下一件東西：${$(mem.name)}。${$(mem.blurb)}` : "這一章沒有新的物件。"}</p>
    <p class="muted">${$(run.role)}仍在。合上帳簿不會刪掉公司，只是這一局先停。</p>
    <button class="go" data-act="chapter-go" data-autofocus>繼續經營</button>
    ${run.month >= 12 ? `<button class="alt" data-act="close-book">合上這一本</button>` : ""}
    ${data.economy.modes[run.mode].chapter_save ? `<button class="ghost" data-act="pause">先存起來</button>` : `<p class="muted">硬核不提供章節讀取。重新整理只會回到當下。</p>`}`);
}

function summaryView() {
  const s = ui.run.summary || { lines: [], from: 0, to: 0 };
  return sheet(`<p class="kicker">摘要</p><h2>從第 ${s.from} 月到第 ${s.to} 月</h2>
    <ul class="symptoms">${(s.lines || []).map((l) => `<li>第 ${l.m} 月 ${$(l.line)}</li>`).join("") || "<li>這段時間沒有句子。</li>"}</ul>
    <p>現金現在是 ${$(P.money(data, ui.run, ui.run.finance.cash))}。</p>
    <button class="go" data-act="ack-summary" data-autofocus>看下一件要決定的事</button>`);
}

function closeView() {
  return sheet(`<p class="kicker">結業</p><h2>要怎樣結束</h2>
    <button class="choice" data-act="do-close" data-how="back"><b>還不結束</b><span>回到這個月。</span></button>
    <button class="choice" data-act="do-close" data-how="shrink"><b>縮小到還做得動</b><span>公司繼續，尺寸變小。</span></button>
    <button class="choice" data-act="do-close" data-how="craft"><b>把方法交給下一個人再結束</b><span>若現金還允許，這可以是手藝移交。</span></button>
    <button class="choice warn" data-act="do-close" data-how="voluntary" data-autofocus><b>正式結業</b><span>付得起離職與帳，就是主動結業。付不起，就是清算。</span></button>`);
}

function endingView() {
  const run = ui.run;
  const end = P.endingView(data, run);
  const digital = ["online"].includes(run.shape?.venue) || ["saas", "enterprise", "fin"].includes(run.venture?.family);
  return sheet(`<p class="kicker">${$(end.stamp)}</p>
    <div class="ending-hero" aria-hidden="true">${shopSvg(digital, end.id === "century", !!run.ending && ["liquidate", "compliance", "guarantee_ruin", "voluntary"].includes(end.id))}</div>
    <h1>${$(run.venture?.name || "未開的店")}</h1>
    <p class="sub">${$(end.title)}</p>
    <p>${$(P.rarityLine(end.prior))}</p>
    <p>若按這套規則長期來看，這種結局大約每一千局有 ${end.prior} 局。這是遊戲內分布，不是現實統計。</p>
    <hr class="cardline">
    <p>${$(end.fact)}</p>
    <p>${$(end.cost)}</p>
    <p>留下：${end.featured ? $(end.featured.name) : "一本合上的帳簿"}。</p>
    ${end.memories.length > 5 ? `<p>選五件放進紀念館。</p><div class="memories">${end.memories.map((m) => `<button class="alt" data-act="mem" data-id="${$(m.id)}" aria-pressed="${ui.picked?.includes(m.id) ? "true" : "false"}">${$(m.name)}</button>`).join("")}</div>` : ""}
    <button class="go" data-act="share" data-autofocus>做成一張可以分享的圖</button>
    <p class="muted">${$(ui.shareNote)}</p>
    <button class="alt" data-act="to-diagnosis">看診斷</button>
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
  const cf = run.counterfactual;
  const peers = (run.peers || []).map((p) => `${p.name}（${p.label}）${p.alive ? "還在" : "已不在"}`).join("。");
  return sheet(`<p class="kicker">診斷</p><h2>若重來，節點在選擇裡</h2>
    <p>推著它的：${end.pos.length ? $(end.pos.join("、")) : "開局條件本身"}。</p>
    <p>消耗它的：${end.neg.length ? $(end.neg.join("、")) : "時間與固定的帳"}。</p>
    <p>近場：${$(peers || "沒有形成。")}</p>
    <p>遠場：${(run.far || []).map((f) => `${$(f.kind)} ${$(f.name)}`).join("。") || "沒有。"}</p>
    <p>${cf ? `若第一個重大選擇改成「${$(cf.choice)}」，那間公司可能走到第 ${cf.months} 個月，結局傾向「${$(cf.ending)}」。這是可能，不是保證。` : "這局還沒有足夠的分岔可以對照。"}</p>
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

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && ui.drawer) { ui.drawer = null; render(); return; }
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

function act(name, ds = {}) {
  const run = ui.run;
  if (name === "reload") return location.reload();
  if (name === "title") { ui.screen = "title"; ui.drawer = null; return render(); }
  if (name === "about") { ui.screen = "about"; return render(); }
  if (name === "settings") { ui.screen = "settings"; return render(); }
  if (name === "to-mode") { ui.screen = "mode"; return render(); }
  if (name === "archive") { ui.screen = "archive"; ui.archiveId = null; return render(); }
  if (name === "set-speed") { ui.settings.speed = ds.id; if (run) run.speed = ds.id; persistSettings(); return render(); }
  if (name === "toggle") {
    ui.settings[ds.key] = !ui.settings[ds.key];
    if (ds.key === "still") document.documentElement.classList.toggle("still", ui.settings.still);
    if (ds.key === "smart" && run) run.smart = ui.settings.smart;
    persistSettings();
    return render();
  }
  if (name === "pick-mode") {
    ui.mode = ds.id;
    if (ds.id === "challenge") { ui.screen = "challenge"; return render(); }
    if (ds.id === "sandbox") { ui.screen = "sandbox"; return render(); }
    ui.prologue = 0; ui.screen = "prologue"; return render();
  }
  if (name === "pick-challenge") { ui.challenge = ds.id; ui.prologue = 0; ui.screen = "prologue"; return render(); }
  if (name === "start-sandbox") return startSandbox();
  if (name === "prologue") {
    if (ui.prologue < 2) { ui.prologue += 1; return render(); }
    beginRun();
    return render();
  }
  if (name === "reveal-next") {
    if (ui.reveal < 4) { ui.reveal += 1; return render(); }
    Sim.acknowledgeReveal(run);
    ui.screen = "opportunity";
    saveRun();
    return render();
  }
  if (name === "accept") { Sim.acceptOpportunity(run); ui.screen = "shaping"; saveRun(); return render(); }
  if (name === "reject") {
    const res = Sim.rejectOpportunity(data, run);
    if (!res.ok) { say(res.reason); return; }
    ui.screen = "rejected"; saveRun(); return render();
  }
  if (name === "after-reject") { Sim.finishReject(run); ui.screen = "opportunity"; saveRun(); return render(); }
  if (name === "job") { Sim.returnToJob(data, run); ui.screen = "ending"; finishWorld(); saveRun(); return render(); }
  if (name === "shape") {
    Sim.setShape(run, ds.key, ds.value);
    run.shapeStep = (run.shapeStep || 0) + 1;
    saveRun(); return render();
  }
  if (name === "shape-back") { run.shapeStep = Math.max(0, (run.shapeStep || 0) - 1); return render(); }
  if (name === "lock-shape") {
    const res = Sim.confirmShape(data, run);
    if (!res.ok) { say(res.reason); return; }
    ui.screen = "naming"; saveRun(); return render();
  }
  if (name === "name") { Sim.confirmName(run, ds.name); run.speed = ui.settings.speed; run.smart = ui.settings.smart; ui.screen = "play"; saveRun(); say(`${run.venture.name}開業。`); return render(); }
  if (name === "settle") return doSettle();
  if (name === "choice") { Sim.chooseEvent(data, run, ds.id); ui.quiet = 0; afterStep(); return; }
  if (name === "rescue") { Sim.chooseRescue(data, run, ds.id); afterStep(); return; }
  if (name === "successor") { Sim.chooseSuccessor(data, run, ds.id); afterStep(); return; }
  if (name === "chapter-go") { Sim.continueChapter(run); ui.screen = "play"; saveRun(); return render(); }
  if (name === "ack-summary") { Sim.ackSummary(run); ui.screen = "play"; saveRun(); return render(); }
  if (name === "skip") { Sim.skipToEvent(data, run); ui.quiet = 0; ui.screen = "play"; saveRun(); return render(); }
  if (name === "drawer") { ui.drawer = ds.id; if (ds.id === "ledger") Sim.logEvent?.(run, "ledger_open"); log(run, "ledger_open"); return render(); }
  if (name === "close-drawer") { ui.drawer = null; return render(); }
  if (name === "initiative-open") { ui.drawer = "initiative"; return render(); }
  if (name === "initiative") { Sim.actInitiative(data, run, ds.id); ui.drawer = null; afterStep(); return; }
  if (name === "do-close") { Sim.confirmClose(data, run, ds.how); afterStep(); return; }
  if (name === "close-book") { Sim.closeBook(data, run); ui.screen = "ending"; finishWorld(); saveRun(); return render(); }
  if (name === "pause") { saveRun(); ui.screen = "title"; say("這一章已留下。"); return render(); }
  if (name === "continue") { ui.run = ui.saved; ui.screen = ui.saved.venture ? "play" : screenFor(ui.saved); return render(); }
  if (name === "drop-save") { localStorage.removeItem(KEY.run); ui.saved = null; ui.corrupt = false; ui.screen = "title"; return render(); }
  if (name === "cycle-speed") {
    const order = ["immerse", "standard", "fast", "blitz"];
    const i = order.indexOf(run.speed || "standard");
    run.speed = order[(i + 1) % order.length];
    ui.settings.speed = run.speed;
    persistSettings(); log(run, "speed_change"); saveRun(); return render();
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
  if (run.phase === "reveal") return "reveal";
  if (run.phase === "opportunity") return "opportunity";
  if (run.phase === "rejected") return "rejected";
  if (run.phase === "shaping") return "shaping";
  if (run.phase === "naming") return "naming";
  if (run.phase === "ending") return "ending";
  return "play";
}

function beginRun() {
  const recent = read(KEY.recent, { cities: [], families: [], gaps: [] });
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
    challenge: ui.mode === "challenge" ? ui.challenge : null,
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
  ui.run = run;
  ui.reveal = 0;
  ui.screen = "reveal";
  ui.picked = [];
  saveRun();
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
  ui.prologue = 0;
  ui.screen = "prologue";
  render();
}
function clampAge(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 22 || n > 58) return null;
  return Math.round(n);
}

function doSettle() {
  const run = ui.run;
  if (!run || run.phase !== "play") return;
  const before = run.month;
  Sim.settle(data, run);
  if (run.phase === "play") ui.quiet += 1; else ui.quiet = 0;
  if (ui.settings.smart && ui.quiet >= 2 && run.phase === "play" && run.level !== "crit") {
    /* smart span is represented by faster autoplay; a tap still moves one month so choices stay visible */
  }
  say(run.last?.line || "這個月過去了。");
  if (before === run.month && run.phase === "play") say("這個月沒有推進。");
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
  const ok = write(KEY.run, ui.run);
  if (!ok) say("這台裝置寫不進存檔。這一局仍可繼續，但重新整理會消失。");
  ui.saved = ui.run;
}
function persistSettings() { write(KEY.settings, ui.settings); }
function log(run, name) { if (run) run.analytics = [...(run.analytics || []), { e: name, m: run.month }]; }

let timer = 0;
function armAuto() {
  clearInterval(timer);
  const run = ui.run;
  if (!ui.settings.autoplay || !run || ui.screen !== "play" || run.phase !== "play") return;
  const table = data.economy.speeds_seconds;
  let sec = table[run.speed] || table.standard;
  if (ui.settings.smart && ui.quiet >= 2) sec = table.blitz;
  if (run.level === "crit" || run.founder.health < 0.4) sec = table.immerse;
  timer = setInterval(() => { if (ui.run?.phase === "play" && ui.screen === "play") doSettle(); }, sec * 1000);
}

async function share() {
  const run = ui.run;
  const ending = P.endingView(data, run);
  const canvas = document.querySelector("#card") || document.createElement("canvas");
  try {
    await paintCard(canvas, data, run, ending);
    const blob = await cardBlob(canvas);
    const file = new File([blob], "qianfen.png", { type: "image/png" });
    const text = `《千分之一的店》\n${run.venture?.name || "未開的店"}\n${ending.title}\n${P.rarityLine(ending.prior)}\n${ending.fact}\n${ending.cost}`;
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text, title: "千分之一的店" });
      ui.shareNote = "已送出。";
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "qianfen.png"; a.click();
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
  ui.shareNote = run.official === false ? "已放入紀念館，並標成沙盒。" : "已匿名放入紀念館。";
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
