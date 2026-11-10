import { describe, expect, it } from "vitest";
import type { Snapshot, StructureSnapshot } from "../src/simulation";
import {
  describeStructureStack,
  stacksInList,
  summariseStructureGroup,
} from "../src/ui/structure-list-text";
import { loadSample } from "./sample-saves";

// A sample save of a base with two solar arrays, an extraction plant running
// and a vacuum fabrication plant waiting for silicon.
const state: Snapshot = loadSample("version-35.moonbase").snapshot();

function typed(structureTypeId: string): StructureSnapshot {
  const structure = state.structures.find(
    (each) => each.structureTypeId === structureTypeId,
  );
  if (structure === undefined) throw new Error(`no ${structureTypeId}`);
  return structure;
}

/** A solar array like the base's, at a Condition. */
function array(id: string, conditionPercent: number): StructureSnapshot {
  return { ...typed("solar-array"), id, conditionPercent };
}

/** A Plant like the base's extraction plant, at a Condition, switched off or not. */
function plant(
  id: string,
  conditionPercent: number,
  switchedOff = false,
): StructureSnapshot {
  return { ...typed("extraction-plant"), id, conditionPercent, switchedOff };
}

describe("which Structures the Base panel lists in one row for their type", () => {
  it("lists those that only stand and work, such as battery banks, solar arrays, lights and tanks", () => {
    for (const id of [
      "battery-bank",
      "solar-array",
      "light-mast",
      "oxygen-tank",
    ]) {
      expect(stacksInList(id), id).toBe(true);
    }
  });

  it("gives each Plant a row, as each has its own switch and its own batch", () => {
    for (const id of ["extraction-plant", "greenhouse", "infrared-telescope"]) {
      expect(stacksInList(id), id).toBe(false);
    }
  });

  it("gives each Habitat a row, with its shielding and water wall under it", () => {
    for (const id of ["habitat", "regolith-shielding", "water-wall"]) {
      expect(stacksInList(id), id).toBe(false);
    }
  });

  it("gives each radio telescope array a row, as each works through its own round", () => {
    expect(stacksInList("radio-telescope-array")).toBe(false);
  });
});

describe("the one row for several Structures of a type", () => {
  it("names the type, counts them and gives the lowest Condition among them", () => {
    expect(
      describeStructureStack(state, [
        array("a", 97),
        array("b", 78),
        array("c", 100),
      ]),
    ).toEqual({ name: "Solar array ×3", lowestConditionPercent: 78 });
  });

  it("says how many are Broken, without power, to be dismantled or due Maintenance", () => {
    const withOrders: Snapshot = {
      ...state,
      dismantlings: [],
      maintenance: [
        {
          ...maintenanceLike(),
          target: {
            kind: "structure",
            structureId: "c",
            structureTypeId: "solar-array",
          },
          underWay: false,
        },
      ],
    };

    const stack = describeStructureStack(withOrders, [
      array("a", 0),
      { ...array("b", 90), powered: false },
      array("c", 55),
      array("d", 100),
    ]);

    expect(stack.lowestConditionPercent).toBe(0);
    expect(stack.line).toBe("1 Broken, 1 no power, 1 awaiting Maintenance");
  });
});

describe("what a group's heading says of its Structures", () => {
  it("says nothing while every one is working and as good as new", () => {
    expect(
      summariseStructureGroup([array("a", 100), array("b", 99.6)]),
    ).toBeUndefined();
  });

  it("gives the lowest Condition among them", () => {
    expect(summariseStructureGroup([array("a", 97), array("b", 71.6)])).toBe(
      "lowest 72%",
    );
  });

  it("counts the Plants switched off, and the Broken, ahead of the lowest Condition of the rest", () => {
    expect(
      summariseStructureGroup([
        plant("a", 100, true),
        plant("b", 0),
        plant("c", 64, true),
        plant("d", 100),
      ]),
    ).toBe("1 Broken · 2 off · lowest 64%");
  });
});

/** A Maintenance Work Order awaiting the Robot, for its target to be set. */
function maintenanceLike(): Snapshot["maintenance"][number] {
  return {
    target: { kind: "structure", structureId: "", structureTypeId: "" },
    spareComponents: 1,
    cleaning: false,
    underWay: false,
    step: "loading-spare-components",
    stageProgress: 0,
    waiting: undefined,
  };
}

describe("counting the states of the Structures that share a row", () => {
  it("counts each of them once, by the worst of what is so of it, in a fixed order", () => {
    const order = (structureId: string): Snapshot["maintenance"][number] => ({
      ...maintenanceLike(),
      target: {
        kind: "structure",
        structureId,
        structureTypeId: "solar-array",
      },
    });
    const withOrders: Snapshot = {
      ...state,
      dismantlings: [],
      // The Broken one is due Maintenance too, as every Broken thing is.
      maintenance: [order("b"), order("c")],
    };

    expect(
      describeStructureStack(withOrders, [
        array("a", 100),
        array("b", 60),
        array("c", 0),
      ]).line,
    ).toBe("1 Broken, 1 awaiting Maintenance");
  });
});
