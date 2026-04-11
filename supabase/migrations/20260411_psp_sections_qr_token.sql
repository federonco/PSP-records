-- QR access for PSP sections (OnSite-B field entry via /enter?token=...)
alter table psp_sections add column if not exists qr_token text;
alter table psp_sections add column if not exists qr_token_issued_at timestamptz;

create unique index if not exists psp_sections_qr_token_unique
  on psp_sections (qr_token)
  where qr_token is not null;

create index if not exists psp_sections_qr_token_lookup_idx
  on psp_sections (qr_token)
  where qr_token is not null;
