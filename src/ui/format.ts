import type { ClockSnapshot } from "../simulation";

const twoDigits = (value: number): string => String(value).padStart(2, "0");

/** Formats the game clock as, for example, "Earth Day 3, 07:05". */
export function formatClock(clock: ClockSnapshot): string {
  return `Earth Day ${clock.earthDay}, ${twoDigits(clock.hour)}:${twoDigits(clock.minute)}`;
}
