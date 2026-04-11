-- Optional crew identifier for admin / flat section list (OnSite-D parity)
alter table public.locations add column if not exists crew_id text;
