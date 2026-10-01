# 球友記帳（sports-ledger）

球隊運動費用分攤帳本 SPA：記錄場次費用與付款，跨運動抵銷欠款並算出最少轉帳。
Vue 3 + Vite + TypeScript + Tailwind CSS v4 + Pinia + Vue Router（hash 模式）+ PWA；
資料在 Supabase（未設定 env 時進 Demo 模式，存 localStorage）；部署在 GitHub Pages。
不做帳號登入：拿到球隊連結 `#/t/<token>` 的人都能讀寫，token 走 `x-team-token` header、由 RLS 比對。
成員各有 4～8 位數字密碼：切換「我是誰」要輸入，付款只有收款人本人能記錄／刪除（資料庫端以 RPC 強制）。
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
- **改 schema**：每張表都要開 RLS、有 `team_all` policy（`using`／`with check` 都是 `team_token_ok()`）、
  明確 grant 給 anon／authenticated（預設權限已收回）且收回 truncate（唯一例外是 `member_pins`：完全不授權，讀得到就等於拿到雜湊與登入憑證）；新增 view 一律 `with (security_invoker = true)`；
  新增函式要 `revoke execute ... from public` 再明確 grant；`schema.sql` 要可重複執行，也要能套在舊版 DB 上升級；
  改完用 PGlite（`@electric-sql/pglite`，不在依賴內，臨時裝在專案外）實跑 `schema.sql` 兩次，
  需先替身 `anon`／`authenticated` 角色，以 `set_config('request.headers', '{"x-team-token":"…"}', true)` 模擬 header，
  驗沒帶／帶錯 token 讀不到也寫不進；並同步 `src/types.ts`、兩個 repo 實作與 `src/data/demoSeed.ts`
- **付款與成員的寫入**：`payments` 只能經 `create_payment()`／`delete_payments()`（收款人＝登入成員），`members` 只能經
  `create_members()` 新增（一併設密碼）；不要重新 grant 這兩張表的直接寫入，前端也不要繞過 `ledger` store 的 `asPayee`
- **改金額或結算邏輯**：先在 `src/lib/balance.test.ts` 補會失敗的測試，再改 `balance.ts`；金額一律整數新台幣
- **手機版**：375px 寬不可水平溢出（`document.documentElement.scrollWidth` 不得大於視窗寬）
- 路由是 hash 模式，站內連結用 router 產生；完整網址參考 `src/views/SettingsView.vue` 的 `teamUrl`

## 目錄地圖

- `src/lib/balance.ts`：分攤、淨餘額、最少轉帳、結清判定的**唯一來源**（純函式），測試 `balance.test.ts`
- `src/lib/ledger.ts`：畫面用彙整與排序；`src/lib/format.ts`：金額與日期格式
- `src/data/repository.ts`：資料層介面與 `InvalidTokenError`／`MemberSessionError`／`NotPayeeError`；實作 `supabaseRepo.ts`（Supabase）、
  `demoRepo.ts`（localStorage，以 `guard()` 模擬 RLS 的 token 檢查、`guardMember()`／`attemptPin()` 模擬密碼 RPC，測試 `demoRepo.test.ts`）
- `src/data/writeCheck.ts`：RLS 擋下 update／delete 時只會 0 列不報錯，`supabaseRepo.ts` 的 update／delete
  一律 `.select(…)` 後經 `expectAffected` 判定（0 列時再確認 token，分辨連結失效與資料已不在）
- `src/data/index.ts`：依 `VITE_SUPABASE_*` 有無選 repo；`demoSeed.ts` 是 Demo 示範資料
- `src/types.ts`：資料型別；`src/stores/`：Pinia（`access.ts` 球隊 token 與存取狀態、`ledger.ts`）
- `src/router.ts`：路由；`/t/:token` 記下 token 後以 replace 導回 `/`，網址不留 token
- `src/App.vue`：存取狀態不是 ok 時一律顯示 `src/views/AccessView.vue`（說明頁／失效頁）
- 「我是誰」／成員登入：`src/composables/useWhoAmI.ts`（登入憑證存 localStorage、`askLogin()` 跳密碼框）、
  `src/components/PinLoginHost.vue`（密碼框，掛在 App.vue）、`src/components/WhoAmIPicker.vue`（AppShell 頁首）；
  密碼格式與鎖定次數在 `src/lib/pin.ts`，要與 `schema.sql` 一致
- `supabase/schema.sql`：資料表、RLS、`team_token_ok()`／`regenerate_team_token()`、成員密碼與付款 RPC、預設運動種子資料
- `.github/workflows/deploy.yml`：測試、打包、部署 Pages；`keepalive.yml`：每日不帶 token GET sports，預期 `[]`
- `vite.config.ts`：`base` 依 `VITE_BASE`／`GITHUB_REPOSITORY` 決定、PWA manifest
- `.claude/launch.json`：瀏覽器預覽設定 `sports-ledger`（跑 `npm run dev`，port 5173）

## 業務規則指標（改之前先讀）

- 每人應付、零頭由墊付者（付錢的人）多收 → README「分攤」、`computeDues`
- 要付／要收（淨額）公式（全隊加總必為 0）→ README「要付／要收（淨額）」、`netBalances`
- 最少轉帳（貪婪法）→ README「轉帳建議（最少轉帳）」、`simplifyDebts`
- 結清判定（還沒記費用／當場付清／事後打平）→ README「場次狀態」、`sessionSettlements`／`sessionStatuses`
- 運動預設費用列 → `supabase/schema.sql` 的 sports 種子資料與 `src/data/demoSeed.ts`
- 成員密碼、只有收款人能記付款、忘記密碼的重設 SQL → README「成員密碼」
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
