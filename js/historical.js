/**
 * 史實是背景資料，不是玩家局內已經發生的事。
 * 所有選項、觸發節奏和數值都是遊戲設計；兩個節點的資料在
 * research/historical-companies.psv，來源可在遊戲內打開。
 */

export function historicalCompany(data, id) {
  return (data?.historical?.companies || []).find((company) => company.id === id) || null;
}

const SECTORS = {
  chips: ['半導體', '晶片設計及設備客戶', '一批晶片'],
  electronics: ['電子產品', '電子產品客戶', '一件產品'],
  industrial: ['工業及設備', '企業及機構客戶', '一套設備或一批產品'],
  auto: ['汽車', '汽車買家', '一部車'],
  software: ['企業軟件', '企業客戶', '一份軟件服務'],
  network: ['網絡設備', '企業和機構', '一套網絡設備'],
  telecom: ['電訊服務', '通訊服務客戶', '一份通訊服務'],
  platform: ['網絡平台', '平台使用者及商戶', '一次平台服務'],
  retail: ['零售', '購物的客人', '一件商品'],
  luxury: ['奢侈品', '選購精品的客人', '一件商品'],
  consumer: ['消費品', '消費者及零售商', '一件商品'],
  food: ['食品及飲料', '顧客與分銷商', '一件食品或飲品'],
  energy: ['能源', '能源買家及合作企業', '一批能源或一項服務'],
  bank: ['銀行及金融', '存戶與企業客戶', '一項金融服務'],
  payments: ['支付網絡', '商戶及支付網絡成員', '一筆支付服務'],
  insurance: ['醫療保障', '醫療計劃客戶', '一份服務'],
  pharma: ['醫療及製藥', '醫療機構及合作夥伴', '一批醫療產品'],
  agri: ['農業及水產', '食品買家', '一批產品'],
  media: ['文化及媒體', '觀眾及發行夥伴', '一部作品或一份服務'],
};

/** 經營單位與現有模擬共用；不把遊戲中的工作、人物和本金當史實。 */
export function historicalWork(company) {
  const [industry, buyer, unit] = SECTORS[company.sector] || ['企業經營', '客戶', '一份產品或服務'];
  return {
    id: company.id,
    name: company.name,
    company: `以${company.name}為藍本的${industry}企業`,
    industry,
    does: `故事以${company.startingBusiness}作為起步業務，之後的方向由你的選擇決定。`,
    sells: company.startingBusiness,
    buyer,
    unit,
    scale: '研究史實轉折，再決定是擴張、合作還是守住原有業務。',
    hire: '先請能把現有交付做好的人。',
    companyTypeName: '歷史範本',
    core: company.startingBusiness,
  };
}

// 選擇後的回響是虛構情境，不冒充另一個歷史事實。
const FOLLOWUP_QUESTIONS = {
  product: '接下來要怎樣安排產品測試、交付和客戶的期望？',
  technology: '研發、維護與原有營運都要資源；下一步要投入多少？',
  network: '客戶與合作夥伴的承諾需要管理；如何控制發展節奏？',
  capital: '資金、現金流與決策權都要兼顧；接下來如何部署？',
  acquisition: '合作或獨立發展都需要協調資源；怎樣安排整合與交付？',
  restructure: '新的工作安排需要時間磨合；怎樣處理流程與人手？',
  expansion: '新的發展方向會佔用資源；如何平衡規模與現金？',
};

const IMPACTS = {
  product: {
    historical: [{ cash: -0.4, revenue_mult: 1.12, market_fit: 0.05 }, '現金 −0.4；需求係數 +12%，市場配合度 +5 個百分點。'],
    alternate: [{ cash: -0.15, revenue_mult: 1.04, trust: 0.02 }, '現金 −0.15；需求係數 +4%，信任 +2 個百分點。'],
  },
  technology: {
    historical: [{ cash: -0.6, revenue_mult: 1.08, market_fit: 0.06, quality: 0.04 }, '現金 −0.6；需求係數 +8%，市場配合度 +6、品質 +4 個百分點。'],
    alternate: [{ cash: -0.1, cost_mod: -0.02, trust: 0.01 }, '現金 −0.1；變動成本率 −2 個百分點，信任 +1 個百分點。'],
  },
  network: {
    historical: [{ cash: -0.3, revenue_mult: 1.1, capacity_add: 0.08, trust: 0.02 }, '現金 −0.3；需求係數 +10%、產能 +8%，信任 +2 個百分點。'],
    alternate: [{ cash: -0.1, revenue_mult: 1.03, trust: 0.04 }, '現金 −0.1；需求係數 +3%，信任 +4 個百分點。'],
  },
  acquisition: {
    historical: [{ cash: -1, revenue_mult: 1.15, capacity_add: 0.15, complexity: 0.35 }, '現金 −1；需求係數 +15%、產能 +15%，複雜度增加。'],
    alternate: [{ cash: -0.15, revenue_mult: 1.04, trust: 0.02 }, '現金 −0.15；需求係數 +4%，信任 +2 個百分點。'],
  },
  capital: {
    historical: [{ cash: 2, control: -0.12, board: true }, '現金 +2；控制權 −12 個百分點，董事會進來。這不等同完成遊戲中的上市程序。'],
    alternate: [{ market_fit: 0.02, trust: 0.02 }, '不引入外部資金；市場配合度及信任各 +2 個百分點。'],
  },
  restructure: {
    historical: [{ cash: -0.4, fixed_mult: 0.92, trust: 0.02, complexity: 0.1 }, '現金 −0.4；基本固定成本 ×0.92，信任 +2 個百分點，複雜度略增。'],
    alternate: [{ revenue_mult: 1.03, trust: 0.02 }, '不支付重組費；需求係數 +3%，信任 +2 個百分點。'],
  },
  expansion: {
    historical: [{ cash: -0.7, revenue_mult: 1.16, capacity_add: 0.15, fixed_add: 0.12, complexity: 0.25 }, '現金 −0.7；需求係數 +16%、產能 +15%，每季固定成本 +0.12。'],
    alternate: [{ cash: -0.1, revenue_mult: 1.03, trust: 0.02 }, '現金 −0.1；需求係數 +3%，信任 +2 個百分點。'],
  },
};

function followupEvent(company, followup) {
  return {
    id: `history_followup_${followup.index}`,
    layer: 'historical', grammar: 'HISTORY_FOLLOWUP', major: true, once: true,
    historyFollowup: true, historyFollowupIndex: followup.index,
    title: `${company.name} · 方向的回響`,
    body: `這是因你的選擇產生的虛構後續，不是現實中發生過的事件。${FOLLOWUP_QUESTIONS[followup.type] || '你要如何繼續經營？'}`,
    chainCause: { causeMonth: followup.quarter, event: '歷史參照的決定', choice: followup.direction },
    choices: [
      { id: 'invest', label: '投入資源，深化這個方向', detail: '現金 −0.3；需求係數 +6%，市場配合度 +3 個百分點。', risk: '投入會壓縮眼前現金。', effects: { cash: -0.3, revenue_mult: 1.06, market_fit: 0.03 }, drivers: { growth: 1, cash: -1 } },
      { id: 'test', label: '小規模驗證，逐季調整', detail: '現金 −0.1；信任 +2、市場配合度 +1 個百分點。', risk: '進度較慢，對手可能先行。', effects: { cash: -0.1, trust: 0.02, market_fit: 0.01 }, drivers: { learning: 1, flexibility: 1 } },
      { id: 'slow', label: '放慢速度，減少開支', detail: '基本固定成本 ×0.95，需求係數 ×0.96。', risk: '需求可能隨規模收縮。', effects: { fixed_mult: 0.95, revenue_mult: 0.96 }, drivers: { cash: 1, growth: -1 } },
    ],
  };
}

/** 到點後排隊；危機、章節和存檔不會讓節點被跳過。 */
export function dueHistoricalEvent(data, state) {
  const history = state?.historical;
  const company = historicalCompany(data, history?.companyId);
  if (state?.mode !== 'history' || !company) return null;
  const index = Math.max(0, Number.isInteger(history.nextMilestone) ? history.nextMilestone : 0);
  const milestone = company.milestones[index];
  const followup = (history.followups || []).find((item) => !item.done && item.due <= state.month);
  // 依原定到期順序處理積壓；一個危機不會覆蓋更早的分支回響。
  if (followup && (!milestone || followup.due <= milestone.due || state.month < milestone.due)) return followupEvent(company, followup);
  if (!milestone || state.month < milestone.due) return followup ? followupEvent(company, followup) : null;
  const impacts = IMPACTS[milestone.type];
  if (!impacts) return null;
  const previous = (history.decisions || []).at(-1);
  const afterDivergence = previous && previous.route !== 'historical'
    ? `你上次選了「${previous.direction}」；以下只是真實世界的參考，你的公司並未自動重演。`
    : '以下是真實世界的參考，不代表你的公司已經發生同樣的事。';
  return {
    id: `history_${milestone.id}`,
    layer: 'historical', grammar: `HISTORY_${milestone.type.toUpperCase()}`,
    historicalCompany: company.id, historicalIndex: index, historicalType: milestone.type,
    historicalYear: milestone.year, historicalFact: milestone.fact, historicalSource: company.source,
    title: `${company.name}的轉折 ${index + 1} / ${company.milestones.length}`,
    body: `${afterDivergence}面對這個方向，你想如何經營？`,
    omen: '', subject: '', object: '', major: true, once: true,
    choices: [
      {
        id: 'historical', route: 'historical', label: `史實方向：${milestone.historical}`,
        detail: impacts.historical[1], risk: '這是遊戲內的確定效果，不保證重現現實結果。',
        effects: { ...impacts.historical[0] }, drivers: { growth: 2, capital: -1 },
      },
      {
        id: 'alternate', route: 'alternate', label: `假設分支：${milestone.alternate}`,
        detail: impacts.alternate[1], risk: '這是虛構的替代方案，可能錯過規模較大的機會。',
        effects: { ...impacts.alternate[0] }, drivers: { flexibility: 2, growth: -1 },
      },
      {
        id: 'hold', route: 'hold', label: '先守住現有業務',
        detail: '不投入現金；信任 +1 個百分點，需求係數 −2%。',
        risk: '保留現金，但市場可能向其他方向前進。',
        effects: { trust: 0.01, revenue_mult: 0.98 }, drivers: { cash: 1, growth: -1 },
      },
    ],
  };
}

/** 只在成功選擇後前進；重繪、預演與讀檔不會吃掉事件。 */
export function recordHistoricalDecision(state, event, choice) {
  const history = state?.historical;
  if (!history || event.historicalCompany !== history.companyId || !Number.isInteger(event.historicalIndex)) return;
  history.decisions = Array.isArray(history.decisions) ? history.decisions : [];
  if (history.decisions.some((item) => item.index === event.historicalIndex)) return;
  const direction = choice.label.replace(/^(史實方向|假設分支)：/, '');
  history.decisions.push({ index: event.historicalIndex, year: event.historicalYear, route: choice.route || choice.id, direction, quarter: state.month });
  history.nextMilestone = Math.max(history.nextMilestone || 0, event.historicalIndex + 1);
  history.currentDirection = direction;
  history.followups = Array.isArray(history.followups) ? history.followups : [];
  history.followups.push({ index: event.historicalIndex, type: event.historicalType, direction, quarter: state.month, due: state.month + 2, done: false });
}

export function recordHistoricalFollowup(state, event) {
  if (!event?.historyFollowup || !state?.historical) return;
  const followup = (state.historical.followups || []).find((item) => item.index === event.historyFollowupIndex && !item.done);
  if (followup) followup.done = true;
}
