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

`data/content.json` 的 `gaps` 是二十四個市場缺口。每個缺口的 `work` 是一間公司，不是一份工作：`name`（公司）、`company`（哪一種公司）、`does`（做甚麼）、`sells`（賣甚麼）、`buyer`（誰付錢）、`unit`（一筆交易交付甚麼）、`scale`（怎麼長大）、`hire`（第一個要請的人）。加新缺口時這八個欄位都要填，`unit` 不能是報價、帳單、工單這種過程產物。同一個檔案的 `jobs` 是開局抽到的正職：`income` 是月薪（城市中位薪資的倍數）、`severance` 是遣散費月數、`drain` 是這份工作的消耗，三者會直接影響「你怎麼投入」那一頁的數字。

## 開局與轉型設計

新開局會取得與市場缺口有關的啟動資金和限期場地補貼；經營時可選短期周轉或長期成本、產品重整。資料來源、取捨和測試指令見 [玩法研究](gameplay-research.md)。

## 公司生活與事件

主畫面的「公司生活紀錄」按時間顯示季結、人物小事和決策；「經營行動」會暫停時間並開啟選單。`data/life-events.json` 收錄按公司壽命階段限定的重大事件與日常小事；故事模式會參考本機最近遇過的內容降低重複，沙盒與每日世界不讀取這份歷史。事件鏈和必經節點仍保留因果與必要的重現。

可執行 `node --experimental-default-type=module tests/lifecycle.mjs` 檢查各階段事件、紀錄和預演不改變存檔。
