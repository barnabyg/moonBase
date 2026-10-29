import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
} from "../catalogue";
import type { CampaignState } from "./campaign";
import { distance, footprintRadius } from "./construction";
import {
  regolithHeap,
  regolithHeapGround,
  type RegolithHeap,
} from "./regolith-heap";

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

/** The ground a Structure stands on, or is planned to, as a Campaign's state and its snapshot both give it. */
interface Footing {
  readonly position: GroundPosition;
  readonly structureTypeId: string;
}

/**
 * The heap of the base's Regolith beside the stockpile, sized to the
 * stock, or undefined if there is none, or if a Structure stands, or is
 * planned to stand, over it: the heap lies outside the stockpile's
 * footprint, where Structures may be built.
 */
export function uncoveredRegolithHeap(base: {
  readonly stockpile: { readonly position: GroundPosition };
  readonly bulkResources: readonly {
    readonly resourceId: string;
    readonly kilograms: number;
  }[];
  readonly structures: readonly Footing[];
  readonly constructions: readonly Footing[];
}): RegolithHeap | undefined {
  const kilograms =
    base.bulkResources.find(
      (stock) => stock.resourceId === catalogue.digging.resourceId,
    )?.kilograms ?? 0;
  const heap = regolithHeap(base.stockpile.position, kilograms);
  if (heap === undefined) return undefined;
  const covered = [...base.structures, ...base.constructions].some(
    (footing) =>
      distance(footing.position, heap.position) <
      heap.radiusMetres + footprintRadius(footing.structureTypeId),
  );
  return covered ? undefined : heap;
}

/** How far clear of the Regolith heap a Robot stands to work. */
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
  return spotClearOfRegolithHeap(
    state,
    stockpile,
    catalogue.stockpile.footprintRadiusMetres +
      catalogue.robot.workingGapMetres,
    Math.atan2(workSpot.y - stockpile.y, workSpot.x - stockpile.x),
  );
}

/**
 * The spot this far from a centre in the direction given, or, if that is
 * too close to the Regolith heap's largest ground for a Robot to stand,
 * turned round the centre as little as it takes to stand clear of it.
 */
export function spotClearOfRegolithHeap(
  state: CampaignState,
  centre: GroundPosition,
  reach: number,
  angle: number,
): GroundPosition {
  const heap = regolithHeapGround(state.stockpile.position);
  const away = distance(centre, heap.position);
  const clear = heap.radiusMetres + HEAP_CLEARANCE_METRES;
  // The angle either side of the heap within which a spot is too close to
  // it, from the triangle of the centre, the heap and the spot.
  const cosine =
    (reach * reach + away * away - clear * clear) / (2 * reach * away);
  const heapAngle = Math.atan2(
    heap.position.y - centre.y,
    heap.position.x - centre.x,
  );
  const off = Math.atan2(
    Math.sin(angle - heapAngle),
    Math.cos(angle - heapAngle),
  );
  // Standing in the middle of the heap, no way out is better than another.
  const tooClose =
    away === 0 ? 0 : Math.acos(Math.max(Math.min(cosine, 1), -1));
  const turned =
    Math.abs(off) >= tooClose
      ? angle
      : heapAngle + (off < 0 ? -tooClose : tooClose);
  return {
    x: centre.x + Math.cos(turned) * reach,
    y: centre.y + Math.sin(turned) * reach,
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
