export type DepthRange = {
  from_ch: number;
  to_ch: number;
  max_depth_mm: number;
};

/** Parsed `depth_ranges` from a section or subsection `app_config`. */
export function depthRangesFromAppConfig(appConfig: unknown): DepthRange[] {
  const raw =
    appConfig &&
    typeof appConfig === "object" &&
    !Array.isArray(appConfig)
      ? (appConfig as Record<string, unknown>).depth_ranges
      : null;
  if (!Array.isArray(raw)) return [];
  return (raw as DepthRange[]).filter(
    (r) =>
      r &&
      Number.isFinite(r.from_ch) &&
      Number.isFinite(r.to_ch) &&
      Number.isFinite(r.max_depth_mm),
  );
}

/**
 * Subsection-specific ranges override the parent section when non-empty.
 * Empty subsection config falls back to the section.
 */
export function resolveDepthRangesForScope(
  sectionAppConfig: unknown,
  subsectionAppConfig?: unknown | null,
): DepthRange[] {
  const sub = depthRangesFromAppConfig(subsectionAppConfig);
  if (sub.length > 0) return sub;
  return depthRangesFromAppConfig(sectionAppConfig);
}

export function getLayersRequired(
  chainage: number,
  depthRanges: DepthRange[],
): number {
  const range = depthRanges.find(
    (r) => chainage >= r.from_ch && chainage < r.to_ch,
  );
  if (!range) return 3;
  const layers = Math.ceil((range.max_depth_mm - 150) / 900);
  return Math.max(layers, 1);
}

export function getLayerKeys(layersRequired: number): string[] {
  const keys: string[] = [];
  const clamped = Math.min(Math.max(layersRequired, 1), 5);
  for (let l = 1; l <= clamped; l += 1) {
    keys.push(`l${l}_150`, `l${l}_450`, `l${l}_750`);
  }
  return keys;
}

/** Lift keys `l1_150`…`l{n}_750` for validation/payload (no upper clamp). */
export function getLayerFieldKeysForLayerCount(layerCount: number): string[] {
  const keys: string[] = [];
  const n = Math.max(1, Math.floor(Number(layerCount)) || 1);
  for (let l = 1; l <= n; l += 1) {
    keys.push(`l${l}_150`, `l${l}_450`, `l${l}_750`);
  }
  return keys;
}

/** Columns currently materialized on `psp_records` (l1–l5). */
export const PSP_RECORD_DB_LAYER_COUNT = 5 as const;

export function isRecordComplete(
  record: Record<string, unknown>,
  layersRequired: number,
): boolean {
  const storableLayers = Math.min(Math.max(layersRequired, 1), 5);
  return getLayerKeys(storableLayers).every((key) => {
    const value = record[key];
    return value !== null && value !== undefined;
  });
}
