import { describe, expect, it } from "vitest";
import type {
  ConstructionSnapshot,
  ConstructionWait,
  RobotSnapshot,
  Snapshot,
} from "../src/simulation";
import {
  isConstructionHeldUp,
  isMaintenanceHeldUp,
  summariseHeldUp,
} from "../src/ui/construction-panel-text";

/** A solar array at Site Preparation, waiting for what it is given. */
function construction(
  waiting: ConstructionWait | undefined,
): ConstructionSnapshot {
  return {
    id: "structure-1",
    structureTypeId: "solar-array",
    position: { x: 0, y: 0 },
    stage: "site-preparation",
    stageProgress: 0,
    componentsTaken: false,
    failedCommissionings: 0,
    unusedComponents: [],
    waiting,
  };
}

const idleBase: Pick<
  Snapshot,
  "robots" | "machines" | "structures" | "cables"
> = { robots: [], machines: [], structures: [], cables: [] };

describe("which Work Orders the Work panel marks as held up", () => {
  it("marks a Construction that waits for Components, water or a Broken Machine", () => {
    const waits: ConstructionWait[] = [
      {
        reason: "missing-components",
        missing: [{ componentId: "solar-panel", count: 2 }],
      },
      { reason: "water-reserve", stockId: "water", missingKilograms: 120 },
      { reason: "machine-broken", machineTypeId: "excavator" },
    ];
    for (const waiting of waits) {
      expect(isConstructionHeldUp(construction(waiting), idleBase)).toBe(true);
    }
  });

  it("doesn't mark one waiting for the Robot, or for a Machine the base's own work frees", () => {
    const waits: (ConstructionWait | undefined)[] = [
      undefined,
      { reason: "machine-busy", machineTypeId: "excavator" },
      { reason: "machine-maintained", machineTypeId: "excavator" },
    ];
    for (const waiting of waits) {
      expect(isConstructionHeldUp(construction(waiting), idleBase)).toBe(false);
    }
  });

  it("doesn't mark one that a Robot is working on meanwhile", () => {
    const robot = {
      id: "robot-1",
      activity: { kind: "laying-cable", structureId: "structure-1" },
      carrying: [],
    } as unknown as RobotSnapshot;
    expect(
      isConstructionHeldUp(
        construction({ reason: "machine-broken", machineTypeId: "excavator" }),
        { ...idleBase, robots: [robot] },
      ),
    ).toBe(false);
  });

  it("marks Maintenance short of spare Components, but not one waiting for a Machine at work", () => {
    expect(
      isMaintenanceHeldUp({
        waiting: { reason: "missing-spare-components", missing: 2 },
      }),
    ).toBe(true);
    expect(
      isMaintenanceHeldUp({ waiting: { reason: "machine-at-work" } }),
    ).toBe(false);
    expect(isMaintenanceHeldUp({ waiting: undefined })).toBe(false);
  });

  it("sums up how many are held up, and nothing while none is", () => {
    expect(summariseHeldUp(0)).toBeUndefined();
    expect(summariseHeldUp(2)).toBe("2 waiting");
  });
});
