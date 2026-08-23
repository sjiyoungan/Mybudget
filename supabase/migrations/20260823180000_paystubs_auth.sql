create table if not exists public.paystubs (
  id uuid primary key,
  pay_date date not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.paystubs
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table public.paystubs drop constraint if exists paystubs_pay_date_key;

create unique index if not exists paystubs_user_pay_date_key
  on public.paystubs (user_id, pay_date);

alter table public.paystubs enable row level security;

revoke all on table public.paystubs from anon;
grant select, insert, update, delete on table public.paystubs to authenticated;

drop policy if exists "anon_paystubs_all" on public.paystubs;
drop policy if exists "paystubs_own_rows" on public.paystubs;

create policy "paystubs_own_rows"
  on public.paystubs
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
