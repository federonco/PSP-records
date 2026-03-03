-- Run this in Supabase SQL Editor to fix missing columns
-- Add penetrometer_serial to psp_locations
alter table public.psp_locations
  add column if not exists penetrometer_serial integer not null default 1;

-- Add compactor_serial to psp_locations
alter table public.psp_locations
  add column if not exists compactor_serial integer null;

-- Add signature columns to psp_records
alter table public.psp_records
  add column if not exists sign_off_by text null,
  add column if not exists sign_off_at timestamptz null,
  add column if not exists signature_strokes jsonb null;

-- Add compactor_sn to psp_records
alter table public.psp_records
  add column if not exists compactor_sn integer null;

-- Allow anon to read locations and sections for user mode (no auth)
drop policy if exists "locations_read_anon" on psp_locations;
create policy "locations_read_anon" on psp_locations
  for select to anon using (true);

drop policy if exists "sections_read_anon" on psp_sections;
create policy "sections_read_anon" on psp_sections
  for select to anon using (true);
