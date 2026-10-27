import { describe, expect, it, vi } from "vitest";
import {
  catalogue,
  type Catalogue,
  type StructureType,
} from "../src/catalogue";
import type {
  GroundPosition,
  PowerNetworkSnapshot,
  Snapshot,
  StructureSnapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

// The Power Designs are unlocked from the start, with a kit for each of
// their Structures in the starting stock. Dust neither wears down nor
// coats anything, and no Machine feels the cold, so that Structures
// generate and draw just what the data catalogue sets.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withDesigns } = await import("./with-designs");
  const { withoutDust } = await import("./without-dust");
  const { withoutCold } = await import("./without-cold");
  return {
    ...actual,
    catalogue: withDesigns(withoutCold(withoutDust(actual.catalogue)), [
      "thin-film-solar-cells",
      "tall-light-masts",
    ]),
  };
});

function structureType(id: string): StructureType {
  const type = catalogue.structureTypes.find(
    (candidate) => candidate.id === id,
  );
  if (type === undefined) throw new Error(`expected a ${id}`);
  return type;
}
const thinFilm = structureType("thin-film-solar-array");
const tallMast = structureType("tall-light-mast");
const solarArray = structureType("solar-array");
const batteryBank = structureType("battery-bank");
const solarSite: GroundPosition = { x: 20, y: 12 };
const batterySite: GroundPosition = { x: 30, y: 25 };
const mastSite: GroundPosition = { x: 15, y: -10 };

/** Runs the game until every planned Construction is commissioned. */
function runUntilBuilt(game: Scenario): void {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 5 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
}

/** Runs the game until the given part of the Lunation has just begun. */
function runUntil(game: Scenario, part: "daylight" | "night"): void {
  do {
    game.advance({ minutes: game.state.lunation.minutesRemaining });
  } while (game.state.lunation.part !== part);
}

function structureOf(state: Snapshot, typeId: string): StructureSnapshot {
  const found = state.structures.find((s) => s.structureTypeId === typeId);
  if (found === undefined) throw new Error(`expected a ${typeId}`);
  return found;
}

function networkOf(state: Snapshot, structureId: string): PowerNetworkSnapshot {
  const network = state.power.networks.find((candidate) =>
    candidate.structureIds.includes(structureId),
  );
  if (network === undefined) throw new Error("expected a power network");
  return network;
}

describe("a thin-film solar array", () => {
  it("generates as much as the data catalogue says in Daylight, more than a solar array", () => {
    const game = scenario()
      .plan(thinFilm.id, solarSite)
      .plan("battery-bank", batterySite);
    runUntilBuilt(game);
    game.advance({ minutes: 1 });

    const array = structureOf(game.state, thinFilm.id);
    expect(game.state.lunation.part).toBe("daylight");
    expect(array.powered).toBe(true);
    expect(networkOf(game.state, array.id).generationKilowatts).toBeCloseTo(
      thinFilm.power.generationKilowatts,
    );
    expect(thinFilm.power.generationKilowatts).toBeGreaterThan(
      solarArray.power.generationKilowatts,
    );
  });
});

describe("a tall Light Mast", () => {
  /** A thin-film solar array, a battery bank and a tall Light Mast, all commissioned and joined by cable. */
  function litBase(): Scenario {
    const game = scenario()
      .plan(thinFilm.id, solarSite)
      .plan("battery-bank", batterySite)
      .plan(tallMast.id, mastSite);
    runUntilBuilt(game);
    return game;
  }

  it("switches on at Night, lighting as far round it as the data catalogue says and drawing its power, and off in Daylight", () => {
    const game = litBase();
    game.advance({ minutes: 1 });
    expect(structureOf(game.state, tallMast.id)).toMatchObject({
      lit: false,
      powered: true,
    });

    runUntil(game, "night");
    game.advance({ hours: 1 });

    const mast = structureOf(game.state, tallMast.id);
    expect(mast).toMatchObject({
      lit: true,
      powered: true,
      lightRadiusMetres: tallMast.lightRadiusMetres,
    });
    expect(networkOf(game.state, mast.id).consumptionKilowatts).toBeCloseTo(
      thinFilm.power.drawKilowatts +
        batteryBank.power.drawKilowatts +
        tallMast.power.nightDrawKilowatts,
    );
    expect(mast.lightRadiusMetres).toBe(
      2 * structureType("light-mast").lightRadiusMetres,
    );

    runUntil(game, "daylight");
    game.advance({ minutes: 1 });
    expect(structureOf(game.state, tallMast.id).lit).toBe(false);
  });
});
