-- =============================================================
-- 球友記帳 Supabase schema
-- 在 Supabase Dashboard → SQL Editor 貼上整份執行即可；可重複執行
--
-- 建立第一位管理員：
--   1. Authentication → Users → Add user → Create new user
--      填 Email、密碼，並勾選「Auto Confirm User」
--   2. 回到 SQL Editor 執行（把 Email 換成剛剛建立的帳號）：
--        insert into public.admins (user_id)
--        select id from auth.users
--        where email = 'you@example.com' and email_confirmed_at is not null
--        on conflict do nothing;
--   之後要加其他管理員，重複上面兩步即可
-- =============================================================

-- ---------- 資料表 ----------

create table if not exists public.settings (
  id          int primary key default 1 check (id = 1),
  team_name   text not null default '球友記帳',
  share_token text not null default replace(gen_random_uuid()::text, '-', ''),
  updated_at  timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

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

-- security definer 才能在 RLS 開啟時讀 admins，否則 policy 會自我遞迴
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
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
    execute format(
      'create trigger touch_updated_at after insert or update or delete on public.%I
         for each statement execute function public.touch_ledger_updated_at()', t);
  end loop;
end;
$$;

-- ---------- RLS ----------
-- anon 一律不可直接讀寫；只有列在 admins 的登入者可讀寫；球友透過 get_public_ledger 取得唯讀資料

do $$
declare t text;
begin
  foreach t in array array['settings', 'sports', 'members', 'sessions', 'attendances', 'expenses', 'expense_shares', 'payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    -- TRUNCATE 不受 RLS 約束，登入者即使非管理員也能清表
    execute format('revoke truncate, trigger, references on public.%I from authenticated', t);
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format(
      'create policy admin_all on public.%I for all to authenticated
         using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end;
$$;

alter table public.admins enable row level security;
revoke all on public.admins from anon;
revoke truncate, trigger, references on public.admins from authenticated;
drop policy if exists admins_read_self on public.admins;
create policy admins_read_self on public.admins for select to authenticated
  using (user_id = auth.uid());

-- ---------- RPC ----------

-- 分享頁用：token 正確才回傳整份帳本（不含 share_token），錯誤回 null
create or replace function public.get_public_ledger(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.settings;
begin
  select * into s from public.settings where id = 1;
  if not found or p_token is null or s.share_token is distinct from p_token then
    return null;
  end if;

  return jsonb_build_object(
    'team_name',   s.team_name,
    'updated_at',  s.updated_at,
    'sports',      coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.created_at) from public.sports x), '[]'::jsonb),
    'members',     coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.created_at) from public.members x), '[]'::jsonb),
    'sessions',    coalesce((select jsonb_agg(to_jsonb(x)) from public.sessions x), '[]'::jsonb),
    'attendances', coalesce((select jsonb_agg(jsonb_build_object('session_id', x.session_id, 'member_id', x.member_id))
                             from public.attendances x), '[]'::jsonb),
    'expenses',    coalesce((select jsonb_agg(to_jsonb(x)) from public.expenses x), '[]'::jsonb),
    'shares',      coalesce((select jsonb_agg(jsonb_build_object('expense_id', x.expense_id, 'member_id', x.member_id,
                                                                 'amount_due', x.amount_due))
                             from public.expense_shares x), '[]'::jsonb),
    'payments',    coalesce((select jsonb_agg(to_jsonb(x)) from public.payments x), '[]'::jsonb)
  );
end;
$$;

create or replace function public.regenerate_share_token()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t text;
begin
  if not public.is_admin() then
    raise exception 'only admins can regenerate the share token' using errcode = '42501';
  end if;
  update public.settings
     set share_token = replace(gen_random_uuid()::text, '-', '')
   where id = 1
  returning share_token into t;
  return t;
end;
$$;

revoke execute on function public.get_public_ledger(text) from public;
grant execute on function public.get_public_ledger(text) to anon, authenticated;

revoke execute on function public.regenerate_share_token() from public, anon;
grant execute on function public.regenerate_share_token() to authenticated;
