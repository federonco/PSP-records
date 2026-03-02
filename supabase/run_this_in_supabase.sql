-- Run this in Supabase SQL Editor to fix missing columns
-- Add penetrometer_serial to psp_locations
alter table public.psp_locations
  add column if not exists penetrometer_serial integer not null default 1;

-- Add signature columns to psp_records
alter table public.psp_records
  add column if not exists sign_off_by text null,
  add column if not exists sign_off_at timestamptz null,
  add column if not exists signature_strokes jsonb null;
