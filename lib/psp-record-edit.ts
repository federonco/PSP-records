import { LIFT_SUFFIXES } from "@/lib/psp-depth";

export const BLOW_MIN = 0;
export const BLOW_MAX = 35;
export const LAYER_MIN = 1;
export const LAYER_MAX = 5;

export type EditAction = "edit" | "delete_layer" | "add_layer";

export type PspEditExisting = {
  layers_required: number;
  sign_off_at: string | null;
  updated_at: string;
  readings: Record<string, number | null>;
};

export type PspEditInput = {
  layersRequired: number;
  readings: Record<string, number | null>;
  reason: string | null;
  expectedUpdatedAt: string;
};

export type PspEditResult =
  | { ok: true; action: EditAction; readings: Record<string, number | null>; reason: string | null }
  | { ok: false; status: number; error: string };

export function layerKey(layer: number, suffix: string) {
  return `l${layer}_${suffix}`;
}

export function timestampsConflict(stored: string, expected: string): boolean {
  const a = Date.parse(stored);
  const b = Date.parse(expected);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
  return a !== b;
}

function readingValue(raw: unknown): { ok: true; value: number | null } | { ok: false } {
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };
  if (typeof raw === "number") {
    if (!Number.isInteger(raw) || raw < BLOW_MIN || raw > BLOW_MAX) return { ok: false };
    return { ok: true, value: raw };
  }
  if (typeof raw === "string" && /^-?\d+$/.test(raw.trim())) {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < BLOW_MIN || value > BLOW_MAX) return { ok: false };
    return { ok: true, value };
  }
  return { ok: false };
}

function layerHasReading(
  readings: Record<string, number | null>,
  layer: number,
): boolean {
  return LIFT_SUFFIXES.some((suffix) => readings[layerKey(layer, suffix)] != null);
}

export function validatePspRecordEdit(
  existing: PspEditExisting,
  input: PspEditInput,
): PspEditResult {
  if (timestampsConflict(existing.updated_at, input.expectedUpdatedAt)) {
    return { ok: false, status: 409, error: "Record changed. Reload and try again." };
  }
  if (!Number.isInteger(input.layersRequired) || input.layersRequired < LAYER_MIN || input.layersRequired > LAYER_MAX) {
    return { ok: false, status: 400, error: "layers_required must be between 1 and 5." };
  }
  const current = Math.min(LAYER_MAX, Math.max(LAYER_MIN, Math.floor(existing.layers_required || 3)));
  if (input.layersRequired > current + 1) {
    return { ok: false, status: 400, error: "Add one layer at a time." };
  }
  const signed = existing.sign_off_at != null && String(existing.sign_off_at).trim() !== "";
  const reason = input.reason?.trim() ? input.reason.trim() : null;
  if (signed && !reason) {
    return { ok: false, status: 400, error: "A reason is required for a signed record." };
  }

  const readings: Record<string, number | null> = {};
  for (let layer = 1; layer <= LAYER_MAX; layer += 1) {
    for (const suffix of LIFT_SUFFIXES) {
      const key = layerKey(layer, suffix);
      const parsed = readingValue(input.readings[key]);
      if (!parsed.ok) {
        return { ok: false, status: 400, error: `${key} must be an integer from 0 to 35, or empty.` };
      }
      readings[key] = layer > input.layersRequired ? null : parsed.value;
      if (layer > input.layersRequired && parsed.value != null) {
        return {
          ok: false,
          status: 400,
          error: "Remove the highest layer first. A lower layer cannot be deleted while a higher one has readings.",
        };
      }
    }
  }

  if (input.layersRequired < current) {
    for (let layer = input.layersRequired + 1; layer <= current; layer += 1) {
      if (layerHasReading(readings, layer) || layerHasReading(input.readings as Record<string, number | null>, layer)) {
        return {
          ok: false,
          status: 400,
          error: "Remove the highest layer first. A lower layer cannot be deleted while a higher one has readings.",
        };
      }
    }
  }

  let action: EditAction = "edit";
  if (input.layersRequired > current) action = "add_layer";
  if (input.layersRequired < current) action = "delete_layer";
  return { ok: true, action, readings, reason };
}
