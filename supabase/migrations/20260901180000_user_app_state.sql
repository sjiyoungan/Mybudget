create table if not exists public.user_app_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  budget jsonb not null default '{}'::jsonb,
  plan jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_app_state enable row level security;

revoke all on table public.user_app_state from anon;
grant select, insert, update, delete on table public.user_app_state to authenticated;

drop policy if exists "user_app_state_own_row" on public.user_app_state;
create policy "user_app_state_own_row"
  on public.user_app_state
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
