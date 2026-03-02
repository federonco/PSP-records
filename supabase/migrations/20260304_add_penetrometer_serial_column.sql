-- Add penetrometer_serial to psp_locations if missing
alter table public.psp_locations
  add column if not exists penetrometer_serial integer not null default 1;
