-- PAT layers_required + completed_at backfill (reversible notes at bottom)
-- Does NOT modify any blow values.

BEGIN;

-- Step 1 — PAT subsections default to one layer
UPDATE subsections
   SET app_config = COALESCE(app_config, '{}'::jsonb) || '{"layers_required": 1}'::jsonb
 WHERE name ILIKE '%permanent access track%';

-- Step 2 — existing PAT records that only ever had Layer 1
-- CRITICAL: 2026-05-05 McLennan PAT rows with real L2/L3 are excluded by WHERE.
UPDATE psp_records r
   SET layers_required = 1
  FROM subsections sb
 WHERE sb.id = r.subsection_id
   AND sb.name ILIKE '%permanent access track%'
   AND r.l2_150 IS NULL AND r.l2_450 IS NULL AND r.l2_750 IS NULL
   AND r.l3_150 IS NULL AND r.l3_450 IS NULL AND r.l3_750 IS NULL
   AND r.l4_150 IS NULL AND r.l5_150 IS NULL;

-- Step 3 — backfill completed_at after layers_required is correct
UPDATE psp_records r
   SET completed_at = COALESCE(r.sign_off_at, r.updated_at, r.recorded_at)
 WHERE r.completed_at IS NULL
   AND r.l1_150 IS NOT NULL AND r.l1_450 IS NOT NULL AND r.l1_750 IS NOT NULL
   AND (r.layers_required < 2 OR (r.l2_150 IS NOT NULL AND r.l2_450 IS NOT NULL AND r.l2_750 IS NOT NULL))
   AND (r.layers_required < 3 OR (r.l3_150 IS NOT NULL AND r.l3_450 IS NOT NULL AND r.l3_750 IS NOT NULL))
   AND (r.layers_required < 4 OR (r.l4_150 IS NOT NULL AND r.l4_450 IS NOT NULL AND r.l4_750 IS NOT NULL))
   AND (r.layers_required < 5 OR (r.l5_150 IS NOT NULL AND r.l5_450 IS NOT NULL AND r.l5_750 IS NOT NULL));

-- Step 4 — drop silent default so the app must always send layers_required
ALTER TABLE psp_records ALTER COLUMN layers_required DROP DEFAULT;

COMMIT;

-- VERIFY (must return 0 rows):
-- select r.id from psp_records r
--  where r.completed_at is null
--    and (r.layers_required < 2 or (r.l2_150 is not null and r.l2_450 is not null and r.l2_750 is not null))
--    and (r.layers_required < 3 or (r.l3_150 is not null and r.l3_450 is not null and r.l3_750 is not null))
--    and r.l1_150 is not null and r.l1_450 is not null and r.l1_750 is not null;

-- ROLLBACK sketch (manual):
-- ALTER TABLE psp_records ALTER COLUMN layers_required SET DEFAULT 3;
-- (layers_required / completed_at / app_config restores require a prior backup)
