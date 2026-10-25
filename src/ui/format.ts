import type { ClockSnapshot, LunationSnapshot } from "../simulation";

const twoDigits = (value: number): string => String(value).padStart(2, "0");

/**
 * Formats the game clock to the hour, for example "Earth Day 3, 07:00". The
 * minutes are left out because at 1x they change six times a real second,
 * which is distracting.
 */
export function formatClock(clock: ClockSnapshot): string {
  return `Earth Day ${clock.earthDay}, ${twoDigits(clock.hour)}:00`;
}

const plural = (count: number, unit: string): string =>
  `${count} ${unit}${count === 1 ? "" : "s"}`;

/**
 * Formats the current part of the Lunation and the time left in it, for
 * example "Daylight: 7 Earth Days 23 hours left". The time left is rounded up
 * to the hour, so that it adds up with the clock, which is rounded down.
 */
export function formatLunation(lunation: LunationSnapshot): string {
  const part = lunation.part === "daylight" ? "Daylight" : "Night";
  const totalHours = Math.ceil(lunation.minutesRemaining / 60);
  const earthDays = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const parts = [
    ...(earthDays > 0 ? [plural(earthDays, "Earth Day")] : []),
    ...(hours > 0 || earthDays === 0 ? [plural(hours, "hour")] : []),
  ];
  return `${part}: ${parts.join(" ")} left`;
}
