import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import type {
  ComponentCount,
  GroundPosition,
  Snapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

const solarArray = catalogue.structureTypes.find(
  (type) => type.id === "solar-array",
);
if (solarArray === undefined) throw new Error("expected a solar array");
const site: GroundPosition = { x: 20, y: 12 };

/** Runs the game a game-minute at a time until the condition holds, returning every state. */
function runUntil(
  game: Scenario,
  done: (state: Snapshot) => boolean,
): Snapshot[] {
  const states: Snapshot[] = [];
  for (let minute = 0; minute < 5 * 24 * 60; minute++) {
    if (done(game.state)) return states;
    states.push(game.advance({ minutes: 1 }).state);
  }
  throw new Error("It never happened.");
}

function total(counts: readonly ComponentCount[]): number {
  return counts.reduce((sum, { count }) => sum + count, 0);
}

/** A commissioned solar array. */
function builtArray(): { game: Scenario; id: string } {
  const game = scenario().plan("solar-array", site);
  const id = game.state.constructions[0]?.id ?? "";
  runUntil(game, (state) => state.constructions.length === 0);
  return { game, id };
}

describe("dismantling a Structure", () => {
  it("has the Robot take it apart live, then carry most of its Components back into stock", () => {
    const { game, id } = builtArray();
    const stockBefore = game.state.cargo;

    expect(game.campaign.dismantleStructure(id)).toEqual({ ok: true });
    const states = runUntil(game, (state) => state.dismantlings.length === 0);

    const robotKinds = states
      .map((state) => state.robots[0]?.activity.kind)
      .filter((kind, index, all) => kind !== all[index - 1]);
    // It is still at the site from commissioning the solar array.
    expect(robotKinds).toEqual([
      "dismantling",
      "walking",
      "returning-components",
    ]);
    expect(
      states.filter(
        (state) => state.robots[0]?.activity.kind === "dismantling",
      ),
    ).toHaveLength(solarArray.stageHours.assembly * 60);
    expect(game.state.structures).toEqual([]);
    const recovered = game.state.cargo.map(
      (stock, index) => stock.count - (stockBefore[index]?.count ?? 0),
    );
    const recoveredTotal = recovered.reduce((sum, count) => sum + count, 0);
    const builtFrom = total(solarArray.components);
    expect(recoveredTotal).toBe(
      builtFrom - Math.round(builtFrom * catalogue.dismantlingLossShare),
    );
    expect(recoveredTotal).toBeGreaterThan(builtFrom / 2);
    for (const [index, stock] of game.state.cargo.entries()) {
      const used =
        solarArray.components.find(
          (need) => need.componentId === stock.componentId,
        )?.count ?? 0;
      expect(recovered[index]).toBeGreaterThanOrEqual(0);
      expect(recovered[index]).toBeLessThanOrEqual(used);
    }
  });

  it("takes it off its power network, with its cables, once the Robot starts taking it apart", () => {
    const game = scenario()
      .plan("solar-array", site)
      .plan("battery-bank", { x: 30, y: 25 });
    const [solarId, batteryId] = game.state.constructions.map((c) => c.id);
    runUntil(game, (state) => state.constructions.length === 0);
    expect(game.state.cables).toHaveLength(1);

    game.campaign.dismantleStructure(solarId ?? "");
    expect(game.state.structures.map((structure) => structure.id)).toEqual([
      solarId,
      batteryId,
    ]);
    runUntil(game, (state) => state.robots[0]?.activity.kind === "dismantling");

    expect(game.state.structures.map((structure) => structure.id)).toEqual([
      batteryId,
    ]);
    expect(game.state.cables).toEqual([]);
    expect(game.state.power.networks).toEqual([
      expect.objectContaining({ structureIds: [batteryId] }),
    ]);
    expect(game.state.dismantlings).toEqual([
      expect.objectContaining({ id: solarId, stage: "taking-apart" }),
    ]);
  });

  it("keeps its ground taken until its Components are back in stock", () => {
    const { game, id } = builtArray();
    game.campaign.dismantleStructure(id);
    const placeOverIt = () =>
      game.campaign.checkPlacement({
        structureTypeId: "light-mast",
        position: site,
      });

    runUntil(game, (state) => state.dismantlings[0]?.collected === true);
    expect(game.state.structures).toEqual([]);
    expect(placeOverIt()).toMatchObject({
      ok: false,
      reason: "overlaps-structure",
    });

    runUntil(game, (state) => state.dismantlings.length === 0);
    expect(placeOverIt()).toEqual({ ok: true });
  });

  it.each([
    ["before", "dismantling"],
    ["after", "walking"],
  ] as const)(
    "is worked on in plan order: planned %s a Construction, the Robot starts with %s",
    (when, firstActivity) => {
      const { game, id } = builtArray();
      const later = { x: -20, y: -15 };
      if (when === "before") {
        game.campaign.dismantleStructure(id);
        game.plan("light-mast", later);
      } else {
        game.plan("light-mast", later);
        game.campaign.dismantleStructure(id);
      }

      game.advance({ minutes: 1 });

      expect(game.state.robots[0]?.activity.kind).toBe(firstActivity);
    },
  );

  it("isn't used to power a new Construction once its dismantling is planned", () => {
    const { game, id } = builtArray();
    game.plan("battery-bank", { x: 30, y: 25 });
    game.campaign.dismantleStructure(id);

    const states = runUntil(
      game,
      (state) =>
        state.constructions.length === 0 && state.dismantlings.length === 0,
    );

    for (const state of states) {
      expect(state.cables).toEqual([]);
    }
    expect(game.state.structures.map((s) => s.structureTypeId)).toEqual([
      "battery-bank",
    ]);
  });

  it("counts the Structure being dismantled as an event to skip to", () => {
    const { game, id } = builtArray();
    game.campaign.dismantleStructure(id);

    const events = game.campaign.advanceToNextEvent();

    expect(events).toEqual([
      {
        kind: "structure-dismantled",
        atMinute: game.state.clock.elapsedMinutes,
        structureId: id,
        structureTypeId: "solar-array",
      },
    ]);
    expect(game.state.dismantlings).toEqual([]);
  });

  it("is refused for a Structure that doesn't exist or is already being dismantled", () => {
    const { game, id } = builtArray();

    expect(game.campaign.dismantleStructure(id)).toEqual({ ok: true });
    expect(game.campaign.dismantleStructure(id)).toMatchObject({ ok: false });
    expect(game.campaign.dismantleStructure("no-such-structure")).toMatchObject(
      { ok: false },
    );
    expect(game.state.dismantlings).toHaveLength(1);
  });
});
