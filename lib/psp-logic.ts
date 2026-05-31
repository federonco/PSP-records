import { CHAINAGE_STEP, START_CHAINAGE } from "@/lib/psp";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getLayerFieldKeysForLayerCount } from "@/lib/psp-depth";

type ResolveLocationInput = {
  locationId?: string | null;
  locationName?: string | null;
  accessToken?: string | null;
};

export type CleanRecordInput = {
  /** Legacy PSP site id; optional when saving by unified section only (QR flow). */
  locationId: string;
  locationName?: string | null;
  chainage: number;
  siteInspector: string;
  layers: Partial<Record<string, number | null>>;
  layersRequired: number;
  /** Unified `sections.id` (replaces legacy psp_sections.section_id). */
  unifiedSectionId?: string | null;
  subsectionId?: string | null;
  /** Legacy FK to psp_sections; omit for new unified records. */
  legacySectionId?: string | null;
  compactorSn?: string | null;
};

export async function resolveLocationId({
  locationId,
  locationName,
  accessToken,
}: ResolveLocationInput) {
  if (locationId) return locationId;
  if (!locationName) return null;

  const supabase = accessToken
    ? getSupabaseServer({ accessToken })
    : getSupabaseServer({ useServiceRole: true });
  const { data, error } = await supabase
    .from("locations")
    .select("id")
    .eq("location_type", "psp")
    .eq("name", locationName)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

export function validateSaveData(
  input: Record<string, unknown>,
  layersRequired: number,
) {
  const errors: string[] = [];
  const clean: CleanRecordInput = {
    locationId: "",
    locationName: null,
    chainage: 0,
    siteInspector: "",
    layers: {},
    layersRequired,
    unifiedSectionId: null,
    subsectionId: null,
    legacySectionId: null,
  };

  const locationId = String(input.locationId ?? "").trim();
  const locationName = String(input.locationName ?? "").trim();
  clean.locationId = locationId;
  clean.locationName = locationName || null;

  const siteInspector = String(input.siteInspector ?? "").trim();
  if (!siteInspector) errors.push("Site inspector is required");
  clean.siteInspector = siteInspector;

  const chainageRaw = input.chainage;
  const chainageNumber = Number(chainageRaw);
  if (!Number.isFinite(chainageNumber)) {
    errors.push(
      `Invalid chainage: received '${chainageRaw}', parsed NaN.`,
    );
  }
  clean.chainage = Number.isFinite(chainageNumber) ? chainageNumber : 0;

  const layers = input.layers as Record<string, unknown> | undefined;
  const physicalKeys = getLayerFieldKeysForLayerCount(layersRequired);
  for (const key of physicalKeys) {
    if (!layers || !Object.prototype.hasOwnProperty.call(layers, key)) {
      continue;
    }
    const raw = layers[key];
    if (raw === "" || raw === null || raw === undefined) {
      clean.layers[key] = null;
      continue;
    }
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      errors.push(`${key} must be a number`);
    } else if (num < 0 || num > 35) {
      errors.push(`${key} must be between 0 and 35`);
    }
    clean.layers[key] = num;
  }

  const unified =
    String(input.unifiedSectionId ?? input.sectionId ?? "").trim() || null;
  clean.unifiedSectionId = unified;
  clean.subsectionId =
    String(input.subsectionId ?? "").trim() || null;
  clean.legacySectionId =
    String(input.section_id ?? input.legacySectionId ?? "").trim() || null;

  if (!clean.unifiedSectionId) {
    errors.push("unifiedSectionId is required");
  }

  const compactorRaw = input.compactorSn;
  if (compactorRaw !== undefined && compactorRaw !== null && compactorRaw !== "") {
    const str = String(compactorRaw).trim();
    clean.compactorSn = str || null;
  } else {
    clean.compactorSn = null;
  }

  if (errors.length) {
    return { ok: false as const, error: errors.join("; ") };
  }
  return { ok: true as const, clean };
}

/** @param chainages Lodge order: most recent first (`recorded_at` DESC). */
export function getNextChainageFromSet(
  chainages: number[],
  direction: "backwards" | "onwards" = "backwards",
  startChainage?: number | null,
): number {
  const numeric = chainages.filter((value) => Number.isFinite(value));

  // Sin registros: arrancar desde start_ch
  if (numeric.length === 0) {
    return typeof startChainage === "number" ? startChainage : START_CHAINAGE;
  }

  // Con registros: último lodgeado ± step
  const lastLodged = numeric[0];
  const step = direction === "onwards" ? CHAINAGE_STEP : -CHAINAGE_STEP;
  const existing = new Set(numeric);

  let next = lastLodged + step;
  while (existing.has(next)) {
    next += step;
  }

  return next;
}

export function getHistoricalBlocksFromChainages(chainages: number[]) {
  if (!chainages.length) return [];

  const sorted = [...chainages]
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);

  if (!sorted.length) return [];

  const max = sorted[0];
  const totalBlocks = Math.ceil(sorted.length / 10);
  const set = new Set(sorted);
  const blocks = [];

  for (let index = 0; index < totalBlocks; index += 1) {
    const blockMax = max - index * 10 * CHAINAGE_STEP;
    const expected = Array.from({ length: 10 }, (_, idx) => blockMax - idx * CHAINAGE_STEP);
    const recordCount = expected.filter((value) => set.has(value)).length;
    const pending = expected.filter((value) => !set.has(value));
    blocks.push({
      key: `${blockMax}-${expected[expected.length - 1]}`,
      index: index + 1,
      start: expected[expected.length - 1],
      end: expected[0],
      expected,
      recordCount,
      status: recordCount === expected.length ? "READY" : "OPEN",
      pending,
    });
  }

  return blocks;
}
