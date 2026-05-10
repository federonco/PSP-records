alter table psp_records
  alter column l1_150 drop not null,
  alter column l1_450 drop not null,
  alter column l1_750 drop not null,
  alter column l2_150 drop not null,
  alter column l2_450 drop not null,
  alter column l2_750 drop not null,
  alter column l3_150 drop not null,
  alter column l3_450 drop not null,
  alter column l3_750 drop not null;

alter table psp_records
  add column if not exists l4_150 integer,
  add column if not exists l4_450 integer,
  add column if not exists l4_750 integer,
  add column if not exists l5_150 integer,
  add column if not exists l5_450 integer,
  add column if not exists l5_750 integer;

alter table psp_records
  add column if not exists updated_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table psp_records
  add column if not exists layers_required integer not null default 3;

alter table sections
  add column if not exists app_config jsonb;
