import { describe, expect, it, vi } from "vitest";
import type { Catalogue } from "../src/catalogue";
import type { GroundPosition, StructureSnapshot } from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

// Dust wears Structures down and coats solar arrays, and nothing else
// wears anything; both Dust Protection Designs are unlocked from the
// start, with their Components in the starting stock.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  const { withoutCold } = await import("./without-cold");
  const { withDesigns } = await import("./with-designs");
  return {
    ...actual,
    catalogue: withDesigns(
      withoutCold(withoutMicrometeorites(actual.catalogue)),
      ["dust-sealed-solar-arrays", "electrodynamic-dust-screens"],
    ),
  };
});

const sites: readonly GroundPosition[] = [
  { x: 20, y: 12 },
  { x: 32, y: 12 },
];

/** The given Structures, built side by side, with the game run on until all are commissioned. */
function sideBySide(types: readonly string[]): Scenario {
  const game = scenario();
  for (const [index, type] of types.entries()) {
    const site = sites[index];
    if (site === undefined) throw new Error("expected a site");
    game.plan(type, site);
  }
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 5 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
  return game;
}

function structure(game: Scenario, type: string): StructureSnapshot {
  const found = game.state.structures.find((s) => s.structureTypeId === type);
  if (found === undefined) throw new Error(`expected a ${type}`);
  return found;
}

/** How much a Structure's Condition and Dust coating change over a span of Daylight. */
function change(game: Scenario, types: readonly string[], hours: number) {
  const before = types.map((type) => structure(game, type));
  game.advance({ hours });
  expect(game.state.lunation.part).toBe("daylight");
  return types.map((type, index) => {
    const after = structure(game, type);
    return {
      conditionLost:
        (before[index]?.conditionPercent ?? Number.NaN) -
        after.conditionPercent,
      coatingGained:
        after.dustCoatingPercent -
        (before[index]?.dustCoatingPercent ?? Number.NaN),
      powered: after.powered,
      performance: after.performance,
    };
  });
}

describe("a dust-sealed solar array", () => {
  it("loses Condition to Dust at 0.02 percentage points an hour, against a solar array's 0.05 beside it, and gathers Dust coating as fast", () => {
    const types = ["solar-array", "dust-sealed-solar-array"];
    const game = sideBySide(types);

    const [plain, sealed] = change(game, types, 24);

    expect(plain?.conditionLost).toBeCloseTo(24 * 0.05);
    expect(sealed?.conditionLost).toBeCloseTo(24 * 0.02);
    expect(sealed?.coatingGained).toBeCloseTo(plain?.coatingGained ?? 0);
    // It works just as a solar array does.
    expect(sealed).toMatchObject({ powered: true, performance: 1 });
  });
});

describe("a dust-screened solar array", () => {
  it("gathers Dust coating at a quarter of a solar array's rate beside it, and loses Condition as slowly as a dust-sealed one", () => {
    const types = ["solar-array", "dust-screened-solar-array"];
    const game = sideBySide(types);

    const [plain, screened] = change(game, types, 24);

    expect(plain?.coatingGained).toBeCloseTo(24 * 0.1);
    expect(screened?.coatingGained).toBeCloseTo(24 * 0.1 * 0.25);
    expect(screened?.conditionLost).toBeCloseTo(24 * 0.02);
    expect(screened).toMatchObject({ powered: true, performance: 1 });
  });
});
