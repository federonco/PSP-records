-- Store normalized PSP settings in locations.app_config (jsonb).
-- Legacy columns may be removed after backfill; app reads via lib/location-app-config.ts
alter table public.locations
  add column if not exists app_config jsonb not null default '{}'::jsonb;
