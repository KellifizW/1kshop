# 企業類型與營運平衡：設計研究

## 設計目標

本作保留背景抽取、時間推進、重大事件暫停，以及玩家自行開啟的自動選擇。這次重點是讓有需求、懂得管理現金的企業有機會度過第 2–4 年，讓大膽決策有合理的成功及挫敗分支，同時保留倒閉、債務和人事風險；不是保證每局成功，也不是財務建議。

## 十種企業類型

新增的企業各有獨立公司、客戶、產品、交付單位、成長方式，以及市場需求、成本和趨勢；每間公司仍屬於既有母行業，共用原有的收入、交付、事件及經營規則。這是十種企業類型，**不是十個新玩法或遊戲模式**。

| 企業類型 | 類型 ID | 母行業 |
| --- | --- | --- |
| AI 自動化服務公司 | `ai_workflow` | 數碼產品及 SaaS |
| 行業 SaaS 訂閱公司 | `vertical_saas` | 數碼產品及 SaaS |
| D2C 電商品牌公司 | `d2c_brand` | 零售及電商 |
| 數碼內容行銷代理公司 | `creator_marketing` | 專業服務 |
| 線上教育與技能培訓公司 | `online_skills` | 教育及培訓 |
| 中小企網絡安全公司 | `cyber_sme` | 大型科技、企業軟件及資料服務 |
| 商戶支付對帳公司 | `merchant_payments` | 金融科技及商業基建 |
| 遠距醫療支援公司 | `telehealth_support` | 醫療及照護 |
| 太陽能工程及維護公司 | `solar_install` | 能源及環境服務 |
| 電商倉儲與履約公司 | `seller_fulfillment` | 物流、租賃及資產服務 |

這是依公開資料選出的十個**熱門方向**，不是依全球創業公司數量或成功率排列的官方「十大」：不同資料的地區、樣本和定義不同，部分方向由較廣的趨勢推導，不能精確排序。主要參考：

- [OECD 中小企 AI 報告](https://www.oecd.org/en/publications/2025/12/ai-adoption-by-small-and-medium-sized-enterprises_9c48eae6.html)討論採用、潛在效益與障礙；[D4SME 調查](https://www.oecd.org/content/dam/oecd/en/publications/reports/2026/04/empowering-smes-in-the-age-of-ai_7f58652c/bf5a9816-en.pdf)涵蓋數碼化、資安及金融科技，屬調查樣本而非全球普查。
- [UNCTAD](https://unctad.org/news/stronger-statistics-measure-e-commerce-and-digital-economy)指出電商和數碼交付服務增長迅速，同時提醒各地統計存在缺口；電商品牌及倉配是遊戲對相關需求的轉化。
- [OECD 成人學習研究](https://www.oecd.org/en/publications/2025/06/trends-in-adult-learning_f0d8514f/full-report/where-what-and-how-are-adults-learning_59e53872.html)討論線上及混合式培訓，但也指出不少國家的成人學習參與未見上升。[IAB 創作者廣告調查](https://www.iab.com/wp-content/uploads/2025/11/IAB_Creator_Ad_Spend_and_Strategy_Report_2025.pdf)反映**美國**內容行銷活動，不是全球排名。
- [世界銀行](https://blogs.worldbank.org/en/developmenttalk/digital-technology-is-unlocking-financial-inclusion)討論數碼帳戶與付款普及；[WHO 人口老化資料](https://www.who.int/news-room/fact-sheets/detail/ageing-and-health)顯示照護需求背景，並不證明某種遠距醫療商業模式必定成功。
- [IEA](https://www.iea.org/reports/global-energy-review-2026/technology-solar-pv-and-wind)記錄 2025 年全球新增再生能源裝置創紀錄，其中太陽能佔主要部分。

這十種企業只透過一般的加權隨機開局出現：故事模式、每日世界及沙盒（指定缺口或由種子抽取）都走同一條路徑，沒有額外的自選畫面、路線或模式。抽到時沿用母行業的收入、交付、事件及經營規則，開局頁僅多顯示企業類型名稱。已開業的舊存檔不會追補開局資金；新增產能欄位缺失時按原有產能倍率 1 處理，企業類型可由缺口補回。

## 現金、產能與轉機

- 新機會以種子及缺口決定支援等級：一次性、無須償還的資金 1／2／3.5 單位，及前四季基本場地費補貼 25%／40%／60%；等級機率為 20%／60%／20%。其他成本照付，第五季恢復原價。每單位相當於所在城市中位月薪。
- 在原有場地費及開局支援基礎上，調整基礎收入、創辦人及員工產能、技能和部分定價的變動成本。需求增加不等於交付增加：實際銷量仍受產能限制。新設備、產品、通路、合作和據點可實際擴充產能；租設備的產能與租金持續四季，購置設備則增加資產及維護費。縮編或賣設備也會減少產能。
- 產品、合作、通路、擴張及部分事件有種子決定的成功／挫敗分支。畫面在行動前列出成本與雙方結果，機率依配合度、信任和現金調整，夾在 64%–90%；**這些是遊戲參數，並非現實創業成功率**。失敗仍可能損失投入，部分行動有冷卻期。
- 三種驚喜事件包括客戶轉介紹、一次性支援和付費試做。救援新增有資格限制、整局只能申請一次的紓困；股權救援受控制權與冷卻期限制。每次新危機重設救援次數，但選項不會憑空變成長期盈利。
- 借款本金按承諾期限償還；個人現金、個人債務與公司帳分開。付清生活費並預留一季生活費後，個人盈餘的一半可用來還個人債。預測使用下一季季節及承諾；一季測試的場地優惠與選擇結束後的薪資按季度處理。

其他營運做法的參考包括澳洲政府關於[改善現金流](https://business.gov.au/finance/cash-flow/improve-your-cash-flow)、[管理現金流](https://business.gov.au/guide/guide-to-managing-cash-flow)及[編製現金流報表](https://business.gov.au/finance/cash-flow/set-up-a-cash-flow-statement)的建議。提前收款有折讓；延期產生債務，預售抵扣未來收款，不是免費盈利。

## 模擬結果與限制

固定 400 個種子，兩版本均使用原有 24 個市場缺口並鎖定同一種子版本；各自按事件建議選擇，進取策略另外優先選擴張事件，不主動執行經營行動。允許救援時使用測試中固定的優先序；到達 16 季且仍在營業計作「四年」。結果是**遊戲內政策樣本，不是現實資料，也不代表所有玩法或種子**：

| 策略 | 可救援：舊版 → 新版四年仍營業 | 不救援：首次現金危機前到達四年，舊版 → 新版 |
| --- | ---: | ---: |
| 全職、街舖、低價；偏向擴張 | 32.8% → 90.8% | 0% → 37.8% |
| 兼職、工作室、便利定位 | 55.8% → 93.5% | 2.0% → 69.8% |
| 保留工作、居家、便利定位 | 69.3% → 98.8% | 11.3% → 90.8% |

新版允許救援時，上述三種策略在十年仍營業的比例分別為 37.0%、70.5% 和 86.5%，風險並未消失。四年仍營業者的平均個人債分別約為 10.47、10.84 和 3.95 遊戲單位；公司存續不等於創辦人沒有財務壓力。當季收入扣變動、人力、場地、平台及權利金後為正的比例分別為 95.9%、86.6%、89.9%，但**不包括**創辦人領款與生活費、天氣成本、利息、稅項及還本，不能當成完整淨利或現金流。

另以新版種子，對每個新企業類型各跑 100 組、沿用上面三種策略：允許救援時四年仍營業的比例，進取策略介乎 86%–100%、兼職策略介乎 97%–100%、保留正職策略均為 100%；首次危機即停止的比例則分別介乎 34%–56%、57%–92%、95%–100%。這只是小樣本的遊戲內檢查，不是現實數據，亦不保證所有局都能成功。

## 驗證與重現

```sh
node --experimental-default-type=module tests/gameplay.mjs
node --experimental-default-type=module tests/lifecycle.mjs
node --experimental-default-type=module tests/balance-sample.mjs
node --experimental-default-type=module tests/operating.mjs
node --experimental-default-type=module tests/long-balance.mjs
```

專項測試涵蓋十種企業的資料、母行業、營運、隨機抽取（故事模式與每日世界）及不存在自選介面，以及舊存檔、可重播的成功／受挫、成本及禁用選項、限期產能、預測、借款、個人帳務、測試期和救援。長期樣本預設 400 組、鎖定原 24 個缺口及種子版本 `1.0.0` 以便配對；`SIM_SEED_VERSION=1.1.0` 可改用新版種子，`ALL_GAPS=1` 可納入新企業缺口，`COMPANY_TYPE=ai_workflow` 等可固定單一企業類型。要比較舊版，可先建立 `/tmp/shop-baseline`，再用 `git archive 3ee37d1 | tar -x -C /tmp/shop-baseline` 將原始版本解到該目錄，最後以 `SHOP_ROOT=/tmp/shop-baseline` 執行同一測試。

可選的 `tests/browser-smoke.cjs` 使用 Playwright 與 Chromium，檢查桌面／手機、企業類型顯示、沙盒缺口選單、每日模式的隨機開局、舊存檔、機率畫面、救援及自動選擇；使用方式見 README。
