import { describe, expect, it, vi } from "vitest";
import {
  catalogue,
  type Catalogue,
  type StructureType,
} from "../src/catalogue";
import type { PowerNetworkSnapshot, Snapshot } from "../src/simulation";
import { unlock } from "./designs";
import { scenario, type Scenario } from "./scenario";

// Dust neither wears down nor coats anything, so that Structures generate
// and store just what the data catalogue sets, and no Machine draws power
// for a heater at Night. A large battery bank's Components come in the
// starting stock, so that no Launch has to bring them.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutDust } = await import("./without-dust");
  const { withoutCold } = await import("./without-cold");
  const base = withoutCold(withoutDust(actual.catalogue));
  const large = base.structureTypes.find(
    (type) => type.id === "large-battery-bank",
  );
  return {
    ...actual,
    catalogue: {
      ...base,
      startingStock: [...base.startingStock, ...(large?.components ?? [])],
    },
  };
});

function structureType(id: string): StructureType {
  const type = catalogue.structureTypes.find(
    (candidate) => candidate.id === id,
  );
  if (type === undefined) throw new Error(`expected a ${id}`);
  return type;
}
const solarArray = structureType("solar-array");
const largeBatteryBank = structureType("large-battery-bank");

/** Runs the game until every planned Construction is commissioned. */
function runUntilBuilt(game: Scenario): void {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 5 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
}

function networkOf(state: Snapshot, structureId: string): PowerNetworkSnapshot {
  const network = state.power.networks.find((candidate) =>
    candidate.structureIds.includes(structureId),
  );
  if (network === undefined) throw new Error("expected a power network");
  return network;
}

describe("a large battery bank", () => {
  it("once its Design is unlocked and it is built, stores as much as the data catalogue says, charging from a solar array's surplus in Daylight", () => {
    const game = scenario();
    unlock(game.campaign, largeBatteryBank.designId);
    game
      .plan(solarArray.id, { x: 20, y: 12 })
      .plan(largeBatteryBank.id, { x: 30, y: 25 });
    runUntilBuilt(game);
    const batteryId =
      game.state.structures.find(
        (structure) => structure.structureTypeId === largeBatteryBank.id,
      )?.id ?? "";
    const before = networkOf(game.state, batteryId).storedKilowattHours;

    game.advance({ hours: 1 });
    const after = networkOf(game.state, batteryId).storedKilowattHours;
    game.advance({ earthDays: 2 });

    expect(game.state.lunation.part).toBe("daylight");
    const surplus =
      solarArray.power.generationKilowatts -
      solarArray.power.drawKilowatts -
      largeBatteryBank.power.drawKilowatts;
    expect(after - before).toBeCloseTo(surplus);
    expect(networkOf(game.state, batteryId)).toMatchObject({
      storedKilowattHours: largeBatteryBank.power.storageKilowattHours,
      storageCapacityKilowattHours: largeBatteryBank.power.storageKilowattHours,
      consumptionKilowatts:
        solarArray.power.drawKilowatts + largeBatteryBank.power.drawKilowatts,
      powered: true,
    });
  });
});
