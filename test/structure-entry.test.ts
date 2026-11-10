import { describe, expect, it } from "vitest";
import type { Snapshot, StructureSnapshot } from "../src/simulation";
import { describeStructureEntry } from "../src/ui/structure-state";
import { loadSample } from "./sample-saves";
import { changed, worn } from "./worn";

// A sample save of a base with two solar arrays, an extraction plant running
// and a vacuum fabrication plant waiting for silicon.
const base = loadSample("version-35.moonbase");

function typed(state: Snapshot, structureTypeId: string): StructureSnapshot {
  const structure = state.structures.find(
    (each) => each.structureTypeId === structureTypeId,
  );
  if (structure === undefined) throw new Error(`no ${structureTypeId}`);
  return structure;
}

function entryOf(state: Snapshot, structureTypeId: string) {
  return describeStructureEntry(state, typed(state, structureTypeId), false);
}

describe("what the Base panel's row says of a Structure", () => {
  it("says nothing of one that is commissioned and working with nothing to report", () => {
    // A battery bank, where the first solar array stood.
    const withBank = changed(base, (saved) => {
      const first = saved.structures[0] as unknown as {
        structureTypeId: string;
      };
      first.structureTypeId = "battery-bank";
    });

    expect(entryOf(withBank.snapshot(), "battery-bank")).toEqual({
      value: undefined,
    });
  });

  it("leaves out that it is commissioned, and keeps what is out of the ordinary about it", () => {
    const entry = entryOf(base.snapshot(), "solar-array");

    expect(entry.value).toBeUndefined();
    expect(entry.note).toMatch(/^Dust coating \d+%$/);
    expect(entry.more).toBeUndefined();
  });

  it("says what a running Plant is doing, and leaves what it makes and uses to its tooltip", () => {
    const entry = entryOf(base.snapshot(), "extraction-plant");

    expect(entry.value).toMatch(/^running, \d+ min left of this batch$/);
    expect(entry.note).toBeUndefined();
    expect(entry.more).toBe(
      "making 0.15 kg of oxygen, 0.04 kg of metals and 0.02 kg of silicon an hour from 4 kg of Regolith",
    );
  });

  it("says what a Plant is waiting for", () => {
    expect(entryOf(base.snapshot(), "vacuum-fabrication-plant")).toEqual({
      value: "waiting for Silicon: 0.2 of 0.35 kg",
    });
  });

  it("says that one is Broken, or to be dismantled", () => {
    const state = base.snapshot();
    const array = typed(state, "solar-array");
    const broken = worn(base, array.id, 0, 0).snapshot();

    expect(entryOf(broken, "solar-array").value).toBe("Broken");
    expect(describeStructureEntry(state, array, true).value).toBe(
      "to be dismantled",
    );
  });
});
