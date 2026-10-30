import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
} from "../src/simulation";
import { formatEvent } from "../src/ui/notifications-text";
import {
  formatAct,
  formatNextMilestone,
  summariseMilestones,
} from "../src/ui/status-panel-text";
import { scenario, toGameMinutes, type Scenario } from "./scenario";

// Three Acts: Act 1 holds power storage and moving in; Act 2 the Lander
// departing, the Habitat shielded and the landing pad; Act 3 the rest, from the
// first Research Task on.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withActs } = await import("./with-acts");
  return { ...actual, catalogue: withActs(actual.catalogue, [2, 3]) };
});

const solarSite: GroundPosition = { x: 20, y: 12 };
const bankSite: GroundPosition = { x: 28, y: 12 };
const habitatSite: GroundPosition = { x: 25, y: -20 };

/** Runs the game a game-minute at a time until a Milestone is reached, returning every event on the way. */
function untilReached(game: Scenario, milestoneId: string): GameEvent[] {
  const events: GameEvent[] = [];
  for (let minute = 0; minute < 15 * 24 * 60; minute++) {
    if (game.state.milestones.reachedIds.includes(milestoneId)) return events;
    events.push(...game.campaign.advance(1));
  }
  throw new Error(`${milestoneId} was never reached.`);
}

function startedActs(events: readonly GameEvent[]): string[] {
  return events.flatMap((event) =>
    event.kind === "act-started" ? [event.actId] : [],
  );
}

/** A Campaign played as `scenario` does, from a save with these Milestones reached. */
function withReached(reachedIds: readonly string[]): Scenario {
  const document = JSON.parse(scenario().campaign.save()) as {
    state: { reachedMilestoneIds: readonly string[] };
  };
  document.state.reachedMilestoneIds = reachedIds;
  const loaded = loadCampaign(JSON.stringify(document));
  if (!loaded.ok) throw new Error(loaded.message);
  const { campaign } = loaded;
  const self: Scenario = {
    campaign,
    advance(duration) {
      campaign.advance(toGameMinutes(duration));
      return self;
    },
    plan(structureTypeId, position) {
      const result = campaign.planConstruction({ structureTypeId, position });
      if (!result.ok)
        throw new Error(`Planning was refused: ${result.message}`);
      return self;
    },
    get state() {
      return campaign.snapshot();
    },
  };
  return self;
}

/** Every Milestone but those given. */
function allBut(...left: readonly string[]): string[] {
  return catalogue.milestones
    .map((milestone) => milestone.id)
    .filter((id) => !left.includes(id));
}

describe("the current Act", () => {
  it("is the first at the landing, with no notification", () => {
    const game = scenario();

    expect(game.state.milestones.currentActId).toBe("act-1");

    const events = game.campaign.advance(toGameMinutes({ hours: 6 }));
    expect(startedActs(events)).toEqual([]);
    expect(game.state.milestones.currentActId).toBe("act-1");
  });

  it("is the Act of the earliest Milestone not reached, whatever has been reached later on", () => {
    expect(
      withReached(["first-research-task"]).state.milestones.currentActId,
    ).toBe("act-1");
    expect(
      withReached(["power-storage", "moved-in"]).state.milestones.currentActId,
    ).toBe("act-2");
    expect(
      withReached(["power-storage", "moved-in", "first-research-task"]).state
        .milestones.currentActId,
    ).toBe("act-2");
  });

  it("is the last Act once every Milestone is reached", () => {
    const { milestones } = withReached(allBut()).state;

    expect(milestones.currentId).toBeUndefined();
    expect(milestones.currentActId).toBe("act-3");
  });
});

describe("a new Act", () => {
  it("doesn't start when a Milestone of the current Act is reached out of order, then starts once, after the Milestone that opens it", () => {
    const game = scenario().plan("solar-array", solarSite);
    game.plan("habitat", habitatSite);
    const habitatId = game.state.constructions.at(-1)?.id ?? "";
    for (let minute = 0; game.state.constructions.length > 0; minute++) {
      if (minute > 15 * 24 * 60) throw new Error("It was never built.");
      game.campaign.advance(1);
    }
    expect(game.campaign.moveMissionDirectorIn(habitatId)).toEqual({
      ok: true,
    });

    const movedIn = untilReached(game, "moved-in");
    expect(startedActs(movedIn)).toEqual([]);
    expect(game.state.milestones.currentActId).toBe("act-1");

    game.plan("battery-bank", bankSite);
    const stored = untilReached(game, "power-storage");

    expect(startedActs(stored)).toEqual(["act-2"]);
    expect(stored.slice(-2)).toEqual([
      expect.objectContaining({
        kind: "milestone-reached",
        milestoneId: "power-storage",
      }),
      expect.objectContaining({ kind: "act-started", actId: "act-2" }),
    ]);
    expect(stored.at(-1)?.atMinute).toBe(stored.at(-2)?.atMinute);
    expect(game.state.milestones.currentActId).toBe("act-2");

    expect(
      startedActs(game.campaign.advance(toGameMinutes({ earthDays: 2 }))),
    ).toEqual([]);
  });

  it("doesn't start when a Milestone of a later Act is reached first", () => {
    const game = scenario();
    expect(
      game.campaign.startResearchTask("regolith-sample-analysis"),
    ).toMatchObject({ ok: true });

    const events = untilReached(game, "first-research-task");

    expect(startedActs(events)).toEqual([]);
    expect(game.state.milestones.currentActId).toBe("act-1");
  });

  it("starts only once when an Act is passed over, as its Milestones were all reached early", () => {
    const game = withReached([
      "moved-in",
      "lander-departs",
      "habitat-shielded",
      "landing-pad",
    ]);
    game.plan("battery-bank", bankSite);

    const events = untilReached(game, "power-storage");

    expect(startedActs(events)).toEqual(["act-3"]);
    expect(game.state.milestones.currentActId).toBe("act-3");
  });

  it("starts when the last Milestone, in an earlier Act, leaves the last Act current", () => {
    const game = withReached(allBut("power-storage"));
    game.plan("battery-bank", bankSite);

    const events = untilReached(game, "power-storage");

    expect(startedActs(events)).toEqual(["act-3"]);
    expect(game.state.milestones.currentId).toBeUndefined();
  });

  it("doesn't start as the last Milestone of the last Act is reached, and the Campaign carries on", () => {
    const game = withReached(allBut("first-research-task"));
    expect(
      game.campaign.startResearchTask("regolith-sample-analysis"),
    ).toMatchObject({ ok: true });

    const events = untilReached(game, "first-research-task");

    expect(startedActs(events)).toEqual([]);
    expect(
      startedActs(game.campaign.advance(toGameMinutes({ earthDays: 1 }))),
    ).toEqual([]);
    expect(game.state.ended).toBeUndefined();
    expect(game.state.milestones.currentActId).toBe("act-3");
  });

  it("stops a skip to the next event with its Milestone, and says what it asks", () => {
    const game = withReached(["moved-in"]);
    game.plan("battery-bank", bankSite);

    let events: readonly GameEvent[] = [];
    for (let skips = 0; startedActs(events).length === 0; skips++) {
      if (skips > 100) throw new Error("It never started.");
      events = game.campaign.advanceToNextEvent();
    }

    expect(events.map((event) => event.kind)).toContain("milestone-reached");
    const started = events.find((event) => event.kind === "act-started");
    if (started === undefined) throw new Error("expected a new Act");
    expect(formatEvent(started)).toBe(
      "Act 2: Made-up begins. Do what Act 2 asks.",
    );
  });
});

describe("a loaded Campaign", () => {
  it("has the Act its reached Milestones imply, and no new Act starts for it", () => {
    const game = withReached(["power-storage", "moved-in"]);
    const loaded = loadCampaign(game.campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    expect(loaded.campaign.snapshot().milestones.currentActId).toBe("act-2");
    expect(startedActs(loaded.campaign.advance(60))).toEqual([]);
  });

  it("has the Act an older sample save's Milestones imply, and no new Act starts for it", () => {
    const loaded = loadCampaign(
      readFileSync(
        new URL("saves/version-33.moonbase", import.meta.url),
        "utf8",
      ),
    );
    if (!loaded.ok) throw new Error(loaded.message);

    const { milestones } = loaded.campaign.snapshot();
    expect(milestones.reachedIds).toEqual(["power-storage", "moved-in"]);
    expect(milestones.currentActId).toBe("act-2");
    expect(startedActs(loaded.campaign.advance(60))).toEqual([]);
  });
});

describe("the status panel's words for the Acts", () => {
  const milestones = (state: Snapshot): Snapshot["milestones"] =>
    state.milestones;

  it("name the current Act and what it asks", () => {
    expect(formatAct(milestones(scenario().state))).toEqual({
      label: "Act 1",
      asks: "Do what Act 1 asks.",
    });
    expect(
      formatAct(milestones(withReached(["power-storage", "moved-in"]).state)),
    ).toEqual({ label: "Act 2: Made-up", asks: "Do what Act 2 asks." });
  });

  it("say every Milestone is reached instead of what the last Act asks, once it is", () => {
    expect(formatAct(milestones(withReached(allBut()).state))).toEqual({
      label: "Act 3: Made-up",
      asks: "Everything this Act asks of you is done.",
    });
  });

  it("name the next Milestone alone within an Act, and its Act when it is in a later one", () => {
    expect(formatNextMilestone(milestones(scenario().state))).toBe(
      "Habitat commissioned, Mission Director moved in",
    );
    expect(
      formatNextMilestone(milestones(withReached(["power-storage"]).state)),
    ).toBe("Lander departs, in Act 2: Made-up");
    expect(
      formatNextMilestone(
        milestones(withReached(["lander-departs", "moved-in"]).state),
      ),
    ).toBe("Habitat shielded, in Act 2: Made-up");
  });

  it("say none is left after the last Milestone, and once every one is reached", () => {
    expect(
      formatNextMilestone(milestones(withReached(allBut("moved-in")).state)),
    ).toBe("none left");
    expect(formatNextMilestone(milestones(withReached(allBut()).state))).toBe(
      "none left",
    );
  });

  it("keep the folded section's headline to the Milestone to aim for now", () => {
    expect(
      summariseMilestones(milestones(withReached(["power-storage"]).state)),
    ).toBe("Habitat commissioned, Mission Director moved in");
    expect(summariseMilestones(milestones(withReached(allBut()).state))).toBe(
      "every Milestone reached",
    );
  });
});
