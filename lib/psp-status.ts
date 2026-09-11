import { getLayerKeys, PSP_RECORD_DB_LAYER_COUNT } from "@/lib/psp-depth";

export type RecordStatus = "COMPLETE" | "INCOMPLETE";

function readLayersRequired(record: Record<string, unknown>): number {
  const raw = record.layers_required;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 3;
  return Math.min(
    PSP_RECORD_DB_LAYER_COUNT,
    Math.max(1, Math.floor(n)),
  );
}

function cellFilled(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

/**
 * COMPLETE when every lift of every required layer is filled.
 * Uses the record's frozen `layers_required` — never recompute from config.
 */
export function isRecordComplete(record: Record<string, unknown>): boolean {
  const layersRequired = readLayersRequired(record);
  const keys = getLayerKeys(layersRequired);
  if (!keys.length) return false;
  return keys.every((key) => cellFilled(record[key]));
}

export function recordStatus(record: Record<string, unknown>): RecordStatus {
  return isRecordComplete(record) ? "COMPLETE" : "INCOMPLETE";
}

/**
 * Timestamp WHEN complete — not WHETHER.
 * false→true: stamp now; true→false (layer cleared): null; already complete: keep.
 */
export function nextCompletedAt(
  previous: Record<string, unknown>,
  merged: Record<string, unknown>,
  nowIso: string = new Date().toISOString(),
): string | null {
  const wasComplete = isRecordComplete(previous);
  const nowComplete = isRecordComplete(merged);
  if (nowComplete) {
    if (wasComplete && previous.completed_at != null) {
      return String(previous.completed_at);
    }
    return nowIso;
  }
  return null;
}
