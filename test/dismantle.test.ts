import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import type {
  ComponentCount,
  GroundPosition,
  Snapshot,
} from "../src/simulation";
import { recoveredComponents } from "../src/simulation/dismantling";
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

/** The Components the base's stock has gained, leaving out those it hasn't. */
function gained(
  before: readonly ComponentCount[],
  after: readonly ComponentCount[],
): ComponentCount[] {
  return after
    .map(({ componentId, count }) => ({
      componentId,
      count:
        count -
        (before.find((stock) => stock.componentId === componentId)?.count ?? 0),
    }))
    .filter(({ count }) => count !== 0);
}

/** A commissioned solar array. */
function commissionedArray(): { game: Scenario; id: string } {
  const game = scenario().plan("solar-array", site);
  const id = game.state.constructions[0]?.id ?? "";
  runUntil(game, (state) => state.constructions.length === 0);
  return { game, id };
}

describe("what dismantling gives back", () => {
  it("is the spare Components the data catalogue gives, more for a larger Structure", () => {
    const spare = catalogue.maintenance.spareComponentId;
    expect(recoveredComponents("light-mast")).toEqual([
      { componentId: spare, count: 1 },
    ]);
    expect(recoveredComponents("crew-habitat")).toEqual([
      { componentId: spare, count: 6 },
    ]);
  });

  it("is nothing for a Structure made from Regolith alone", () => {
    expect(recoveredComponents("regolith-shielding")).toEqual([]);
    expect(recoveredComponents("sintered-landing-pad")).toEqual([]);
  });
});

describe("dismantling a Structure", () => {
  it("has the Robot take it apart live, then carry spare Components back into stock", () => {
    const { game, id } = commissionedArray();
    const stockBefore = game.state.stockpile.components;

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
    expect(gained(stockBefore, game.state.stockpile.components)).toEqual([
      {
        componentId: catalogue.maintenance.spareComponentId,
        count: solarArray.dismantlingSpareComponents,
      },
    ]);
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

  it("joins up what drew power through it, so the Habitat keeps the battery banks it shared a network with", () => {
    // The Habitat is cabled from the first battery bank, and the second from
    // the Habitat, so that taking the first away would leave the Habitat on a
    // network with a battery bank, and the rest of the storage on another.
    const game = scenario()
      .plan("solar-array", site)
      .plan("battery-bank", { x: 30, y: 25 })
      .plan("habitat", { x: 40, y: 40 })
      .plan("battery-bank", { x: 52, y: 52 })
      .plan("battery-bank", { x: 8, y: 26 });
    const [solarId, firstBankId, habitatId, secondBankId, thirdBankId] =
      game.state.constructions.map((c) => c.id);
    runUntil(game, (state) => state.constructions.length === 0);
    expect(
      game.state.cables.map(({ fromStructureId, toStructureId }) => [
        fromStructureId,
        toStructureId,
      ]),
    ).toEqual([
      [solarId, firstBankId],
      [firstBankId, habitatId],
      [habitatId, secondBankId],
      [solarId, thirdBankId],
    ]);
    expect(game.campaign.moveMissionDirectorIn(habitatId ?? "")).toEqual({
      ok: true,
    });

    game.campaign.dismantleStructure(firstBankId ?? "");
    runUntil(game, (state) => state.robots[0]?.activity.kind === "dismantling");

    expect(game.state.power.networks).toEqual([
      expect.objectContaining({
        structureIds: [solarId, habitatId, secondBankId, thirdBankId],
      }),
    ]);
    expect(
      game.state.cables.every(({ fromStructureId, toStructureId }) =>
        [fromStructureId, toStructureId].every((id) => id !== firstBankId),
      ),
    ).toBe(true);
  });

  it("has the Robot unload the recovered Components beside the stockpile", () => {
    const { game, id } = commissionedArray();
    game.campaign.dismantleStructure(id);

    const states = runUntil(game, (state) => state.dismantlings.length === 0);

    const returning = states.filter(
      (state) => state.robots[0]?.activity.kind === "returning-components",
    );
    expect(returning.length).toBeGreaterThan(0);
    const reach =
      catalogue.stockpile.footprintRadiusMetres +
      catalogue.robot.workingGapMetres;
    for (const state of returning) {
      const position = state.robots[0]?.position ?? { x: NaN, y: NaN };
      expect(
        Math.hypot(
          position.x - state.stockpile.position.x,
          position.y - state.stockpile.position.y,
        ),
      ).toBeCloseTo(reach);
    }
    expect(
      states.some(
        (state) =>
          state.robots[0]?.activity.kind === "walking" &&
          state.robots[0].activity.destination === "stockpile",
      ),
    ).toBe(true);
  });

  it("keeps its ground taken until its Components are back in stock", () => {
    const { game, id } = commissionedArray();
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
    expect(placeOverIt()).toEqual({ ok: true, position: site });
  });

  it.each([
    ["before", "dismantling"],
    ["after", "walking"],
  ] as const)(
    "is worked on in plan order: planned %s a Construction, the Robot starts with %s",
    (when, firstActivity) => {
      const { game, id } = commissionedArray();
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
    const { game, id } = commissionedArray();
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
    const { game, id } = commissionedArray();
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
    const { game, id } = commissionedArray();

    expect(game.campaign.dismantleStructure(id)).toEqual({ ok: true });
    expect(game.campaign.dismantleStructure(id)).toMatchObject({ ok: false });
    expect(game.campaign.dismantleStructure("no-such-structure")).toMatchObject(
      { ok: false },
    );
    expect(game.state.dismantlings).toHaveLength(1);
  });
});
