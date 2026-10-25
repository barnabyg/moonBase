import type { ClockSnapshot } from "../simulation";

const twoDigits = (value: number): string => String(value).padStart(2, "0");

/**
 * Formats the game clock to the hour, for example "Earth Day 3, 07:00". The
 * minutes are left out because at 1x they change six times a real second,
 * which is distracting.
 */
export function formatClock(clock: ClockSnapshot): string {
  return `Earth Day ${clock.earthDay}, ${twoDigits(clock.hour)}:00`;
}
