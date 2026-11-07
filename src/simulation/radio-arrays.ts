import { catalogue } from "../catalogue";
import type { CampaignState } from "./campaign";
import { structurePerformance } from "./condition";
import {
  findStructureType,
  isBroken,
  type StructureState,
} from "./construction";
import type { GameEvent, RadioRoundLoss } from "./events";
import { structuresInTheWay } from "./keep-clear";
import {
  loseRound,
  roundFraction,
  roundMinutesLeft,
  workRound,
} from "./rounds";

// The radio telescope array (ADR-0009). It isn't a Plant: it takes nothing from
// the base's stocks, and draws its power steadily, by day and at Night, as any
// Structure does (see `supplyPower`), so the forecasts count it with no more code.
// What it has that no other Structure does is here: rounds of its own survey,
// worked through Daylight and Night alike, faster for each antenna field it has,
// which a shortage of power or a Plant within its quiet radius loses (see
// `rounds.ts` and `keep-clear.ts`). It keeps its round's progress where an
// infrared telescope does, as `observedMinutes`.

/** Whether a Structure is a radio telescope array. */
export function isRadioArray(
  structure: Pick<StructureState, "structureTypeId">,
): boolean {
  return findStructureType(structure.structureTypeId)?.radioArray !== undefined;
}

/**
 * How many antenna fields a radio telescope array works with, none for any other
 * Structure: each adds its performance's share of a game-minute to the round for
 * each game-minute it works. An array is built with one, its own, and for now
 * has only that.
 */
export function antennaFields(
  array: Pick<StructureState, "structureTypeId">,
): number {
  return isRadioArray(array) ? 1 : 0;
}

/**
 * The share of a game-minute a radio telescope array adds to its round for each
 * game-minute it works: its performance for each antenna field.
 */
function rateOf(array: StructureState): number {
  return structurePerformance(array) * antennaFields(array);
}

/** Whether something an array is kept clear of stands within its radius. */
function isCrowded(state: CampaignState, array: StructureState): boolean {
  return (
    structuresInTheWay(
      array.structureTypeId,
      array.position,
      state.structures,
      array.id,
    ).length > 0
  );
}

/**
 * Runs every radio telescope array's round for a game-minute, once power has
 * been supplied. One with power and no Plant within its quiet radius adds its
 * rate's share of the game-minute (see `rateOf`). Once the round has its length,
 * its Science is added to the base's, and the next starts with anything done
 * beyond it. One without power, or with a Plant within its quiet radius, loses
 * what it has done. A Broken one keeps it for its repair.
 */
export function runRadioArrays(state: CampaignState): GameEvent[] {
  return state.structures.flatMap((structure): GameEvent[] => {
    const rounds = findStructureType(structure.structureTypeId)?.radioArray;
    if (rounds === undefined || isBroken(structure)) return [];
    const reason: RadioRoundLoss | undefined = isCrowded(state, structure)
      ? "plant"
      : structure.powered
        ? undefined
        : "power";
    if (reason === undefined) {
      const completed = workRound(
        state,
        structure,
        rounds,
        "observedMinutes",
        rateOf(structure),
      );
      return completed
        ? [
            {
              kind: "radio-round-completed",
              atMinute: state.elapsedMinutes,
              structureId: structure.id,
              structureTypeId: structure.structureTypeId,
              science: rounds.science,
            },
          ]
        : [];
    }
    return loseRound(structure, "observedMinutes", QUIET_MINUTES)
      ? [
          {
            kind: "radio-round-lost",
            atMinute: state.elapsedMinutes,
            structureId: structure.id,
            structureTypeId: structure.structureTypeId,
            reason,
          },
        ]
      : [];
  });
}

/**
 * A round no older than this goes without a notification as it is lost, as a
 * Plant's round no older than its batch does: an hour.
 */
const QUIET_MINUTES = 60;

/** Why a radio telescope array didn't work during the latest game-minute. */
export type RadioArrayStop = "plant" | "power" | "broken";

/** A radio telescope array, as the player sees it. */
export interface RadioArraySnapshot {
  readonly structureId: string;
  /** Whether it worked during the latest game-minute. */
  readonly working: boolean;
  /** How much of its current round is done, from 0 to 1. */
  readonly progress: number;
  /**
   * Game-minutes of work at its rate until its round is complete; undefined
   * once it is Broken.
   */
  readonly minutesLeft: number | undefined;
  /** Why it didn't work during the latest game-minute; undefined while it did. */
  readonly stoppedFor: RadioArrayStop | undefined;
  /** The ids of the Plants within its quiet radius, which stop it working. */
  readonly inTheWay: readonly string[];
  /** How many antenna fields it works with. */
  readonly antennaFields: number;
  /** The Science it earns a Lunation at its rate, working all through. */
  readonly sciencePerLunation: number;
}

export function readRadioArrays(state: CampaignState): RadioArraySnapshot[] {
  const { daylightEarthDays, nightEarthDays } = catalogue.lunation;
  const lunationHours = (daylightEarthDays + nightEarthDays) * 24;
  return state.structures.flatMap((structure) => {
    const rounds = findStructureType(structure.structureTypeId)?.radioArray;
    if (rounds === undefined) return [];
    const inTheWay = structuresInTheWay(
      structure.structureTypeId,
      structure.position,
      state.structures,
      structure.id,
    ).map((other) => other.id);
    const stoppedFor: RadioArrayStop | undefined = isBroken(structure)
      ? "broken"
      : inTheWay.length > 0
        ? "plant"
        : structure.powered
          ? undefined
          : "power";
    const rate = rateOf(structure);
    return [
      {
        structureId: structure.id,
        working: stoppedFor === undefined,
        progress: roundFraction(structure.observedMinutes, rounds),
        minutesLeft: roundMinutesLeft(structure.observedMinutes, rounds, rate),
        stoppedFor,
        inTheWay,
        antennaFields: antennaFields(structure),
        sciencePerLunation:
          (rounds.science * rate * lunationHours) / rounds.lengthHours,
      },
    ];
  });
}
