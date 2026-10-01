-- =============================================================
-- 球友記帳 Supabase schema
-- 在 Supabase Dashboard → SQL Editor 貼上整份執行即可；可重複執行，也可直接套在舊版（帳號登入版）資料庫上升級
--
-- 不用帳號登入：拿到「球隊連結」的人都能查看與記帳，沒有連結的人什麼都讀不到、改不了
--   1. 執行完後取得 token：
--        select team_token from public.settings;
--   2. 組成球隊連結貼到球友群組：
--        https://knowwhao.github.io/sports-ledger/#/t/<token>
--   連結外流時到網站「設定 → 重新產生」，舊連結立即失效；連結被搶先重新產生時見 README 的救援 SQL
--
-- 原理：前端在每個 API 請求帶 x-team-token header，RLS 以 team_token_ok() 比對 settings.team_token；
-- 日後改回帳號登入時只要換掉 policy 裡的檢查條件，資料不用重建
-- =============================================================

-- ---------- 預設權限 ----------
-- Supabase 預設把 postgres 日後建立的表、函式、序列全部授權給 anon／authenticated，新物件一建好就對外公開；
-- 改成預設不授權，本檔的物件都在下方明確 grant。之後新增物件的規則：
--   table：開 RLS、加 team_all policy、明確 grant；view：一律 with (security_invoker = true)，否則會繞過 RLS；
--   函式：PostgreSQL 內建讓 public 可執行，不受這裡影響，要自己 revoke execute ... from public 再明確 grant
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

-- ---------- 清除舊版（帳號登入版）殘留 ----------
-- 舊版的分享 RPC 與管理員 policy 不檢查球隊 token，留著就是後門；全新資料庫上這段什麼都不做
drop function if exists public.get_public_ledger(text) cascade;
drop function if exists public.regenerate_share_token() cascade;

do $$
declare t text;
begin
  foreach t in array array['settings', 'sports', 'members', 'sessions', 'attendances', 'expenses', 'expense_shares', 'payments'] loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('drop policy if exists admin_all on public.%I', t);
    end if;
  end loop;
end;
$$;

drop function if exists public.is_admin() cascade;
drop table if exists public.admins;

-- ---------- 球隊連結 token ----------

-- 兩個 v4 UUID 共 244 bit 隨機；用內建 gen_random_uuid 免得依賴 pgcrypto 所在的 schema
create or replace function public.new_team_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

-- ---------- 資料表 ----------

create table if not exists public.settings (
  id         int primary key default 1 check (id = 1),
  team_name  text not null default '球友記帳',
  team_token text not null default public.new_team_token() check (length(team_token) >= 32),
  updated_at timestamptz not null default now()
);
-- 舊版 settings 沒有 team_token；必須在 team_token_ok() 之前補上，否則建函式時就找不到欄位而整份失敗
alter table public.settings
  add column if not exists team_token text not null default public.new_team_token() check (length(team_token) >= 32);
alter table public.settings drop column if exists share_token;
insert into public.settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.sports (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique check (length(btrim(name)) between 1 and 30),
  emoji            text not null default '🏅',
  color            text not null default '#64748b',
  default_expenses jsonb not null default '[]'::jsonb check (jsonb_typeof(default_expenses) = 'array'),
  sort_order       int not null default 0,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

create table if not exists public.members (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(btrim(name)) between 1 and 30),
  color      text not null default '#64748b',
  active     boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id         uuid primary key default gen_random_uuid(),
  sport_id   uuid references public.sports (id) on delete set null,
  play_date  date,
  title      text,
  location   text,
  note       text not null default '',
  locked     boolean not null default false,
  created_at timestamptz not null default now(),
  constraint sessions_date_or_title check (play_date is not null or title is not null)
);

create table if not exists public.attendances (
  session_id uuid not null references public.sessions (id) on delete cascade,
  member_id  uuid not null references public.members (id) on delete restrict,
  primary key (session_id, member_id)
);

create table if not exists public.expenses (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions (id) on delete cascade,
  label           text not null check (length(btrim(label)) > 0),
  amount          int not null check (amount > 0),
  payer_member_id uuid not null references public.members (id) on delete restrict,
  created_at      timestamptz not null default now()
);

create table if not exists public.expense_shares (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  member_id  uuid not null references public.members (id) on delete restrict,
  amount_due int not null check (amount_due >= 0),
  primary key (expense_id, member_id)
);

create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  from_member_id uuid not null references public.members (id) on delete restrict,
  to_member_id   uuid not null references public.members (id) on delete restrict,
  amount         int not null check (amount > 0),
  paid_at        timestamptz not null default now(),
  -- 刪除場次時一併刪除該場的直接付款，與前端確認視窗的說明一致
  session_id     uuid references public.sessions (id) on delete cascade,
  note           text not null default '',
  created_at     timestamptz not null default now(),
  constraint payments_distinct_parties check (from_member_id <> to_member_id)
);

create index if not exists sessions_play_date_idx on public.sessions (play_date);
create index if not exists sessions_sport_idx on public.sessions (sport_id);
create index if not exists attendances_member_idx on public.attendances (member_id);
create index if not exists expenses_session_idx on public.expenses (session_id);
create index if not exists expenses_payer_idx on public.expenses (payer_member_id);
create index if not exists expense_shares_member_idx on public.expense_shares (member_id);
create index if not exists payments_session_idx on public.payments (session_id);
create index if not exists payments_from_idx on public.payments (from_member_id);
create index if not exists payments_to_idx on public.payments (to_member_id);

-- 預設運動：只在完全沒有運動時灌入
insert into public.sports (name, emoji, color, default_expenses, sort_order)
select * from (values
  ('匹克球', '🏓', '#9fcc12', '[{"label":"場地費","amount":null}]'::jsonb, 0),
  ('羽球',   '🏸', '#38bdf8', '[{"label":"場地費","amount":null},{"label":"羽球","amount":null}]'::jsonb, 1)
) as v (name, emoji, color, default_expenses, sort_order)
where not exists (select 1 from public.sports);

-- ---------- 權限判斷 ----------

-- PostgREST 把請求 header 以小寫名稱存進 request.headers；同一連線先前設過再清掉時會是空字串而非 null
-- security definer 才能在 RLS 開啟時讀 settings，否則 settings 自己的 policy 會遞迴
create or replace function public.team_token_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.team_token = (nullif(current_setting('request.headers', true), '')::json ->> 'x-team-token')
       from public.settings s
      where s.id = 1),
    false);
$$;

-- ---------- 資料最後更新時間 ----------

create or replace function public.touch_ledger_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.settings set updated_at = now() where id = 1;
  return null;
end;
$$;

create or replace function public.settings_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists settings_updated_at on public.settings;
create trigger settings_updated_at before update on public.settings
  for each row execute function public.settings_set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['sports', 'members', 'sessions', 'attendances', 'expenses', 'expense_shares', 'payments'] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    -- 用 row 層級：statement trigger 在 RLS 擋掉全部列時仍會觸發，帶錯 token 也能改到 updated_at
    execute format(
      'create trigger touch_updated_at after insert or update or delete on public.%I
         for each row execute function public.touch_ledger_updated_at()', t);
  end loop;
end;
$$;

-- ---------- RLS ----------
-- anon 與 authenticated 一律要帶正確的球隊 token 才能讀寫；包成 (select …) 讓每個查詢只算一次

do $$
declare t text;
begin
  foreach t in array array['settings', 'sports', 'members', 'sessions', 'attendances', 'expenses', 'expense_shares', 'payments'] loop
    execute format('alter table public.%I enable row level security', t);
    -- TRUNCATE 不受 RLS 約束，只能靠收回權限擋下
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t);
    execute format('drop policy if exists team_all on public.%I', t);
    execute format(
      'create policy team_all on public.%I for all to anon, authenticated
         using ((select public.team_token_ok())) with check ((select public.team_token_ok()))', t);
  end loop;

  foreach t in array array['sports', 'members', 'sessions', 'attendances', 'expenses', 'expense_shares', 'payments'] loop
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end;
$$;

-- settings 是單列設定：只開放改 team_name，token 只能經由 regenerate_team_token() 換發，避免被改成弱 token
revoke insert, update, delete on public.settings from anon, authenticated;
grant select, update (team_name) on public.settings to anon, authenticated;

-- ---------- RPC ----------

create or replace function public.regenerate_team_token()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t text;
begin
  if not public.team_token_ok() then
    raise exception 'invalid team token' using errcode = '42501';
  end if;
  update public.settings
     set team_token = public.new_team_token()
   where id = 1
  returning team_token into t;
  return t;
end;
$$;

-- Supabase 的預設權限會把新函式的 execute 直接授予 anon／authenticated，只收回 public 不夠
revoke execute on function public.new_team_token() from public, anon, authenticated;

revoke execute on function public.team_token_ok() from public;
grant execute on function public.team_token_ok() to anon, authenticated;

revoke execute on function public.regenerate_team_token() from public;
grant execute on function public.regenerate_team_token() to anon, authenticated;
