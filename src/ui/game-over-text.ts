import { catalogue } from "../catalogue";
import type { CampaignEnd, DeathCause } from "../simulation";
import { formatMoment, millisieverts } from "./format";
import { stockLabel } from "./labels";

// How the Mission Director died, in words, for the game-over screen and the
// notification list.

/**
 * Explains how the Mission Director died, for the game-over screen, for
 * example "The oxygen in the Habitat ran out on Earth Day 30, 18:17, and
 * the Mission Director died at once."
 */
export function formatDeath(end: CampaignEnd): string {
  const cause = describeCause(end.cause);
  return `${cause.charAt(0).toUpperCase()}${cause.slice(1)} on ${formatMoment(end.atMinute)}, and the Mission Director died at once.`;
}

/** What killed the Mission Director, for example "the oxygen in the Habitat ran out". */
export function describeCause(cause: DeathCause): string {
  switch (cause.kind) {
    case "ran-out":
      return `the ${stockLabel(cause.stockId).toLowerCase()} in the Habitat ran out`;
    case "habitat-power-failed":
      return "Habitat power failed";
    case "radiation-dose-limit":
      return `Radiation Dose reached the ${millisieverts(catalogue.radiation.doseLimitMillisieverts, 0)} limit`;
  }
}
