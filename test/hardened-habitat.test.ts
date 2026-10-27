import { describe, expect, it, vi } from "vitest";
import type { Catalogue } from "../src/catalogue";
import type {
  GameEvent,
  GroundPosition,
  StructureSnapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

// The Mission Director can live in a Habitat through a round trip of the
// Lander, and only Plume Ejecta wears anything down. The Hardened Habitat
// is unlocked from the start, with its Components in the starting stock
// beside the inflatable Habitat's.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { safeHabitat } = await import("./safe-habitat");
  const { withoutDust } = await import("./without-dust");
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  const { withDesigns } = await import("./with-designs");
  return {
    ...actual,
    catalogue: withDesigns(
      safeHabitat(withoutMicrometeorites(withoutDust(actual.catalogue)), [
        "power",
        "radiation",
        "life-support",
        "solar-particle-events",
      ]),
      ["hardened-habitat"],
    ),
  };
});

/** Within the Plume Ejecta's reach of the Lander, and well beyond it. */
const nearSites: readonly GroundPosition[] = [
  { x: 14, y: 8 },
  { x: -6, y: 18 },
];
const farSite: GroundPosition = { x: 60, y: 0 };

/** Runs the game until every planned Construction is commissioned. */
function buildAll(game: Scenario): Scenario {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
  return game;
}

function structure(game: Scenario, type: string): StructureSnapshot {
  const found = game.state.structures.find((s) => s.structureTypeId === type);
  if (found === undefined) throw new Error(`expected a ${type}`);
  return found;
}

function moveIn(game: Scenario, type: string): void {
  const result = game.campaign.moveMissionDirectorIn(structure(game, type).id);
  if (!result.ok) throw new Error(result.message);
}

/** Skips from event to event until the event comes. */
function skipUntil(game: Scenario, kind: GameEvent["kind"]): void {
  for (let skips = 0; ; skips++) {
    if (skips > 100) throw new Error(`No ${kind} event came.`);
    if (game.campaign.advanceToNextEvent().some((e) => e.kind === kind)) {
      return;
    }
  }
}

describe("a hardened Habitat", () => {
  it("loses a quarter as much Condition to Plume Ejecta as an inflatable Habitat beside it, at each take-off and landing", () => {
    const game = scenario()
      .plan("habitat", nearSites[0] ?? farSite)
      .plan("hardened-habitat", nearSites[1] ?? farSite);
    buildAll(game);
    moveIn(game, "habitat");
    const sent = game.campaign.sendLander();
    if (!sent.ok) throw new Error(sent.message);

    skipUntil(game, "lander-took-off");
    const afterTakeOff = [
      structure(game, "habitat").conditionPercent,
      structure(game, "hardened-habitat").conditionPercent,
    ];
    skipUntil(game, "lander-landed");

    expect(afterTakeOff).toEqual([80, 95]);
    expect(structure(game, "habitat").conditionPercent).toBe(60);
    expect(structure(game, "hardened-habitat").conditionPercent).toBe(90);
  });

  it("is a Habitat: the Mission Director can move into it, and Regolith shielding printed over it shields it", () => {
    const game = buildAll(scenario().plan("hardened-habitat", farSite));
    moveIn(game, "hardened-habitat");

    expect(game.state.missionDirector).toMatchObject({
      residence: "habitat",
      habitatId: structure(game, "hardened-habitat").id,
    });
    buildAll(game.plan("regolith-shielding", farSite));
    expect(structure(game, "hardened-habitat").shielded).toBe(true);
  });
});
