import type { CampaignState } from "./campaign";
import { findStructureType, type ConstructionState } from "./construction";
import { earthDaysOfUseKilograms } from "./life-support-reserve";
import { storageLimitKilograms } from "./storage-limits";

/**
 * Why a water wall's Construction waits to start its Assembly: filling it
 * would leave the Mission Director less than the data catalogue's reserve
 * of the stock it is filled from.
 */
export interface WaterReserveWait {
  readonly reason: "water-reserve";
  /** The life support stock it is filled from. */
  readonly stockId: string;
  /** How much more of it the base's stock needs before it can be filled. */
  readonly missingKilograms: number;
  /**
   * What the base can hold of it, if that is too little for what filling it takes,
   * so that more of it alone would never do.
   */
  readonly tooLittleRoomKilograms?: number;
}

/**
 * Says why a Construction waits for water, if it is a water wall about to
 * start its Assembly and the stock it is filled from is short; undefined
 * otherwise, including once its Assembly has started and it is filled.
 */
export function findWaterReserveWait(
  state: CampaignState,
  construction: ConstructionState,
): WaterReserveWait | undefined {
  const fill = fillOf(construction);
  if (fill === undefined) return undefined;
  const needed = fill.kilograms + fill.reserveKilograms;
  const missing = needed - inStock(state, fill.stockId);
  if (missing <= 0) return undefined;
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

/**
 * Fills a water wall as its Assembly starts, taking the water from the
 * base's stock, if that leaves the reserve; says whether its Assembly can
 * go on. Anything that isn't a water wall about to start its Assembly goes
 * on as it is.
 */
export function fillWaterWall(
  state: CampaignState,
  construction: ConstructionState,
): boolean {
  const fill = fillOf(construction);
  if (fill === undefined) return true;
  if (findWaterReserveWait(state, construction) !== undefined) return false;
  const stock = state.lifeSupport.find(
    (candidate) => candidate.stockId === fill.stockId,
  );
  if (stock === undefined) return false;
  stock.kilograms -= fill.kilograms;
  return true;
}

/**
 * What filling a water wall takes, while it is about to start its Assembly:
 * none of the Assembly worked yet, so not filled yet.
 */
function fillOf(construction: ConstructionState):
  | {
      readonly stockId: string;
      readonly kilograms: number;
      readonly reserveKilograms: number;
    }
  | undefined {
  const rules = findStructureType(construction.structureTypeId)?.waterWall;
  if (
    rules === undefined ||
    construction.stage !== "assembly" ||
    construction.workedMinutes > 0
  ) {
    return undefined;
  }
  return {
    stockId: rules.stockId,
    kilograms: rules.kilograms,
    reserveKilograms: earthDaysOfUseKilograms(
      rules.stockId,
      rules.reserveEarthDays,
    ),
  };
}

function inStock(state: CampaignState, stockId: string): number {
  return (
    state.lifeSupport.find((stock) => stock.stockId === stockId)?.kilograms ?? 0
  );
}
