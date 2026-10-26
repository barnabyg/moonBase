import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import type { GameEvent, GroundPosition } from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

// The Habitat needs no power and its oxygen and water last, so that the
// Mission Director can live in it through Nights until an event comes.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { safeHabitat } = await import("./safe-habitat");
  return {
    ...actual,
    catalogue: safeHabitat(actual.catalogue, ["power", "life-support"]),
  };
});

const rules = catalogue.solarParticleEvents;
const rates = catalogue.radiation.doseRateMillisievertsPerEarthDay;
const habitatSite: GroundPosition = { x: 25, y: -20 };

type SolarParticleEventKind =
  | "solar-particle-event-warning"
  | "solar-particle-event-started"
  | "solar-particle-event-ended";

function isSolarParticleEvent(
  event: GameEvent,
): event is Extract<GameEvent, { kind: SolarParticleEventKind }> {
  return (
    event.kind === "solar-particle-event-warning" ||
    event.kind === "solar-particle-event-started" ||
    event.kind === "solar-particle-event-ended"
  );
}

/**
 * Skips from one notable event to the next for the given number of Earth
 * Days, returning the Solar Particle Events' events, each with the minute
 * its skip stopped at.
 */
function skipThrough(
  game: Scenario,
  earthDays: number,
): { event: GameEvent; stoppedAt: number }[] {
  const seen: { event: GameEvent; stoppedAt: number }[] = [];
  while (game.state.clock.elapsedMinutes < earthDays * 24 * 60) {
    const events = game.campaign.advanceToNextEvent();
    const stoppedAt = game.state.clock.elapsedMinutes;
    for (const event of events.filter(isSolarParticleEvent)) {
      seen.push({ event, stoppedAt });
    }
  }
  return seen;
}

describe("Solar Particle Events", () => {
  it("are each announced by a warning the warning time ahead, then start and end, and every skip stops at each", () => {
    const seen = skipThrough(scenario(), 200);

    expect(seen.length).toBeGreaterThanOrEqual(9);
    for (const { event, stoppedAt } of seen) {
      expect(event.atMinute).toBe(stoppedAt);
    }
    const kinds = seen.map(({ event }) => event.kind);
    for (const [index, kind] of kinds.entries()) {
      expect(kind).toBe(
        [
          "solar-particle-event-warning",
          "solar-particle-event-started",
          "solar-particle-event-ended",
        ][index % 3],
      );
    }
    for (let index = 0; index + 2 < seen.length; index += 3) {
      const [warning, started, ended] = seen
        .slice(index, index + 3)
        .map(({ event }) => event);
      if (
        warning?.kind !== "solar-particle-event-warning" ||
        started?.kind !== "solar-particle-event-started" ||
        ended === undefined
      ) {
        throw new Error("expected a warning, a start and an end");
      }
      expect(started.atMinute - warning.atMinute).toBe(rules.warningHours * 60);
      expect(warning.startsAtMinute).toBe(started.atMinute);
      expect(warning.endsAtMinute).toBe(ended.atMinute);
      expect(started.endsAtMinute).toBe(ended.atMinute);
      const hours = (ended.atMinute - started.atMinute) / 60;
      expect(hours).toBeGreaterThanOrEqual(rules.durationHours.min);
      expect(hours).toBeLessThanOrEqual(rules.durationHours.max);
    }
  });

  it("come at random intervals within the data catalogue's bounds, starting none too soon", () => {
    const seen = skipThrough(scenario(), 200);
    const starts = seen
      .map(({ event }) => event)
      .filter((event) => event.kind === "solar-particle-event-started");
    const ends = seen
      .map(({ event }) => event)
      .filter((event) => event.kind === "solar-particle-event-ended");

    const gaps = starts.map(
      (start, index) =>
        (start.atMinute - (ends[index - 1]?.atMinute ?? 0)) / (24 * 60),
    );
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(rules.earthDaysBetween.min);
      expect(gap).toBeLessThanOrEqual(rules.earthDaysBetween.max);
    }
    expect(new Set(gaps).size).toBeGreaterThan(1);
  });

  it("are scheduled only by the seeded generator: the same seed and commands give the same events, and another seed others", () => {
    const play = (seed: number) => {
      const game = scenario(seed)
        .plan("solar-array", { x: 20, y: 12 })
        .advance({ hours: 5 })
        .plan("habitat", { x: 25, y: -20 });
      return skipThrough(game, 120);
    };

    expect(play(42)).toEqual(play(42));
    expect(play(43)).not.toEqual(play(42));
  });

  it("are shown in the snapshot from the warning until they end, and not before", () => {
    const game = scenario();
    const untilNext = (kind: SolarParticleEventKind) => {
      for (let skips = 0; skips < 1000; skips++) {
        const events = game.campaign.advanceToNextEvent();
        const found = events.find((event) => event.kind === kind);
        if (found !== undefined) return found;
        expect(game.state.solarParticleEvent).toBeUndefined();
      }
      throw new Error(`No ${kind} came.`);
    };
    // Up to the warning, nothing is known of it.
    const warning = untilNext("solar-particle-event-warning");
    if (warning.kind !== "solar-particle-event-warning") throw new Error();
    const expected = {
      startsAtMinute: warning.startsAtMinute,
      endsAtMinute: warning.endsAtMinute,
      doseRateMultiplier: rules.doseRateMultiplier,
    };

    expect(game.state.solarParticleEvent).toEqual({
      ...expected,
      state: "coming",
    });
    game.advance({ minutes: rules.warningHours * 60 - 1 });
    expect(game.state.solarParticleEvent).toMatchObject({ state: "coming" });
    game.advance({ minutes: 1 });
    expect(game.state.solarParticleEvent).toEqual({
      ...expected,
      state: "under-way",
    });
    game.campaign.advance(warning.endsAtMinute - warning.startsAtMinute - 1);
    expect(game.state.solarParticleEvent).toMatchObject({
      state: "under-way",
    });
    game.advance({ minutes: 1 });
    expect(game.state.solarParticleEvent).toBeUndefined();
  });
});

/**
 * Skips to the next event of the given kind, returning it and every event
 * of its game-minute.
 */
function skipTo<Kind extends SolarParticleEventKind>(
  game: Scenario,
  kind: Kind,
): {
  readonly found: Extract<GameEvent, { kind: Kind }>;
  readonly events: readonly GameEvent[];
} {
  for (let skips = 0; skips < 1000; skips++) {
    const events = game.campaign.advanceToNextEvent();
    const found = events.find(
      (event): event is Extract<GameEvent, { kind: Kind }> =>
        event.kind === kind,
    );
    if (found !== undefined) return { found, events };
  }
  throw new Error(`No ${kind} came.`);
}

/** Runs the game until the Robot has carried out every planned Construction. */
function buildAll(game: Scenario): Scenario {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
  return game;
}

/**
 * A commissioned Habitat, shielded or not, that the Mission Director moves
 * into when the first Solar Particle Event's warning comes; returns the
 * game at the moment the event starts.
 */
function inTheHabitatAsAnEventStarts(shielded: boolean): {
  game: Scenario;
  started: Extract<GameEvent, { kind: "solar-particle-event-started" }>;
  /** Every event of the game-minute it started. */
  atStart: readonly GameEvent[];
} {
  const game = buildAll(scenario().plan("habitat", habitatSite));
  const habitatId = game.state.structures[0]?.id ?? "";
  if (shielded) buildAll(game.plan("regolith-shielding", habitatSite));
  skipTo(game, "solar-particle-event-warning");
  const movedIn = game.campaign.moveMissionDirectorIn(habitatId);
  if (!movedIn.ok) throw new Error(movedIn.message);
  const { found, events } = skipTo(game, "solar-particle-event-started");
  return { game, started: found, atStart: events };
}

describe("the Radiation Dose during a Solar Particle Event", () => {
  it("stays at zero aboard the Lander", () => {
    const game = scenario();

    const started = skipTo(game, "solar-particle-event-started").found;
    expect(game.campaign.forecasts().radiationDose).toEqual({
      millisievertsPerEarthDay: 0,
      minutesUntilLimit: undefined,
    });
    game.campaign.advance(started.endsAtMinute - started.atMinute);

    expect(game.state.radiationDoseMillisieverts).toBe(0);
  });

  it("builds up in a Habitat at the data catalogue's multiple of the usual rate, as forecast, until it ends", () => {
    const { game, started } = inTheHabitatAsAnEventStarts(false);
    const minutes = started.endsAtMinute - started.atMinute;
    const before = game.state.radiationDoseMillisieverts;

    const during = rates.habitat * rules.doseRateMultiplier;
    expect(
      game.campaign.forecasts().radiationDose.millisievertsPerEarthDay,
    ).toBe(during);
    game.campaign.advance(minutes);
    const gained = game.state.radiationDoseMillisieverts - before;
    const afterwards = game.state.radiationDoseMillisieverts;
    game.campaign.advance(minutes);
    const gainedAfterwards = game.state.radiationDoseMillisieverts - afterwards;

    expect(gained).toBeCloseTo((during * minutes) / (24 * 60), 6);
    expect(gainedAfterwards).toBeCloseTo(
      (rates.habitat * minutes) / (24 * 60),
      6,
    );
    expect(gained).toBeGreaterThan(gainedAfterwards);
  });

  it("builds up far more slowly in a shielded Habitat than in an unshielded one", () => {
    const unshielded = inTheHabitatAsAnEventStarts(false);
    const shielded = inTheHabitatAsAnEventStarts(true);
    // The same seed, with Commissioning drawing on the same generator, may
    // put the event at a different time, so compare rates.
    const rateDuring = ({ game }: { game: Scenario }) =>
      game.campaign.forecasts().radiationDose.millisievertsPerEarthDay;

    expect(rateDuring(shielded)).toBe(
      rates.shieldedHabitat * rules.doseRateMultiplier,
    );
    expect(rateDuring(shielded)).toBeLessThan(rateDuring(unshielded));
  });

  it("brings the forecast time until the limit forward, with a warning when that passes a warning level", () => {
    const { game, started, atStart } = inTheHabitatAsAnEventStarts(false);
    const { minutesUntilLimit } = game.campaign.forecasts().radiationDose;
    const left =
      catalogue.radiation.doseLimitMillisieverts -
      game.state.radiationDoseMillisieverts;

    expect(minutesUntilLimit).toBe(
      Math.ceil(
        (left / (rates.habitat * rules.doseRateMultiplier)) * 24 * 60 - 1e-6,
      ),
    );
    // The limit is now nearer than the 3-Earth-Day warning level, which it
    // passed as the event started.
    expect(minutesUntilLimit).toBeLessThan(3 * 24 * 60);
    expect(atStart).toContainEqual({
      kind: "radiation-dose-warning",
      atMinute: started.atMinute,
      minutesUntilLimit,
    });
  });
});
