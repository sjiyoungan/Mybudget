create table if not exists public.paystubs (
  id uuid primary key,
  pay_date date not null unique,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.paystubs enable row level security;

grant select, insert, update, delete on table public.paystubs to anon, authenticated;

drop policy if exists "anon_paystubs_all" on public.paystubs;
create policy "anon_paystubs_all"
  on public.paystubs
  for all
  to anon, authenticated
  using (true)
  with check (true);
