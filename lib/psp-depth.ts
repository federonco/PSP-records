export type DepthRange = {
  from_ch: number;
  to_ch: number;
  max_depth_mm: number;
};

export const LIFT_OFFSET_MM = 150;
export const LIFT_BAND_MM = 300;
export const LIFTS_PER_LAYER = 3;
/** Hard ceiling: l1–l5 × 3 lifts (psp_records columns). */
export const MAX_TOTAL_LIFTS = 15;
export const LIFT_SUFFIXES = ["150", "450", "750"] as const;
export type LiftSuffix = (typeof LIFT_SUFFIXES)[number];

export type DepthLiftPlan = {
  totalLifts: number;
  layers: number;
  /** Required blow keys, e.g. `l1_150`, `l1_450` (no inactive lifts). */
  activeKeys: string[];
  /** Per 1-based layer: which depth suffixes are active. */
  liftsByLayer: { layer: number; suffixes: LiftSuffix[] }[];
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

/**
 * Exact lift/layer plan from max excavation depth.
 * totalLifts = clamp(ceil((max_depth_mm - 150) / 300), 1, 15);
 * layers = ceil(totalLifts / 3). Last layer may be partial.
 */
export function calculateDepthLiftPlan(maxDepthMm: number): DepthLiftPlan {
  const depth = Number(maxDepthMm);
  const raw = Number.isFinite(depth)
    ? Math.ceil((depth - LIFT_OFFSET_MM) / LIFT_BAND_MM)
    : 1;
  const totalLifts = Math.min(MAX_TOTAL_LIFTS, Math.max(1, raw));
  const layers = Math.ceil(totalLifts / LIFTS_PER_LAYER);

  const activeKeys: string[] = [];
  const liftsByLayer: DepthLiftPlan["liftsByLayer"] = [];

  for (let layer = 1; layer <= layers; layer += 1) {
    const startLift = (layer - 1) * LIFTS_PER_LAYER;
    const liftsInLayer = Math.min(LIFTS_PER_LAYER, totalLifts - startLift);
    const suffixes = LIFT_SUFFIXES.slice(0, liftsInLayer) as LiftSuffix[];
    liftsByLayer.push({ layer, suffixes });
    for (const suf of suffixes) {
      activeKeys.push(`l${layer}_${suf}`);
    }
  }

  return { totalLifts, layers, activeKeys, liftsByLayer };
}

export function findDepthRangeForChainage(
  chainage: number,
  depthRanges: DepthRange[],
): DepthRange | null {
  if (!Number.isFinite(chainage) || !depthRanges.length) return null;
  const lo = Math.min;
  const hi = Math.max;
  return (
    depthRanges.find((r) => {
      const a = lo(r.from_ch, r.to_ch);
      const b = hi(r.from_ch, r.to_ch);
      // Inclusive on both ends so end_ch of the span still matches.
      return chainage >= a && chainage <= b;
    }) ?? null
  );
}

/** Null when chainage is outside all configured ranges (caller uses fallback). */
export function getDepthLiftPlanForChainage(
  chainage: number,
  depthRanges: DepthRange[],
): DepthLiftPlan | null {
  const range = findDepthRangeForChainage(chainage, depthRanges);
  if (!range) return null;
  return calculateDepthLiftPlan(range.max_depth_mm);
}

/** Layer count for a chainage from depth_ranges; default 3 when no range matches. */
export function getLayersRequired(
  chainage: number,
  depthRanges: DepthRange[],
): number {
  const plan = getDepthLiftPlanForChainage(chainage, depthRanges);
  return plan?.layers ?? 3;
}

/** All three lift keys for each of `layersRequired` layers (legacy full-layer shape). */
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

/**
 * Record is COMPLETE when every required lift key has a non-null value.
 * Pass `activeKeys` from a DepthLiftPlan, or a layer count (legacy: all 3 lifts/layer).
 */
export function isRecordComplete(
  record: Record<string, unknown>,
  layersRequiredOrKeys: number | string[],
): boolean {
  const keys = Array.isArray(layersRequiredOrKeys)
    ? layersRequiredOrKeys
    : getLayerKeys(
        Math.min(Math.max(layersRequiredOrKeys, 1), PSP_RECORD_DB_LAYER_COUNT),
      );
  if (!keys.length) return false;
  return keys.every((key) => {
    const value = record[key];
    return value !== null && value !== undefined && value !== "";
  });
}
