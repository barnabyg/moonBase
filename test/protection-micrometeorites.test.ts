import { describe, expect, it, vi } from "vitest";
import type { Catalogue } from "../src/catalogue";
import type { GameEvent, GroundPosition } from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

// A strike every 6 to 12 hours, each taking 20 percentage points off what
// it hits in full, and nothing else wearing anything down, so that every
// Condition change in these tests is a strike's. Whipple shielding and the
// Hardened Habitat are unlocked from the start, with their Components in
// the starting stock beside the inflatable Habitat's.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutDust } = await import("./without-dust");
  const { withoutCold } = await import("./without-cold");
  const { withDesigns } = await import("./with-designs");
  const base = withDesigns(withoutCold(withoutDust(actual.catalogue)), [
    "whipple-shielding",
    "hardened-habitat",
  ]);
  return {
    ...actual,
    catalogue: {
      ...base,
      micrometeorites: {
        earthDaysBetween: { min: 0.25, max: 0.5 },
        conditionLossPercent: { min: 20, max: 20 },
      },
    },
  };
});

type Strike = Extract<GameEvent, { kind: "micrometeorite-strike" }>;

/** The given Structures, with the game run on until all are commissioned. */
function built(plans: readonly [string, GroundPosition][]): Scenario {
  const game = scenario();
  for (const [type, site] of plans) game.plan(type, site);
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
  return game;
}

/**
 * Plans the given Structures, then runs the game on until each has been
 * built and struck, returning the Condition each type was left with by the
 * first strike to hit one of it.
 */
function firstStrikes(
  plans: readonly [string, GroundPosition][],
): Map<string, number> {
  const game = scenario();
  for (const [type, site] of plans) game.plan(type, site);
  const left = new Map<string, number>();
  for (let skips = 0; left.size < plans.length; skips++) {
    if (skips > 500) throw new Error("Not every Structure was struck.");
    for (const event of game.campaign.advanceToNextEvent()) {
      if (event.kind !== "micrometeorite-strike") continue;
      const { target } = event satisfies Strike;
      if (target.kind === "structure" && !left.has(target.structureTypeId)) {
        left.set(target.structureTypeId, event.conditionPercent);
      }
    }
  }
  return left;
}

describe("a Micrometeorite strike", () => {
  it("takes a quarter as much Condition off a Whipple-shielded battery bank as off a battery bank, and off a hardened Habitat as off an inflatable Habitat", () => {
    const left = firstStrikes([
      ["battery-bank", { x: 20, y: 12 }],
      ["whipple-shielded-battery-bank", { x: 30, y: 12 }],
      ["habitat", { x: 20, y: 30 }],
      ["hardened-habitat", { x: 35, y: 30 }],
    ]);

    expect(Object.fromEntries(left)).toEqual({
      "battery-bank": 80,
      "whipple-shielded-battery-bank": 95,
      habitat: 80,
      "hardened-habitat": 95,
    });
  });

  it("is forecast to use fewer spare Components when it may hit a Whipple-shielded battery bank than a battery bank", () => {
    const perEarthDay = (type: string) =>
      built([[type, { x: 20, y: 12 }]]).campaign.forecasts().spareComponents
        .perEarthDay;
    const plain = perEarthDay("battery-bank");
    const shielded = perEarthDay("whipple-shielded-battery-bank");

    // Of the five things a strike may hit, the bank, two Machines, the
    // Rover and the Robot, one takes a quarter of it rather than all.
    expect(shielded / plain).toBeCloseTo((0.25 + 4) / 5);
  });
});
