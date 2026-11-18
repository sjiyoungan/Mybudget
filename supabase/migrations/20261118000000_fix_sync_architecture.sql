-- ==============================================================================
-- Migration: Fix Sync Architecture with Per-User Isolation and Optimistic Concurrency
-- ==============================================================================
-- This migration:
-- 1. Creates user_app_state table with per-user RLS and optimistic concurrency
-- 2. Migrates existing __app_state__ paystubs row to owner's user_app_state
-- 3. Adds user_id to paystubs and enables per-user RLS
-- 4. Backfills existing paystubs to the owner
-- ==============================================================================

-- Constants
-- Owner user: s.jiyoung.an@gmail.com -> 9a6e4f26-68a8-445a-be81-db7d2f8ec414

-- ==============================================================================
-- PART 1: Create user_app_state table with optimistic concurrency
-- ==============================================================================

create table if not exists public.user_app_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  budget jsonb not null default '{}'::jsonb,
  plan jsonb not null default '{}'::jsonb,
  spending jsonb not null default '{}'::jsonb,
  sync_version bigint not null default 1,
  updated_at timestamptz not null default now()
);

comment on table public.user_app_state is 'Per-user application state with optimistic concurrency control';
comment on column public.user_app_state.sync_version is 'Incremented on each write for optimistic concurrency. Clients must provide current version to update.';

-- Index for faster lookups
create index if not exists user_app_state_updated_at_idx on public.user_app_state (updated_at);

-- Enable RLS
alter table public.user_app_state enable row level security;

-- Revoke all public access
revoke all on table public.user_app_state from anon, public;
grant select, insert, update, delete on table public.user_app_state to authenticated;

-- Per-user RLS policy
drop policy if exists "user_app_state_own_row" on public.user_app_state;
create policy "user_app_state_own_row"
  on public.user_app_state
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ==============================================================================
-- PART 2: Create RPC for conditional update with optimistic concurrency
-- ==============================================================================

create or replace function public.upsert_user_app_state(
  p_budget jsonb,
  p_plan jsonb,
  p_spending jsonb,
  p_expected_version bigint default null
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_current_version bigint;
  v_new_version bigint;
  v_updated_at timestamptz;
begin
  -- Get current user
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Lock the row for update (or for insert if doesn't exist)
  select sync_version into v_current_version
  from public.user_app_state
  where user_id = v_user_id
  for update;

  -- If row doesn't exist, create it
  if not found then
    if p_expected_version is not null and p_expected_version != 0 then
      -- Client expected a row to exist
      return jsonb_build_object(
        'success', false,
        'error', 'version_conflict',
        'message', 'Row does not exist but client expected version ' || p_expected_version,
        'current_version', 0
      );
    end if;
    
    insert into public.user_app_state (user_id, budget, plan, spending, sync_version, updated_at)
    values (v_user_id, p_budget, p_plan, p_spending, 1, now())
    returning sync_version, updated_at into v_new_version, v_updated_at;
    
    return jsonb_build_object(
      'success', true,
      'sync_version', v_new_version,
      'updated_at', v_updated_at
    );
  end if;

  -- Row exists, check version
  if p_expected_version is not null and p_expected_version != v_current_version then
    -- Version conflict
    return jsonb_build_object(
      'success', false,
      'error', 'version_conflict',
      'message', 'Expected version ' || p_expected_version || ' but current is ' || v_current_version,
      'current_version', v_current_version
    );
  end if;

  -- Update with incremented version
  v_new_version := v_current_version + 1;
  
  update public.user_app_state
  set
    budget = p_budget,
    plan = p_plan,
    spending = p_spending,
    sync_version = v_new_version,
    updated_at = now()
  where user_id = v_user_id
  returning updated_at into v_updated_at;

  return jsonb_build_object(
    'success', true,
    'sync_version', v_new_version,
    'updated_at', v_updated_at
  );
end;
$$;

comment on function public.upsert_user_app_state is 'Upsert user app state with optimistic concurrency control. Returns success=false if version conflict.';

grant execute on function public.upsert_user_app_state to authenticated;

-- ==============================================================================
-- PART 3: Migrate existing __app_state__ to owner's user_app_state row
-- ==============================================================================

do $$
declare
  v_owner_id uuid := '9a6e4f26-68a8-445a-be81-db7d2f8ec414';
  v_app_state_data jsonb;
  v_budget jsonb;
  v_plan jsonb;
  v_spending jsonb;
begin
  -- Read existing __app_state__ paystubs row
  select data into v_app_state_data
  from public.paystubs
  where pay_date = '1970-01-01'
    and (data->>'fileName' = '__app_state__' or data->>'appState' = 'true');

  if found and v_app_state_data is not null then
    -- Extract components
    v_budget := coalesce(v_app_state_data->'budget', '{}'::jsonb);
    v_plan := coalesce(v_app_state_data->'plan', '{}'::jsonb);
    v_spending := coalesce(v_app_state_data->'spending', '{}'::jsonb);

    -- Insert into user_app_state (idempotent)
    insert into public.user_app_state (user_id, budget, plan, spending, sync_version, updated_at)
    values (v_owner_id, v_budget, v_plan, v_spending, 1, now())
    on conflict (user_id) do nothing;

    raise notice 'Migrated app state from paystubs to user_app_state for owner %', v_owner_id;
  else
    raise notice 'No __app_state__ row found in paystubs, skipping migration';
  end if;
end;
$$;

-- ==============================================================================
-- PART 4: Add user_id to paystubs and enable per-user RLS
-- ==============================================================================

-- Add user_id column if it doesn't exist
alter table public.paystubs
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- Backfill user_id for existing rows (assign to owner)
update public.paystubs
set user_id = '9a6e4f26-68a8-445a-be81-db7d2f8ec414'
where user_id is null;

-- Drop old global unique constraint if it exists
alter table public.paystubs drop constraint if exists paystubs_pay_date_key;

-- Create composite unique index (user_id, pay_date)
drop index if exists paystubs_user_pay_date_key;
create unique index paystubs_user_pay_date_key
  on public.paystubs (user_id, pay_date);

-- Make user_id NOT NULL after backfill
alter table public.paystubs alter column user_id set not null;

-- Drop old insecure policy
drop policy if exists "anon_paystubs_all" on public.paystubs;

-- Revoke anon access
revoke all on table public.paystubs from anon, public;
grant select, insert, update, delete on table public.paystubs to authenticated;

-- Create per-user RLS policy
drop policy if exists "paystubs_own_rows" on public.paystubs;
create policy "paystubs_own_rows"
  on public.paystubs
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ==============================================================================
-- PART 5: Migration tracking
-- ==============================================================================

-- Optional: Create migrations table for tracking
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

insert into public.schema_migrations (version)
values ('20261118000000_fix_sync_architecture')
on conflict (version) do nothing;

-- ==============================================================================
-- Verification queries (run manually after applying)
-- ==============================================================================

-- Check user_app_state row for owner
-- SELECT user_id, sync_version, updated_at,
--        jsonb_array_length(plan->'affirmLoans') as loan_count
-- FROM user_app_state
-- WHERE user_id = '9a6e4f26-68a8-445a-be81-db7d2f8ec414';

-- Check paystubs user_id backfill
-- SELECT COUNT(*), user_id FROM paystubs GROUP BY user_id;

-- Check RLS policies
-- SELECT tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename IN ('user_app_state', 'paystubs');
