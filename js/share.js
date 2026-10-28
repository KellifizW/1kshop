import { rarityLine } from "./present.js";
import { memorial as buildMemorial, obituary } from "./story.js";

const CARD_FONT = '"Microsoft JhengHei UI", "PingFang TC", "Noto Sans TC", QianWen, sans-serif';
const INK = "#1c1612";
const PAPER = "#f4efe4";
const SEAL = "#8f2d2d";
const SOFT = "#3c342c";
const MUTED = "#7a6e62";
const RULE = "#e0d5c6";

/**
 * 創業訃告／企業紀念卡。
 *
 * 一張直的、可以傳給朋友的圖：店名、開業地點、行業、撐了多久、
 * 服務過多少人、最多時幾個人、累計營業額、最大的危機、最重要的決定、
 * 最後的死因或成就、一句墓誌銘，以及「你 beat 了多少同樣開局的人」。
 *
 * 上面的插圖不是裝飾：它畫的是結業那一天這間店的樣子。
 */
export async function paintCard(canvas, data, state, ending, memorial) {
  try { await document.fonts.load("64px 'Microsoft JhengHei UI'"); } catch { /* system face may already be available */ }
  try { await document.fonts.load("64px QianWen"); } catch { /* share card can fall back to the system face */ }
  await document.fonts.ready;
  const m = memorial || buildMemorial(data, state, ending);
  const w = 1080;
  const h = 1620;
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  g.textBaseline = "alphabetic";
  g.fillStyle = INK;
  g.fillRect(0, 0, w, h);
  g.fillStyle = PAPER;
  roundRect(g, 64, 64, w - 128, h - 128, 28);
  g.fill();
  g.strokeStyle = SEAL;
  g.lineWidth = 3;
  g.stroke();

  seal(g, w - 210, 200, 74);

  g.textAlign = "left";
  g.fillStyle = MUTED;
  g.font = `28px ${CARD_FONT}`;
  g.fillText("千分之一的店", 120, 168);

  g.fillStyle = INK;
  g.font = `66px ${CARD_FONT}`;
  const nameY = wrap(g, m.name, 120, 258, 700, 78);

  g.font = `30px ${CARD_FONT}`;
  g.fillStyle = SOFT;
  g.fillText(`${m.years} · ${m.city} · ${m.industry || "未成業"}`, 120, nameY + 34);

  const closed = m.group === "fail";
  shopFront(g, 120, nameY + 66, 840, 210, { closed, century: m.group === "success" && m.months >= 600 });

  let y = nameY + 66 + 210 + 44;
  rule(g, y);
  y += 56;

  const stats = [
    ["撐了", m.life],
    ["服務過", `${m.customers.toLocaleString("zh-Hant")} 個人`],
    ["最多的時候", `${m.peakCrew} 個人在裡面做事`],
    ["累計營業額", m.money(m.revenueTotal)],
  ];
  for (const [label, value] of stats) {
    g.fillStyle = MUTED;
    g.font = `26px ${CARD_FONT}`;
    g.fillText(label, 120, y);
    g.fillStyle = INK;
    g.font = `38px ${CARD_FONT}`;
    g.textAlign = "right";
    g.fillText(value, w - 120, y);
    g.textAlign = "left";
    y += 62;
  }

  y += 6;
  rule(g, y);
  y += 52;
  y = pair(g, "最大的危機", m.crisis ? `第 ${m.crisis.month} 個月 · ${m.crisis.title}` : "沒有單一件大事。是很多件小事加起來。", 120, y, 840);
  y = pair(g, "最重要的決定", m.decision ? `第 ${m.decision.month} 個月 · ${m.decision.label}` : "沒有做過足以改變方向的決定。", 120, y, 840);

  y += 8;
  rule(g, y);
  y += 66;

  g.fillStyle = SEAL;
  g.font = `54px ${CARD_FONT}`;
  g.fillText(m.title, 120, y);
  y += 46;
  g.fillStyle = SOFT;
  g.font = `30px ${CARD_FONT}`;
  y = wrap(g, m.cause, 120, y, 840, 44);

  y += 16;
  g.fillStyle = INK;
  g.font = `30px ${CARD_FONT}`;
  y = wrap(g, m.epitaph, 120, y, 840, 44);

  y += 12;
  g.fillStyle = SEAL;
  g.font = `28px ${CARD_FONT}`;
  y = wrap(g, state.mode === "history"
    ? "歷史範本的遊戲模擬；經營結果和數字並非真實企業紀錄。"
    : `以同樣的開局條件看，你走得比 ${m.percentile}% 的創業者久，或走得比他們清楚。${rarityLine(m.prior)}。`, 120, y, 840, 40);

  g.fillStyle = "#8a8178";
  g.font = `22px ${CARD_FONT}`;
  g.fillText("模擬，不是建議。種子 " + state.seed, 120, h - 128);
  g.textAlign = "right";
  g.fillText(`${m.life} · ${ending?.title || m.title}`, w - 120, h - 128);
  g.textAlign = "left";
  return canvas;
}

function pair(g, label, text, x, y, max) {
  g.fillStyle = MUTED;
  g.font = `26px ${CARD_FONT}`;
  g.fillText(label, x, y);
  g.fillStyle = INK;
  g.font = `32px ${CARD_FONT}`;
  return wrap(g, text, x, y + 42, max, 44) + 14;
}

function rule(g, y) {
  g.strokeStyle = RULE;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(120, y);
  g.lineTo(960, y);
  g.stroke();
}

function seal(g, cx, cy, r) {
  g.fillStyle = SEAL;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = PAPER;
  g.textAlign = "center";
  g.font = `26px ${CARD_FONT}`;
  g.fillText("千分之一", cx, cy - 6);
  g.font = `20px ${CARD_FONT}`;
  g.fillText("的店", cx, cy + 26);
  g.textAlign = "left";
}

/**
 * 卡片上的店。它跟遊戲裡的舞台是同一套語言：
 * 結業的店燈是暗的、貨架是空的、門上貼著紙；百年的店招牌換過、街上多了樹。
 */
function shopFront(g, x, y, w, h, opts = {}) {
  const dim = opts.closed;
  g.save();
  g.globalAlpha = dim ? 0.62 : 1;
  // 天空與街
  g.fillStyle = dim ? "#cfc7bb" : "#cfe0e4";
  g.fillRect(x, y, w, h * 0.42);
  g.fillStyle = dim ? "#b9b0a4" : "#c9a87c";
  g.fillRect(x, y + h * 0.42, w, h * 0.58);
  // 鄰居
  g.fillStyle = dim ? "#a89e92" : "#d8c9b4";
  g.fillRect(x + 8, y + h * 0.1, 150, h * 0.32);
  g.fillRect(x + w - 158, y + h * 0.06, 150, h * 0.36);
  // 自己的店
  const bx = x + 190;
  const bw = w - 380;
  const by = y + h * 0.05;
  const bh = h * 0.37;
  g.fillStyle = dim ? "#d6cec2" : "#e7dccb";
  g.fillRect(bx, by, bw, bh);
  // 招牌
  g.fillStyle = dim ? "#6b6055" : SEAL;
  g.fillRect(bx - 10, by - 26, bw + 20, 34);
  g.fillStyle = PAPER;
  g.font = `26px ${CARD_FONT}`;
  g.textAlign = "center";
  g.fillText(opts.century ? "一百年了" : dim ? "已 結 業" : "營 業 中", bx + bw / 2, by - 1);
  g.textAlign = "left";
  // 雨遮
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? (dim ? "#b7ada1" : "#f0e6d6") : (dim ? "#8d8378" : SEAL);
    g.fillRect(bx - 14 + i * ((bw + 28) / 8), by + bh - 6, (bw + 28) / 8, 16);
  }
  // 門與窗
  g.fillStyle = dim ? "#3a332c" : "#ffd9a0";
  g.fillRect(bx + bw / 2 - 34, by + bh * 0.34, 68, bh * 0.66);
  g.fillStyle = dim ? "#b3aa9e" : "#cfe0e4";
  g.fillRect(bx + 22, by + bh * 0.3, bw * 0.24, bh * 0.42);
  g.fillRect(bx + bw - 22 - bw * 0.24, by + bh * 0.3, bw * 0.24, bh * 0.42);
  // 貨架的影子：結業時是空的
  if (!dim) {
    g.fillStyle = "#b98b5e";
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 4; c++) g.fillRect(bx + 26 + c * 20, by + bh * 0.34 + r * 16, 14, 10);
    }
  }
  // 結業的紙
  if (dim) {
    g.save();
    g.translate(bx + bw / 2, by + bh * 0.6);
    g.rotate(-0.06);
    g.fillStyle = "#f4efe4";
    g.fillRect(-58, -34, 116, 68);
    g.strokeStyle = "#8a8178";
    g.lineWidth = 2;
    g.strokeRect(-58, -34, 116, 68);
    g.fillStyle = "#5c534a";
    g.font = `22px ${CARD_FONT}`;
    g.textAlign = "center";
    g.fillText("暫 歇", 0, -2);
    g.font = `16px ${CARD_FONT}`;
    g.fillText("謝謝你們", 0, 22);
    g.textAlign = "left";
    g.restore();
  }
  // 植物與路人
  g.fillStyle = dim ? "#6f7a70" : "#2a6a4a";
  g.beginPath();
  g.arc(bx - 34, y + h * 0.36, 18, 0, Math.PI * 2);
  g.arc(bx - 20, y + h * 0.3, 15, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = dim ? "#8f6842" : "#8f6842";
  g.fillRect(bx - 30, y + h * 0.36, 10, 22);
  const people = dim ? 1 : 4;
  for (let i = 0; i < people; i++) {
    const px = x + 40 + i * ((w - 80) / Math.max(1, people)) + 12;
    const py = y + h * 0.66;
    g.fillStyle = ["#7a5c4a", "#4a5f6a", "#6a4a52", "#5a6a4a"][i % 4];
    g.beginPath();
    g.arc(px, py, 9, 0, Math.PI * 2);
    g.fill();
    g.fillRect(px - 8, py + 9, 16, 26);
  }
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function wrap(g, text, x, y, max, lh) {
  const chars = [...String(text || "")];
  let line = "";
  let yy = y;
  for (const ch of chars) {
    const test = line + ch;
    if (g.measureText(test).width > max) {
      g.fillText(line, x, yy);
      line = ch;
      yy += lh;
    } else line = test;
  }
  if (line) g.fillText(line, x, yy);
  return yy + lh;
}

/** 分享時跟著圖一起送出去的文字。 */
export function shareText(data, state, ending, m) {
  const mem = m || buildMemorial(data, state, ending);
  return [
    `《千分之一的店》`,
    `${mem.name}（${mem.years}）`,
    `${mem.title}：${mem.cause}`,
    `${mem.life} · 服務過 ${mem.customers.toLocaleString("zh-Hant")} 人 · 最多 ${mem.peakCrew} 個人`,
    state.mode === "history" ? "歷史範本模擬；這不是企業的真實結果。" : `你走得比 ${mem.percentile}% 的創業者久，或走得比他們清楚。`,
    `${mem.epitaph}`,
  ].join("\n");
}

export function cardBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export { obituary };
