import { catalogue } from "../catalogue";
import type { CampaignState } from "./campaign";
import { MINUTES_PER_EARTH_DAY } from "./clock";
import type { GameEvent } from "./events";
import { fellToWarningLevel, killMissionDirector } from "./mission-director";

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

export function forecastRadiationDose(
  state: CampaignState,
): RadiationDoseForecast {
  const rate = doseRate(state);
  return {
    millisievertsPerEarthDay: rate,
    minutesUntilLimit: rate > 0 ? minutesUntilLimit(state, rate) : undefined,
  };
}

/**
 * Adds a game-minute of Radiation Dose where the Mission Director lives. If
 * it reaches the limit, they die at once, which ends the Campaign; otherwise
 * a warning comes as the time until it would falls to one of the warning
 * levels set in the data catalogue.
 */
export function absorbRadiationDose(state: CampaignState): GameEvent[] {
  const rate = doseRate(state);
  if (rate === 0) return [];
  const before = minutesUntilLimit(state, rate);
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
  return fellToWarningLevel(warningMinutes, before, after)
    ? [
        {
          kind: "radiation-dose-warning",
          atMinute: state.elapsedMinutes,
          minutesUntilLimit: after,
        },
      ]
    : [];
}

/**
 * The dose rate where the Mission Director lives, in millisieverts an Earth
 * Day, while they are alive.
 */
function doseRate(state: CampaignState): number {
  if (state.ended !== undefined) return 0;
  const rates = catalogue.radiation.doseRateMillisievertsPerEarthDay;
  return state.missionDirector.residence === "habitat"
    ? rates.habitat
    : rates.lander;
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
