# 球友記帳

給運動球隊用的費用分攤帳本：誰先墊了場地費、每個人該付多少、誰還欠誰，一眼看清楚。支援匹克球、羽球等多種運動，欠款會跨運動、跨場次自動抵銷，算出最少筆數的轉帳建議。

- 前端：Vue 3 + Vite + TypeScript + Tailwind CSS v4，可安裝成 PWA
- 資料：Supabase（免費方案即可）；沒設定時自動進入 **Demo 模式**，資料存在瀏覽器
- 存取：不用帳號密碼，拿到**球隊連結**的人都能查看與記帳；沒有連結的人什麼都讀不到、改不了
- 部署：GitHub Pages（GitHub Actions 自動部署），網址 `https://knowwhao.github.io/sports-ledger/`
- 原始碼：<https://github.com/knowwHao/sports-ledger>

## 功能

開啟球隊連結後，所有球友看到的是同一個畫面，都能查看與記帳：

- **總覽**：全隊待轉帳總額、結算建議（按「記錄已轉帳」直接建立付款）、每人淨餘額、付款紀錄（可手動新增／刪除）、依運動篩選最近場次
- **場次**：依月份分組、搜尋（標題／地點／運動／成員）、依運動與結清狀態篩選
- **新增場次**：先選運動，自動帶入該運動的預設費用列；可一鍵沿用同運動上一場的出席名單
- **場次詳情**：出席勾選、多筆費用（每筆各自的墊付者與分攤對象）、分攤預覽與「墊付者多收 $X」零頭提示、付款追蹤（每人一列，按「已付給 ○○」記錄同場直接付款，再按一次取消，也可只付部分）、鎖定／解鎖、刪除
- **成員**：一次輸入多位（空白或逗號分隔）、改名、換頭像色、排序、封存／恢復（不刪歷史）
- **設定**：球隊名稱、運動項目（新增／編輯／封存、預設費用）、球隊連結（複製、重新產生）、深色模式、Demo 重置
- **我是誰**：頁首的選擇器全站共用、記在瀏覽器，選好後總覽的結算建議與每人淨餘額會標出自己
- 沒有球隊連結時任何頁面都顯示「請用球友群組裡的球隊連結開啟」；連結失效時提示跟群組要新連結，並可清除舊連結

## 計算規則

### 分攤

- 每筆費用的每人應付 = `ceil(金額 ÷ 分攤人數)`（無條件進位，金額一律整數新台幣）
- 進位多出來的零頭由墊付者多收，畫面會標示「墊付者多收 $X」

### 淨餘額

```
淨餘額 = 墊付入帳 − 自己的應付總額 + 自己付出的付款 − 自己收到的付款
```

- 正數＝別人欠他（應收），負數＝他欠別人（應付）
- 「墊付入帳」以該筆費用的**分攤總額**計（= 金額 + 零頭），這樣全隊餘額加總恰好為 0，結算建議才能把帳完全打平
- 墊付者自己也在分攤名單時，他的那份應付會跟墊付入帳自然抵掉，不用特別處理

### 結算建議（最少轉帳）

貪婪法：每次讓「欠最多的人」付給「應收最多的人」，金額取兩者較小值，直到全部歸零。結果的轉帳總額等於所有正餘額的總和。

### 場次狀態

還沒有任何費用的場次顯示「尚無費用」，不算已結清也不算未結清。有費用的場次符合下列**任一**條件就算「已結清」，其餘為「未結清」：

1. **同場直接付清**：這場每位非墊付者的應付，都有足額的「同場直接付款」（付款紀錄帶有這場的 `session_id`，且付給該筆費用的墊付者）。同一場有多位墊付者時，分別對每位墊付者計算。
2. **事後抵銷歸零**：依時間順序重播所有事件——場次以 `play_date`（沒有日期的場次用 `created_at`）排序、付款以 `paid_at` 排序，同一時間點先記場次再記付款——若在這場之後的某個時間點，**全員淨餘額都是 0**，這場以及之前的場次都算結清（畫面標示「已結清（抵銷）」）。

邏輯在 `src/lib/balance.ts`，測試在 `src/lib/balance.test.ts`。

## 本機開發（Demo 模式）

需要 Node.js 22（22.12 以上）或 24，這是 vitest 5 的要求；CI 用 Node 22。

```bash
npm ci             # 依 package-lock.json 安裝
npm run dev        # http://localhost:5173
npm test           # 單元測試（vitest）
npm run build      # 型別檢查 + 打包到 dist/
```

不設定任何環境變數就會進入 Demo 模式：

- 頂端會出現「Demo 模式」提示條
- 首次開啟自動灌入示範資料（兩種運動、十幾位成員、近三個月的場次、部分付款與一筆年費）
- 一樣要有球隊連結才能進入：說明頁按「進入示範帳本」即可；「設定」裡的 `#/t/<token>` 連結在同一個瀏覽器也能開（資料只存在 localStorage）
- 「設定 → 重置示範資料」可隨時還原

## Supabase 設定

1. 到 [supabase.com](https://supabase.com) 建立新專案（Free 方案即可），記下資料庫密碼。
2. 左側 **SQL Editor** → New query，把 [`supabase/schema.sql`](supabase/schema.sql) 整份貼上執行。這份 SQL 可以重複執行，會建立：
   - 資料表、外鍵、索引，以及預設運動（匹克球、羽球）
   - `settings.team_token`：球隊連結用的隨機 token（244 bit），第一次執行時自動產生，之後重跑不會改變
   - RLS：每張表都要帶正確 token 才能讀寫，沒帶或帶錯時 select 是 0 筆、寫入被擋；`truncate` 權限已收回
   - `team_token_ok()`：RLS 用的檢查函式；`regenerate_team_token()`：帶正確 token 才能呼叫，換發並回傳新 token
3. 取得球隊連結：在 SQL Editor 執行

   ```sql
   select team_token from public.settings;
   ```

   組成 `https://knowwhao.github.io/sports-ledger/#/t/<token>`（fork 的話是 `https://<帳號>.github.io/<repo>/#/t/<token>`），貼到球友群組。開過一次的裝置會記住 token，之後直接開網站即可；之後也能在網站的 **設定 → 球隊連結** 複製。
4. 這個專案**不使用 Supabase Auth**，但仍建議到 **Authentication → Sign In / Providers** 關閉 **Allow new users to sign up**：anon key 是公開的，不關閉的話任何人都能註冊成 `authenticated` 使用者（目前 RLS 對 `anon` 與 `authenticated` 一視同仁，註冊了也讀不到資料，關閉是多一層保險）。
5. 取得連線資訊：**Project Settings → API**（或 Data API），複製 **Project URL** 與 **anon public key**。
6. 本機要連 Supabase 的話，在專案根目錄建立 `.env.local`：

   ```bash
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

   `.env*` 已列在 `.gitignore`，不會被 commit。anon key 本來就會出現在前端，資料安全靠 RLS 保護；**絕對不要**把 `service_role` key 放進前端或 GitHub secrets。

## 部署到 GitHub Pages

1. 在 GitHub 建立 repo（本專案是 `https://github.com/knowwHao/sports-ledger`），把專案 push 到 `main`。
2. **Settings → Secrets and variables → Actions → New repository secret**，新增：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   （不設定也能部署，網站會以 Demo 模式運作。）
3. **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。
4. 之後每次 push 到 `main`，`.github/workflows/deploy.yml` 會跑測試、打包並部署。網址是 `https://<帳號>.github.io/<repo>/`，本專案為 `https://knowwhao.github.io/sports-ledger/`；打包時會自動以 repo 名稱設定 Vite 的 `base`。

   網址裡的帳號一律寫小寫是**依 GitHub 文件推斷**，尚未實測：[Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) 要求帳號含大寫時，使用者站台的 repo 名稱要改成小寫的 `<帳號>.github.io`；網域名稱本身也不分大小寫。第一次部署成功後，以 **Settings → Pages** 顯示的網址為準。
5. 路由使用 hash 模式（網址長得像 `.../#/sessions`），GitHub Pages 重新整理深層頁面也不會 404。

未來有需要時，可以改部署到 Cloudflare Workers（已有實驗分支 `cloudflare-attempt`，尚未合併）。

### 避免 Supabase 免費專案被暫停

Supabase 免費專案閒置一週會被暫停。`.github/workflows/keepalive.yml` 每天以 GET 呼叫一次 `/rest/v1/sports?select=id&limit=1`（不帶球隊 token）保持活躍，預期回傳 200 與空陣列；回傳不是空陣列代表 RLS 失守，workflow 會失敗。secrets 沒設定時會直接成功跳過。

**注意**：public repo 連續 60 天沒有任何活動（commit 等）時，GitHub 會自動停用 schedule 排程，keepalive 就不會再跑。停用期間只要 Supabase 連續 7 天沒有收到請求，專案就會被暫停。收到 GitHub 的停用通知或發現排程沒在跑時，到 repo 的 **Actions → Supabase keepalive** 頁面按 **Enable workflow** 重新啟用；專案若已被暫停，要到 Supabase Dashboard 手動恢復（Restore）。

## 球隊連結

- 網址格式為 `https://knowwhao.github.io/sports-ledger/#/t/<token>`；在 **設定 → 球隊連結** 按「複製連結」，貼到球友群組即可
- 開啟後網站會把 token 記在這台裝置的 localStorage，並立刻把 token 從網址移除，避免截圖外流
- 拿到連結的人都能查看與記帳；前端把 token 放在每個 API 請求的 `x-team-token` header，資料庫的 RLS 以 `team_token_ok()` 比對，沒有 token 的人（包括直接打 API 的陌生人或機器人）讀不到也改不了
- 連結外流或有人退隊時，按「重新產生」，舊連結立即失效（已開過的裝置也會看到「連結已失效」），再把新連結傳到群組
- 日後若要改回帳號登入，只要把 RLS policy 裡的 `team_token_ok()` 換成其他檢查條件，資料不用重建

## 專案結構

```
src/
  lib/balance.ts        分攤、淨餘額、最少轉帳、場次結清判定（純函式＋測試）
  lib/ledger.ts         畫面用的彙整與排序
  data/repository.ts    資料層介面
  data/supabaseRepo.ts  Supabase 實作
  data/demoRepo.ts      Demo 實作（localStorage）
  data/demoSeed.ts      示範資料產生器
  stores/               Pinia：球隊連結存取狀態、帳本
  views/                各頁面
  components/           共用元件（modal、toast、頭像、清單…）
supabase/schema.sql     資料庫結構、RLS、球隊 token RPC
.github/workflows/      部署與 keepalive
```

## 用 Claude Code 繼續開發

根目錄的 [`CLAUDE.md`](CLAUDE.md) 寫了常用指令、目錄地圖和硬性規則，每個 Claude Code session 都會自動載入。開新 session 後可以直接這樣下指令：

- 「新增一種運動『網球』，預設費用列是場地費和球費，`supabase/schema.sql` 和 Demo 示範資料都要加」
- 「場次詳情頁加一個備註欄位，Supabase schema 一起改，記得用 PGlite 驗 RLS」
- 「跑測試，再開瀏覽器用 375px 寬檢查手機版有沒有水平溢出」
- 「部署前幫我檢查：`npm test`、`npm run build` 都跑一次，再看 `git status` 有沒有漏掉的檔案」
- 「結算建議的金額怪怪的，先補一個能重現的測試再修」
- 「GitHub Actions 部署失敗了，幫我看原因」（先把 Actions 頁面的錯誤 log 貼給它）
- 「改完了，幫我 commit」（push 前它會先問你）
