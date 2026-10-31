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

/**
 * How many parts of a Lunation a stock's forecast looks ahead: far enough to
 * see a stock that rises in Daylight run out in the Night after.
 */
const FORECAST_LUNATION_PARTS = 6;

/**
 * The game-minutes until a stock runs out, or Infinity if it doesn't within
 * the look-ahead, when what makes it may stand idle at Night, as Plants then
 * run only on what the battery banks hold to spare. So it counts on none
 * through a Night: the rest of a Daylight at the rate it is changing now, then
 * each Night at what is used, and each Daylight after again at that rate. At
 * Night, when what the Plants make in Daylight isn't known, it looks only as
 * far as the next Daylight. `minutesLeft` is how long an amount lasts at a
 * rate of change.
 */
export function minutesUntilEmptyThroughLunations(
  elapsedMinutes: number,
  amount: number,
  netPerMinute: number,
  usedPerMinute: number,
  minutesLeft: (amount: number, perMinute: number) => number,
): number {
  const daylightRate =
    readLunation(elapsedMinutes, catalogue.lunation).part === "daylight"
      ? netPerMinute
      : undefined;
  // Each whole Lunation from the next one on changes the stock the same way.
  const { daylight, lunation } = lunationMinutes(catalogue.lunation);
  const perLunation =
    (daylightRate ?? 0) * daylight - usedPerMinute * (lunation - daylight);
  let left = amount;
  let skipped = 0;
  let parts = 0;
  for (const part of partsAhead(elapsedMinutes, Infinity)) {
    if (part.daylight && daylightRate === undefined) return Infinity;
    parts += 1;
    // Skipping leaves a Lunation or two to run out in, at most.
    if (parts > 2 * FORECAST_LUNATION_PARTS) return Infinity;
    if (parts === FORECAST_LUNATION_PARTS + 1) {
      // Past the look-ahead, it only ever runs out if each Lunation leaves
      // less: skip all but the last of the whole Lunations it lasts.
      if (perLunation >= 0) return Infinity;
      const lunations = Math.max(Math.floor(left / -perLunation) - 1, 0);
      skipped = lunations * lunation;
      left += lunations * perLunation;
    }
    const rate = part.daylight ? (daylightRate ?? 0) : -usedPerMinute;
    const lasts = minutesLeft(left, rate);
    if (lasts <= part.minutes) return skipped + part.start + lasts;
    left += rate * part.minutes;
  }
  return Infinity;
}

function toMinutes(earthDays: number): number {
  return Math.round(earthDays * MINUTES_PER_EARTH_DAY);
}
