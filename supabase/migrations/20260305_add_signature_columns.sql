-- Add signature columns to psp_records if missing
alter table public.psp_records
  add column if not exists sign_off_by text null,
  add column if not exists sign_off_at timestamptz null,
  add column if not exists signature_strokes jsonb null;
