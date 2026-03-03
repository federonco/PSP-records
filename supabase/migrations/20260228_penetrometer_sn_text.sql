-- Add penetrometer_sn (text) to psp_locations for alphanumeric serials
alter table public.psp_locations
  add column if not exists penetrometer_sn text null;

-- Migrate compactor_sn to text for alphanumeric support (e.g. #3059-0325)
alter table public.psp_records
  alter column compactor_sn type text using compactor_sn::text;
