import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
} from "../catalogue";
import type { CampaignState } from "./campaign";
import { distance, footprintRadius } from "./construction";
import { iceStore, iceStoreGround, type IceStore } from "./ice-store";
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

/** The parts of a Campaign's state, or its snapshot, that say what lies beside the stockpile. */
interface BaseGround {
  readonly stockpile: { readonly position: GroundPosition };
  readonly bulkResources: readonly {
    readonly resourceId: string;
    readonly kilograms: number;
  }[];
  readonly structures: readonly Footing[];
  readonly constructions: readonly Footing[];
}

function kilogramsOf(base: BaseGround, resourceId: string): number {
  return (
    base.bulkResources.find((stock) => stock.resourceId === resourceId)
      ?.kilograms ?? 0
  );
}

/** Whether a Structure stands, or is planned to stand, over this ground. */
function isCovered(
  base: BaseGround,
  ground: { readonly position: GroundPosition; readonly radiusMetres: number },
): boolean {
  return [...base.structures, ...base.constructions].some(
    (footing) =>
      distance(footing.position, ground.position) <
      ground.radiusMetres + footprintRadius(footing.structureTypeId),
  );
}

/**
 * The heap of the base's Regolith beside the stockpile, sized to the
 * stock, or undefined if there is none, or if a Structure stands, or is
 * planned to stand, over it: the heap lies outside the stockpile's
 * footprint, where Structures may be built.
 */
export function uncoveredRegolithHeap(
  base: BaseGround,
): RegolithHeap | undefined {
  const heap = regolithHeap(
    base.stockpile.position,
    kilogramsOf(base, catalogue.digging.resourceId),
  );
  return heap === undefined || isCovered(base, heap) ? undefined : heap;
}

/**
 * The store of the base's water ice beside the stockpile, or undefined if
 * there is none, or if a Structure stands, or is planned to stand, over it,
 * as with the Regolith heap.
 */
export function uncoveredIceStore(base: BaseGround): IceStore | undefined {
  const store = iceStore(
    base.stockpile.position,
    kilogramsOf(base, catalogue.expeditions.resourceId),
  );
  return store === undefined || isCovered(base, store) ? undefined : store;
}

/** How far clear of the Regolith heap and the ice store a Robot stands to work. */
const STORE_CLEARANCE_METRES = 0.5;

/**
 * Where the Robot stands to load or unload Components: beside the stockpile,
 * on the side facing the site, or turned aside as little as it takes to
 * stand clear of the Regolith heap and the ice store if they are in the way.
 */
export function stockpileSpot(
  state: CampaignState,
  site: { readonly workSpot: GroundPosition },
): GroundPosition {
  const stockpile = state.stockpile.position;
  const { workSpot } = site;
  return spotClearOfStores(
    state,
    stockpile,
    catalogue.stockpile.footprintRadiusMetres +
      catalogue.robot.workingGapMetres,
    Math.atan2(workSpot.y - stockpile.y, workSpot.x - stockpile.x),
  );
}

/**
 * The spot this far from a centre in the direction given, or, if that is
 * too close to the Regolith heap's largest ground or the ice store for a
 * Robot to stand, turned round the centre as little as it takes to stand
 * clear of them.
 */
export function spotClearOfStores(
  state: CampaignState,
  centre: GroundPosition,
  reach: number,
  angle: number,
): GroundPosition {
  const stockpile = state.stockpile.position;
  return spotClearOf(
    [regolithHeapGround(stockpile), iceStoreGround(stockpile)].map(
      ({ position, radiusMetres }) => ({
        position,
        radiusMetres: radiusMetres + STORE_CLEARANCE_METRES,
      }),
    ),
    centre,
    reach,
    angle,
  );
}

/**
 * The spot this far from a centre in the direction given, or turned round
 * the centre as little as it takes to be outside all this ground. Where no
 * spot is, it takes the one that comes closest.
 */
export function spotClearOf(
  grounds: readonly {
    readonly position: GroundPosition;
    readonly radiusMetres: number;
  }[],
  centre: GroundPosition,
  reach: number,
  angle: number,
): GroundPosition {
  const spotAt = (turned: number): GroundPosition => ({
    x: centre.x + Math.cos(turned) * reach,
    y: centre.y + Math.sin(turned) * reach,
  });
  // Standing in the middle of some ground, no way out is better than another.
  const around = grounds.filter(
    ({ position }) => distance(centre, position) > 0,
  );
  /** How far outside the nearest ground a spot is, in metres. */
  const margin = (spot: GroundPosition) =>
    Math.min(
      ...around.map(
        ({ position, radiusMetres }) => distance(spot, position) - radiusMetres,
      ),
    );
  // The directions to try: the one given, then either side of each ground,
  // from the triangle of the centre, the ground and the spot.
  const edges = around.flatMap(({ position, radiusMetres }) => {
    const away = distance(centre, position);
    const cosine =
      (reach * reach + away * away - radiusMetres * radiusMetres) /
      (2 * reach * away);
    const tooClose = Math.acos(Math.max(Math.min(cosine, 1), -1));
    const towards = Math.atan2(position.y - centre.y, position.x - centre.x);
    return [towards - tooClose, towards + tooClose];
  });
  const turnFrom = (direction: number) =>
    Math.abs(
      Math.atan2(Math.sin(direction - angle), Math.cos(direction - angle)),
    );
  const directions = [angle, ...edges].sort(
    (a, b) => turnFrom(a) - turnFrom(b),
  );
  const clear = directions.find(
    (direction) => margin(spotAt(direction)) >= -1e-9,
  );
  if (clear !== undefined) return spotAt(clear);
  const closest = directions.reduce((best, direction) =>
    margin(spotAt(direction)) > margin(spotAt(best)) ? direction : best,
  );
  return spotAt(closest);
}

function stockOf(
  state: CampaignState,
  componentId: string,
): CampaignState["stockpile"]["components"][number] | undefined {
  return state.stockpile.components.find(
    (stock) => stock.componentId === componentId,
  );
}
