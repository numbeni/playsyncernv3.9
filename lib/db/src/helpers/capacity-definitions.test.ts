import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCapacityDefinitions,
  type CapacityDefinition,
} from "./capacity-definitions.ts";

const SHARED: CapacityDefinition = {
  capacityKind: "Z3_SHARED_PS5_PS4",
  instanceNo: 0,
  displayLabel: "Z3 Shared PS5/PS4",
};

describe("buildCapacityDefinitions", () => {
  it("PS5_ONLY returns two Z2_PS5 slots and one shared Z3", () => {
    const defs = buildCapacityDefinitions("PS5_ONLY");
    assert.deepStrictEqual(defs, [
      { capacityKind: "Z2_PS5", instanceNo: 1, displayLabel: "Z2 PS5 #1" },
      { capacityKind: "Z2_PS5", instanceNo: 2, displayLabel: "Z2 PS5 #2" },
      SHARED,
    ]);
  });

  it("PS4_ONLY returns one Z2_PS4 slot and one shared Z3", () => {
    const defs = buildCapacityDefinitions("PS4_ONLY");
    assert.deepStrictEqual(defs, [
      { capacityKind: "Z2_PS4", instanceNo: 1, displayLabel: "Z2 PS4 #1" },
      SHARED,
    ]);
  });

  it("PS4_AND_PS5 returns two Z2_PS5, one Z2_PS4, and one shared Z3", () => {
    const defs = buildCapacityDefinitions("PS4_AND_PS5");
    assert.deepStrictEqual(defs, [
      { capacityKind: "Z2_PS5", instanceNo: 1, displayLabel: "Z2 PS5 #1" },
      { capacityKind: "Z2_PS5", instanceNo: 2, displayLabel: "Z2 PS5 #2" },
      { capacityKind: "Z2_PS4", instanceNo: 1, displayLabel: "Z2 PS4 #1" },
      SHARED,
    ]);
  });
});
