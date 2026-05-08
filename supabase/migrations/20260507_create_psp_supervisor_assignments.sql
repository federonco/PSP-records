create table psp_supervisor_assignments (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references psp_supervisors(id) on delete cascade,
  section_id uuid references sections(id) on delete cascade,
  subsection_id uuid references subsections(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint section_or_subsection check (
    (section_id is not null and subsection_id is null) or
    (section_id is null and subsection_id is not null)
  ),
  unique (supervisor_id, section_id),
  unique (supervisor_id, subsection_id)
);

alter table psp_supervisor_assignments enable row level security;

create policy "service_role full access" on psp_supervisor_assignments
  for all to service_role using (true) with check (true);

create policy "authenticated read" on psp_supervisor_assignments
  for select to authenticated using (true);
