import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
} from "../catalogue";
import type { CampaignState } from "./campaign";
import { regolithHeapGround } from "./regolith-heap";

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

/** Adds Components to a list of counts, keeping one count for each Component. */
export function addCounts(
  counts: { componentId: string; count: number }[],
  added: readonly ComponentCount[],
): void {
  for (const { componentId, count } of added) {
    const existing = counts.find((other) => other.componentId === componentId);
    if (existing === undefined) counts.push({ componentId, count });
    else existing.count += count;
  }
}

/** How far clear of the Regolith heap a Robot stands to load or unload. */
const HEAP_CLEARANCE_METRES = 0.5;

/**
 * Where the Robot stands to load or unload Components: beside the stockpile,
 * on the side facing the site, or turned aside as little as it takes to
 * stand clear of the Regolith heap if that is in the way.
 */
export function stockpileSpot(
  state: CampaignState,
  site: { readonly workSpot: GroundPosition },
): GroundPosition {
  const stockpile = state.stockpile.position;
  const { workSpot } = site;
  const reach =
    catalogue.stockpile.footprintRadiusMetres +
    catalogue.robot.workingGapMetres;
  const angle = clearOfHeap(
    stockpile,
    reach,
    Math.atan2(workSpot.y - stockpile.y, workSpot.x - stockpile.x),
  );
  return {
    x: stockpile.x + Math.cos(angle) * reach,
    y: stockpile.y + Math.sin(angle) * reach,
  };
}

/**
 * The direction from the stockpile nearest the one given in which a spot
 * this far from it stands clear of the Regolith heap's largest ground.
 */
function clearOfHeap(
  stockpile: GroundPosition,
  reach: number,
  angle: number,
): number {
  const heap = regolithHeapGround(stockpile);
  const away = Math.hypot(
    heap.position.x - stockpile.x,
    heap.position.y - stockpile.y,
  );
  const clear = heap.radiusMetres + HEAP_CLEARANCE_METRES;
  // The angle either side of the heap within which a spot is too close to
  // it, from the triangle of the stockpile, the heap and the spot.
  const cosine =
    (reach * reach + away * away - clear * clear) / (2 * reach * away);
  if (cosine >= 1) return angle;
  const tooClose = Math.acos(Math.max(cosine, -1));
  const heapAngle = Math.atan2(
    heap.position.y - stockpile.y,
    heap.position.x - stockpile.x,
  );
  const off = Math.atan2(
    Math.sin(angle - heapAngle),
    Math.cos(angle - heapAngle),
  );
  if (Math.abs(off) >= tooClose) return angle;
  return heapAngle + (off < 0 ? -tooClose : tooClose);
}

function stockOf(
  state: CampaignState,
  componentId: string,
): CampaignState["stockpile"]["components"][number] | undefined {
  return state.stockpile.components.find(
    (stock) => stock.componentId === componentId,
  );
}
