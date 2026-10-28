/**
 * 五張圖，解決同一個問題：玩家破產之後，仍然不知道自己為什麼輸。
 *
 * 1. 現金跑道　　2. 現金流瀑布　　3. 顧客漏斗
 * 4. 產能瓶頸　　5. 決策回顧線
 *
 * 全部回傳 HTML/SVG 字串，不做任何 DOM 操作，所以在結算頁、帳簿、
 * 結局卡與紀念卡上都能重複使用。
 */
import { money } from "./present.js";
import { cashflowLedger } from "./cashflow.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const r0 = (n) => Math.round(num(n, 0)).toLocaleString("zh-Hant");

/* ── 1. 現金跑道 ───────────────────────────────────────── */

export function runwayView(data, run, opts = {}) {
  const cash = num(run.finance?.cash, 0);
  const last = run.last?.parts || {};
  const estimatedCosts = opts.forecast?.costs || [0, 0];
  const estimatedCollections = opts.forecast?.collected || [0, 0];
  const forecastBurn = (num(estimatedCosts[0]) + num(estimatedCosts[1])) / 2
    - (num(estimatedCollections[0]) + num(estimatedCollections[1])) / 2;
  const collected = num(run.last?.collected, 0);
  const burn = Math.max(0, run.last?.parts
    ? num(last.operating, 0) + num(last.personalTransfer, 0) - collected
    : forecastBurn);
  const months = burn > 0.01 ? cash / burn : 24;
  const revenue = num(run.last?.revenue, (num(opts.forecast?.revenue?.[0]) + num(opts.forecast?.revenue?.[1])) / 2);
  const worstBurn = burn + revenue * 0.2 * 0.35;
  const worst = worstBurn > 0.01 ? cash / worstBurn : months;
  const w = 320;
  const span = Math.max(6, Math.min(36, Math.ceil(months * 1.25)));
  const x = (m) => clamp((m / span) * w, 0, w);
  const label = months >= 24 ? "很長" : `${months.toFixed(1)} 季`;
  return `<figure class="chart chart-runway" data-level="${months < 3 ? "crit" : months < 6 ? "warn" : "ok"}">
    <figcaption>現金跑道</figcaption>
    <svg viewBox="0 0 ${w} 46" role="img" aria-label="現金 ${esc(money(data, run, cash))}，目前速度可生存 ${esc(label)}，最壞情況 ${worst.toFixed(1)} 季">
      <rect x="0" y="16" width="${w}" height="14" rx="7" fill="#e7dccb"/>
      <rect x="0" y="16" width="${x(months)}" height="14" rx="7" fill="${months < 3 ? "#8f2d2d" : months < 6 ? "#8a5a12" : "#2a6a4a"}"/>
      <rect x="0" y="16" width="${x(worst)}" height="14" rx="7" fill="#1c1612" opacity="0.18"/>
      ${[0, 3, 6, 12].filter((m) => m <= span).map((m) => `<g><line x1="${x(m)}" y1="32" x2="${x(m)}" y2="38" stroke="#7a6e62" stroke-width="1"/><text x="${x(m)}" y="46" font-size="9" fill="#7a6e62" text-anchor="middle">${m}</text></g>`).join("")}
      <text x="${clamp(x(months), 20, w - 20)}" y="11" font-size="10" fill="#1c1612" text-anchor="middle">${esc(label)}</text>
    </svg>
    <ul class="chart-notes">
      <li>現金 <b>${esc(money(data, run, cash))}</b></li>
      <li>每季淨燃燒 <b>${esc(money(data, run, burn))}</b></li>
      <li>目前速度可生存 <b>${months >= 24 ? "很長" : months.toFixed(1) + " 季"}</b></li>
      <li class="worst">若客流再跌 20%：<b>${worst >= 24 ? "仍很長" : worst.toFixed(1) + " 季"}</b></li>
      ${opts.debt ? `<li>債務 <b>${esc(money(data, run, num(run.finance?.debt, 0)))}</b></li>` : ""}
    </ul>
  </figure>`;
}

/* ── 2. 現金流瀑布 ─────────────────────────────────────── */

export function waterfallSteps(data, run) {
  const last = run.last;
  if (!last?.parts) return [];
  const biz = run.work || {};
  const previous = (run.series || []).slice(-2)[0]?.cash;
  const flow = cashflowLedger(last, { sells: biz.sells }, previous);
  const steps = [{ k: "inflow", label: "現金入帳", v: flow.totalIn, kind: "total" }];
  for (const item of flow.expenses) {
    if (item.amount > 1e-9) steps.push({ k: item.key, label: item.label, v: -item.amount, kind: "cost" });
  }
  steps.push({ k: "net", label: "現金淨變動", v: flow.net, kind: "net" });
  return steps;
}

export function waterfall(data, run) {
  const steps = waterfallSteps(data, run);
  if (!steps.length) return `<figure class="chart chart-waterfall"><figcaption>現金入帳與支出</figcaption><p class="muted">結算第一季之後，這裡會顯示實際收款、每項支出與現金變化。</p></figure>`;
  const w = 340, h = 150, pad = 18;
  const bw = Math.min(30, (w - 8) / steps.length - 3);
  let run0 = 0;
  const bars = [];
  const maxAbs = Math.max(...steps.map((s) => Math.abs(s.v)), 0.05);
  const scale = (h - pad * 2) / (maxAbs * 1.9);
  const zero = h / 2;
  steps.forEach((s, i) => {
    const x = 4 + i * ((w - 8) / steps.length);
    if (s.kind === "total" || s.kind === "net") {
      const bh = Math.abs(s.v) * scale;
      const y = s.v >= 0 ? zero - bh : zero;
      bars.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${Math.max(1, bh).toFixed(1)}" rx="2" fill="${s.kind === "net" ? (s.v >= 0 ? "#2a6a4a" : "#8f2d2d") : "#3c342c"}"/>`);
      bars.push(`<text x="${(x + bw / 2).toFixed(1)}" y="${(s.v >= 0 ? y - 3 : y + bh + 9).toFixed(1)}" font-size="8" text-anchor="middle" fill="#3c342c">${esc(money(data, run, s.v))}</text>`);
      run0 = s.v;
    } else {
      const from = run0;
      run0 += s.v;
      const y1 = zero - Math.max(from, run0) * scale;
      const y2 = zero - Math.min(from, run0) * scale;
      bars.push(`<rect x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${bw}" height="${Math.max(1, y2 - y1).toFixed(1)}" rx="2" fill="${s.k === "ar" ? "#a89680" : "#8f2d2d"}" opacity="0.82"/>`);
      bars.push(`<line x1="${(x - 2).toFixed(1)}" y1="${(zero - from * scale).toFixed(1)}" x2="${(x + bw + 2).toFixed(1)}" y2="${(zero - from * scale).toFixed(1)}" stroke="#7a6e62" stroke-width="0.6" stroke-dasharray="2 2"/>`);
    }
  });
  bars.push(`<line x1="0" y1="${zero}" x2="${w}" y2="${zero}" stroke="#7a6e62" stroke-width="1"/>`);
  const rows = steps.map((s) => `<li class="${s.v < 0 ? "down" : "up"}"><span>${esc(s.label)}</span><b>${esc(money(data, run, s.v))}</b></li>`).join("");
  const killer = steps.filter((s) => s.kind === "cost").sort((a, b) => a.v - b.v)[0];
  return `<figure class="chart chart-waterfall">
    <figcaption>現金入帳與支出</figcaption>
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="現金流瀑布圖，${esc(killer ? `最大的一項現金流出是${killer.label}` : "沒有支出")}">${bars.join("")}</svg>
    <ul class="chart-rows">${rows}</ul>
    ${killer ? `<p class="chart-verdict">這季最大的現金流出是<b>${esc(killer.label)}</b>（${esc(money(data, run, killer.v))}）。</p>` : ""}
  </figure>`;
}

/** 主遊戲畫面上常駐的精簡現金帳。 */
export function cashflowPanel(data, run, forecast = null) {
  const biz = run.work || {};
  const last = run.last?.parts ? run.last : null;
  const estimated = !last;
  if (estimated && !forecast?.parts) {
    return `<figure class="chart chart-cashflow"><figcaption>公司現金流</figcaption><p class="muted">開業後，這裡會逐項列出客戶收款、租金、薪酬、材料與其他支出。</p></figure>`;
  }

  const previousCash = (run.series || []).slice(-2)[0]?.cash;
  const forecastRevenue = forecast?.revenue || [0, 0];
  const revenueMid = (num(forecastRevenue[0]) + num(forecastRevenue[1])) / 2;
  const source = last || {
    revenue: revenueMid,
    collected: num(forecast?.parts?.collectedNow) + num(forecast?.parts?.releasing),
    parts: forecast.parts,
  };
  const flow = cashflowLedger(source, biz, previousCash);
  const cashChange = estimated ? flow.totalIn - flow.totalOut : flow.net;
  const minRange = (range) => `${esc(money(data, run, num(range?.[0])))} – ${esc(money(data, run, num(range?.[1])))}`;
  const signed = (value) => `${value > 0 ? "+" : ""}${esc(money(data, run, value))}`;
  const revenueText = estimated ? minRange(forecastRevenue) : esc(money(data, run, flow.revenue));
  const inflowText = estimated ? minRange(forecast.collected) : esc(money(data, run, flow.totalIn));
  const outflowText = estimated
    ? `${esc(money(data, run, -num(forecast.costs?.[0])))} – ${esc(money(data, run, -num(forecast.costs?.[1])))}`
    : esc(money(data, run, -flow.totalOut));
  const changeText = estimated
    ? minRange([
      num(forecast.collected?.[0]) - num(forecast.costs?.[1]),
      num(forecast.collected?.[1]) - num(forecast.costs?.[0]),
    ])
    : signed(cashChange);
  const stateClass = cashChange < -0.005 ? "down" : "up";
  const scale = Math.max(flow.totalIn, flow.totalOut, 0.01);
  const biggestIn = flow.inflows.slice().sort((a, b) => b.amount - a.amount)[0];
  const biggestOut = flow.expenses.slice().sort((a, b) => b.amount - a.amount)[0];
  const incomeRows = flow.inflows.map((item) => `<li class="cashflow-line in">
    <span class="cashflow-line-label">${esc(item.label)}</span><b>${esc(money(data, run, item.amount))}</b>
  </li>`).join("") || `<li class="muted">目前沒有現金入帳。</li>`;
  const expenseRows = flow.expenses.slice().sort((a, b) => b.amount - a.amount).map((item) => {
    const share = clamp((item.amount / Math.max(flow.totalOut, 0.01)) * 100, 0, 100);
    return `<li class="cashflow-line out">
      <div class="cashflow-line-main"><span class="cashflow-line-label">${esc(item.label)}</span>
        <span class="cashflow-share"><i style="width:${share.toFixed(1)}%"></i></span></div>
      <b>${esc(money(data, run, -item.amount))}</b>
    </li>`;
  }).join("") || `<li class="muted">目前沒有現金支出。</li>`;

  const points = (run.series || []).slice(-8).map((item) => {
    const recordedIn = item.collected ?? (run.last?.month === item.m ? run.last.collected : undefined);
    const hasCashIn = recordedIn !== undefined && recordedIn !== null && recordedIn !== "" && Number.isFinite(Number(recordedIn));
    return {
      m: item.m,
      cashIn: hasCashIn ? num(recordedIn) : 0,
      hasCashIn,
      cashOut: Number.isFinite(Number(item.cashOut)) ? num(item.cashOut) : num(item.cost),
      hasCashOut: Number.isFinite(Number(item.cashOut)),
    };
  });
  if (estimated && !points.length) points.push({ m: "預估", cashIn: flow.totalIn, cashOut: flow.totalOut, hasCashIn: true, hasCashOut: true });
  const hasLegacyHistory = points.some((point) => !point.hasCashIn || !point.hasCashOut);
  const chartW = 320, chartH = 92, baseY = 68;
  const chartMax = Math.max(0.01, ...points.flatMap((point) => [point.cashIn, point.cashOut]));
  const slot = points.length ? (chartW - 20) / points.length : chartW - 20;
  const barW = Math.max(3, Math.min(13, (slot - 5) / 2));
  const chartBars = points.map((point, index) => {
    const center = 10 + slot * index + slot / 2;
    const inH = point.hasCashIn ? Math.max(point.cashIn > 0 ? 1 : 0, (point.cashIn / chartMax) * 48) : 0;
    const outH = Math.max(point.cashOut > 0 ? 1 : 0, (point.cashOut / chartMax) * 48);
    const xIn = center - barW - 1;
    const xOut = center + 1;
    const label = typeof point.m === "number" ? `第 ${point.m} 季` : point.m;
    const inTitle = point.hasCashIn ? `${label}現金入帳 ${money(data, run, point.cashIn)}` : `${label}的舊存檔未分開記錄現金入帳`;
    const outTitle = point.hasCashOut ? `${label}現金流出 ${money(data, run, point.cashOut)}` : `${label}記錄的營運開支 ${money(data, run, point.cashOut)}`;
    return `<g>
      ${point.hasCashIn ? `<rect x="${xIn.toFixed(1)}" y="${(baseY - inH).toFixed(1)}" width="${barW.toFixed(1)}" height="${inH.toFixed(1)}" rx="2" fill="#2a6a4a"><title>${esc(inTitle)}</title></rect>` : `<title>${esc(inTitle)}</title>`}
      <rect x="${xOut.toFixed(1)}" y="${(baseY - outH).toFixed(1)}" width="${barW.toFixed(1)}" height="${outH.toFixed(1)}" rx="2" fill="#8f2d2d"><title>${esc(outTitle)}</title></rect>
      <text x="${center.toFixed(1)}" y="84" text-anchor="middle" font-size="8" fill="#7a6e62">${typeof point.m === "number" ? point.m : "估"}</text>
    </g>`;
  }).join("");
  const liveStart = estimated ? "估算期間進行中" : "本季進行中";
  const note = estimated
    ? "開業預測按目前設定估算，實際收款與開支會隨客流、帳期和事件改變。流出亦會分開列出創辦人提款、還本金與生活費補貼。"
    : `營業額是帳面收入，不等於現金入帳；逾期合約款會在之後的季度才收回。流出亦包含提款、還本金等非營運項目。${hasLegacyHistory ? "舊存檔較早季度未分開記錄實際入帳，圖上會留空而不拿營業額冒充收款。" : ""}`;

  return `<figure class="chart chart-cashflow" aria-label="公司現金流總覽">
    <figcaption><span>${estimated ? "開業預估現金流" : "公司現金流 · 最近一季"}</span><span class="cashflow-period">${estimated ? "估算" : `第 ${last.month} 季`}</span></figcaption>
    <div class="cashflow-metrics">
      <div><span>帳面營業額</span><b>${revenueText}</b></div>
      <div><span>現金入帳</span><b class="positive">${inflowText}</b></div>
      <div><span>現金流出</span><b class="negative">${outflowText}</b></div>
      <div><span>現金淨變動</span><b class="${stateClass}">${changeText}</b></div>
    </div>
    <div class="cashflow-total-bars" aria-label="現金入帳與流出比較">
      <div class="cashflow-total-row"><span>入帳</span><i><em class="positive-bar" style="width:${clamp((flow.totalIn / scale) * 100, 0, 100).toFixed(1)}%"></em></i><b class="positive">${esc(money(data, run, flow.totalIn))}</b></div>
      <div class="cashflow-total-row"><span>流出</span><i><em class="negative-bar" style="width:${clamp((flow.totalOut / scale) * 100, 0, 100).toFixed(1)}%"></em></i><b class="negative">${esc(money(data, run, -flow.totalOut))}</b></div>
    </div>
    <p class="cashflow-insight">最大收款：<b>${biggestIn ? esc(biggestIn.label) : "—"}</b> <strong class="positive">${biggestIn ? esc(money(data, run, biggestIn.amount)) : ""}</strong> · 最大流出：<b>${biggestOut ? esc(biggestOut.label) : "—"}</b> <strong class="negative">${biggestOut ? esc(money(data, run, -biggestOut.amount)) : ""}</strong></p>
    <div class="cashflow-breakdown">
      <section><h4>收入來源</h4><ul>${incomeRows}</ul></section>
      <section><h4>流出項目</h4><ul>${expenseRows}</ul></section>
    </div>
    <p class="cashflow-live" id="cashflow-live" aria-live="polite"><span>${liveStart}</span> · 已入帳 <b class="positive" id="cashflow-live-in">${esc(money(data, run, 0))}</b> · 已支出 <b class="negative" id="cashflow-live-out">${esc(money(data, run, 0))}</b></p>
    <p class="cashflow-note">${note}</p>
    <div class="cashflow-history">
      <div class="cashflow-history-head"><span>近 8 季收款／支出</span><span class="cashflow-legend"><i class="in"></i>入帳 <i class="out"></i>支出</span></div>
      <svg viewBox="0 0 ${chartW} ${chartH}" role="img" aria-label="${esc(`近 ${points.length} 季的每季現金入帳與支出，綠色為入帳，紅色為支出`)}">
        <line x1="8" y1="${baseY}" x2="${chartW - 8}" y2="${baseY}" stroke="#d9cbb8" stroke-width="1"/>${chartBars}
      </svg>
    </div>
  </figure>`;
}

/* ── 3. 顧客漏斗 ───────────────────────────────────────── */

const FUNNEL_FIX = {
  passersby: ["位置、招牌、外觀", "有多少人經過你的門口"],
  entered: ["招牌、陳列、門口的隊", "願意走進來的比例"],
  orders: ["價格、菜單、品質、評價", "走進來之後決定要買"],
  served: ["人手、設備、流程", "你做得完的量"],
  paid: ["帳期、退貨、付款摩擦", "真的收到錢"],
  repeat: ["品質穩定、信任", "願意再來一次"],
  loyal: ["會員制、關係、熟客", "會帶別人來的那些人"],
};

export function funnel(data, run) {
  const ops = run.last?.ops || run.lastOps;
  if (!ops) return `<figure class="chart chart-funnel"><figcaption>顧客漏斗</figcaption><p class="muted">結算一次之後，這裡會顯示客人怎麼一層一層少掉。</p></figure>`;
  const rows = [
    ["passersby", "路過", ops.passersby],
    ["entered", "走進店裡", ops.entered],
    ["orders", "下單", ops.orders],
    ["served", "做得完", ops.served],
    ["paid", "付到錢", ops.paid],
    ["repeat", "再來", ops.repeat],
    ["loyal", "成為熟客", ops.loyal],
  ];
  const max = Math.max(1, ...rows.map((r) => r[2]));
  const body = rows.map(([k, label, v], i) => {
    const prev = i ? rows[i - 1][2] : v;
    const conv = prev > 0 ? Math.round((v / prev) * 100) : 100;
    const fix = FUNNEL_FIX[k] || ["", ""];
    const leak = i && conv < 55;
    return `<li class="${leak ? "leak" : ""}">
      <div class="funnel-bar"><i style="width:${clamp((v / max) * 100, 1.5, 100).toFixed(1)}%"></i></div>
      <div class="funnel-meta"><b>${esc(label)}</b><span>${r0(v)} 人${i ? ` · ${conv}%` : ""}</span></div>
      <p class="funnel-fix">${leak ? "這一層漏得最多：" : "改善手段："}${esc(fix[0])}</p>
    </li>`;
  }).join("");
  const worstIdx = rows.slice(1).map((r, i) => ({ i: i + 1, conv: rows[i][2] > 0 ? r[2] / rows[i][2] : 1 })).sort((a, b) => a.conv - b.conv)[0];
  return `<figure class="chart chart-funnel">
    <figcaption>顧客漏斗</figcaption>
    <ul class="funnel">${body}</ul>
    ${worstIdx ? `<p class="chart-verdict">最大的漏點在「${esc(rows[worstIdx.i][1])}」這一層：${esc(FUNNEL_FIX[rows[worstIdx.i][0]][1])}。</p>` : ""}
  </figure>`;
}

/* ── 4. 產能瓶頸 ───────────────────────────────────────── */

export function bottleneck(data, run) {
  const ops = run.last?.ops || run.lastOps;
  if (!ops) return `<figure class="chart chart-cap"><figcaption>產能瓶頸</figcaption><p class="muted">結算一次之後，這裡會指出卡在人、設備還是場地。</p></figure>`;
  const rows = [
    ["需求", ops.orders, "#3c342c"],
    ["人手與設備做得完", ops.handsCap, "#2a5a6a"],
    ["場地與收銀接得住", ops.frontCap, "#7a6e62"],
    ["實際完成", ops.served, "#2a6a4a"],
  ];
  const max = Math.max(1, ...rows.map((r) => r[1]));
  const bars = rows.map(([label, v, color]) => `<li>
      <span class="cap-label">${esc(label)}</span>
      <span class="cap-bar"><i style="width:${clamp((v / max) * 100, 1, 100).toFixed(1)}%;background:${color}"></i></span>
      <b class="cap-num">${r0(v)}</b>
    </li>`).join("");
  const gapHands = ops.orders - ops.handsCap;
  const gapFront = ops.handsCap - ops.frontCap;
  let verdict;
  if (gapHands > Math.max(4, ops.orders * 0.08)) verdict = `卡在<b>人與設備</b>：有 ${r0(gapHands)} 單沒有人做得完。要嘛加人、要嘛買設備、要嘛把流程改短。`;
  else if (gapFront > Math.max(4, ops.orders * 0.08)) verdict = `卡在<b>場地與收銀</b>：做得出來，但接不住。櫃檯、動線或店面大小是瓶頸。`;
  else if (ops.served < ops.orders * 0.98) verdict = `差一點點：${r0(ops.orders - ops.served)} 單在最後一步流失。`;
  else verdict = `產能不是這季的問題。<b>需求</b>才是：你做得完，但沒有那麼多人要。`;
  return `<figure class="chart chart-cap">
    <figcaption>產能瓶頸</figcaption>
    <ul class="cap">${bars}</ul>
    <p class="chart-verdict">${verdict}</p>
    <p class="muted">利用率 ${Math.round(num(ops.utilization, 0) * 100)}%。利用率長期高於九成，人的壓力會跟著上來。</p>
  </figure>`;
}

/* ── 5. 決策回顧線 ─────────────────────────────────────── */

const MARK_ICON = {
  price: "價", hire: "聘", fire: "裁", raise: "薪", market: "推", expand: "擴", transform: "轉",
  borrow: "借", repay: "還", repair: "修", rest: "休", close: "結", ipo: "市", succession: "班",
  event: "事", chain: "果", crisis: "危", weather: "天",
};

export function decisionMarks(run) {
  const marks = [];
  for (const c of run.choices || []) {
    const kind = /price/i.test(c.label || "") ? "price"
      : /聘|加人|人手的/.test(c.label || "") ? "hire"
        : /減|裁|請走/.test(c.label || "") ? "fire"
          : /薪/.test(c.label || "") ? "raise"
            : /借|額度|擔保|融資|債/.test(c.label || "") ? "borrow"
              : /平台|獨家|大促/.test(c.label || "") ? "market"
                : /第二|據點|擴張|分店/.test(c.label || "") ? "expand"
                  : /轉型|調整做法/.test(c.label || "") ? "transform" : "event";
    marks.push({ m: c.month, kind, label: c.label, chain: false });
  }
  for (const c of run.chains || []) {
    if (c.done) marks.push({ m: c.at, kind: "chain", label: `「${c.cause}」的後果`, chain: true });
  }
  for (const c of run.kpis?.crises || []) marks.push({ m: c.m, kind: "crisis", label: c.title, chain: false });
  for (const t of run.timeline || []) {
    if (/接班|上市|結業|開業|轉型/.test(t.title || "")) marks.push({ m: t.m, kind: t.title.includes("上市") ? "ipo" : t.title.includes("接班") ? "succession" : "event", label: t.title, chain: false });
  }
  const seen = new Set();
  return marks.filter((x) => {
    const k = `${x.m}:${x.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => a.m - b.m);
}

export function decisionLine(data, run, opts = {}) {
  const pts = (run.series || []).slice(-(opts.months || 120));
  if (pts.length < 2) return `<figure class="chart chart-line"><figcaption>決策回顧線</figcaption><p class="muted">兩季之後，這裡會有一條線，上面標著你當時做的決定。</p></figure>`;
  const w = 640, h = 170, padL = 8, padB = 20, padT = 14;
  const marks = decisionMarks(run).filter((m) => m.m >= pts[0].m && m.m <= pts[pts.length - 1].m);
  const max = Math.max(...pts.map((p) => p.cash), 0.05);
  const min = Math.min(...pts.map((p) => p.cash), 0);
  const X = (i) => padL + (i / (pts.length - 1)) * (w - padL * 2);
  const Y = (v) => padT + (1 - (v - min) / (max - min || 1)) * (h - padT - padB);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.cash).toFixed(1)}`).join(" ");
  const zeroY = Y(0);
  const idxOf = (m) => pts.findIndex((p) => p.m >= m);
  const markSvg = marks.slice(0, 40).map((mk) => {
    const i = idxOf(mk.m);
    if (i < 0) return "";
    const x = X(i);
    const color = mk.kind === "crisis" ? "#8f2d2d" : mk.kind === "chain" ? "#8a5a12" : "#2a5a6a";
    return `<g class="mark mark-${mk.kind}"><line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${(h - padB).toFixed(1)}" stroke="${color}" stroke-width="0.8" stroke-dasharray="2 3" opacity="0.55"/>
      <circle cx="${x.toFixed(1)}" cy="${padT - 4}" r="6" fill="${color}"/>
      <text x="${x.toFixed(1)}" y="${padT - 1}" font-size="8" text-anchor="middle" fill="#f4efe4">${MARK_ICON[mk.kind] || "·"}</text>
      <title>${esc(`第 ${mk.m} 季 · ${mk.label}`)}</title></g>`;
  }).join("");
  return `<figure class="chart chart-line">
    <figcaption>決策回顧線</figcaption>
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="現金曲線，上面標著 ${marks.length} 個當時的決定">
      <line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${w - padL}" y2="${zeroY.toFixed(1)}" stroke="#7a6e62" stroke-width="1"/>
      <path d="${path}" fill="none" stroke="#8f2d2d" stroke-width="2"/>
      ${markSvg}
      <text x="${padL}" y="${h - 6}" font-size="9" fill="#7a6e62">第 ${pts[0].m} 季</text>
      <text x="${w - padL}" y="${h - 6}" font-size="9" fill="#7a6e62" text-anchor="end">第 ${pts[pts.length - 1].m} 季</text>
    </svg>
    ${marks.length ? `<ul class="mark-list">${marks.slice(-14).reverse().map((mk) => `<li class="mark-${mk.kind}"><span>第 ${mk.m} 季</span><b>${esc(mk.label)}</b></li>`).join("")}</ul>` : ""}
  </figure>`;
}

/* ── 季初：預測與部署。重點是區間，不是準確答案。 ─────────── */

export function forecastPanel(data, run, fc) {
  if (!fc || !run.venture) return "";
  const ops = run.last?.ops || run.lastOps;
  const parts = run.last?.parts || {};
  const burn = Math.max(0, num(parts.operating, 0) + num(parts.personalTransfer, 0) - num(run.last?.collected, 0));
  const worstCash = num(run.finance?.cash, 0) + num(fc.collected?.[0], 0) - num(fc.costs?.[1], 0);
  const orders = Math.max(1, num(ops?.orders, 1));
  const revenue = Math.max(0.05, num(run.last?.revenue, 0.05));
  // 一單的貢獻毛利：賣一單能蓋掉多少固定帳。盈虧平衡就用它算。
  const perOrder = Math.max(0.0001, (revenue - num(parts.variable, 0) - num(parts.platform, 0)) / orders);
  const fixed = num(parts.premises, 0) + num(parts.labor, 0) + num(parts.interest, 0) + num(parts.royalty, 0) + num(parts.weather, 0);
  const breakevenOrders = perOrder > 0.0001 ? fixed / perOrder : Infinity;
  const aov = revenue / orders;
  const orderBand = [num(fc.revenue?.[0], 0) / aov, num(fc.revenue?.[1], 0) / aov];
  const capOrders = ops ? Math.max(ops.handsCap, ops.frontCap) : 0;
  const risk = biggestRisk(data, run, fc);
  return `<section class="forecast" aria-label="這季的預測與部署">
    <p class="fold-k">季初 · 預測與部署</p>
    <ul class="forecast-grid">
      <li><span>客流區間</span><b>${r0(orderBand[0])} – ${r0(orderBand[1])} 單</b></li>
      <li><span>帳面收入區間</span><b>${esc(money(data, run, fc.revenue?.[0]))} – ${esc(money(data, run, fc.revenue?.[1]))}</b></li>
      <li class="${worstCash < 0 ? "bad" : ""}"><span>最壞情況現金</span><b>${esc(money(data, run, worstCash))}</b></li>
      <li class="${Number.isFinite(breakevenOrders) && breakevenOrders > capOrders ? "bad" : ""}"><span>盈虧平衡所需</span><b>${Number.isFinite(breakevenOrders) ? r0(breakevenOrders) + " 單" : "毛利是負的"}</b></li>
      <li><span>最大產能</span><b>${r0(capOrders)} 單</b></li>
      <li><span>每季淨燃燒</span><b>${esc(money(data, run, burn))}</b></li>
    </ul>
    <p class="forecast-risk">最大風險來源：<b>${esc(risk)}</b></p>
    <p class="muted">這是區間，不是答案。同一個決定，不同的季度會給不同的結果。</p>
  </section>`;
}

function biggestRisk(data, run, fc) {
  const v = run.venture;
  const parts = run.last?.parts || {};
  const rl = run.redlineSnap;
  const list = [];
  const cash = num(run.finance?.cash, 0);
  const burn = Math.max(0.01, num(parts.operating, 0) + num(parts.personalTransfer, 0) - num(run.last?.collected, 0));
  list.push([cash / burn < 4 ? 5 : 1, `現金只夠 ${Math.max(0, cash / burn).toFixed(1)} 季`]);
  if (num(parts.platformRate, 0) > 0.12) list.push([4, `平台抽走 ${Math.round(parts.platformRate * 100)}% 的收入`]);
  if (num(parts.premises, 0) > num(run.last?.revenue, 0) * 0.3) list.push([4, `場地吃掉 ${Math.round((parts.premises / Math.max(0.01, run.last.revenue)) * 100)}% 的營業額`]);
  if (num(run.crewStress, 0) > 0.7) list.push([3, "人的壓力已經到會出錯的位置"]);
  if (num(run.founder?.health, 1) < 0.5) list.push([4, "你自己的身體"]);
  if (num(run.finance?.debt, 0) > 3) list.push([3, `債務 ${money(data, run, run.finance.debt)}`]);
  if (num(v?.concentration, 0) > 0.5) list.push([3, `最大客戶佔 ${Math.round(v.concentration * 100)}%`]);
  if (run.weather && num(run.weather.demand, 0) < -0.1) list.push([2, `${run.weather.label}會把客流壓下來`]);
  if (rl?.level === "crit") list.push([5, `${rl.name}已經越過紅線`]);
  if (!list.length) list.push([1, "這季沒有明顯的單一風險"]);
  list.sort((a, b) => b[0] - a[0]);
  return list[0][1];
}
