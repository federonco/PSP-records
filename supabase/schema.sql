create extension if not exists "pgcrypto";

create table if not exists psp_locations (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  penetrometer_serial integer not null default 1
);

insert into psp_locations (name)
values ('McLennan Dr - SEC3')
on conflict do nothing;

create table if not exists psp_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  email text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists psp_sections (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references psp_locations(id),
  name text not null,
  length_m integer,
  start_chainage integer,
  direction text,
  chainage_increment integer default 20,
  steps integer,
  chainage_list_json jsonb,
  created_at timestamptz default now(),
  unique (location_id, name)
);

create table if not exists psp_records (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references psp_locations(id),
  location_name text,
  section_id uuid references psp_sections(id),
  chainage int not null,
  recorded_at timestamptz not null default now(),
  l1_150 int not null,
  l1_450 int not null,
  l1_750 int not null,
  l2_150 int not null,
  l2_450 int not null,
  l2_750 int not null,
  l3_150 int not null,
  l3_450 int not null,
  l3_750 int not null,
  site_inspector text not null,
  sign_off_by text null,
  sign_off_at timestamptz null,
  signature_strokes jsonb null,
  unique (location_id, chainage),
  check (l1_150 between 0 and 35),
  check (l1_450 between 0 and 35),
  check (l1_750 between 0 and 35),
  check (l2_150 between 0 and 35),
  check (l2_450 between 0 and 35),
  check (l2_750 between 0 and 35),
  check (l3_150 between 0 and 35),
  check (l3_450 between 0 and 35),
  check (l3_750 between 0 and 35)
);

create table if not exists psp_reports (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references psp_locations(id),
  report_type text not null,
  block_key text not null,
  pdf_path text,
  status text default 'READY',
  pending_chainages jsonb,
  start_chainage integer,
  end_chainage integer,
  block_index integer,
  record_count integer,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id) null
);

alter table psp_locations enable row level security;
alter table psp_records enable row level security;
alter table psp_reports enable row level security;
alter table psp_admins enable row level security;
alter table psp_sections enable row level security;

create policy "locations_read" on psp_locations
  for select
  to authenticated
  using (true);

create policy "records_read" on psp_records
  for select
  to authenticated
  using (true);

create policy "records_insert" on psp_records
  for insert
  to authenticated
  with check (true);

create policy "records_signoff_update" on psp_records
  for update
  to authenticated
  using (exists (select 1 from psp_admins where user_id = auth.uid()));

create policy "reports_read" on psp_reports
  for select
  to authenticated
  using (true);

create policy "reports_insert" on psp_reports
  for insert
  to authenticated
  with check (exists (select 1 from psp_admins where user_id = auth.uid()));

create policy "admins_read" on psp_admins
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "sections_read" on psp_sections
  for select
  to authenticated
  using (true);

create policy "sections_insert" on psp_sections
  for insert
  to authenticated
  with check (true);

create policy "sections_update" on psp_sections
  for update
  to authenticated
  using (true);

create index if not exists psp_records_section_id_idx on psp_records (section_id);

create index if not exists psp_sections_location_id_idx on psp_sections (location_id);

create unique index if not exists psp_reports_compaction_uidx
  on public.psp_reports (location_id, report_type, block_key)
  where report_type = 'compaction';
