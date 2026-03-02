-- Penetrometers per location (selectable in Layers card)
create table if not exists public.psp_penetrometers (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.psp_locations(id) on delete cascade,
  serial_number integer not null default 1,
  sort_order integer not null default 0,
  unique (location_id, serial_number)
);

alter table public.psp_penetrometers enable row level security;

create policy "penetrometers_read" on public.psp_penetrometers
  for select
  to anon, authenticated
  using (true);

create policy "penetrometers_insert" on public.psp_penetrometers
  for insert
  to anon, authenticated
  with check (true);

create policy "penetrometers_update" on public.psp_penetrometers
  for update
  to anon, authenticated
  using (true)
  with check (true);

create index if not exists psp_penetrometers_location_id_idx on public.psp_penetrometers (location_id);

-- Seed default penetrometer 1 for existing locations
insert into public.psp_penetrometers (location_id, serial_number, sort_order)
select id, 1, 0 from public.psp_locations
on conflict (location_id, serial_number) do nothing;
