import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { timestampsConflict, validatePspRecordEdit, type PspEditExisting } from "../lib/psp-record-edit";

function fill(record: Record<string, number | null>, layer: number, value: number | null) {
  record[`l${layer}_150`] = value;
  record[`l${layer}_450`] = value;
  record[`l${layer}_750`] = value;
}

function row(layers: number, overrides: Partial<PspEditExisting> = {}): PspEditExisting {
  const readings: Record<string, number | null> = {};
  for (let layer = 1; layer <= 5; layer += 1) fill(readings, layer, null);
  return {
    layers_required: layers,
    sign_off_at: null,
    updated_at: "2026-06-29T00:00:00.000Z",
    readings,
    ...overrides,
  };
}

describe("validatePspRecordEdit", () => {
  it("drops 1434 from 5 layers to 3 when layer 4 and 5 are empty", () => {
    const existing = row(5, { sign_off_at: "2026-05-10T00:00:00.000Z" });
    fill(existing.readings, 1, 8);
    fill(existing.readings, 2, 8);
    fill(existing.readings, 3, 8);
    const readings = { ...existing.readings };
    const result = validatePspRecordEdit(existing, {
      layersRequired: 3,
      readings,
      reason: "Loaded with 5 layers by mistake",
      expectedUpdatedAt: existing.updated_at,
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.action, "delete_layer");
  });

  it("adds a layer to a 3-layer record", () => {
    const existing = row(3);
    fill(existing.readings, 1, 6);
    fill(existing.readings, 2, 6);
    fill(existing.readings, 3, 6);
    const readings = { ...existing.readings };
    const result = validatePspRecordEdit(existing, {
      layersRequired: 4,
      readings,
      reason: null,
      expectedUpdatedAt: existing.updated_at,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.action, "add_layer");
      assert.equal(result.readings.l4_150, null);
    }
  });

  it("allows clearing layer 3 readings when that layer is the highest", () => {
    const existing = row(3);
    fill(existing.readings, 1, 6);
    fill(existing.readings, 2, 6);
    fill(existing.readings, 3, 9);
    const readings = { ...existing.readings };
    fill(readings, 3, null);
    const result = validatePspRecordEdit(existing, {
      layersRequired: 2,
      readings,
      reason: null,
      expectedUpdatedAt: existing.updated_at,
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.action, "delete_layer");
  });

  it("blocks deleting layer 2 while layer 3 still has readings", () => {
    const existing = row(3);
    fill(existing.readings, 2, 4);
    fill(existing.readings, 3, 9);
    const readings = { ...existing.readings };
    fill(readings, 2, null);
    const result = validatePspRecordEdit(existing, {
      layersRequired: 2,
      readings,
      reason: null,
      expectedUpdatedAt: existing.updated_at,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 400);
  });

  it("blocks a signed edit without a reason", () => {
    const existing = row(3, { sign_off_at: "2026-06-29T01:00:00.000Z" });
    fill(existing.readings, 1, 6);
    const result = validatePspRecordEdit(existing, {
      layersRequired: 3,
      readings: { ...existing.readings, l1_150: 7 },
      reason: "  ",
      expectedUpdatedAt: existing.updated_at,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 400);
  });

  it("returns 409 when updated_at moved", () => {
    const existing = row(3);
    assert.equal(timestampsConflict(existing.updated_at, "2026-06-29T00:00:01.000Z"), true);
    const result = validatePspRecordEdit(existing, {
      layersRequired: 3,
      readings: existing.readings,
      reason: null,
      expectedUpdatedAt: "2026-06-29T00:00:01.000Z",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 409);
  });
});
