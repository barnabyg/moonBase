import { catalogue } from "../catalogue";
import type {
  BulkResourceForecast,
  DiggingHold,
  Snapshot,
} from "../simulation";
import { formatKilograms, formatShortDuration } from "./format";
import { inSentence, machineLabel, resourceLabel } from "./labels";
import type { Stat } from "./stat";

// The status panel's words for digging and the base's bulk resources, and
// the summary beside their folded section's title.

/**
 * Sums up the base's bulk resources for their folded section: how long the
 * one that will run out soonest lasts, then how much there is of the first
 * other in stock, which is Regolith to build with once the base has any, for
 * example "Silicon 2d · Regolith 1250 kg", or that there is none in stock.
 */
export function summariseBulkResources(
  bulkResources: Snapshot["bulkResources"],
  forecasts: readonly BulkResourceForecast[],
): string {
  const held = bulkResources.filter((stock) => stock.kilograms > 0);
  if (held.length === 0) return "none in stock";
  const left = (resourceId: string): number =>
    forecasts.find((forecast) => forecast.resourceId === resourceId)
      ?.minutesUntilEmpty ?? Infinity;
  const soonest = held.reduce((first, stock) =>
    left(stock.resourceId) < left(first.resourceId) ? stock : first,
  );
  const falling = left(soonest.resourceId) !== Infinity;
  const other = held.find((stock) => !falling || stock !== soonest);
  return [
    ...(falling
      ? [
          `${resourceLabel(soonest.resourceId)} ${formatShortDuration(left(soonest.resourceId), true)}`,
        ]
      : []),
    ...(other === undefined
      ? []
      : [
          `${resourceLabel(other.resourceId)} ${formatKilograms(other.kilograms)}`,
        ]),
  ].join(" · ");
}

/**
 * Says why the resource the excavator digs isn't being dug though the base
 * needs it, for example "not dug while the excavator is parked for Night".
 */
export function formatDiggingHold(hold: DiggingHold): string {
  const machine = inSentence(machineLabel(catalogue.digging.machineTypeId));
  const why =
    hold === "parked-for-night"
      ? "parked for Night"
      : hold === "construction"
        ? "busy with Construction"
        : hold === "broken"
          ? "Broken"
          : "undergoing Maintenance";
  return `not dug while the ${machine} is ${why}`;
}

/**
 * Lists the base's stock of bulk resources, each with its amount and,
 * if it is falling, roughly how long it will last at the current rate, for
 * example "Water ice", "190 kg" and "~7d 22h". One with a limit is shown against
 * it, for example "450.0 of 450 kg", and while the Plants are holding it there the
 * line says so. The one the excavator digs says why it isn't being dug, if
 * the base needs it and something keeps the excavator from it (see
 * `formatDiggingHold`). Each says whether it is a warning, as one falling with
 * little time left is, and whether it is in play, with any in stock or being
 * made or used.
 */
export function formatBulkResources(
  bulkResources: Snapshot["bulkResources"],
  forecasts: readonly BulkResourceForecast[],
): (Stat & {
  readonly label: string;
  readonly empty: boolean;
  readonly warning: boolean;
  readonly inPlay: boolean;
})[] {
  const warnFrom = catalogue.bulkResourceWarningEarthDaysLeft * 24 * 60;
  return bulkResources.map((stock) => {
    const label = resourceLabel(stock.resourceId);
    // With a limit of none, as with no Plant to hold it, there is nothing to say of it.
    const value =
      stock.limitKilograms === undefined || stock.limitKilograms === 0
        ? formatKilograms(stock.kilograms)
        : `${stock.kilograms.toFixed(1)} of ${stock.limitKilograms} kg`;
    const empty = stock.kilograms < 1;
    const forecast = forecasts.find(
      (candidate) => candidate.resourceId === stock.resourceId,
    );
    const perDay = (forecast?.kilogramsPerHour ?? 0) * 24;
    const minutes = forecast?.minutesUntilEmpty;
    // How fast it is changing, if at all, and how long it lasts if falling.
    const rate =
      Math.abs(perDay) < 0.05
        ? undefined
        : `${perDay > 0 ? "+" : "−"}${Math.abs(perDay).toFixed(1)} kg/day`;
    const lasts =
      minutes === undefined || stock.kilograms === 0
        ? undefined
        : `~${formatShortDuration(minutes, true)}`;
    const held =
      forecast?.holdingFull !== true
        ? undefined
        : stock.kilograms > (stock.limitKilograms ?? Infinity)
          ? "holding full, over the limit"
          : "holding full";
    const diggingHold =
      forecast?.diggingHold === undefined
        ? undefined
        : formatDiggingHold(forecast.diggingHold);
    const note = [held, rate, lasts, diggingHold]
      .filter((part) => part !== undefined)
      .join(", ");
    const shown = {
      label,
      value,
      empty,
      // With none left, it may be that nothing wants any.
      warning:
        stock.kilograms > 0 && minutes !== undefined && minutes <= warnFrom,
      inPlay: stock.kilograms > 0 || note !== "",
    };
    return note === "" ? shown : { ...shown, note };
  });
}
