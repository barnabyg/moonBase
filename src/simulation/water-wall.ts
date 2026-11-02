import type { CampaignState } from "./campaign";
import { findStructureType, type ConstructionState } from "./construction";
import { earthDaysOfUseKilograms } from "./life-support-reserve";
import { storageLimitKilograms } from "./storage-limits";

/**
 * Why a Construction that is filled or stocked from the base's life support
 * stocks, such as a water wall, waits to start its Assembly: taking what it
 * needs would leave the Mission Director less than the data catalogue's
 * reserve of a stock.
 */
export interface WaterReserveWait {
  readonly reason: "water-reserve";
  /** The life support stock it is short of. */
  readonly stockId: string;
  /** How much more of it the base's stock needs before it can be taken. */
  readonly missingKilograms: number;
  /**
   * What the base can hold of it, if that is too little for what it takes,
   * so that more of it alone would never do.
   */
  readonly tooLittleRoomKilograms?: number;
}

/**
 * Says why a Construction waits for a life support stock, if it is filled or
 * stocked from them, is about to start its Assembly, and one of them is
 * short; undefined otherwise, including once its Assembly has started and it
 * has taken them.
 */
export function findWaterReserveWait(
  state: CampaignState,
  construction: ConstructionState,
): WaterReserveWait | undefined {
  for (const fill of fillsOf(construction)) {
    const needed = fill.kilograms + fill.reserveKilograms;
    const missing = needed - inStock(state, fill.stockId);
    if (missing <= 0) continue;
    const limit = storageLimitKilograms(state, {
      kind: "life-support",
      stockId: fill.stockId,
    });
    return {
      reason: "water-reserve",
      stockId: fill.stockId,
      missingKilograms: missing,
      ...(limit !== undefined && limit < needed
        ? { tooLittleRoomKilograms: limit }
        : {}),
    };
  }
  return undefined;
}

/**
 * Fills a water wall, or stocks a Structure, as its Assembly starts, taking
 * what it needs from the base's life support stocks if that leaves the reserve
 * of every one; says whether its Assembly can go on. Anything that takes
 * nothing, or isn't about to start its Assembly, goes on as it is.
 */
export function fillWaterWall(
  state: CampaignState,
  construction: ConstructionState,
): boolean {
  const fills = fillsOf(construction);
  if (fills.length === 0) return true;
  if (findWaterReserveWait(state, construction) !== undefined) return false;
  for (const fill of fills) {
    const stock = state.lifeSupport.find(
      (candidate) => candidate.stockId === fill.stockId,
    );
    if (stock === undefined) return false;
    stock.kilograms -= fill.kilograms;
  }
  return true;
}

/**
 * What filling a water wall, or stocking a Structure, takes, while it is about
 * to start its Assembly: none of the Assembly worked yet, so not taken yet.
 */
function fillsOf(construction: ConstructionState): readonly {
  readonly stockId: string;
  readonly kilograms: number;
  readonly reserveKilograms: number;
}[] {
  const type = findStructureType(construction.structureTypeId);
  if (
    type === undefined ||
    construction.stage !== "assembly" ||
    construction.workedMinutes > 0
  ) {
    return [];
  }
  return [
    ...(type.waterWall === undefined ? [] : [type.waterWall]),
    ...(type.stockedWith ?? []),
  ].map((rules) => ({
    stockId: rules.stockId,
    kilograms: rules.kilograms,
    reserveKilograms: earthDaysOfUseKilograms(
      rules.stockId,
      rules.reserveEarthDays,
    ),
  }));
}

function inStock(state: CampaignState, stockId: string): number {
  return (
    state.lifeSupport.find((stock) => stock.stockId === stockId)?.kilograms ?? 0
  );
}
