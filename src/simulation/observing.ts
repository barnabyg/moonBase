import { catalogue } from "../catalogue";
import type { CampaignState } from "./campaign";
import { structurePerformance } from "./condition";
import {
  findStructureType,
  isBroken,
  type StructureState,
} from "./construction";
import type { GameEvent } from "./events";
import { readLunation } from "./lunation";

// The observing programme: the standing Research Task the base's
// telescopes work on together at Night, a round at a time (see
// `ObservingProgramme` in the data catalogue).

/** How close to a whole round of observing counts as one, as telescopes below full performance add fractions of a game-minute. */
const MINUTE_TOLERANCE = 1e-9;

/**
 * Why none of the base's telescopes observed during the latest game-minute:
 * it was Daylight, those not Broken had no power, or every one is Broken.
 */
export type ObservingStop = "daylight" | "no-power" | "broken";

/** How far the observing programme has got, and how the telescopes are doing. */
export interface ObservingProgrammeSnapshot {
  /** How much of the current round is done, from 0 to 1. */
  readonly progress: number;
  /** How many commissioned telescopes the base has. */
  readonly telescopes: number;
  /** How many of them observed during the latest game-minute. */
  readonly observing: number;
  /**
   * Game-minutes until the round is complete, if the telescopes go on
   * observing as they did during the latest game-minute; undefined while
   * none is.
   */
  readonly minutesLeft: number | undefined;
  /**
   * Why none of them observed during the latest game-minute; undefined
   * while one did, or the base has none.
   */
  readonly stoppedFor: ObservingStop | undefined;
}

/** Whether a Structure is a telescope. */
export function isTelescope(structure: StructureState): boolean {
  return findStructureType(structure.structureTypeId)?.telescope === true;
}

/**
 * Whether a Structure is a telescope that observed during the latest
 * game-minute: one whose Night load was on (see `supplyPower`), which is
 * only at Night, while it has power to spare and isn't Broken.
 */
export function observes(structure: StructureState): boolean {
  return isTelescope(structure) && structure.lit;
}

/**
 * Runs the observing programme for a game-minute, once power has been
 * supplied. Each telescope that observed adds its performance's share of the game-minute to the round.
 * Once the round has its length, it is complete: its Science is added to
 * the base's, and the next round starts with anything observed beyond it.
 */
export function runObservingProgramme(state: CampaignState): GameEvent[] {
  const rate = observingRate(state);
  if (rate === 0) return [];
  state.observingMinutes += rate;
  const length = roundMinutes();
  if (state.observingMinutes < length - MINUTE_TOLERANCE) return [];
  state.observingMinutes = Math.max(state.observingMinutes - length, 0);
  const { science } = catalogue.observingProgramme;
  state.science += science;
  return [
    {
      kind: "observing-round-completed",
      atMinute: state.elapsedMinutes,
      science,
    },
  ];
}

export function readObservingProgramme(
  state: CampaignState,
): ObservingProgrammeSnapshot {
  const night = latestMinuteWasNight(state);
  const telescopes = state.structures.filter(isTelescope);
  const observing = telescopes.filter(observes);
  const rate = observingRate(state);
  const left = Math.max(roundMinutes() - state.observingMinutes, 0);
  return {
    progress: Math.min(state.observingMinutes / roundMinutes(), 1),
    telescopes: telescopes.length,
    observing: observing.length,
    minutesLeft:
      rate === 0 ? undefined : Math.ceil(left / rate - MINUTE_TOLERANCE),
    stoppedFor:
      telescopes.length === 0 || observing.length > 0
        ? undefined
        : telescopes.every(isBroken)
          ? "broken"
          : night
            ? "no-power"
            : "daylight",
  };
}

/** Whether the latest game-minute played was Night: at the very start, whether it is now. */
export function latestMinuteWasNight(state: CampaignState): boolean {
  return (
    readLunation(Math.max(state.elapsedMinutes - 1, 0), catalogue.lunation)
      .part === "night"
  );
}

/** How long a round of the observing programme takes one telescope at full performance, in game-minutes. */
export function roundMinutes(): number {
  return Math.round(catalogue.observingProgramme.lengthHours * 60);
}

/** The game-minutes of a round the telescopes observed in the latest game-minute. */
function observingRate(state: CampaignState): number {
  return state.structures
    .filter(observes)
    .reduce((sum, telescope) => sum + structurePerformance(telescope), 0);
}
