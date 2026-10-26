import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import type { GameEvent, GroundPosition } from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

// The Habitat needs no power and lets in no radiation here, so that the
// Mission Director can live in it until the oxygen runs out.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { safeHabitat } = await import("./safe-habitat");
  const { withoutCold } = await import("./without-cold");
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  return {
    ...actual,
    catalogue: safeHabitat(
      withoutMicrometeorites(withoutCold(actual.catalogue)),
      ["power", "radiation", "solar-particle-events"],
    ),
  };
});

const habitatSite: GroundPosition = { x: 25, y: -20 };

/** Runs the game a game-minute at a time until the condition holds. */
function runUntil(game: Scenario, done: (game: Scenario) => boolean): void {
  for (let minute = 0; minute < 10 * 24 * 60; minute++) {
    if (done(game)) return;
    game.advance({ minutes: 1 });
  }
  throw new Error("It never happened.");
}

/** A Mission Director who has just moved into a newly commissioned Habitat. */
function movedIn(): Scenario {
  const game = scenario().plan("habitat", habitatSite);
  const habitatId = game.state.constructions[0]?.id ?? "";
  runUntil(game, (candidate) => candidate.state.constructions.length === 0);
  const result = game.campaign.moveMissionDirectorIn(habitatId);
  if (!result.ok) throw new Error(`Moving in was refused: ${result.message}`);
  return game;
}

function dailyUse(stockId: string): number {
  const use = catalogue.lifeSupportStocks.find(
    (type) => type.id === stockId,
  )?.usePerEarthDayKilograms;
  if (use === undefined) throw new Error("expected a catalogued stock");
  return use;
}

/** The kilograms of each life support stock, by id. */
function stocks(game: Scenario): Record<string, number> {
  return Object.fromEntries(
    game.state.lifeSupport.map((stock) => [stock.stockId, stock.kilograms]),
  );
}

describe("oxygen and water aboard the Lander", () => {
  it("start with about 30 Earth Days of each", () => {
    const { state } = scenario();

    expect(state.lifeSupport.map((stock) => stock.stockId)).toEqual([
      "oxygen",
      "water",
    ]);
    for (const stock of state.lifeSupport) {
      const earthDays = stock.kilograms / dailyUse(stock.stockId);
      expect(earthDays).toBeGreaterThan(28);
      expect(earthDays).toBeLessThan(32);
    }
  });

  it("are not used up while the Mission Director lives aboard the Lander", () => {
    const game = scenario();
    const before = stocks(game);

    game.advance({ earthDays: 60 });

    expect(stocks(game)).toEqual(before);
    expect(game.state.lifeSupport.map((stock) => stock.inUse)).toEqual([
      false,
      false,
    ]);
    expect(game.state.ended).toBeUndefined();
    expect(game.campaign.forecasts().lifeSupport).toEqual([
      {
        stockId: "oxygen",
        kilogramsPerEarthDay: 0,
        minutesUntilEmpty: undefined,
      },
      {
        stockId: "water",
        kilogramsPerEarthDay: 0,
        minutesUntilEmpty: undefined,
      },
    ]);
  });
});

describe("oxygen and water in the Habitat", () => {
  it("are kept safe until the Mission Director moves in, then used up every Earth Day", () => {
    const start = stocks(scenario());
    const game = movedIn();
    expect(stocks(game)).toEqual(start);

    game.advance({ earthDays: 1 });

    expect(game.state.lifeSupport.map((stock) => stock.inUse)).toEqual([
      true,
      true,
    ]);
    for (const [stockId, kilograms] of Object.entries(stocks(game))) {
      expect(kilograms).toBeCloseTo(
        (start[stockId] ?? 0) - dailyUse(stockId),
        6,
      );
    }
  });

  it("are forecast to run out after the Earth Days their stock lasts", () => {
    const game = movedIn();
    game.advance({ earthDays: 1 });

    // 25 kg of oxygen at 0.84 kg an Earth Day lasts 29.76 Earth Days, and
    // 108 kg of water at 3.5 kg lasts 30.86, a day of which has gone.
    const [oxygen, water] = game.campaign.forecasts().lifeSupport;
    expect(oxygen?.stockId).toBe("oxygen");
    expect((oxygen?.minutesUntilEmpty ?? 0) / (24 * 60)).toBeCloseTo(28.76, 2);
    expect(water?.stockId).toBe("water");
    expect((water?.minutesUntilEmpty ?? 0) / (24 * 60)).toBeCloseTo(29.86, 2);
  });
});

/** A Mission Director who has moved into a Habitat and is a game-minute from running out of oxygen. */
function aMinuteFromDeath(): Scenario {
  const game = movedIn();
  const oxygen = game.campaign
    .forecasts()
    .lifeSupport.find((stock) => stock.stockId === "oxygen");
  game.campaign.advance((oxygen?.minutesUntilEmpty ?? 0) - 1);
  return game;
}

describe("running out of oxygen", () => {
  it("kills the Mission Director at once, exactly when forecast, and ends the Campaign", () => {
    const game = aMinuteFromDeath();
    expect(game.state.ended).toBeUndefined();
    const atMinute = game.state.clock.elapsedMinutes + 1;

    const events = game.campaign.advance(1);

    const cause = { kind: "ran-out", stockId: "oxygen" };
    expect(events).toContainEqual({
      kind: "mission-director-died",
      atMinute,
      cause,
    });
    expect(game.state.ended).toEqual({ atMinute, cause });
    expect(stocks(game)["oxygen"]).toBe(0);
    expect(stocks(game)["water"]).toBeGreaterThan(0);
  });

  it("is the last thing that happens", () => {
    const game = aMinuteFromDeath();

    const events = game.campaign.advance(1);

    expect(events.at(-1)?.kind).toBe("mission-director-died");
    expect(game.campaign.forecasts().lifeSupport).toEqual([
      {
        stockId: "oxygen",
        kilogramsPerEarthDay: 0,
        minutesUntilEmpty: undefined,
      },
      {
        stockId: "water",
        kilogramsPerEarthDay: 0,
        minutesUntilEmpty: undefined,
      },
    ]);
  });

  it("stops the simulation advancing", () => {
    const game = aMinuteFromDeath();
    game.campaign.advance(1);
    const after = game.state;

    expect(game.campaign.advance(24 * 60)).toEqual([]);
    expect(game.campaign.advanceToNextEvent()).toEqual([]);

    expect(game.state).toEqual(after);
  });

  it("refuses every command, saying the Campaign is over", () => {
    const game = aMinuteFromDeath();
    game.campaign.advance(1);
    const habitatId = game.state.structures[0]?.id ?? "";
    const plan = { structureTypeId: "light-mast", position: { x: -30, y: 30 } };

    const refusals = [
      game.campaign.checkPlacement(plan),
      game.campaign.planConstruction(plan),
      game.campaign.cancelConstruction("structure-1"),
      game.campaign.dismantleStructure(habitatId),
      game.campaign.moveMissionDirectorIn(habitatId),
    ];

    for (const refusal of refusals) {
      expect(refusal).toMatchObject({
        ok: false,
        message: "The Campaign is over: the Mission Director has died.",
      });
    }
    expect(game.state.constructions).toEqual([]);
    expect(game.state.dismantlings).toEqual([]);
  });
});

describe("life support warnings", () => {
  it("come as each stock falls to 7, 3 and 1 Earth Days left, stopping each skip to the next event, before the Mission Director dies", () => {
    const game = movedIn();
    const skips: { events: readonly GameEvent[]; stoppedAt: number }[] = [];
    while (game.state.ended === undefined && skips.length < 100) {
      const events = game.campaign.advanceToNextEvent();
      skips.push({ events, stoppedAt: game.state.clock.elapsedMinutes });
    }

    const notable = skips
      .flatMap((skip) => skip.events)
      .filter(
        (event) =>
          event.kind !== "night-started" && event.kind !== "daylight-started",
      )
      .map((event) =>
        event.kind === "life-support-warning"
          ? `${event.stockId} warning, ${event.minutesUntilEmpty / (24 * 60)} Earth Days left`
          : event.kind === "mission-director-died" &&
              event.cause.kind === "ran-out"
            ? `died: ${event.cause.stockId} ran out`
            : event.kind,
      );
    expect(notable).toEqual([
      "oxygen warning, 7 Earth Days left",
      "water warning, 7 Earth Days left",
      "oxygen warning, 3 Earth Days left",
      "water warning, 3 Earth Days left",
      "oxygen warning, 1 Earth Days left",
      "died: oxygen ran out",
    ]);
    for (const { events, stoppedAt } of skips) {
      for (const event of events) expect(event.atMinute).toBe(stoppedAt);
    }
  });

  it("don't come while the Mission Director lives aboard the Lander", () => {
    const game = scenario();

    const events = game.campaign.advance(60 * 24 * 60);

    expect(
      events.filter((event) => event.kind === "life-support-warning"),
    ).toEqual([]);
  });
});
