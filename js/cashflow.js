const EPSILON = 1e-9;
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * 這裡記的是現金的實際流入／流出，不把會計類別混為一談。
 * 還本金與創辦人提款會減少現金，但不是營運費用，因此分開列示。
 */
const EXPENSES = [
  { key: "variable", label: "材料與履約成本", shortLabel: "材料／履約", at: 0.32 },
  { key: "platform", label: "平台／渠道抽成", shortLabel: "平台抽成", at: 0.42 },
  { key: "labor", label: "員工薪酬", shortLabel: "員工薪酬", at: 0.19 },
  { key: "premises", label: "租金與場地", shortLabel: "租金／場地", at: 0.08 },
  { key: "royalty", label: "權利金", shortLabel: "權利金", at: 0.5 },
  { key: "interest", label: "貸款利息", shortLabel: "利息", at: 0.62 },
  { key: "weather", label: "天氣／能源成本", shortLabel: "天氣／能源", at: 0.58 },
  { key: "tax", label: "稅款", shortLabel: "稅款", at: 0.76 },
  { key: "draw", label: "創辦人提款", shortLabel: "創辦人提款", at: 0.83 },
  { key: "principal", label: "償還貸款本金", shortLabel: "還本金", at: 0.9 },
  { key: "personalTransfer", label: "補貼創辦人生活費", shortLabel: "生活費補貼", at: 0.94 },
];

function hasNumber(value) {
  return value !== null && value !== "" && Number.isFinite(Number(value));
}

/** 從結算的原始分項，建立有來源名稱的現金帳。 */
export function cashflowLedger(last, biz = {}, previousCash = null) {
  const parts = last?.parts || {};
  const currentCollected = hasNumber(parts.collectedNow)
    ? num(parts.collectedNow)
    : Math.max(0, num(last?.collected) - num(parts.releasing));
  const released = hasNumber(parts.releasing)
    ? num(parts.releasing)
    : Math.max(0, num(last?.collected) - currentCollected);
  const paymentSource = biz.sells ? `${biz.sells}收款` : "客戶付款";
  const inflows = [];
  if (currentCollected > EPSILON) {
    inflows.push({
      key: "collectedNow",
      side: "in",
      amount: currentCollected,
      label: paymentSource,
      shortLabel: "客戶付款",
      at: 0.4,
    });
  }
  if (released > EPSILON) {
    inflows.push({
      key: "releasing",
      side: "in",
      amount: released,
      label: "收回先前應收帳款",
      shortLabel: "收回欠款",
      at: 0.68,
    });
  }

  const expenses = [];
  let listedOperating = 0;
  for (const item of EXPENSES) {
    const amount = Math.max(0, num(parts[item.key]));
    if (item.key !== "personalTransfer") listedOperating += amount;
    if (amount > EPSILON) expenses.push({ ...item, side: "out", amount });
  }

  // 舊存檔沒有新版分項時，把差額列為「其他營運開支」，不會默默漏帳。
  const unlisted = Math.max(0, num(parts.operating) - listedOperating);
  if (unlisted > EPSILON) {
    expenses.push({
      key: "otherOperating",
      side: "out",
      amount: unlisted,
      label: "其他營運開支",
      shortLabel: "其他開支",
      at: 0.7,
    });
  }

  const sum = (rows) => rows.reduce((total, row) => total + row.amount, 0);
  let totalIn = sum(inflows);
  let totalOut = sum(expenses);
  const cashStart = hasNumber(last?.cashStart)
    ? num(last.cashStart)
    : hasNumber(previousCash) ? num(previousCash) : null;
  const cashEnd = hasNumber(last?.cash) ? num(last.cash) : null;
  const net = cashStart !== null && cashEnd !== null ? cashEnd - cashStart : totalIn - totalOut;
  const reconciliation = net - (totalIn - totalOut);

  // 與公司實際現金餘額對帳。新機制或舊存檔的未分類差額都會明確顯示。
  if (Math.abs(reconciliation) > EPSILON) {
    if (reconciliation > 0) {
      inflows.push({
        key: "otherInflow",
        side: "in",
        amount: reconciliation,
        label: "其他現金收入／調整",
        shortLabel: "其他入帳",
        at: 0.88,
      });
      totalIn += reconciliation;
    } else {
      expenses.push({
        key: "otherOutflow",
        side: "out",
        amount: -reconciliation,
        label: "其他現金支出／調整",
        shortLabel: "其他支出",
        at: 0.88,
      });
      totalOut -= reconciliation;
    }
  }

  return {
    revenue: num(last?.revenue),
    inflows,
    expenses,
    totalIn,
    totalOut,
    net,
    cashStart,
    cashEnd,
    uncollected: Math.max(0, num(last?.revenue) - currentCollected),
  };
}

/**
 * 季內動畫使用的現金移動；所有正負脈衝總和，會等於公司現金的實際變化。
 */
export function cashflowPulses(startCash, endCash, last, biz = {}) {
  const ledger = cashflowLedger({ ...last, cashStart: startCash, cash: endCash }, biz);
  const pulses = [];
  const ticks = Math.max(1, Math.min(16, Math.round(num(biz.ticks, 6))));
  const late = !!biz.late;

  for (const item of ledger.inflows) {
    if (item.key === "collectedNow") {
      // 避免收入切得太碎，四捨五入後每個浮動數字都變成零。
      const receiptTicks = Math.max(1, Math.min(ticks, Math.floor(item.amount / 0.05) || 1));
      for (let i = 0; i < receiptTicks; i++) {
        const at = late ? 0.58 + 0.36 * ((i + 1) / receiptTicks) : 0.1 + 0.78 * ((i + 1) / (receiptTicks + 1));
        pulses.push({ ...item, at, amount: item.amount / receiptTicks });
      }
    } else {
      pulses.push({ ...item, at: item.at, amount: item.amount });
    }
  }
  for (const item of ledger.expenses) {
    pulses.push({ ...item, amount: -item.amount });
  }

  // 若新機制改變現金但沒有提供分類，顯示實際差額，而不是假造收入。
  const expectedDelta = endCash - startCash;
  const pulseDelta = pulses.reduce((total, pulse) => total + pulse.amount, 0);
  const adjustment = expectedDelta - pulseDelta;
  if (Math.abs(adjustment) > EPSILON) {
    pulses.push({
      key: "unclassifiedMovement",
      side: adjustment > 0 ? "in" : "out",
      amount: adjustment,
      label: adjustment > 0 ? "其他現金收入／調整" : "其他現金支出／調整",
      shortLabel: adjustment > 0 ? "其他入帳" : "其他支出",
      at: 0.97,
    });
  }
  return pulses.sort((a, b) => a.at - b.at);
}

export const cashflowExpenseLabels = EXPENSES.map(({ key, label }) => ({ key, label }));
