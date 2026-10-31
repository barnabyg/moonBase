import {
  habitatDoseRate,
  readClock,
  type ClockSnapshot,
  type LunationSnapshot,
} from "../simulation";

// Low-level formatters for figures in the game's units, shared by every
// panel: times and durations, power, mass, money, Science and percentages.

const twoDigits = (value: number): string => String(value).padStart(2, "0");

/**
 * Formats the game clock to the hour, for example "Earth Day 3, 07:00". The
 * minutes are left out because at 1x they change six times a real second,
 * which is distracting.
 */
export function formatClock(clock: ClockSnapshot): string {
  return `Earth Day ${clock.earthDay}, ${twoDigits(clock.hour)}:00`;
}

/** Formats a moment in the Campaign to the minute, for example "Earth Day 23, 05:17". */
export function formatMoment(atMinute: number): string {
  const clock = readClock(atMinute);
  return `Earth Day ${clock.earthDay}, ${twoDigits(clock.hour)}:${twoDigits(clock.minute)}`;
}

/** Counts something in words, for example "1 hour" or "3 spare Components". */
export const plural = (count: number, unit: string): string =>
  `${count} ${unit}${count === 1 ? "" : "s"}`;

/**
 * Formats the current part of the Lunation and the time left in it, for
 * example "Daylight · 7d 23h left". The time left is rounded up to the hour,
 * so that it adds up with the clock, which is rounded down.
 */
export function formatLunation(lunation: LunationSnapshot): string {
  const part = lunation.part === "daylight" ? "Daylight" : "Night";
  return `${part} · ${formatShortDuration(lunation.minutesRemaining)} left`;
}

/**
 * Says what the Radiation Dose rate is in a Habitat with no Solar Particle
 * Event under way, in millisieverts, for example "0.15 mSv".
 */
export function formatDoseRate(
  habitat: Parameters<typeof habitatDoseRate>[0],
): string {
  return `${formatMillisieverts(habitatDoseRate(habitat, 1))} mSv`;
}

/**
 * A dose rate to as many places as it takes to show one a Buried Habitat cuts
 * it to: three below a tenth of a millisievert, and two above.
 */
export function formatMillisieverts(millisieverts: number): string {
  return millisieverts.toFixed(millisieverts < 0.1 ? 3 : 2);
}

/**
 * Formats a span of game time in Earth Days and hours for the status panel,
 * where space is short, for example "7d 23h", rounded up to the hour. In
 * whole Earth Days only, it leaves out the hours past them, for a folded
 * section's title, where there is only room for one unit: "7d", or "5h"
 * under an Earth Day.
 */
export function formatShortDuration(
  minutes: number,
  wholeEarthDays = false,
): string {
  const totalHours = Math.ceil(minutes / 60);
  const earthDays = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return [
    ...(earthDays > 0 ? [`${earthDays}d`] : []),
    ...(earthDays === 0 || (hours > 0 && !wholeEarthDays) ? [`${hours}h`] : []),
  ].join(" ");
}

/**
 * Formats a span of game time in Earth Days and hours, for example "7 Earth
 * Days 23 hours", rounded up to the hour.
 */
export function formatDuration(minutes: number): string {
  const totalHours = Math.ceil(minutes / 60);
  const earthDays = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return [
    ...(earthDays > 0 ? [plural(earthDays, "Earth Day")] : []),
    ...(hours > 0 || earthDays === 0 ? [plural(hours, "hour")] : []),
  ].join(" ");
}

/** Formats power and energy, for example "0.30 kW" and "42.0 kWh". */
export const kilowatts = (value: number): string => `${value.toFixed(2)} kW`;
const kilowattHours = (value: number): string => `${value.toFixed(1)} kWh`;

/** Says how much energy is stored out of how much there is room for, for example "42.0 / 60.0 kWh". */
export function formatCharge(
  storedKilowattHours: number,
  capacityKilowattHours: number,
): string {
  return `${storedKilowattHours.toFixed(1)} / ${kilowattHours(capacityKilowattHours)}`;
}

/**
 * Formats a change in a figure with its sign, for example "+9.70 kW" or
 * "−0.30 kW", leaving the sign off one that rounds to nothing.
 */
export function signed(value: number, digits: number, unit: string): string {
  const shown = Math.abs(value).toFixed(digits);
  if (Number(shown) === 0) return `${shown} ${unit}`;
  return `${value > 0 ? "+" : "−"}${shown} ${unit}`;
}

/**
 * Formats a Condition to the whole percent, for example "73%". Only a
 * Broken one shows as 0%, and one that has worn down at all shows below
 * 100% once it is half a percentage point down.
 */
export function formatCondition(conditionPercent: number): string {
  if (conditionPercent <= 0) return "0%";
  return `${Math.min(Math.max(Math.round(conditionPercent), 1), 100)}%`;
}

/**
 * Says how well something works, if its Condition has cut its output, for
 * example "working at 80%"; undefined at full performance or once Broken.
 */
export function formatPerformance(performance: number): string | undefined {
  return performance > 0 && performance < 1
    ? `working at ${Math.max(Math.round(performance * 100), 1)}%`
    : undefined;
}

/** Formats a radiation dose, for example "600 mSv". */
export const millisieverts = (value: number, digits: number): string =>
  `${value.toFixed(digits)} mSv`;

/**
 * Says how far a stage of work has got, to the whole percent rounded down,
 * so that it shows 100% only once done, for example "Assembly: 42%".
 */
export function formatStageProgress(
  stage: string,
  stageProgress: number,
): string {
  return `${stage}: ${Math.floor(stageProgress * 100)}%`;
}

/**
 * Formats an amount of money to the nearest $0.1M, for example "$12.5M" for
 * 12.5 million dollars, or "$60M" for 60.004 million.
 */
export function formatMillionDollars(value: number): string {
  return `$${Math.round(value * 10) / 10}M`;
}

/** Formats an amount in kilograms, rounded down to the whole kilogram, for example "1250 kg". */
export function formatKilograms(kilograms: number): string {
  return `${Math.floor(kilograms)} kg`;
}

/** Says how much Funding the base programme has, for example "$400M". */
export function formatFunding(fundingMillionDollars: number): string {
  return formatMillionDollars(fundingMillionDollars);
}

/** Says how much Science the base has or a Research Task pays, for example "20 Science". */
export function formatScience(science: number): string {
  return `${science} Science`;
}

/** Joins phrases the way a sentence would, for example "a, b and c". */
export function listInWords(phrases: readonly string[]): string {
  const items = [...phrases];
  const last = items.pop();
  return items.length === 0
    ? (last ?? "")
    : `${items.join(", ")} and ${last ?? ""}`;
}

/**
 * Formats a stock an Export can be loaded from, rounded down to the tenth of
 * a kilogram the player can set, for example "46.5 kg".
 */
export function formatExportStock(kilograms: number): string {
  return `${Math.floor(kilograms * 10) / 10} kg`;
}

/**
 * Formats an amount the player sets in kilograms, to the nearest tenth, for
 * example "35.5".
 */
export function formatKilogramAmount(kilograms: number): string {
  return String(Math.round(kilograms * 10) / 10);
}
