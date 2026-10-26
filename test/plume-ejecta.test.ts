import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

// The Mission Director has to live in the Habitat for whole round trips.
// Each take-off and landing takes half a Structure's Condition, so that one
// round trip breaks what stands near the Lander.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { safeHabitat } = await import("./safe-habitat");
  const safe = safeHabitat(actual.catalogue, [
    "power",
    "radiation",
    "solar-particle-events",
  ]);
  return {
    ...actual,
    catalogue: {
      ...safe,
      plumeEjecta: { ...safe.plumeEjecta, conditionLossPercent: 50 },
    },
  };
});

const { radiusMetres } = catalogue.plumeEjecta;
const lander = catalogue.landingSite.landerPosition;
/** Well inside the Plume Ejecta's radius, and well outside it. */
const near = (dx: number, dy: number): GroundPosition => ({
  x: lander.x + dx,
  y: lander.y + dy,
});
const far: GroundPosition = { x: lander.x + radiusMetres + 30, y: lander.y };
const habitatSite = far;

/** Runs the game until the Robot has carried out every planned Construction. */
function buildAll(game: Scenario): Scenario {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
  return game;
}

/** A Habitat with the Mission Director in it, and the given Structures built too. */
function base(plans: readonly [string, GroundPosition][]): Scenario {
  const game = scenario();
  for (const [type, position] of plans) game.plan(type, position);
  buildAll(game);
  const habitat = game.state.structures.find(
    (structure) => structure.structureTypeId === "habitat",
  );
  const movedIn = game.campaign.moveMissionDirectorIn(habitat?.id ?? "");
  if (!movedIn.ok) throw new Error(movedIn.message);
  return game;
}

function send(game: Scenario): void {
  const result = game.campaign.sendLander();
  if (!result.ok) throw new Error(result.message);
}

/** Skips from event to event until the event comes, returning every event on the way. */
function skipUntil(game: Scenario, kind: GameEvent["kind"]): GameEvent[] {
  const events: GameEvent[] = [];
  for (let skips = 0; !events.some((event) => event.kind === kind); skips++) {
    if (skips > 100) throw new Error(`No ${kind} event came.`);
    events.push(...game.campaign.advanceToNextEvent());
  }
  return events;
}

function structure(state: Snapshot, type: string): StructureSnapshot {
  const found = state.structures.find((s) => s.structureTypeId === type);
  if (found === undefined) throw new Error(`expected a ${type}`);
  return found;
}

describe("Condition", () => {
  it("starts at 100% for every commissioned Structure", () => {
    const { state } = base([
      ["habitat", habitatSite],
      ["solar-array", near(12, 8)],
    ]);

    expect(state.structures.map((s) => s.conditionPercent)).toEqual([100, 100]);
  });
});

describe("Plume Ejecta", () => {
  it("wears down every Structure within its radius as the Lander takes off, and leaves those outside it unharmed", () => {
    const game = base([
      ["habitat", habitatSite],
      ["light-mast", near(10, 10)],
    ]);
    const mast = structure(game.state, "light-mast");
    send(game);

    const events = skipUntil(game, "lander-took-off");

    const loss = catalogue.plumeEjecta.conditionLossPercent;
    expect(structure(game.state, "light-mast").conditionPercent).toBe(
      100 - loss,
    );
    expect(structure(game.state, "habitat").conditionPercent).toBe(100);
    expect(events).toContainEqual({
      kind: "plume-ejecta-damage",
      atMinute: game.state.clock.elapsedMinutes,
      damaged: [
        {
          structureId: mast.id,
          structureTypeId: "light-mast",
          conditionPercent: 100 - loss,
        },
      ],
    });
  });

  it("wears them down again as the Lander lands, until they are Broken", () => {
    const game = base([
      ["habitat", habitatSite],
      ["light-mast", near(10, 10)],
    ]);
    const mast = structure(game.state, "light-mast");
    send(game);

    const events = skipUntil(game, "lander-landed");

    expect(structure(game.state, "light-mast").conditionPercent).toBe(0);
    expect(events).toContainEqual({
      kind: "structure-broken",
      atMinute: game.state.clock.elapsedMinutes,
      structureId: mast.id,
      structureTypeId: "light-mast",
    });
    // A Broken Structure stays on the map, worn down no further.
    send(game);
    skipUntil(game, "lander-took-off");
    expect(structure(game.state, "light-mast").conditionPercent).toBe(0);
  });

  it("does no damage when nothing stands within its radius", () => {
    const game = base([["habitat", habitatSite]]);
    send(game);

    const events = skipUntil(game, "lander-landed");

    expect(events.map((event) => event.kind)).not.toContain(
      "plume-ejecta-damage",
    );
  });

  it("is reported with its radius around the Lander, for placing Structures clear of it", () => {
    expect(scenario().state.plumeEjecta).toEqual({
      position: lander,
      radiusMetres,
    });
  });
});

describe("a Broken Structure", () => {
  it("stops working: a solar array generates nothing, a battery bank neither stores nor supplies power, and a light mast gives no light", () => {
    const game = base([
      ["habitat", habitatSite],
      ["solar-array", near(14, 8)],
      ["battery-bank", near(-6, 14)],
      ["light-mast", near(14, -6)],
    ]);
    const bankId = structure(game.state, "battery-bank").id;
    const network = () =>
      game.state.power.networks.find((candidate) =>
        candidate.structureIds.includes(bankId),
      );
    send(game);
    // Night has fallen by the time the Lander is back.
    skipUntil(game, "lander-left-earth");
    expect(game.state.lunation.part).toBe("night");
    expect(structure(game.state, "light-mast").lit).toBe(true);
    expect(network()?.storageCapacityKilowattHours).toBeGreaterThan(0);

    skipUntil(game, "lander-landed");
    game.advance({ minutes: 1 });

    expect(game.state.structures.map((s) => s.conditionPercent)).toEqual([
      100, 0, 0, 0,
    ]);
    expect(structure(game.state, "light-mast")).toMatchObject({
      lit: false,
      powered: false,
    });
    expect(structure(game.state, "battery-bank")).toMatchObject({
      storedKilowattHours: 0,
      powered: false,
    });
    expect(network()).toMatchObject({
      storageCapacityKilowattHours: 0,
      storedKilowattHours: 0,
    });
    const daylight = skipUntil(game, "daylight-started");
    expect(daylight.length).toBeGreaterThan(0);
    game.advance({ minutes: 1 });
    expect(network()?.generationKilowatts).toBe(0);
    expect(structure(game.state, "solar-array").powered).toBe(false);
  });

  it("stops protecting the Mission Director when it is their Habitat: it loses power, and they die", () => {
    const site = near(14, -18);
    const game = buildAll(scenario().plan("habitat", site));
    buildAll(game.plan("regolith-shielding", site));
    const movedIn = game.campaign.moveMissionDirectorIn(
      structure(game.state, "habitat").id,
    );
    if (!movedIn.ok) throw new Error(movedIn.message);
    expect(structure(game.state, "habitat").shielded).toBe(true);
    send(game);

    const events = skipUntil(game, "lander-landed");

    const habitat = structure(game.state, "habitat");
    expect(habitat).toMatchObject({
      conditionPercent: 0,
      powered: false,
      shielded: false,
    });
    expect(structure(game.state, "regolith-shielding").conditionPercent).toBe(
      0,
    );
    expect(events.at(-1)).toEqual({
      kind: "mission-director-died",
      atMinute: game.state.clock.elapsedMinutes,
      cause: { kind: "habitat-power-failed", habitatId: habitat.id },
    });
  });

  it("can be dismantled, and built again from the Components recovered", () => {
    const game = base([
      ["habitat", habitatSite],
      ["light-mast", near(10, 10)],
    ]);
    const mast = structure(game.state, "light-mast");
    send(game);
    skipUntil(game, "lander-landed");
    const poles = () =>
      game.state.stockpile.components.find((s) => s.componentId === "mast-pole")
        ?.count ?? 0;
    const before = poles();

    expect(game.campaign.dismantleStructure(mast.id)).toEqual({ ok: true });
    skipUntil(game, "structure-dismantled");
    expect(poles()).toBe(before + 1);
    buildAll(game.plan("light-mast", near(10, 10)));

    expect(structure(game.state, "light-mast").conditionPercent).toBe(100);
  });

  it("keeps its Condition through saving and loading", () => {
    const game = base([
      ["habitat", habitatSite],
      ["light-mast", near(10, 10)],
    ]);
    send(game);
    skipUntil(game, "lander-took-off");

    const loaded = loadCampaign(game.campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    expect(loaded.campaign.snapshot().structures).toEqual(
      game.state.structures,
    );
  });
});
