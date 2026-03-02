# PSP Lodge (Next.js + Supabase)

## Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Create a storage bucket named `psp-reports` (or update `SUPABASE_STORAGE_BUCKET`).
4. Copy `.env.example` to `.env.local` and fill in values, including
   `SUPABASE_SERVICE_ROLE_KEY` for admin sign-off and PDF uploads.
5. Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

## Admin access

Admins are checked in two places:

- **App allowlist**: add comma-separated emails to `ADMIN_EMAIL_ALLOWLIST`.
- **DB policy**: insert users into `psp_admins`:

```sql
insert into psp_admins (user_id, email)
values ('<auth.user.id>', '<email>');
```

## Block computation

Blocks are calculated from the maximum chainage at a location:

- A block expects 10 chainages: `max, max-20, ... max-180`.
- The next block starts at `max-200`, then continues downward.
- `READY` = all 10 chainages present, otherwise `OPEN`.

## Sign-off rules

- Index page uses `/api/psp/signoff-record`.
- Admin page uses `/api/psp/signoff-block`.
- Sign-off requires an admin allowlist match and `psp_admins` membership.
- Force overwrite is required to replace an existing sign-off.

## Sections + signatures

- Sections are stored in `psp_sections` and linked via `psp_records.section_id`.
- Inspector signatures are saved as JSON stroke data in `psp_records.signature_strokes`.
- Signature updates use the server-side service role and never expose secrets to the client.

## Audit report generation

- Admin page calls `/api/psp/audit-report`.
- The handler renders a simple table-based PDF.
- PDF is uploaded to Supabase Storage under `audit-reports/`.
- A `psp_reports` row is inserted with the file path and metadata.

## Compaction report template (DOCX)

- Place the template at `templates/ITR-EXB-003.docx`.
- POST to `/api/psp/compaction-report` with:

```json
{
  "format": "pdf",
  "data": {
    "REPORT_DATE": "01/03/2026",
    "SUPERVISOR_NAME": "Adam O'Neil",
    "WORK_LOCATION": "McLennan Dr - SEC3",
    "records": [
      { "date": "01/03/2026", "ch": 3210, "l1_a": 1, "l1_b": 2, "l1_c": 3, "l2_a": 1, "l2_b": 2, "l2_c": 3, "l3_a": 1, "l3_b": 2, "l3_c": 3 }
    ]
  }
}
```

- If PDF conversion fails (no LibreOffice), the API returns a DOCX file.
