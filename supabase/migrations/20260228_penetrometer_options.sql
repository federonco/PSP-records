-- Penetrometer options per location (alphanumeric S/N like #3059-0325)
create table if not exists public.psp_penetrometer_options (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.psp_locations(id) on delete cascade,
  serial_text text not null,
  sort_order integer not null default 0,
  unique (location_id, serial_text)
);

alter table public.psp_penetrometer_options enable row level security;

create policy "penetrometer_options_read" on public.psp_penetrometer_options
  for select to anon, authenticated using (true);

create policy "penetrometer_options_insert" on public.psp_penetrometer_options
  for insert to anon, authenticated with check (true);

create policy "penetrometer_options_update" on public.psp_penetrometer_options
  for update to anon, authenticated using (true) with check (true);

create policy "penetrometer_options_delete" on public.psp_penetrometer_options
  for delete to anon, authenticated using (true);

create index if not exists psp_penetrometer_options_location_idx
  on public.psp_penetrometer_options (location_id);

-- Seed default #3059-0325 for existing locations
insert into public.psp_penetrometer_options (location_id, serial_text, sort_order)
select id, '#3059-0325', 0 from public.psp_locations
on conflict (location_id, serial_text) do nothing;
