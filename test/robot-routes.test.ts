import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import type { GroundPosition, Snapshot } from "../src/simulation";
import { distance, footprintRadius } from "../src/simulation/construction";
import { machineFootprintRadius } from "../src/simulation/machines";
import { scenario, type Scenario } from "./scenario";

// Nobody digs Regolith, so that the Robot and the excavator do nothing but
// what a test gives them, and landing pads can be built from the start.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withDesigns } = await import("./with-designs");
  const { withoutDigging } = await import("./without-digging");
  return {
    ...actual,
    catalogue: withDesigns(withoutDigging(actual.catalogue), ["landing-pads"]),
  };
});

/**
 * Between the stockpile and the far site below, on the line the Robot
 * would walk straight along to carry Components there, and the excavator
 * drive along to prepare it.
 */
const inTheWay: GroundPosition = { x: 20, y: -9.5 };
const farSite: GroundPosition = { x: 34, y: -10 };

/** Runs the game a game-minute at a time until no Construction is left, returning every state. */
function runUntilBuilt(game: Scenario): Snapshot[] {
  const states: Snapshot[] = [];
  for (let minute = 0; minute < 10 * 24 * 60; minute++) {
    game.advance({ minutes: 1 });
    states.push(game.state);
    if (game.state.constructions.length === 0) return states;
  }
  throw new Error("The Constructions never finished.");
}

/**
 * Checks that no Robot stood, and no Machine stood with any part of it,
 * inside a footprint, in any of the states. A Robot laying cable to or from
 * a Structure stands right on the edge of its footprint, which rounding can
 * leave a hair inside.
 */
function expectAllKeptOut(
  states: readonly Snapshot[],
  footprint: { readonly centre: GroundPosition; readonly radius: number },
): void {
  for (const state of states) {
    for (const robot of state.robots) {
      expect(distance(robot.position, footprint.centre)).toBeGreaterThanOrEqual(
        footprint.radius - 1e-9,
      );
    }
    for (const machine of state.machines) {
      expect(
        distance(machine.position, footprint.centre),
      ).toBeGreaterThanOrEqual(
        footprint.radius + machineFootprintRadius(machine.machineTypeId) - 1e-9,
      );
    }
  }
}

describe("Robots on their way across the base", () => {
  it.each([
    "habitat",
    "solar-array",
    "battery-bank",
    "light-mast",
    "landing-pad",
  ])(
    "go round a %s in the way, and so does the excavator they drive",
    (structureTypeId) => {
      const game = scenario().plan(structureTypeId, inTheWay);
      runUntilBuilt(game);

      const states = runUntilBuilt(game.plan("battery-bank", farSite));

      expectAllKeptOut(states, {
        centre: inTheWay,
        radius: footprintRadius(structureTypeId),
      });
      for (const state of states) {
        for (const robot of state.robots) {
          expect(
            distance(robot.position, state.lander.position),
          ).toBeGreaterThan(catalogue.lander.footprintRadiusMetres);
        }
      }
    },
  );

  it("go round a site planned for a Structure, before it is built", () => {
    // The far site comes first in the plans, so the Robot works on it while
    // the Habitat's site stands planned in the way.
    const game = scenario()
      .plan("battery-bank", farSite)
      .plan("habitat", inTheWay);

    const states = runUntilBuilt(game);

    const planned = states.filter((state) =>
      state.constructions.some(
        (construction) => construction.structureTypeId === "habitat",
      ),
    );
    expectAllKeptOut(planned, {
      centre: inTheWay,
      radius: footprintRadius("habitat"),
    });
  });

  it("lay cable round a Structure in the way, along the way they walk", () => {
    const source: GroundPosition = { x: 20, y: 12 };
    const pad: GroundPosition = { x: 32, y: 12 };
    const game = scenario()
      .plan("solar-array", source)
      .plan("landing-pad", pad);
    runUntilBuilt(game);

    runUntilBuilt(game.plan("battery-bank", { x: 44, y: 12 }));

    const [cable] = game.state.cables;
    if (cable === undefined) throw new Error("expected a cable");
    expect(cable.complete).toBe(true);
    const padRadius = footprintRadius("landing-pad");
    for (const [index, end] of cable.route.slice(1).entries()) {
      const start = cable.route[index] ?? end;
      // The nearest the stretch of cable comes to the pad's centre.
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const along = Math.min(
        1,
        Math.max(
          0,
          ((pad.x - start.x) * dx + (pad.y - start.y) * dy) /
            (dx * dx + dy * dy),
        ),
      );
      expect(
        distance({ x: start.x + along * dx, y: start.y + along * dy }, pad),
      ).toBeGreaterThanOrEqual(padRadius);
    }
  });
});
