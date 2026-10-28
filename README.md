# 千分之一的店

靜態網頁遊戲。這個倉庫的根目錄就是網站本身，入口是 `index.html`。

## 怎麼打開

遊戲以 ES module 載入程式，並用 `fetch` 讀取 JSON。請在這個資料夾啟動本機伺服器，再用瀏覽器打開首頁。直接用檔案總管雙擊 `index.html` 時，瀏覽器會擋住模組與資料讀取，帳簿會顯示讀取失敗。

```powershell
python -m http.server 8080
```

然後打開 <http://localhost:8080/>。

## 部署到 GitHub Pages

倉庫內已附 `.github/workflows/deploy.yml`。第一次啟用請到：

1. GitHub 倉庫 → **Settings** → **Pages**。
2. **Build and deployment** 的 **Source** 選 **GitHub Actions**。
3. 推送到 `main` 分支（或在 Actions 頁手動觸發 *Deploy to GitHub Pages*），數分鐘後遊戲會出現在 `https://<你的帳號>.github.io/1kshop/`。

工作流會把整個倉庫根目錄作為靜態網站上傳，`.nojekyll` 已加入以避免 Jekyll 處理。路徑皆為相對路徑，所以放在 `username.github.io/<repo>` 子目錄下也能正確載入 JS、JSON、字型與 service worker。

## 數字在哪

工資、租金、稅率、抽成與事件權重都在 `data/`。改那些 JSON 即可調整平衡，不必改程式。設計說明見 `game-data.md` 與 `gdd-v2.md`。

`data/content.json` 的 `gaps` 有 34 個市場缺口：原有 24 個，加上 10 種新企業各自對應的缺口。每個缺口的 `work` 是一間公司，不是一份工作：`name`（公司）、`company`（哪一種公司）、`does`（做甚麼）、`sells`（賣甚麼）、`buyer`（誰付錢）、`unit`（一筆交易交付甚麼）、`scale`（怎麼長大）、`hire`（第一個要請的人）。加新缺口時這八個欄位都要填，`unit` 不能是報價、帳單、工單這種過程產物。`company_types` 記錄新增企業的 `id`、名稱、母行業 `industry` 及對應 `gap_id`；缺口的 `company_type` 指回類型，而 `family` 保留母行業，用以套用既有行業規則。同一個檔案的 `jobs` 是開局抽到的正職：`income` 是月薪（城市中位薪資的倍數）、`severance` 是遣散費月數、`drain` 是這份工作的消耗，三者會直接影響「你怎麼投入」那一頁的數字。

## 新企業類型與營運

新增的十種企業類型是 AI 自動化服務、行業 SaaS、D2C 電商品牌、數碼內容行銷、線上培訓、中小企資安、商戶支付、遠距醫療支援、太陽能工程及電商倉配。每個類型對應一個市場缺口與一間可營運的公司，按缺口權重加入一般的隨機開局（故事模式、每日世界及沙盒的種子抽取），沿用母行業的收入、交付、事件及經營規則。它們不是新的玩法、模式或路線，遊戲也沒有一個額外的企業類型選單；開局抽到時只會在原有的開局頁顯示類型名稱。沙盒原有的「市場缺口」選單可直接選到這十個缺口。類型參考公開研究中的熱門方向，不是官方全球前十排名。

開局有啟動資金及四季場地補貼；擴張可提升需求和實際產能，設備租賃則有四季成本及期限。新產品、合作及擴張會顯示遊戲成功機率、成本和受挫結果；轉介紹、試做及孵化器支援帶來隨機驚喜。資金不足仍可能觸發救援或結業，個人債務亦有獨立記錄和還款規則。遊戲機率不是現實成功率。來源、參數及模擬限制見 [玩法研究](gameplay-research.md)。

## 公司生活與事件

主畫面的「公司生活紀錄」按時間顯示季結、人物小事和決策；「經營行動」會暫停時間並開啟選單。`data/life-events.json` 收錄按公司壽命階段限定的重大事件與日常小事；故事模式會參考本機最近遇過的內容降低重複，沙盒與每日世界不讀取這份歷史。事件鏈和必經節點仍保留因果與必要的重現。

## 測試

需要 Node.js 22 或更新版本，在倉庫根目錄執行：

```sh
node --experimental-default-type=module tests/gameplay.mjs
node --experimental-default-type=module tests/lifecycle.mjs
node --experimental-default-type=module tests/balance-sample.mjs
node --experimental-default-type=module tests/operating.mjs
node --experimental-default-type=module tests/long-balance.mjs
```

最後一項以固定種子模擬 2、4、10 年；可用 `SAMPLE_SIZE` 調整樣本數，`ALL_GAPS=1` 納入十個新企業缺口。另有可選的瀏覽器冒煙測試：啟動 `python -m http.server 8000`，安裝 `playwright-core` 並備妥 Chromium，然後執行 `CHROMIUM_PATH=/path/to/chromium node tests/browser-smoke.cjs`（也可用 `GAME_URL` 指向其他測試網址）。瀏覽器測試涵蓋桌面、手機、沙盒、每日模式、自動選擇、舊存檔、決策及離線畫面。
