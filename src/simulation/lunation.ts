import type { LunationSchedule } from "../catalogue";
import { MINUTES_PER_EARTH_DAY } from "./clock";

export type LunationPart = "daylight" | "night";

export interface LunationSnapshot {
  readonly part: LunationPart;
  /** Game-minutes until this part of the Lunation ends and the other begins. */
  readonly minutesRemaining: number;
}

/** Where the Campaign stands in the Lunation after the given game-minutes. */
export function readLunation(
  elapsedMinutes: number,
  schedule: LunationSchedule,
): LunationSnapshot {
  const daylight = toMinutes(schedule.daylightEarthDays);
  const lunation = daylight + toMinutes(schedule.nightEarthDays);
  // A Campaign begins part-way through Daylight, so count from the start of
  // that Daylight.
  const sinceDaylightBegan =
    (elapsedMinutes +
      daylight -
      toMinutes(schedule.initialDaylightRemainingEarthDays)) %
    lunation;
  return sinceDaylightBegan < daylight
    ? { part: "daylight", minutesRemaining: daylight - sinceDaylightBegan }
    : { part: "night", minutesRemaining: lunation - sinceDaylightBegan };
}

function toMinutes(earthDays: number): number {
  return Math.round(earthDays * MINUTES_PER_EARTH_DAY);
}
