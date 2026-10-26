import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
} from "../catalogue";
import type { CampaignState } from "./campaign";

/**
 * The base's stock of Components, kept on the ground beside the landing
 * site. It belongs to the base rather than the Lander.
 */
export interface StockpileState {
  position: GroundPosition;
  /** One count for every Component, in catalogue order. */
  components: { componentId: string; count: number }[];
}

/** The stockpile a Campaign begins with, holding the starting stock. */
export function startingStockpile(): StockpileState {
  return {
    position: { ...catalogue.landingSite.stockpilePosition },
    components: catalogue.componentTypes.map((type) => ({
      componentId: type.id,
      count: catalogue.startingStock
        .filter((stock) => stock.componentId === type.id)
        .reduce((total, stock) => total + stock.count, 0),
    })),
  };
}

/** How many of a Component the base has in stock. */
export function inStock(state: CampaignState, componentId: string): number {
  return stockOf(state, componentId)?.count ?? 0;
}

/** Takes the Components from the base's stock if they are all there; otherwise takes nothing. */
export function takeFromStock(
  state: CampaignState,
  needed: readonly ComponentCount[],
): boolean {
  if (needed.some((need) => inStock(state, need.componentId) < need.count)) {
    return false;
  }
  for (const need of needed) {
    const stock = stockOf(state, need.componentId);
    if (stock !== undefined) stock.count -= need.count;
  }
  return true;
}

/** Puts Components back into the base's stock, which has a place for every Component. */
export function addToStock(
  state: CampaignState,
  counts: readonly ComponentCount[],
): void {
  for (const { componentId, count } of counts) {
    const stock = stockOf(state, componentId);
    if (stock !== undefined) stock.count += count;
  }
}

/**
 * Where the Robot stands to load or unload Components: beside the stockpile,
 * on the side facing the site.
 */
export function stockpileSpot(
  state: CampaignState,
  site: { readonly workSpot: GroundPosition },
): GroundPosition {
  const stockpile = state.stockpile.position;
  const { workSpot } = site;
  const angle = Math.atan2(workSpot.y - stockpile.y, workSpot.x - stockpile.x);
  const reach =
    catalogue.stockpile.footprintRadiusMetres +
    catalogue.robot.workingGapMetres;
  return {
    x: stockpile.x + Math.cos(angle) * reach,
    y: stockpile.y + Math.sin(angle) * reach,
  };
}

function stockOf(
  state: CampaignState,
  componentId: string,
): CampaignState["stockpile"]["components"][number] | undefined {
  return state.stockpile.components.find(
    (stock) => stock.componentId === componentId,
  );
}
