const MINUTES_PER_HOUR = 60;
const MINUTES_PER_EARTH_DAY = 24 * MINUTES_PER_HOUR;

export interface ClockSnapshot {
  /** Game-minutes since the Campaign began. */
  readonly elapsedMinutes: number;
  /** The Earth Day of the Campaign, counting from 1. */
  readonly earthDay: number;
  readonly hour: number;
  readonly minute: number;
}

export function readClock(elapsedMinutes: number): ClockSnapshot {
  return {
    elapsedMinutes,
    earthDay: Math.floor(elapsedMinutes / MINUTES_PER_EARTH_DAY) + 1,
    hour: Math.floor(
      (elapsedMinutes % MINUTES_PER_EARTH_DAY) / MINUTES_PER_HOUR,
    ),
    minute: elapsedMinutes % MINUTES_PER_HOUR,
  };
}
