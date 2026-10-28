# 開局與轉虧為盈：設計研究

## 體驗方向

[1 in 8B Life](https://in8b.com/) 的公開玩法說明：背景先抽出，時間推進，玩家在轉折處決定，也可調速、暫停及自動選擇。本作保留時間自動流動和重大事件暫停，不要求玩家逐季操作；新設施在「本季決策」自願使用，緊急時也能選重整。自動選擇仍是玩家自行開啟。

## 研究與遊戲轉化

- 澳洲政府 [Improve your cash flow](https://business.gov.au/finance/cash-flow/improve-your-cash-flow)：加快收款、檢視成本及定價、處理存貨和資產。「提早收回應收款」只可處理已有的帳款，收取 5% 費用，並從待收佇列移除。短期多了現金，並非新訂單或免費盈利。
- 澳洲政府 [Guide to managing cash flow](https://business.gov.au/guide/guide-to-managing-cash-flow)：與供應商商討價格及付款條件，並定期追蹤現金流。遊戲內延期帳款會成為債務並分期支付；預售會抵扣未來四季現金收款，而不是額外創造四季收入。
- [US Chamber：cash flow disruptions](https://www.uschamber.com/co/run/finance/small-business-cash-flow-disruptions)：重談租約、付款條件、策略性控制成本。遊戲以所有行業通用的「重整成本結構」模擬重談場地與供應；收入能力也會下降，不能保證轉盈。
- 澳洲政府 [Set up a cash flow statement](https://business.gov.au/finance/cash-flow/set-up-a-cash-flow-statement)：預測收支以辨識缺口。遊戲維持分項現金流和下一季預測，開局補貼到期日亦顯示在畫面。

以上是設計啟發，不代表每個真實公司均可取得相同條件，數值均是遊戲平衡參數，非財務建議。

## 開局及平衡

每個新機會基於種子及缺口確定支援等級，創業契機由該缺口與產品寫成：無須償還的啟動資金 1／2／3.5 單位，以及前四季基本場地費補貼 25%／40%／60%。機率分別 20%／60%／20%；其餘場地固定費仍需支付，第五季恢復原價。支援不保證成活，也不能避免錯誤選擇或創辦人個人財務壓力。拒絕機會後會重新抽取與新缺口綁定的契機；既有營業存檔不追溯發錢。

基礎場地固定成本調至原來的 72%，創辦人產能係數由 2.05 調至 2.56。這不是免租：不同城市和場地差異、季節、供應成本、薪酬、借款與其他事件仍會影響營運。長期行動為一次性結構調整，短期周轉不等於持續盈利。

## 驗證

在倉庫根目錄執行：

```sh
node --experimental-default-type=module tests/gameplay.mjs
node --experimental-default-type=module tests/balance-sample.mjs
```

第一組檢查全部 24 個市場缺口、可重現性、回退、補貼期限、短期收款及還款。第二組是固定種子的探索性樣本，不是預測或真實存活率；事件可能使樣本在第四季之前走到其他階段。
