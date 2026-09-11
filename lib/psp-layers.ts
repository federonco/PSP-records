import {
  depthRangesFromAppConfig,
  findDepthRangeForChainage,
} from "@/lib/psp-depth";

export const MIN_LAYERS_REQUIRED = 1;
export const MAX_LAYERS_REQUIRED = 5;
export const DEFAULT_LAYERS_REQUIRED = 3;
/** One layer = three 300mm lifts spanning 900mm (150–1050 for layer 1). */
export const MM_PER_LAYER = 900;
export const LAYER_DEPTH_OFFSET_MM = 150;

function clampLayers(n: number): number {
  return Math.min(
    MAX_LAYERS_REQUIRED,
    Math.max(MIN_LAYERS_REQUIRED, Math.floor(n)),
  );
}

function readConfigLayersRequired(appConfig: unknown): number | null {
  if (!appConfig || typeof appConfig !== "object" || Array.isArray(appConfig)) {
    return null;
  }
  const raw = (appConfig as Record<string, unknown>).layers_required;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < MIN_LAYERS_REQUIRED || n > MAX_LAYERS_REQUIRED) {
    return null;
  }
  return Math.floor(n);
}

/**
 * Layers from max excavation depth.
 * Layer bands: 150–1050, 1050–1950, … → ceil((max_depth_mm - 150) / 900).
 * Spec text "ceil(max_depth_mm / 900)" with the 150–1050 band description:
 * offset keeps 1050mm = 1 layer (PAT).
 */
export function layersFromMaxDepthMm(maxDepthMm: number): number {
  const depth = Number(maxDepthMm);
  if (!Number.isFinite(depth) || depth <= 0) return DEFAULT_LAYERS_REQUIRED;
  const raw = Math.ceil((depth - LAYER_DEPTH_OFFSET_MM) / MM_PER_LAYER);
  return clampLayers(raw);
}

export type ResolveLayersRequiredInput = {
  subsectionAppConfig?: unknown | null;
  sectionAppConfig?: unknown | null;
  chainage: number;
};

/**
 * Resolution for NEW lodges only (never re-run against existing rows to change
 * their criterion — `psp_records.layers_required` is frozen at insert time).
 *
 * a. subsection depth_ranges covering chainage → layersFromMaxDepthMm
 * b. subsection.app_config.layers_required
 * c. section.app_config.layers_required
 * d. 3
 */
export function resolveLayersRequired(
  input: ResolveLayersRequiredInput,
): number {
  const subRanges = depthRangesFromAppConfig(input.subsectionAppConfig);
  const matched = findDepthRangeForChainage(input.chainage, subRanges);
  if (matched) {
    return layersFromMaxDepthMm(matched.max_depth_mm);
  }

  const fromSub = readConfigLayersRequired(input.subsectionAppConfig);
  if (fromSub != null) return fromSub;

  const fromSec = readConfigLayersRequired(input.sectionAppConfig);
  if (fromSec != null) return fromSec;

  return DEFAULT_LAYERS_REQUIRED;
}
