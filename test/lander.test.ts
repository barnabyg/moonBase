import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type GameEvent,
  type GroundPosition,
} from "../src/simulation";
import { scenario, toGameMinutes, type Scenario } from "./scenario";

// The Mission Director has to live in the Habitat for a whole round trip,
// longer than the starting stock keeps a Habitat powered or the dose low.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { safeHabitat } = await import("./safe-habitat");
  return {
    ...actual,
    catalogue: safeHabitat(actual.catalogue, [
      "power",
      "radiation",
      "solar-particle-events",
    ]),
  };
});

const habitatSite: GroundPosition = { x: 25, y: -20 };
const { roundTripEarthDays } = catalogue.lander;
const legMinutes = {
  toEarth: toGameMinutes({ earthDays: roundTripEarthDays.toEarth }),
  turnaround: toGameMinutes({ earthDays: roundTripEarthDays.turnaround }),
  toMoon: toGameMinutes({ earthDays: roundTripEarthDays.toMoon }),
};

/** Runs the game until the Robot has carried out every planned Construction. */
function buildAll(game: Scenario): Scenario {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
  return game;
}

/** The Mission Director living in a commissioned Habitat, so the Lander is free to fly. */
function landerFree(): Scenario {
  const game = buildAll(scenario().plan("habitat", habitatSite));
  const movedIn = game.campaign.moveMissionDirectorIn(
    game.state.structures[0]?.id ?? "",
  );
  if (!movedIn.ok) throw new Error(movedIn.message);
  return game;
}

function send(game: Scenario): number {
  const result = game.campaign.sendLander();
  if (!result.ok) throw new Error(result.message);
  return game.state.clock.elapsedMinutes;
}

const landerKinds: readonly GameEvent["kind"][] = [
  "lander-took-off",
  "lander-reached-earth",
  "lander-left-earth",
  "lander-landed",
];

describe("sending the Lander", () => {
  it("is refused while the Mission Director lives aboard it, saying the Habitat comes first", () => {
    const game = scenario();

    const result = game.campaign.sendLander();

    expect(result).toEqual({
      ok: false,
      reason: "mission-director-aboard",
      message:
        "The Lander can't leave while the Mission Director lives aboard it. They must move into a Habitat first.",
    });
    expect(game.state.lander).toMatchObject({
      state: "landed-occupied",
      legEndsAtMinute: undefined,
    });
  });

  it("is refused while the Lander is away, with a reason", () => {
    const game = landerFree();
    send(game);
    game.advance({ earthDays: 4 });

    expect(game.campaign.sendLander()).toEqual({
      ok: false,
      reason: "lander-away",
      message: "The Lander is away, and can only be sent once it has landed.",
    });
    expect(game.state.lander.state).toBe("turnaround");
  });

  it("flies it to Earth, through turnaround and back to land on the same spot, each leg as long as the data catalogue says", () => {
    const game = landerFree();
    const position = game.state.lander.position;
    expect(game.state.lander.state).toBe("landed-free");

    const sentAt = send(game);

    const reachesEarth = sentAt + legMinutes.toEarth;
    const leavesEarth = reachesEarth + legMinutes.turnaround;
    const lands = leavesEarth + legMinutes.toMoon;
    expect(game.state.lander).toEqual({
      state: "travelling-to-earth",
      position,
      legStartedAtMinute: sentAt,
      legEndsAtMinute: reachesEarth,
      landingPadId: undefined,
      cargo: [],
    });
    game.advance({ minutes: legMinutes.toEarth - 1 });
    expect(game.state.lander.state).toBe("travelling-to-earth");
    game.advance({ minutes: 1 });
    expect(game.state.lander).toEqual({
      state: "turnaround",
      position,
      legStartedAtMinute: reachesEarth,
      legEndsAtMinute: leavesEarth,
      landingPadId: undefined,
      cargo: [],
    });
    game.advance({ minutes: legMinutes.turnaround });
    expect(game.state.lander).toEqual({
      state: "travelling-to-moon",
      position,
      legStartedAtMinute: leavesEarth,
      legEndsAtMinute: lands,
      landingPadId: undefined,
      cargo: [],
    });
    game.advance({ minutes: legMinutes.toMoon });
    expect(game.state.lander).toEqual({
      state: "landed-free",
      position,
      legStartedAtMinute: undefined,
      legEndsAtMinute: undefined,
      landingPadId: undefined,
      cargo: [],
    });
    expect(game.state.clock.elapsedMinutes).toBe(lands);
  });

  it("can be sent again once it has landed", () => {
    const game = landerFree();
    send(game);
    game.advance({
      minutes: legMinutes.toEarth + legMinutes.turnaround + legMinutes.toMoon,
    });

    expect(game.campaign.sendLander()).toEqual({ ok: true });
    expect(game.state.lander.state).toBe("travelling-to-earth");
  });
});

describe("the Lander's round trip", () => {
  it("has advance to next event stop as it takes off, reaches Earth, leaves Earth and lands", () => {
    const game = landerFree();
    const sentAt = send(game);

    const stops: GameEvent[][] = [];
    for (let skips = 0; game.state.lander.state !== "landed-free"; skips++) {
      if (skips > 100) throw new Error("The Lander never landed.");
      stops.push([...game.campaign.advanceToNextEvent()]);
    }

    const landerStops = stops.filter((events) =>
      events.some((event) => landerKinds.includes(event.kind)),
    );
    const reachesEarth = sentAt + legMinutes.toEarth;
    const leavesEarth = reachesEarth + legMinutes.turnaround;
    expect(
      landerStops.map((events) =>
        events
          .filter((event) => landerKinds.includes(event.kind))
          .map((event) => [event.kind, event.atMinute]),
      ),
    ).toEqual([
      [["lander-took-off", sentAt + 1]],
      [["lander-reached-earth", reachesEarth]],
      [["lander-left-earth", leavesEarth]],
      [["lander-landed", leavesEarth + legMinutes.toMoon]],
    ]);
  });

  it("leaves the base's stock and the Robot's work carrying on while it is away", () => {
    const game = landerFree();
    send(game);
    game.advance({ hours: 1 });

    game.plan("light-mast", { x: 30, y: 15 });
    for (let hours = 0; game.state.constructions.length > 0; hours++) {
      if (hours > 2 * 24) throw new Error("The light mast was never built.");
      game.advance({ hours: 1 });
    }

    expect(game.state.lander.state).toBe("travelling-to-earth");
    expect(game.state.structures.map((s) => s.structureTypeId)).toContain(
      "light-mast",
    );
    expect(
      game.state.stockpile.components.find(
        (stock) => stock.componentId === "mast-pole",
      )?.count,
    ).toBe(
      (catalogue.startingStock.find(
        (stock) => stock.componentId === "mast-pole",
      )?.count ?? 0) - 1,
    );
  });

  it("carries on mid-trip after saving and loading exactly as it would have", () => {
    const game = landerFree();
    send(game);
    game.advance({ earthDays: 5 });
    expect(game.state.lander.state).toBe("turnaround");

    const loaded = loadCampaign(game.campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.campaign.snapshot()).toEqual(game.state);

    const rest = legMinutes.toEarth + legMinutes.turnaround + legMinutes.toMoon;
    expect(loaded.campaign.advance(rest)).toEqual(game.campaign.advance(rest));
    expect(loaded.campaign.snapshot()).toEqual(game.state);
    expect(game.state.lander.state).toBe("landed-free");
  });
});
