import { monthsLabel, rarityLine, worldLine } from "./present.js";

const CARD_FONT = '"Microsoft JhengHei UI", "PingFang TC", "Noto Sans TC", QianWen, sans-serif';

export async function paintCard(canvas, data, state, ending) {
  try { await document.fonts.load("64px 'Microsoft JhengHei UI'"); } catch { /* system face may already be available */ }
  try { await document.fonts.load("64px QianWen"); } catch { /* share card can fall back to the system face */ }
  await document.fonts.ready;
  const w = 1080;
  const h = 1620;
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  g.fillStyle = "#1c1612";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#f4efe4";
  roundRect(g, 64, 64, w - 128, h - 128, 28);
  g.fill();
  g.strokeStyle = "#8f2d2d";
  g.lineWidth = 3;
  g.stroke();

  g.fillStyle = "#8f2d2d";
  g.beginPath();
  g.arc(w - 210, 210, 78, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#f4efe4";
  g.font = `28px ${CARD_FONT}`;
  g.textAlign = "center";
  g.fillText("千分之一", w - 210, 204);
  g.font = `22px ${CARD_FONT}`;
  g.fillText("的店", w - 210, 238);

  const { city, fam } = worldLine(data, state);
  g.fillStyle = "#7a6e62";
  g.textAlign = "left";
  g.font = `28px ${CARD_FONT}`;
  g.fillText("千分之一的店", 120, 180);
  g.fillStyle = "#1c1612";
  g.font = `64px ${CARD_FONT}`;
  const name = state.venture?.name || "沒有開成的店";
  wrap(g, name, 120, 280, 760, 76);
  g.font = `32px ${CARD_FONT}`;
  g.fillStyle = "#3c342c";
  const place = `${city.name} · ${fam?.name || "未成業"}`;
  g.fillText(place, 120, 470);
  g.fillText(state.venture ? `經營了 ${monthsLabel(state.ending?.month ?? state.month)}` : "公司沒有開始", 120, 520);

  g.fillStyle = "#8f2d2d";
  g.font = `72px ${CARD_FONT}`;
  g.fillText(rarityLine(ending.prior), 120, 640);
  g.font = `36px ${CARD_FONT}`;
  g.fillStyle = "#1c1612";
  g.fillText(ending.stamp || ending.title, 120, 700);

  g.strokeStyle = "#e0d5c6";
  g.beginPath();
  g.moveTo(120, 760);
  g.lineTo(w - 120, 760);
  g.stroke();

  g.fillStyle = "#1c1612";
  g.font = `36px ${CARD_FONT}`;
  const y1 = wrap(g, ending.fact, 120, 830, 840, 52);
  g.fillStyle = "#5c534a";
  g.font = `32px ${CARD_FONT}`;
  const y2 = wrap(g, ending.cost, 120, y1 + 36, 840, 48);
  g.fillStyle = "#8f2d2d";
  g.font = `30px ${CARD_FONT}`;
  const mem = ending.featured ? `留下：${ending.featured.name}` : "留下：一本合上的帳簿";
  wrap(g, mem, 120, y2 + 48, 840, 44);

  g.fillStyle = "#8a8178";
  g.font = `24px ${CARD_FONT}`;
  g.fillText("模擬，不是建議。種子 " + state.seed, 120, h - 140);
  g.fillText(ending.title, 120, h - 100);
  return canvas;
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

export function cardBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
