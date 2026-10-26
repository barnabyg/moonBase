import { describe, expect, it } from "vitest";
import type { GroundPosition, Snapshot } from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

const habitatSite: GroundPosition = { x: 25, y: -20 };
const solarSite: GroundPosition = { x: 20, y: 12 };

/** Runs the game a game-minute at a time until the condition holds, returning every state. */
function runUntil(
  game: Scenario,
  done: (state: Snapshot) => boolean,
): Snapshot[] {
  const states: Snapshot[] = [];
  for (let minute = 0; minute < 10 * 24 * 60; minute++) {
    if (done(game.state)) return states;
    states.push(game.advance({ minutes: 1 }).state);
  }
  throw new Error("It never happened.");
}

function idOfLast(game: Scenario): string {
  const id = game.state.constructions.at(-1)?.id;
  if (id === undefined) throw new Error("expected a Construction");
  return id;
}

/** A Habitat built on its own, with no power to cable it to. */
function commissionedHabitat(): { game: Scenario; habitatId: string } {
  const game = scenario().plan("habitat", habitatSite);
  const habitatId = idOfLast(game);
  runUntil(game, (state) => state.constructions.length === 0);
  return { game, habitatId };
}

describe("the inflatable Habitat", () => {
  it("is built by the Robot from the starting cargo through all four stages, and cabled to the power network", () => {
    const game = scenario().plan("solar-array", solarSite);
    const solarId = idOfLast(game);
    game.plan("habitat", habitatSite);
    const habitatId = idOfLast(game);

    const states = runUntil(game, (state) => state.constructions.length === 0);

    const stages = states
      .map(
        (state) =>
          state.constructions.find(
            (construction) => construction.id === habitatId,
          )?.stage,
      )
      .filter((stage) => stage !== undefined)
      .filter((stage, index, all) => stage !== all[index - 1]);
    expect(stages).toEqual([
      "site-preparation",
      "component-delivery",
      "assembly",
      "commissioning",
    ]);
    expect(game.state.structures).toContainEqual(
      expect.objectContaining({ id: habitatId, structureTypeId: "habitat" }),
    );
    expect(game.state.cables).toContainEqual(
      expect.objectContaining({
        fromStructureId: solarId,
        toStructureId: habitatId,
        complete: true,
      }),
    );
    expect(
      game.state.power.networks.map((network) => network.structureIds),
    ).toEqual([[solarId, habitatId]]);
  });
});

describe("moving the Mission Director in", () => {
  it("starts with the Mission Director aboard the Lander, which is landed and occupied", () => {
    const { state } = scenario();

    expect(state.missionDirector).toEqual({ residence: "lander" });
    expect(state.lander.state).toBe("landed-occupied");
  });

  it("is refused, with a reason, before the Habitat is commissioned", () => {
    const game = scenario().plan("habitat", habitatSite);
    const habitatId = idOfLast(game);
    runUntil(game, (state) => state.constructions[0]?.stage === "assembly");

    const result = game.campaign.moveMissionDirectorIn(habitatId);

    expect(result).toMatchObject({ ok: false, reason: "not-commissioned" });
    expect(result.ok || result.message.length > 0).toBe(true);
    expect(game.state.missionDirector).toEqual({ residence: "lander" });
    expect(game.state.lander.state).toBe("landed-occupied");
  });

  it("is refused, with a reason, into anything but a Habitat", () => {
    const game = scenario().plan("solar-array", solarSite);
    const solarId = idOfLast(game);
    runUntil(game, (state) => state.constructions.length === 0);

    expect(game.campaign.moveMissionDirectorIn(solarId)).toMatchObject({
      ok: false,
      reason: "not-a-habitat",
    });
    expect(game.campaign.moveMissionDirectorIn("no-such-thing")).toMatchObject({
      ok: false,
      reason: "not-a-habitat",
    });
    expect(game.state.missionDirector).toEqual({ residence: "lander" });
  });

  it("happens at once into a commissioned Habitat, even an unpowered one, and frees the Lander", () => {
    const { game, habitatId } = commissionedHabitat();
    expect(
      game.state.structures.find((structure) => structure.id === habitatId)
        ?.powered,
    ).toBe(false);
    const before = game.state.clock;

    expect(game.campaign.moveMissionDirectorIn(habitatId)).toEqual({
      ok: true,
    });

    expect(game.state.clock).toEqual(before);
    expect(game.state.missionDirector).toEqual({
      residence: "habitat",
      habitatId,
    });
    expect(game.state.lander.state).toBe("landed-free");
  });

  it("can't be undone or repeated", () => {
    const { game, habitatId } = commissionedHabitat();
    game.campaign.moveMissionDirectorIn(habitatId);

    expect(game.campaign.moveMissionDirectorIn(habitatId)).toMatchObject({
      ok: false,
      reason: "already-moved-in",
    });
    game.advance({ earthDays: 2 });
    expect(game.state.missionDirector).toEqual({
      residence: "habitat",
      habitatId,
    });
  });

  it("is refused into a Habitat that is to be dismantled", () => {
    const { game, habitatId } = commissionedHabitat();
    expect(game.campaign.dismantleStructure(habitatId)).toEqual({ ok: true });

    expect(game.campaign.moveMissionDirectorIn(habitatId)).toMatchObject({
      ok: false,
      reason: "being-dismantled",
    });
    expect(game.state.missionDirector).toEqual({ residence: "lander" });
  });
});

describe("dismantling a Habitat", () => {
  it("is refused, with a reason, while the Mission Director lives in it", () => {
    const { game, habitatId } = commissionedHabitat();
    game.campaign.moveMissionDirectorIn(habitatId);

    const result = game.campaign.dismantleStructure(habitatId);

    expect(result).toMatchObject({ ok: false });
    expect(result.ok || result.message).toMatch(/Mission Director/);
    expect(game.state.dismantlings).toEqual([]);
    game.advance({ earthDays: 1 });
    expect(game.state.structures.map((structure) => structure.id)).toContain(
      habitatId,
    );
  });

  it("goes ahead while nobody lives in it", () => {
    const { game, habitatId } = commissionedHabitat();

    expect(game.campaign.dismantleStructure(habitatId)).toEqual({ ok: true });
  });
});
