import { catalogue, type LunationSchedule } from "../catalogue";
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
  const { daylight, lunation } = lunationMinutes(schedule);
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

/** The lengths of Daylight and of a whole Lunation, in game-minutes. */
export function lunationMinutes(schedule: LunationSchedule): {
  daylight: number;
  lunation: number;
} {
  const daylight = toMinutes(schedule.daylightEarthDays);
  return { daylight, lunation: daylight + toMinutes(schedule.nightEarthDays) };
}

/**
 * The given number of parts of the Lunation ahead, starting with what is
 * left of the current one: whether each is Daylight, how many game-minutes
 * from now it starts, and how many game-minutes it lasts.
 */
export function* partsAhead(
  elapsedMinutes: number,
  count: number,
  schedule: LunationSchedule = catalogue.lunation,
): Generator<{ daylight: boolean; start: number; minutes: number }> {
  const { daylight, lunation } = lunationMinutes(schedule);
  const now = readLunation(elapsedMinutes, schedule);
  let isDaylight = now.part === "daylight";
  let minutes = now.minutesRemaining;
  let start = 0;
  for (let parts = 0; parts < count; parts++) {
    yield { daylight: isDaylight, start, minutes };
    start += minutes;
    isDaylight = !isDaylight;
    minutes = isDaylight ? daylight : lunation - daylight;
  }
}

function toMinutes(earthDays: number): number {
  return Math.round(earthDays * MINUTES_PER_EARTH_DAY);
}
