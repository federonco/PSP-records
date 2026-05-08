create table psp_supervisors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  created_at timestamptz not null default now()
);

alter table psp_supervisors enable row level security;

create policy "service_role full access" on psp_supervisors
  for all to service_role using (true) with check (true);

create policy "authenticated read" on psp_supervisors
  for select to authenticated using (true);
