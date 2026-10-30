import { catalogue, type GroundPosition } from "../catalogue";
import { awayFromLandingSite } from "./regolith-heap";

/**
 * The base's water ice as it stands on the ground beside the stockpile's
 * mat: insulated containers that fill as the stock rises and empty as it
 * falls. It only shows the stock, which stays one number with no limit.
 */
export interface IceStore {
  readonly position: GroundPosition;
  readonly radiusMetres: number;
  /** How full each container holding ice is, from just above 0 to 1, the fullest first. */
  readonly containerLevels: readonly number[];
}

/**
 * The store holding this many kilograms of water ice, beside a stockpile
 * standing here, or undefined if there is none. The containers fill one
 * after another, and a stock too large for them all shows them all full.
 */
export function iceStore(
  stockpile: GroundPosition,
  kilograms: number,
): IceStore | undefined {
  if (kilograms <= 0) return undefined;
  const { containers, kilogramsPerContainer, smallestLevel } =
    catalogue.stockpile.iceStore;
  const shown = Math.min(kilograms, containers * kilogramsPerContainer);
  const full = Math.floor(shown / kilogramsPerContainer);
  const rest = shown / kilogramsPerContainer - full;
  return {
    ...iceStoreGround(stockpile),
    containerLevels: [
      ...Array.from({ length: full }, () => 1),
      ...(rest > 0 ? [Math.max(rest, smallestLevel)] : []),
    ],
  };
}

/**
 * The ground the store beside a stockpile standing here takes: just outside
 * the stockpile's footprint, a quarter of the way round from the Regolith
 * heap, so that it never moves and is clear of the heap, the excavator
 * digging beyond it and the Lander. Robots stand clear of it.
 */
export function iceStoreGround(stockpile: GroundPosition): {
  readonly position: GroundPosition;
  readonly radiusMetres: number;
} {
  const { radiusMetres, gapFromFootprintMetres } = catalogue.stockpile.iceStore;
  const angle = awayFromLandingSite(stockpile) - Math.PI / 2;
  const reach =
    catalogue.stockpile.footprintRadiusMetres +
    gapFromFootprintMetres +
    radiusMetres;
  return {
    position: {
      x: stockpile.x + Math.cos(angle) * reach,
      y: stockpile.y + Math.sin(angle) * reach,
    },
    radiusMetres,
  };
}
