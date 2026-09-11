import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRecordComplete, recordStatus } from "../lib/psp-status";

function base(layers_required: number): Record<string, unknown> {
  return { layers_required };
}

function fillLayer(record: Record<string, unknown>, layer: number) {
  record[`l${layer}_150`] = 10;
  record[`l${layer}_450`] = 10;
  record[`l${layer}_750`] = 10;
}

describe("isRecordComplete / recordStatus", () => {
  it("layers_required 3, l1+l2+l3 full -> COMPLETE", () => {
    const r = base(3);
    fillLayer(r, 1);
    fillLayer(r, 2);
    fillLayer(r, 3);
    assert.equal(isRecordComplete(r), true);
    assert.equal(recordStatus(r), "COMPLETE");
  });

  it("layers_required 3, only l1 full -> INCOMPLETE", () => {
    const r = base(3);
    fillLayer(r, 1);
    assert.equal(isRecordComplete(r), false);
    assert.equal(recordStatus(r), "INCOMPLETE");
  });

  it("layers_required 1, only l1 full -> COMPLETE", () => {
    const r = base(1);
    fillLayer(r, 1);
    assert.equal(isRecordComplete(r), true);
  });

  it("layers_required 1, l1 full + stray l2 data -> COMPLETE", () => {
    const r = base(1);
    fillLayer(r, 1);
    fillLayer(r, 2);
    assert.equal(isRecordComplete(r), true);
  });

  it("layers_required 5, l1..l4 full, l5 null -> INCOMPLETE", () => {
    const r = base(5);
    fillLayer(r, 1);
    fillLayer(r, 2);
    fillLayer(r, 3);
    fillLayer(r, 4);
    assert.equal(isRecordComplete(r), false);
  });

  it("one missing depth cell inside a full layer -> INCOMPLETE", () => {
    const r = base(1);
    r.l1_150 = 10;
    r.l1_450 = 10;
    r.l1_750 = null;
    assert.equal(isRecordComplete(r), false);
  });
});
