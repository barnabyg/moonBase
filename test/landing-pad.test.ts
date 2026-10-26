import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type GameEvent,
  type GroundPosition,
  type ManifestLine,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

// The Mission Director has to live in the Habitat through several round
// trips, and the Funding has to pay for more than one Launch.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { safeHabitat } = await import("./safe-habitat");
  const { withoutDust } = await import("./without-dust");
  return {
    ...actual,
    catalogue: {
      ...safeHabitat(withoutDust(actual.catalogue), [
        "power",
        "radiation",
        "life-support",
        "solar-particle-events",
      ]),
      programmeGrantMillionDollars: 2000,
    },
  };
});

const landingSite = catalogue.landingSite.landerPosition;
const padSite: GroundPosition = { x: 40, y: 25 };
const habitatSite: GroundPosition = { x: 60, y: -10 };
/** Within the Plume Ejecta's reach of the landing site. */
const nearLandingSite: GroundPosition = { x: 10, y: 10 };

const padType = catalogue.structureTypes.find((type) => type.landingPad);
if (padType === undefined) throw new Error("expected a landing pad");
const padComponents: ManifestLine[] = padType.components.map((need) => ({
  itemId: need.componentId,
  count: need.count,
}));

/** Runs the game until the Robot has carried out every planned Construction. */
function buildAll(game: Scenario): Scenario {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
  return game;
}

function setManifest(game: Scenario, manifest: readonly ManifestLine[]): void {
  const result = game.campaign.setLaunchManifest(manifest);
  if (!result.ok) throw new Error(result.message);
}

function send(game: Scenario): void {
  const result = game.campaign.sendLander();
  if (!result.ok) throw new Error(result.message);
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

function structure(state: Snapshot, type: string): StructureSnapshot {
  const found = state.structures.find((s) => s.structureTypeId === type);
  if (found === undefined) throw new Error(`expected a ${type}`);
  return found;
}

function inStock(state: Snapshot, componentId: string): number {
  return (
    state.stockpile.components.find(
      (stock) => stock.componentId === componentId,
    )?.count ?? 0
  );
}

/**
 * The Mission Director in a Habitat, the Lander back at the landing site
 * from bringing a landing pad's Components, the pad commissioned, and a
 * light mast standing near the landing site.
 */
function withPad(): { game: Scenario; padId: string } {
  const game = buildAll(
    scenario().plan("habitat", habitatSite).plan("light-mast", nearLandingSite),
  );
  const movedIn = game.campaign.moveMissionDirectorIn(
    structure(game.state, "habitat").id,
  );
  if (!movedIn.ok) throw new Error(movedIn.message);
  setManifest(game, padComponents);
  send(game);
  skipUntil(game, "lander-landed");
  buildAll(game.plan(padType?.id ?? "", padSite));
  return { game, padId: structure(game.state, "landing-pad").id };
}

describe("the landing pad", () => {
  it("is built from Components that aren't in the starting stock", () => {
    const game = scenario().plan("landing-pad", padSite);

    game.advance({ hours: 12 });

    expect(game.state.constructions[0]?.waiting).toMatchObject({
      reason: "missing-components",
    });
  });

  it("has the Lander land on it from the next landing on, where take-offs and landings do no Plume Ejecta damage", () => {
    const { game, padId } = withPad();
    expect(game.state.lander.position).toEqual(landingSite);
    // Its next take-off is still from the landing site.
    expect(game.state.plumeEjecta).toMatchObject({ position: landingSite });
    const mast = () => structure(game.state, "light-mast").conditionPercent;
    const worn = mast() - catalogue.plumeEjecta.conditionLossPercent;

    send(game);
    skipUntil(game, "lander-took-off");
    expect(mast()).toBe(worn);
    expect(game.state.lander).toMatchObject({
      position: padSite,
      landingPadId: padId,
    });
    expect(game.state.plumeEjecta).toBeUndefined();

    const landing = skipUntil(game, "lander-landed");
    expect(landing.map((event) => event.kind)).not.toContain(
      "plume-ejecta-damage",
    );
    expect(game.state.lander).toMatchObject({
      state: "landed-free",
      position: padSite,
      landingPadId: padId,
    });

    send(game);
    const takeOff = skipUntil(game, "lander-took-off");
    expect(takeOff.map((event) => event.kind)).not.toContain(
      "plume-ejecta-damage",
    );
    expect(mast()).toBe(worn);
    expect(structure(game.state, "landing-pad").conditionPercent).toBe(100);
  });

  it("has the Robot carry the cargo from the Lander to the stockpile, where it joins the base's stock, while oxygen and water join the life support stocks on landing", () => {
    const { game } = withPad();
    const cargo: ManifestLine[] = [
      { itemId: "solar-panel", count: 2 },
      { itemId: "array-mast", count: 1 },
      { itemId: "oxygen", count: 1 },
    ];
    setManifest(game, cargo);
    send(game);
    // The starting stock's solar array Components are all used, so a second one waits.
    buildAll(game.plan("solar-array", { x: 20, y: -30 }));
    game.plan("solar-array", { x: -25, y: 25 });
    skipUntil(game, "lander-left-earth");
    const before = game.state;

    skipUntil(game, "lander-landed");

    const oxygen = (state: Snapshot) =>
      state.lifeSupport.find((stock) => stock.stockId === "oxygen")
        ?.kilograms ?? 0;
    expect(oxygen(game.state)).toBeGreaterThan(oxygen(before));
    expect(inStock(game.state, "solar-panel")).toBe(
      inStock(before, "solar-panel"),
    );
    expect(game.state.lander.cargo).toEqual([
      { componentId: "solar-panel", count: 2 },
      { componentId: "array-mast", count: 1 },
    ]);
    expect(game.state.unloading).toMatchObject({ collected: false });
    expect(game.state.constructions[0]?.waiting).toMatchObject({
      reason: "missing-components",
    });
    expect(game.campaign.sendLander()).toEqual({
      ok: false,
      reason: "cargo-aboard",
      message:
        "The Lander's cargo hasn't been unloaded yet. The Robot has to carry it to the stockpile first.",
    });

    const unloaded = skipUntil(game, "lander-unloaded");

    expect(unloaded).toContainEqual({
      kind: "lander-unloaded",
      atMinute: game.state.clock.elapsedMinutes,
      components: [
        { componentId: "solar-panel", count: 2 },
        { componentId: "array-mast", count: 1 },
      ],
    });
    expect(game.state.lander.cargo).toEqual([]);
    expect(game.state.unloading).toBeUndefined();
    expect(game.state.robots[0]?.carrying).toEqual([]);
    buildAll(game);
    expect(
      game.state.structures.filter((s) => s.structureTypeId === "solar-array"),
    ).toHaveLength(2);
    expect(game.campaign.sendLander()).toEqual({ ok: true });
  });

  it("has unloading take its turn among the other Work Orders in plan order", () => {
    const { game, padId } = withPad();
    setManifest(game, [{ itemId: "mast-pole", count: 2 }]);
    send(game);
    skipUntil(game, "lander-left-earth");
    game.advance({
      minutes:
        (game.state.lander.legEndsAtMinute ?? 0) -
        game.state.clock.elapsedMinutes -
        30,
    });
    // Planned before the landing, so the Robot is busy with it when the Lander lands.
    game.plan("light-mast", { x: -20, y: -25 });
    skipUntil(game, "lander-landed");
    // Planned after the landing, so it comes after the unloading.
    game.plan("light-mast", { x: -30, y: -25 });
    const [earlier, later] = game.state.constructions.map((c) => c.id);
    const workingOn = () => {
      const activity = game.state.robots[0]?.activity;
      return activity !== undefined && "structureId" in activity
        ? activity.structureId
        : undefined;
    };
    expect(workingOn()).toBe(earlier);

    const minutes: (string | undefined)[] = [];
    let unloadedAt: number | undefined;
    for (let minute = 0; game.state.constructions.length > 0; minute++) {
      if (minute > 3 * 24 * 60)
        throw new Error("The light masts were never built.");
      const events = game.campaign.advance(1);
      if (events.some((event) => event.kind === "lander-unloaded")) {
        unloadedAt = minute;
      }
      minutes.push(workingOn());
    }

    // It finishes the Work Order it has claimed for the earlier plan, then
    // unloads, and only then starts on the later plan.
    const firstOtherWork = minutes.findIndex((id) => id !== earlier);
    expect(minutes[firstOtherWork]).toBe(padId);
    expect(unloadedAt).toBeDefined();
    expect(minutes.indexOf(later)).toBeGreaterThan(unloadedAt ?? Infinity);
  });

  it("is kept clear of Structures while the Lander stands on it, as the landing site is", () => {
    const { game } = withPad();
    send(game);
    skipUntil(game, "lander-landed");

    for (const position of [padSite, landingSite]) {
      expect(
        game.campaign.checkPlacement({
          structureTypeId: "light-mast",
          position,
        }),
      ).toMatchObject({ ok: false, reason: "overlaps-lander" });
    }
  });

  it("can't be dismantled while the Lander stands on it; once it is gone, the Lander lands at the landing site again, with Plume Ejecta", () => {
    const { game, padId } = withPad();
    send(game);
    skipUntil(game, "lander-landed");

    expect(game.campaign.dismantleStructure(padId)).toEqual({
      ok: false,
      message:
        "The Lander stands on it. Send the Lander before dismantling it.",
    });

    send(game);
    skipUntil(game, "lander-took-off");
    expect(game.campaign.dismantleStructure(padId)).toEqual({ ok: true });
    expect(game.state.lander.position).toEqual(landingSite);
    expect(game.state.plumeEjecta).toMatchObject({ position: landingSite });
    const landing = skipUntil(game, "lander-landed");

    expect(game.state.lander).toMatchObject({
      position: landingSite,
      landingPadId: undefined,
    });
    expect(landing.map((event) => event.kind)).toContain("plume-ejecta-damage");
  });

  it("carries on unloading exactly as it would have after saving and loading", () => {
    const { game } = withPad();
    setManifest(game, [{ itemId: "battery-module", count: 3 }]);
    send(game);
    skipUntil(game, "lander-landed");
    game.advance({ minutes: 20 });

    const loaded = loadCampaign(game.campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.campaign.snapshot()).toEqual(game.state);

    expect(loaded.campaign.advance(24 * 60)).toEqual(
      game.campaign.advance(24 * 60),
    );
    expect(loaded.campaign.snapshot()).toEqual(game.state);
    expect(inStock(game.state, "battery-module")).toBeGreaterThanOrEqual(3);
  });
});
