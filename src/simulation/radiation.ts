import { catalogue } from "../catalogue";
import type { CampaignState } from "./campaign";
import { MINUTES_PER_EARTH_DAY } from "./clock";
import { isShielded } from "./construction";
import type { GameEvent } from "./events";
import { fellToWarningLevel, killMissionDirector } from "./mission-director";
import { doseRateMultiplier } from "./solar-particle-events";

/**
 * How far short of a whole game-minute the dose may be and still count as
 * reaching the limit in it, so that rounding in the dose never makes it
 * reach the limit a game-minute later or earlier than forecast.
 */
const MINUTE_TOLERANCE = 1e-6;

export interface RadiationDoseForecast {
  /**
   * How fast the Mission Director's Radiation Dose is rising where they
   * live: zero aboard the Lander, and once they have died.
   */
  readonly millisievertsPerEarthDay: number;
  /** Game-minutes until it reaches the limit, or undefined while it isn't rising. */
  readonly minutesUntilLimit: number | undefined;
}

/**
 * How fast the Mission Director's Radiation Dose is rising, in the
 * game-minute about to start, and when it reaches the limit at that rate.
 */
export function forecastRadiationDose(
  state: CampaignState,
): RadiationDoseForecast {
  const rate = doseRate(state, state.elapsedMinutes);
  return {
    millisievertsPerEarthDay: rate,
    minutesUntilLimit: rate > 0 ? minutesUntilLimit(state, rate) : undefined,
  };
}

/**
 * Adds the game-minute that has just passed's Radiation Dose where the
 * Mission Director lives. If it reaches the limit, they die at once, which
 * ends the Campaign; otherwise a warning comes as the time until it would
 * falls to one of the warning levels set in the data catalogue, given the
 * forecast as the game-minute started. So a Solar Particle Event that
 * brings the limit nearer all at once gives a warning as it starts.
 */
export function absorbRadiationDose(
  state: CampaignState,
  minutesUntilLimitBefore: number | undefined,
): GameEvent[] {
  const rate = doseRate(state, state.elapsedMinutes - 1);
  if (rate === 0) return [];
  state.radiationDoseMillisieverts += rate / MINUTES_PER_EARTH_DAY;
  const after = minutesUntilLimit(state, rate);
  if (after === 0) {
    const { doseLimitMillisieverts } = catalogue.radiation;
    state.radiationDoseMillisieverts = Math.max(
      state.radiationDoseMillisieverts,
      doseLimitMillisieverts,
    );
    return killMissionDirector(state, { kind: "radiation-dose-limit" });
  }
  const warningMinutes = catalogue.radiation.warningEarthDaysLeft.map(
    (earthDays) => earthDays * MINUTES_PER_EARTH_DAY,
  );
  const nowRate = doseRate(state, state.elapsedMinutes);
  const now = nowRate > 0 ? minutesUntilLimit(state, nowRate) : undefined;
  return now !== undefined &&
    fellToWarningLevel(warningMinutes, minutesUntilLimitBefore ?? Infinity, now)
    ? [
        {
          kind: "radiation-dose-warning",
          atMinute: state.elapsedMinutes,
          minutesUntilLimit: now,
        },
      ]
    : [];
}

/**
 * The dose rate where the Mission Director lives in the game-minute
 * starting at the given minute, in millisieverts an Earth Day, while they
 * are alive: less in a Habitat once it is shielded, and multiplied during a
 * Solar Particle Event.
 */
function doseRate(state: CampaignState, minute: number): number {
  if (state.ended !== undefined) return 0;
  const rates = catalogue.radiation.doseRateMillisievertsPerEarthDay;
  const { missionDirector } = state;
  const habitat =
    missionDirector.residence === "habitat"
      ? state.structures.find(
          (structure) => structure.id === missionDirector.habitatId,
        )
      : undefined;
  const usual =
    missionDirector.residence === "lander"
      ? rates.lander
      : habitat !== undefined && isShielded(state, habitat)
        ? rates.shieldedHabitat
        : rates.habitat;
  return usual * doseRateMultiplier(state, minute);
}

/** The whole game-minutes until the dose reaches the limit at the given rate. */
function minutesUntilLimit(state: CampaignState, rate: number): number {
  const left =
    catalogue.radiation.doseLimitMillisieverts -
    state.radiationDoseMillisieverts;
  return Math.max(
    Math.ceil(left / (rate / MINUTES_PER_EARTH_DAY) - MINUTE_TOLERANCE),
    0,
  );
}
