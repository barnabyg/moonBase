import { catalogue } from "../catalogue";
import type { CampaignState } from "./campaign";
import { MINUTES_PER_EARTH_DAY } from "./clock";
import { isBuried, isShielded, isWaterWalled } from "./construction";
import type { GameEvent } from "./events";
import { fellToWarningLevel, killMissionDirector } from "./mission-director";
import {
  doseRateMultiplier,
  readSolarParticleEvent,
} from "./solar-particle-events";

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
  /**
   * Game-minutes until it reaches the limit, following any Solar Particle
   * Event the Mission Director knows of through to its end; undefined while
   * it isn't rising.
   */
  readonly minutesUntilLimit: number | undefined;
}

/**
 * How fast the Mission Director's Radiation Dose is rising, in the
 * game-minute about to start, and when it reaches the limit.
 */
export function forecastRadiationDose(
  state: CampaignState,
): RadiationDoseForecast {
  return {
    millisievertsPerEarthDay: doseRate(state, state.elapsedMinutes),
    minutesUntilLimit: minutesUntilLimit(state),
  };
}

/**
 * The forecast to compare with at the end of the game-minute about to start,
 * for `absorbRadiationDose`: the time until the Radiation Dose reaches the
 * limit as things stand. If they have moved since the last game-minute, they
 * had no forecast where they are now, so there is none, and the warning for
 * a move that brings the limit near comes at once.
 */
export function minutesUntilLimitAsMinuteStarts(
  state: CampaignState,
): number | undefined {
  const { missionDirector } = state;
  if (
    missionDirector.residence === "habitat" &&
    missionDirector.movedInAtMinute === state.elapsedMinutes
  ) {
    return undefined;
  }
  return minutesUntilLimit(state);
}

/**
 * Adds the game-minute that has just passed's Radiation Dose where the
 * Mission Director lives. If it reaches the limit, they die at once, which
 * ends the Campaign; otherwise a warning comes as the time until it would
 * falls to one of the warning levels set in the data catalogue, given the
 * forecast as the game-minute started. So a Solar Particle Event that
 * brings the limit nearer all at once gives a warning as it is announced.
 */
export function absorbRadiationDose(
  state: CampaignState,
  minutesUntilLimitBefore: number | undefined,
): GameEvent[] {
  const rate = doseRate(state, state.elapsedMinutes - 1);
  if (rate === 0) return [];
  const perMinute = rate / MINUTES_PER_EARTH_DAY;
  state.radiationDoseMillisieverts += perMinute;
  const { doseLimitMillisieverts } = catalogue.radiation;
  if (
    doseLimitMillisieverts - state.radiationDoseMillisieverts <=
    perMinute * MINUTE_TOLERANCE
  ) {
    state.radiationDoseMillisieverts = Math.max(
      state.radiationDoseMillisieverts,
      doseLimitMillisieverts,
    );
    return killMissionDirector(state, { kind: "radiation-dose-limit" });
  }
  const warningMinutes = catalogue.radiation.warningEarthDaysLeft.map(
    (earthDays) => earthDays * MINUTES_PER_EARTH_DAY,
  );
  const after = minutesUntilLimit(state);
  return after !== undefined &&
    fellToWarningLevel(
      warningMinutes,
      minutesUntilLimitBefore ?? Infinity,
      after,
    )
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
 * The dose rate where the Mission Director lives in the game-minute
 * starting at the given minute, in millisieverts an Earth Day, while they
 * are alive: none aboard the Lander, and in a Habitat as `habitatDoseRate`
 * says.
 */
function doseRate(state: CampaignState, minute: number): number {
  if (state.ended !== undefined) return 0;
  const { missionDirector } = state;
  const multiplier = doseRateMultiplier(state, minute);
  if (missionDirector.residence === "lander") {
    return (
      catalogue.radiation.doseRateMillisievertsPerEarthDay.lander * multiplier
    );
  }
  const habitat = state.structures.find(
    (structure) => structure.id === missionDirector.habitatId,
  );
  return habitatDoseRate(
    {
      shielded: habitat !== undefined && isShielded(state, habitat),
      waterWalled: habitat !== undefined && isWaterWalled(state, habitat),
      buried: habitat !== undefined && isBuried(habitat),
    },
    multiplier,
  );
}

/**
 * The dose rate inside a Habitat, in millisieverts an Earth Day: less once
 * it is shielded, less again once it is water-walled, and least of all if it
 * is buried, and multiplied during a Solar Particle Event by the given
 * multiplier.
 */
export function habitatDoseRate(
  habitat: {
    readonly shielded: boolean;
    readonly waterWalled: boolean;
    readonly buried: boolean;
  },
  solarParticleEventMultiplier: number,
): number {
  const rates = catalogue.radiation.doseRateMillisievertsPerEarthDay;
  const usual = habitat.buried
    ? rates.buriedHabitat
    : habitat.waterWalled
      ? rates.waterWalledHabitat
      : habitat.shielded
        ? rates.shieldedHabitat
        : rates.habitat;
  return usual * solarParticleEventMultiplier;
}

/**
 * The whole game-minutes until the dose reaches the limit, as things stand:
 * at the dose rate now, until a Solar Particle Event the Mission Director
 * knows of starts, then at its rate until it ends, then at the usual rate
 * again. Undefined if it never does. Events not yet announced are left out.
 */
function minutesUntilLimit(state: CampaignState): number | undefined {
  const now = state.elapsedMinutes;
  const known = readSolarParticleEvent(state);
  // Where the dose rate changes, as far as the Mission Director knows.
  const changes =
    known === undefined
      ? []
      : [known.startsAtMinute, known.endsAtMinute].filter(
          (minute) => minute > now,
        );
  let left =
    catalogue.radiation.doseLimitMillisieverts -
    state.radiationDoseMillisieverts;
  let from = now;
  for (const until of [...changes, Infinity]) {
    const perMinute = doseRate(state, from) / MINUTES_PER_EARTH_DAY;
    if (perMinute > 0) {
      const minutes = Math.max(
        Math.ceil(left / perMinute - MINUTE_TOLERANCE),
        0,
      );
      if (from + minutes <= until) return from - now + minutes;
      left -= perMinute * (until - from);
    }
    from = until;
  }
  return undefined;
}
