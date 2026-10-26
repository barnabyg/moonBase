import { catalogue } from "../catalogue";
import type { CampaignState } from "./campaign";
import { MINUTES_PER_EARTH_DAY } from "./clock";
import type { GameEvent } from "./events";
import { nextFraction, type RandomState } from "./random";

/**
 * The next Solar Particle Event, or the one under way, as scheduled. Once
 * it has ended, it stays until the next game-minute, when the one after it
 * is scheduled, so that its last game-minute's dose counts in full.
 */
export interface SolarParticleEventState {
  /** The game-minute its warning comes, counted from the start of the Campaign. */
  warnsAtMinute: number;
  startsAtMinute: number;
  endsAtMinute: number;
}

/**
 * A Solar Particle Event the Mission Director knows of: one whose warning
 * has come, until it ends.
 */
export interface SolarParticleEventSnapshot {
  /** "coming": its warning has come. "under-way": it has started. */
  readonly state: "coming" | "under-way";
  readonly startsAtMinute: number;
  readonly endsAtMinute: number;
  /** How many times the usual dose rate it gives where the Mission Director lives. */
  readonly doseRateMultiplier: number;
}

/**
 * Schedules the Solar Particle Event after the given game-minute, drawing
 * the time until it starts and how long it lasts from the seeded generator.
 */
export function scheduleSolarParticleEvent(
  random: RandomState,
  afterMinute: number,
): SolarParticleEventState {
  const rules = catalogue.solarParticleEvents;
  const startsAtMinute =
    afterMinute +
    drawMinutes(
      random,
      rules.earthDaysBetween.min * MINUTES_PER_EARTH_DAY,
      rules.earthDaysBetween.max * MINUTES_PER_EARTH_DAY,
    );
  return {
    warnsAtMinute: startsAtMinute - Math.round(rules.warningHours * 60),
    startsAtMinute,
    endsAtMinute:
      startsAtMinute +
      drawMinutes(
        random,
        rules.durationHours.min * 60,
        rules.durationHours.max * 60,
      ),
  };
}

/**
 * Says when the scheduled Solar Particle Event's warning comes, when it
 * starts and when it ends, as the game-minute that has just passed reaches
 * each, first scheduling the next one if the last has ended.
 */
export function watchSolarParticleEvents(state: CampaignState): GameEvent[] {
  const atMinute = state.elapsedMinutes;
  if (atMinute > state.solarParticleEvent.endsAtMinute) {
    state.solarParticleEvent = scheduleSolarParticleEvent(
      state.random,
      state.solarParticleEvent.endsAtMinute,
    );
  }
  const event = state.solarParticleEvent;
  const { startsAtMinute, endsAtMinute } = event;
  if (atMinute === event.warnsAtMinute) {
    return [
      {
        kind: "solar-particle-event-warning",
        atMinute,
        startsAtMinute,
        endsAtMinute,
      },
    ];
  }
  if (atMinute === startsAtMinute) {
    return [{ kind: "solar-particle-event-started", atMinute, endsAtMinute }];
  }
  if (atMinute === endsAtMinute) {
    return [{ kind: "solar-particle-event-ended", atMinute }];
  }
  return [];
}

/** The Solar Particle Event the Mission Director knows of, if any. */
export function readSolarParticleEvent(
  state: CampaignState,
): SolarParticleEventSnapshot | undefined {
  const event = state.solarParticleEvent;
  const now = state.elapsedMinutes;
  if (now < event.warnsAtMinute || now >= event.endsAtMinute) return undefined;
  return {
    state: isUnderWay(state, now) ? "under-way" : "coming",
    startsAtMinute: event.startsAtMinute,
    endsAtMinute: event.endsAtMinute,
    doseRateMultiplier: catalogue.solarParticleEvents.doseRateMultiplier,
  };
}

/**
 * How many times the usual dose rate where the Mission Director lives they
 * get in the game-minute starting at the given minute: the data catalogue's
 * multiplier while a Solar Particle Event is under way, otherwise 1.
 */
export function doseRateMultiplier(
  state: CampaignState,
  minute: number,
): number {
  return isUnderWay(state, minute)
    ? catalogue.solarParticleEvents.doseRateMultiplier
    : 1;
}

/** Whether a Solar Particle Event is under way in the game-minute starting at the given minute. */
function isUnderWay(state: CampaignState, minute: number): boolean {
  const event = state.solarParticleEvent;
  return event.startsAtMinute <= minute && minute < event.endsAtMinute;
}

/** Draws a whole number of game-minutes evenly from min to max, both included. */
function drawMinutes(random: RandomState, min: number, max: number): number {
  const low = Math.round(min);
  const high = Math.round(max);
  return low + Math.floor(nextFraction(random) * (high - low + 1));
}
