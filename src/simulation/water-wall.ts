import { catalogue } from "../catalogue";
import type { CampaignState } from "./campaign";
import { findStructureType, type ConstructionState } from "./construction";

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
  const missing =
    fill.kilograms + fill.reserveKilograms - inStock(state, fill.stockId);
  return missing > 0
    ? {
        reason: "water-reserve",
        stockId: fill.stockId,
        missingKilograms: missing,
      }
    : undefined;
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
  const use =
    catalogue.lifeSupportStocks.find((stock) => stock.id === rules.stockId)
      ?.usePerEarthDayKilograms ?? 0;
  return {
    stockId: rules.stockId,
    kilograms: rules.kilograms,
    reserveKilograms: rules.reserveEarthDays * use,
  };
}

function inStock(state: CampaignState, stockId: string): number {
  return (
    state.lifeSupport.find((stock) => stock.stockId === stockId)?.kilograms ?? 0
  );
}
