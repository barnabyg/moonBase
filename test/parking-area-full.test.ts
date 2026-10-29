import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import type { GroundPosition, Snapshot } from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

// A parking area with a single bay, so that it is full once one Machine or
// Rover is parked in it. Dust wears nothing down, and the starting stock
// holds the parking area's bay sockets.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutDust } = await import("./without-dust");
  const { withDesigns } = await import("./with-designs");
  const base = withDesigns(withoutDust(actual.catalogue), ["parking-areas"]);
  return {
    ...actual,
    catalogue: {
      ...base,
      structureTypes: base.structureTypes.map((type) =>
        type.parking === undefined
          ? type
          : {
              ...type,
              parking: {
                ...type.parking,
                bayOffsets: type.parking.bayOffsets.slice(0, 1),
              },
            },
      ),
    },
  };
});

const arraySite: GroundPosition = { x: 20, y: 12 };
const bankSite: GroundPosition = { x: -30, y: 4 };
const parkingSite: GroundPosition = { x: -20, y: -20 };
const { parkingLeadHours } = catalogue.cold;

/** Runs the game until the Robot has carried out every planned Construction. */
function buildAll(game: Scenario): Scenario {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
  return game;
}

/** Runs the game into the game-minute the park Work Orders for the Night are raised. */
function untilParkingStarts(game: Scenario): Snapshot {
  const { lunation } = game.state;
  if (lunation.part !== "daylight") throw new Error("expected Daylight");
  game.advance({ minutes: lunation.minutesRemaining - parkingLeadHours * 60 });
  return game.state;
}

describe("a full parking area", () => {
  it("has the Robot park whatever its bays can't take beside the nearest powered Structure, as without one", () => {
    const game = buildAll(
      scenario()
        .plan("solar-array", arraySite)
        .plan("battery-bank", bankSite)
        .plan("parking-area", parkingSite),
    );
    const { parking } = untilParkingStarts(game);

    expect(parking.length).toBeGreaterThanOrEqual(2);
    expect(parking.filter((order) => order.inBay)).toHaveLength(1);
    expect(
      parking
        .filter((order) => !order.inBay)
        .map((order) => order.structureTypeId),
    ).not.toContain("parking-area");
  });

  it("takes nothing more into its bay once something is parked in it", () => {
    const game = buildAll(
      scenario()
        .plan("solar-array", arraySite)
        .plan("battery-bank", bankSite)
        .plan("parking-area", parkingSite),
    );
    untilParkingStarts(game);
    for (let minutes = 0; game.state.parking.length > 0; minutes++) {
      if (minutes > 24 * 60) throw new Error("The parking was never done.");
      game.advance({ minutes: 1 });
    }
    const area = game.state.structures.find(
      (structure) => structure.structureTypeId === "parking-area",
    );
    const bay = catalogue.structureTypes.find((type) => type.parking)?.parking
      ?.bayOffsets[0];
    const inBay = [...game.state.machines, ...game.state.rovers].filter(
      (driven) =>
        driven.position.x === (area?.position.x ?? 0) + (bay?.x ?? 0) &&
        driven.position.y === (area?.position.y ?? 0) + (bay?.y ?? 0),
    );

    expect(inBay).toHaveLength(1);
    expect(
      [...game.state.machines, ...game.state.rovers].map(
        (driven) => driven.pluggedIn,
      ),
    ).not.toContain(false);
  });
});
