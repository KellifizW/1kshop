# 千分之一的店

靜態網頁遊戲。這個倉庫的根目錄就是網站本身，入口是 `index.html`。

## 怎麼打開

遊戲以 ES module 載入程式，並用 `fetch` 讀取 JSON。請在這個資料夾啟動本機伺服器，再用瀏覽器打開首頁。直接用檔案總管雙擊 `index.html` 時，瀏覽器會擋住模組與資料讀取，帳簿會顯示讀取失敗。

```powershell
python -m http.server 8080
```

然後打開 <http://localhost:8080/>。

## 數字在哪

工資、租金、稅率、抽成與事件權重都在 `data/`。改那些 JSON 即可調整平衡，不必改程式。設計說明見 `game-data.md` 與 `gdd-v2.md`。
