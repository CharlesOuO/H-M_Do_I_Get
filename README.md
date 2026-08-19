# 班次帳

一個用來記錄兼職班次、工時與加班費的靜態網頁。原始設計由 Figma Make 匯出，現已整理為可獨立建置及部署的 React + Vite 專案。

## 本機執行

需要 Node.js 24 與 pnpm。

```bash
pnpm install
pnpm dev
```

建立正式版：

```bash
pnpm build
pnpm preview
```

## 部署到 GitHub Pages

1. 將此專案推送至 GitHub，預設分支命名為 `main`。
2. 到儲存庫的 **Settings → Pages**。
3. 將 **Source** 設為 **GitHub Actions**。
4. 推送到 `main` 後，部署流程會自動建置並發布網站。

建置結果位於 `dist/`。Vite 使用相對資源路徑，因此專案網站與自訂網域都能正常載入。
