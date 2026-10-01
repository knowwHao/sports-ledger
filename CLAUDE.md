# 球友記帳（sports-ledger）

球隊運動費用分攤帳本 SPA：記錄場次費用與付款，跨運動抵銷欠款並算出最少轉帳。
Vue 3 + Vite + TypeScript + Tailwind CSS v4 + Pinia + Vue Router（hash 模式）+ PWA；
資料在 Supabase（未設定 env 時進 Demo 模式，存 localStorage）；部署在 GitHub Pages。
人看的完整說明在 `README.md`。

## 常用指令

```bash
npm ci               # 依 lock 檔安裝；需 Node 22.12+ 或 24（vitest 5 的 engines）
npm run dev          # http://localhost:5173，Demo 模式不需任何 env
npm test             # vitest 單元測試
npm run typecheck    # 只跑 vue-tsc
npm run build        # vue-tsc 型別檢查 + vite build 到 dist/
```

## 硬性規則

- **不做 CSV 匯出**：使用者明確拒絕過，不要提議也不要實作
- **禁用 `v-html`**：使用者輸入一律走文字插值
- **金鑰**：Supabase anon key 只能透過 env 注入，不得寫死；任何地方都不得使用 `service_role` key
- **改 schema**：RLS 政策、`get_public_ledger` 回傳內容、`schema.sql` 可重複執行，三者一起維護；
  改完用 PGlite（`@electric-sql/pglite`，不在依賴內，臨時裝在專案外）實跑 `schema.sql` 兩次，
  需先替身 Supabase 的 `auth.users` 表與 `anon`／`authenticated` 角色；
  並同步 `src/types.ts`、兩個 repo 實作與 `src/data/demoSeed.ts`
- **改金額或結算邏輯**：先在 `src/lib/balance.test.ts` 補會失敗的測試，再改 `balance.ts`；金額一律整數新台幣
- **手機版**：375px 寬不可水平溢出（`document.documentElement.scrollWidth` 不得大於視窗寬）
- 路由是 hash 模式，站內連結用 router 產生；完整網址參考 `src/views/SettingsView.vue` 的 `shareUrl`

## 目錄地圖

- `src/lib/balance.ts`：分攤、淨餘額、最少轉帳、結清判定的**唯一來源**（純函式），測試 `balance.test.ts`
- `src/lib/ledger.ts`：畫面用彙整與排序；`src/lib/format.ts`：金額與日期格式
- `src/data/repository.ts`：資料層介面；實作 `supabaseRepo.ts`（Supabase）、`demoRepo.ts`（localStorage）
- `src/data/index.ts`：依 `VITE_SUPABASE_*` 有無選 repo；`demoSeed.ts` 是 Demo 示範資料
- `src/types.ts`：資料型別；`src/stores/`：Pinia（`auth.ts`、`ledger.ts`）；`src/views/`、`src/components/`、`src/composables/`
- `src/router.ts`：路由與登入守衛；`/s/:token` 是免登入的唯讀分享頁（`src/views/ShareView.vue`）
- `supabase/schema.sql`：資料表、RLS、`get_public_ledger`／`regenerate_share_token` RPC、預設運動種子資料
- `.github/workflows/deploy.yml`：測試、打包、部署 Pages；`keepalive.yml`：每日呼叫 Supabase
- `vite.config.ts`：`base` 依 `VITE_BASE`／`GITHUB_REPOSITORY` 決定、PWA manifest
- `.claude/launch.json`：瀏覽器預覽設定 `sports-ledger`（跑 `npm run dev`，port 5173）

## 業務規則指標（改之前先讀）

- 每人應付、零頭由墊付者多收 → README「分攤」、`computeDues`
- 淨餘額公式（全隊加總必為 0）→ README「淨餘額」、`netBalances`
- 最少轉帳（貪婪法）→ README「結算建議（最少轉帳）」、`simplifyDebts`
- 結清判定（尚無費用／同場付清／事後抵銷）→ README「場次狀態」、`sessionSettlements`／`sessionStatuses`
- 運動預設費用列 → `supabase/schema.sql` 的 sports 種子資料與 `src/data/demoSeed.ts`
- 改了上述任一規則，README 對應段落要同步更新

## 部署

- push 到 `main` → `.github/workflows/deploy.yml` 跑 `npm test`、`npm run build` 並部署到
  `https://knowwhao.github.io/sports-ledger/`（帳號小寫依 GitHub 文件推斷，未實測）
- 需要 repo secrets `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`；沒設定時網站以 Demo 模式運作
- keepalive 是 schedule 排程，repo 連續 60 天沒有活動時 GitHub 可能自動停用，處理方式見 README
- 本機分支 `cloudflare-attempt` 是已驗證過的 Cloudflare Workers 遷移版（未 push），使用者暫不採用但日後可能要；
  未經使用者要求不要合併、刪除或 push

## 完成前的驗證

1. `npm test` 全過
2. `npm run build` exit code 0
3. UI 改動：用瀏覽器預覽 `.claude/launch.json` 的 `sports-ledger` 實際操作，並在 375px 寬檢查版面

## 程式碼註解

- 只寫程式碼本身講不出來的事（為什麼、隱藏限制、外部相依、workaround）
- 繁體中文、一句話講完、句尾不加句號；不寫改動過程敘事（那是 commit 訊息的事）

## Git

- commit 訊息：`feat:`／`fix:`／`docs:` + 繁體中文，參考 `git log`
- 這個 repo 的 local `user.email` 是使用者的個人信箱，不要修改 git config
- remote 是 `https://github.com/knowwHao/sports-ledger`，push 到 `main` 會觸發部署
- **push 前一定要先問使用者**；不要 force push
