-- Fix recursion in psp_admins RLS policy
drop policy if exists "admins_read" on public.psp_admins;
create policy "admins_read" on public.psp_admins
  for select
  to authenticated
  using (user_id = auth.uid());

-- Update layer constraints to allow 0-35
alter table public.psp_records
  drop constraint if exists psp_records_l1_150_check,
  drop constraint if exists psp_records_l1_450_check,
  drop constraint if exists psp_records_l1_750_check,
  drop constraint if exists psp_records_l2_150_check,
  drop constraint if exists psp_records_l2_450_check,
  drop constraint if exists psp_records_l2_750_check,
  drop constraint if exists psp_records_l3_150_check,
  drop constraint if exists psp_records_l3_450_check,
  drop constraint if exists psp_records_l3_750_check;

alter table public.psp_records
  add constraint psp_records_l1_150_check check (l1_150 between 0 and 35),
  add constraint psp_records_l1_450_check check (l1_450 between 0 and 35),
  add constraint psp_records_l1_750_check check (l1_750 between 0 and 35),
  add constraint psp_records_l2_150_check check (l2_150 between 0 and 35),
  add constraint psp_records_l2_450_check check (l2_450 between 0 and 35),
  add constraint psp_records_l2_750_check check (l2_750 between 0 and 35),
  add constraint psp_records_l3_150_check check (l3_150 between 0 and 35),
  add constraint psp_records_l3_450_check check (l3_450 between 0 and 35),
  add constraint psp_records_l3_750_check check (l3_750 between 0 and 35);

-- Add penetrometer serial to locations
alter table public.psp_locations
  add column if not exists penetrometer_serial integer not null default 1;
