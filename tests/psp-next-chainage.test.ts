import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getNextChainageFromSet,
  resolveTravelDirection,
} from "../lib/psp-logic";

describe("resolveTravelDirection", () => {
  it("uses start>end as backwards even if direction says onwards", () => {
    assert.equal(resolveTravelDirection("onwards", 773, 0), "backwards");
  });
  it("uses start<end as onwards", () => {
    assert.equal(resolveTravelDirection("backwards", 0, 773), "onwards");
  });
  it("falls back to direction text when span missing", () => {
    assert.equal(resolveTravelDirection("onwards", null, null), "onwards");
    assert.equal(resolveTravelDirection(null, null, null), "backwards");
  });
});

describe("getNextChainageFromSet", () => {
  it("Section 1 style: backwards subtracts 20 from the lowest", () => {
    assert.equal(getNextChainageFromSet([760, 740, 580, 520], "backwards", 773), 500);
  });
  it("onwards adds 20 past the highest", () => {
    assert.equal(getNextChainageFromSet([0, 20, 40], "onwards", 0), 60);
  });
  it("empty set returns start_ch", () => {
    assert.equal(getNextChainageFromSet([], "backwards", 773), 773);
  });
});
