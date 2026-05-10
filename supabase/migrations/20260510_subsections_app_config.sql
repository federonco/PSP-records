alter table subsections
  add column if not exists app_config jsonb;
