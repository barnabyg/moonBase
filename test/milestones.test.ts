import { describe, expect, it, vi } from "vitest";
import type { Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

// A Habitat on a single solar array can't get through a Night, and these
// tests keep the Mission Director in one past the first.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { safeHabitat } = await import("./safe-habitat");
  return { ...actual, catalogue: safeHabitat(actual.catalogue, ["power"]) };
});

const solarSite: GroundPosition = { x: 20, y: 12 };
const bankSite: GroundPosition = { x: 28, y: 12 };
const habitatSite: GroundPosition = { x: 25, y: -20 };

/**
 * Runs the game a game-minute at a time until the condition holds,
 * returning every event on the way.
 */
function runUntil(
  game: Scenario,
  done: (state: Snapshot) => boolean,
): GameEvent[] {
  const events: GameEvent[] = [];
  for (let minute = 0; minute < 15 * 24 * 60; minute++) {
    if (done(game.state)) return events;
    events.push(...game.campaign.advance(1));
  }
  throw new Error("It never happened.");
}

function idOfLast(game: Scenario): string {
  const id = game.state.constructions.at(-1)?.id;
  if (id === undefined) throw new Error("expected a Construction");
  return id;
}

function reached(events: readonly GameEvent[]): string[] {
  return events.flatMap((event) =>
    event.kind === "milestone-reached" ? [event.milestoneId] : [],
  );
}

/** A solar array and a battery bank, both commissioned. */
function withPowerStorage(): { game: Scenario; bankId: string } {
  const game = scenario().plan("solar-array", solarSite);
  game.plan("battery-bank", bankSite);
  const bankId = idOfLast(game);
  runUntil(game, (state) => state.constructions.length === 0);
  return { game, bankId };
}

/** The Mission Director moved into a Habitat powered by a solar array, before any battery bank. */
function movedInWithoutStorage(): Scenario {
  const game = scenario().plan("solar-array", solarSite);
  game.plan("habitat", habitatSite);
  const habitatId = idOfLast(game);
  runUntil(game, (state) => state.constructions.length === 0);
  const result = game.campaign.moveMissionDirectorIn(habitatId);
  if (!result.ok) throw new Error(result.message);
  return game;
}

describe("the Milestones", () => {
  it("start a fresh Campaign with power storage as the current Milestone and moving in as the next, none reached", () => {
    const { milestones } = scenario().state;

    expect(milestones).toEqual({
      reachedIds: [],
      currentId: "power-storage",
      nextId: "moved-in",
    });
  });

  it("reach power storage as a battery bank is commissioned, with a notification, and make moving in current", () => {
    const game = scenario().plan("solar-array", solarSite);
    game.plan("battery-bank", bankSite);
    const bankId = idOfLast(game);

    const events = runUntil(game, (state) =>
      state.structures.some((structure) => structure.id === bankId),
    );
    events.push(...game.campaign.advance(1));

    expect(reached(events)).toEqual(["power-storage"]);
    const commissioned = events.findIndex(
      (event) =>
        event.kind === "construction-completed" && event.structureId === bankId,
    );
    const milestone = events.findIndex(
      (event) => event.kind === "milestone-reached",
    );
    expect(milestone).toBeGreaterThan(commissioned);
    expect(game.state.milestones).toEqual({
      reachedIds: ["power-storage"],
      currentId: "moved-in",
      nextId: "lander-departs",
    });
  });

  it("stop a skip to the next event as one is reached", () => {
    const game = scenario().plan("battery-bank", bankSite);
    runUntil(
      game,
      (state) => state.constructions[0]?.stage === "commissioning",
    );

    let events: readonly GameEvent[] = [];
    for (let skips = 0; reached(events).length === 0; skips++) {
      if (skips > 100) throw new Error("It was never reached.");
      events = game.campaign.advanceToNextEvent();
    }

    expect(reached(events)).toEqual(["power-storage"]);
    expect(
      events.every((event) => event.atMinute === events[0]?.atMinute),
    ).toBe(true);
  });

  it("reach moving in as the Mission Director moves into a Habitat, out of order, and skip over it once power storage is reached", () => {
    const game = movedInWithoutStorage();

    const events = game.campaign.advance(1);

    expect(reached(events)).toEqual(["moved-in"]);
    expect(game.state.milestones).toEqual({
      reachedIds: ["moved-in"],
      currentId: "power-storage",
      nextId: "lander-departs",
    });

    game.plan("battery-bank", bankSite);
    const later = runUntil(game, (state) =>
      state.milestones.reachedIds.includes("power-storage"),
    );

    expect(reached(later)).toEqual(["power-storage"]);
    expect(game.state.milestones).toEqual({
      reachedIds: ["moved-in", "power-storage"],
      currentId: "lander-departs",
      nextId: undefined,
    });
  });

  it("reach the Lander departing as it takes off for Earth for the first time, and not again", () => {
    const game = movedInWithoutStorage();
    expect(game.campaign.sendLander()).toEqual({ ok: true });

    const events = runUntil(game, (state) =>
      state.milestones.reachedIds.includes("lander-departs"),
    );

    const takeOff = events.findIndex(
      (event) => event.kind === "lander-took-off",
    );
    expect(takeOff).toBeGreaterThanOrEqual(0);
    expect(reached(events)).toEqual(["moved-in", "lander-departs"]);
    expect(
      events.find(
        (event) =>
          event.kind === "milestone-reached" &&
          event.milestoneId === "lander-departs",
      )?.atMinute,
    ).toBe(events[takeOff]?.atMinute);

    const secondTrip = runUntil(
      game,
      (state) => state.lander.state === "landed-free",
    );
    expect(game.campaign.sendLander()).toEqual({ ok: true });
    secondTrip.push(...game.campaign.advance(2));
    expect(secondTrip.some((event) => event.kind === "lander-took-off")).toBe(
      true,
    );
    expect(reached(secondTrip)).toEqual([]);
  });

  it("keep power storage reached once the battery bank is dismantled", () => {
    const { game, bankId } = withPowerStorage();
    game.campaign.advance(1);
    expect(game.state.milestones.reachedIds).toEqual(["power-storage"]);

    expect(game.campaign.dismantleStructure(bankId)).toEqual({ ok: true });
    runUntil(game, (state) => state.dismantlings.length === 0);
    game.campaign.advance(60);

    expect(
      game.state.structures.some((structure) => structure.id === bankId),
    ).toBe(false);
    expect(game.state.milestones).toEqual({
      reachedIds: ["power-storage"],
      currentId: "moved-in",
      nextId: "lander-departs",
    });
  });

  it("are saved and loaded, so that the loaded Campaign carries on exactly as the uninterrupted one does", () => {
    const uninterrupted = movedInWithoutStorage();
    uninterrupted.plan("battery-bank", bankSite);
    const interrupted = movedInWithoutStorage();
    interrupted.plan("battery-bank", bankSite);
    uninterrupted.campaign.advance(1);
    interrupted.campaign.advance(1);
    expect(interrupted.state.milestones.reachedIds).toEqual(["moved-in"]);

    const loaded = loadCampaign(interrupted.campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);
    const later = 3 * 24 * 60;
    const fromSave = loaded.campaign.advance(later);
    const straight = uninterrupted.campaign.advance(later);

    expect(reached(fromSave)).toEqual(["power-storage"]);
    expect(fromSave).toEqual(straight);
    expect(loaded.campaign.snapshot()).toEqual(uninterrupted.state);
  });
});
