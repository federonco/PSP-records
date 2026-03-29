/**
 * Normalized PSP location settings live in `locations.app_config` (jsonb).
 * Legacy top-level columns may still exist in mixed environments; reads merge
 * app_config first, then fall back to legacy fields when present on the row.
 */

export type LocationAppConfig = {
  penetrometer_sn?: string | null;
  penetrometer_serial?: number | null;
  compactor_serial?: number | null;
  chainage_increment?: number | null;
  data_source?: string | null;
  quality_reports_required?: number | null;
};

export type LocationRowWithConfig = {
  app_config?: unknown;
  penetrometer_sn?: string | null;
  penetrometer_serial?: number | null;
  compactor_serial?: number | null;
  chainage_increment?: number | null;
  data_source?: string | null;
  quality_reports_required?: number | null;
  [key: string]: unknown;
};

export function parseAppConfig(raw: unknown): LocationAppConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as LocationAppConfig;
}

export function getEffectiveLocationFields(
  row: LocationRowWithConfig | null | undefined,
): {
  penetrometer_sn: string | null;
  penetrometer_serial: number | null;
  compactor_serial: number | null;
  chainage_increment: number | null;
  data_source: string | null;
  quality_reports_required: number | null;
} {
  const cfg = parseAppConfig(row?.app_config);
  return {
    penetrometer_sn: (cfg.penetrometer_sn ?? row?.penetrometer_sn) ?? null,
    penetrometer_serial:
      (cfg.penetrometer_serial ?? row?.penetrometer_serial) ?? null,
    compactor_serial: (cfg.compactor_serial ?? row?.compactor_serial) ?? null,
    chainage_increment:
      (cfg.chainage_increment ?? row?.chainage_increment) ?? null,
    data_source: (cfg.data_source ?? row?.data_source) ?? null,
    quality_reports_required:
      (cfg.quality_reports_required ?? row?.quality_reports_required) ?? null,
  };
}

/** Value for compaction PDF / HTML template (PENETROMETER_SN). */
export function getPenetrometerSnForTemplate(
  row: LocationRowWithConfig | null | undefined,
): string {
  const eff = getEffectiveLocationFields(row);
  if (eff.penetrometer_sn != null && String(eff.penetrometer_sn).trim() !== "") {
    return String(eff.penetrometer_sn);
  }
  if (eff.penetrometer_serial != null) {
    return String(eff.penetrometer_serial);
  }
  return "";
}

export function mergeLocationAppConfig(
  existing: unknown,
  patch: Partial<LocationAppConfig>,
): Record<string, unknown> {
  const base = parseAppConfig(existing);
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

/** Columns to fetch for list/detail when legacy columns may be dropped. */
export const LOCATION_LIST_SELECT =
  "id,name,start_chainage,end_chainage,direction,length_m,location_type,app_config";
