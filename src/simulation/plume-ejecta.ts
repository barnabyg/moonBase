import { catalogue, type GroundPosition } from "../catalogue";
import type { CampaignState } from "./campaign";
import { distance, footprintRadius, isBroken } from "./construction";
import type { GameEvent } from "./events";
import { nextPlumeEjectaSpot } from "./lander";

/** Where the next take-off or landing will blast Plume Ejecta, and how far it reaches. */
export interface PlumeEjectaSnapshot {
  readonly position: GroundPosition;
  readonly radiusMetres: number;
}

/** A Structure worn down by Plume Ejecta, and the Condition it was left with. */
export interface PlumeEjectaDamage {
  readonly structureId: string;
  readonly structureTypeId: string;
  readonly conditionPercent: number;
}

/**
 * Blasts Plume Ejecta out from the Lander as it takes off or lands at a
 * spot, wearing down the Condition of every Structure with any of its
 * footprint within reach, by the amount the data catalogue sets. Returns
 * the damage done, if any, and the Structures it left Broken.
 */
export function blastPlumeEjecta(
  state: CampaignState,
  from: GroundPosition,
): GameEvent[] {
  const { radiusMetres, conditionLossPercent } = catalogue.plumeEjecta;
  const atMinute = state.elapsedMinutes;
  const damaged: PlumeEjectaDamage[] = [];
  const broken: GameEvent[] = [];
  for (const structure of state.structures) {
    if (
      isBroken(structure) ||
      distance(structure.position, from) >=
        radiusMetres + footprintRadius(structure.structureTypeId)
    ) {
      continue;
    }
    structure.conditionPercent = Math.max(
      structure.conditionPercent - conditionLossPercent,
      0,
    );
    const { id: structureId, structureTypeId, conditionPercent } = structure;
    damaged.push({ structureId, structureTypeId, conditionPercent });
    if (isBroken(structure)) {
      broken.push({
        kind: "structure-broken",
        atMinute,
        structureId,
        structureTypeId,
      });
    }
  }
  return damaged.length === 0
    ? []
    : [{ kind: "plume-ejecta-damage", atMinute, damaged }, ...broken];
}

/**
 * Where the Lander's next take-off or landing will blast Plume Ejecta:
 * nowhere, if it is on a working landing pad.
 */
export function readPlumeEjecta(
  state: CampaignState,
): PlumeEjectaSnapshot | undefined {
  const spot = nextPlumeEjectaSpot(state);
  return spot === undefined
    ? undefined
    : {
        position: { ...spot },
        radiusMetres: catalogue.plumeEjecta.radiusMetres,
      };
}
