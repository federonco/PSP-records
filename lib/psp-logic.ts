import { CHAINAGE_STEP, START_CHAINAGE } from "@/lib/psp";
import { getSupabaseServer } from "@/lib/supabase/server";

type ResolveLocationInput = {
  locationId?: string | null;
  locationName?: string | null;
  accessToken?: string | null;
};

export type CleanRecordInput = {
  locationId: string;
  locationName?: string | null;
  chainage: number;
  siteInspector: string;
  layers: Record<string, number>;
  sectionId?: string | null;
};

const layerKeys = [
  "l1_150",
  "l1_450",
  "l1_750",
  "l2_150",
  "l2_450",
  "l2_750",
  "l3_150",
  "l3_450",
  "l3_750",
] as const;

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
    .from("psp_locations")
    .select("id")
    .eq("name", locationName)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

export function validateSaveData(input: Record<string, unknown>) {
  const errors: string[] = [];
  const clean: CleanRecordInput = {
    locationId: "",
    locationName: null,
    chainage: 0,
    siteInspector: "",
    layers: {},
    sectionId: null,
  };

  const locationId = String(input.locationId ?? "").trim();
  const locationName = String(input.locationName ?? "").trim();
  if (!locationId && !locationName) {
    errors.push("Location is required");
  }
  clean.locationId = locationId;
  clean.locationName = locationName || null;

  const siteInspector = String(input.siteInspector ?? "").trim();
  if (!siteInspector) errors.push("Site inspector is required");
  clean.siteInspector = siteInspector;

  const chainageRaw = input.chainage;
  const chainageNumber = Number(chainageRaw);
  if (!Number.isFinite(chainageNumber)) {
    errors.push(
      `Invalid chainage: received '${chainageRaw}', parsed NaN. Must be multiple of ${CHAINAGE_STEP}.`,
    );
  } else if (chainageNumber % CHAINAGE_STEP !== 0) {
    errors.push(
      `Invalid chainage: received '${chainageRaw}', parsed ${chainageNumber}. Must be multiple of ${CHAINAGE_STEP}.`,
    );
  }
  clean.chainage = Number.isFinite(chainageNumber) ? chainageNumber : 0;

  const layers = input.layers as Record<string, unknown> | undefined;
  layerKeys.forEach((key) => {
    const raw = layers?.[key];
    const num = Number(raw);
    if (raw === "" || raw === null || raw === undefined) {
      errors.push(`${key} is required`);
    } else if (!Number.isFinite(num)) {
      errors.push(`${key} must be a number`);
    } else if (num < 0 || num > 35) {
      errors.push(`${key} must be between 0 and 35`);
    }
    clean.layers[key] = num;
  });

  clean.sectionId = String(input.sectionId ?? "").trim() || null;

  if (errors.length) {
    return { ok: false as const, error: errors.join("; ") };
  }
  return { ok: true as const, clean };
}

export function getNextChainageFromSet(chainages: number[]) {
  if (!chainages.length) return START_CHAINAGE;

  const numeric = chainages.filter((value) => Number.isFinite(value));
  if (!numeric.length) return START_CHAINAGE;

  const max = Math.max(...numeric);
  const aligned = Math.floor(max / CHAINAGE_STEP) * CHAINAGE_STEP;
  const set = new Set(numeric);
  let nextCh = aligned - CHAINAGE_STEP;
  while (set.has(nextCh) || nextCh % CHAINAGE_STEP !== 0) {
    nextCh -= CHAINAGE_STEP;
  }
  return nextCh;
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
