import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import type {
  GameEvent,
  GroundPosition,
  PowerNetworkSnapshot,
  Snapshot,
  StructureSnapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

// Landing pad lights are unlocked from the start, with a lit landing pad's
// kit in the starting stock. The Habitat needs no power and keeps the
// Mission Director safe, and nothing wears down by Dust or the cold, so
// that the pad's lights draw just what the data catalogue sets.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withDesigns } = await import("./with-designs");
  const { safeHabitat } = await import("./safe-habitat");
  const { withoutDust } = await import("./without-dust");
  const { withoutCold } = await import("./without-cold");
  return {
    ...actual,
    catalogue: withDesigns(
      safeHabitat(withoutCold(withoutDust(actual.catalogue)), [
        "power",
        "radiation",
        "life-support",
        "solar-particle-events",
      ]),
      ["landing-pad-lights"],
    ),
  };
});

const padType = catalogue.structureTypes.find(
  (type) => type.id === "lit-landing-pad",
);
if (padType === undefined) throw new Error("expected a lit landing pad");
const arraySite: GroundPosition = { x: 30, y: 8 };
const batterySite: GroundPosition = { x: 36, y: 14 };
const padSite: GroundPosition = { x: 45, y: 28 };
const habitatSite: GroundPosition = { x: 60, y: -10 };

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

/** Skips from event to event until the event comes, returning every event on the way. */
function skipUntil(game: Scenario, kind: GameEvent["kind"]): GameEvent[] {
  const events: GameEvent[] = [];
  for (let skips = 0; !events.some((event) => event.kind === kind); skips++) {
    if (skips > 200) throw new Error(`No ${kind} event came.`);
    events.push(...game.campaign.advanceToNextEvent());
  }
  return events;
}

/** Runs the game until the given part of the Lunation has just begun. */
function runUntil(game: Scenario, part: "daylight" | "night"): void {
  do {
    game.advance({ minutes: game.state.lunation.minutesRemaining });
  } while (game.state.lunation.part !== part);
}

/**
 * A solar array, a battery bank and a lit landing pad cabled to them, and
 * the Mission Director in a Habitat, all built in the first Daylight.
 */
function litBase(): Scenario {
  const game = scenario()
    .plan("habitat", habitatSite)
    .plan("solar-array", arraySite)
    .plan("battery-bank", batterySite)
    .plan("lit-landing-pad", padSite);
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 5 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
  const movedIn = game.campaign.moveMissionDirectorIn(
    structureOf(game.state, "habitat").id,
  );
  if (!movedIn.ok) throw new Error(movedIn.message);
  return game;
}

describe("a lit landing pad", () => {
  it("switches its lights on at Night, lighting as far round it as the data catalogue says and drawing their power, and off in Daylight", () => {
    const game = litBase();
    game.advance({ minutes: 1 });
    expect(structureOf(game.state, padType.id)).toMatchObject({
      lit: false,
    });

    runUntil(game, "night");
    game.advance({ hours: 1 });

    const pad = structureOf(game.state, padType.id);
    expect(pad).toMatchObject({
      lit: true,
      powered: true,
      lightRadiusMetres: padType.lightRadiusMetres,
    });
    const draw = (typeId: string) =>
      catalogue.structureTypes.find((type) => type.id === typeId)?.power
        .drawKilowatts ?? Number.NaN;
    expect(networkOf(game.state, pad.id).consumptionKilowatts).toBeCloseTo(
      draw("solar-array") +
        draw("battery-bank") +
        padType.power.nightDrawKilowatts,
    );

    runUntil(game, "daylight");
    game.advance({ minutes: 1 });
    expect(structureOf(game.state, padType.id).lit).toBe(false);
  });

  it("has the Lander land on it, and take off from it, with no Plume Ejecta, as a landing pad does", () => {
    const game = litBase();
    const padId = structureOf(game.state, padType.id).id;
    const sent = game.campaign.sendLander();
    if (!sent.ok) throw new Error(sent.message);
    // Its first take-off is from the landing site.
    skipUntil(game, "lander-took-off");

    const landing = skipUntil(game, "lander-landed");

    expect(landing.map((event) => event.kind)).not.toContain(
      "plume-ejecta-damage",
    );
    expect(game.state.lander).toMatchObject({
      state: "landed-free",
      position: padSite,
      landingPadId: padId,
    });
    const again = game.campaign.sendLander();
    if (!again.ok) throw new Error(again.message);
    const takeOff = skipUntil(game, "lander-took-off");
    expect(takeOff.map((event) => event.kind)).not.toContain(
      "plume-ejecta-damage",
    );
  });
});
