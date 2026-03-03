-- Add compactor_serial to psp_locations (default compactor SN per location)
alter table public.psp_locations
  add column if not exists compactor_serial integer null;

-- Add compactor_sn to psp_records (SN used for that record)
alter table public.psp_records
  add column if not exists compactor_sn integer null;

-- Allow anon to read locations and sections for user mode (no auth)
create policy "locations_read_anon" on psp_locations
  for select to anon using (true);

create policy "sections_read_anon" on psp_sections
  for select to anon using (true);
