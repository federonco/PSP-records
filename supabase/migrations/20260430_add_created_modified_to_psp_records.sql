alter table if exists psp_records
  add column if not exists created_at timestamptz default now();

alter table if exists psp_records
  add column if not exists modified_at timestamptz default now();

update psp_records
set created_at = coalesce(created_at, recorded_at, now()),
    modified_at = coalesce(modified_at, recorded_at, now())
where created_at is null or modified_at is null;
