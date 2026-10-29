import { catalogue, type GroundPosition } from "../catalogue";

/** How much loose, dug Regolith weighs, in kilograms a cubic metre. */
const BULK_DENSITY_KILOGRAMS_PER_CUBIC_METRE = 1500;
/** The slope loose Regolith settles at when it is tipped: its angle of repose. */
const SLOPE_RADIANS = (35 * Math.PI) / 180;
/** The smallest heap there is, however little Regolith is in stock, so that a few kilograms still show. */
const SMALLEST_RADIUS_METRES = 0.3;
/** How far outside the stockpile's mat the foot of a full heap comes. */
const GAP_FROM_MAT_METRES = 0.1;

/**
 * The base's Regolith stock, heaped on the ground beside the stockpile's
 * mat where the excavator tips it: a cone of loose Regolith that grows and
 * shrinks with the stock. It stands outside the stockpile's footprint, so
 * nothing in the simulation stands on it but what is built over it.
 */
export interface RegolithHeap {
  readonly position: GroundPosition;
  readonly radiusMetres: number;
  readonly heightMetres: number;
}

/**
 * The heap holding this many kilograms of Regolith, beside a stockpile
 * standing here, or undefined if there is none. Its volume goes with the
 * mass, up to the stock digging fills, so its radius goes with the cube
 * root of the mass.
 */
export function regolithHeap(
  stockpile: GroundPosition,
  kilograms: number,
): RegolithHeap | undefined {
  if (kilograms <= 0) return undefined;
  const radiusMetres = Math.max(
    radiusHolding(Math.min(kilograms, catalogue.digging.fullKilograms)),
    SMALLEST_RADIUS_METRES,
  );
  return {
    position: heapPosition(stockpile),
    radiusMetres,
    heightMetres: radiusMetres * Math.tan(SLOPE_RADIANS),
  };
}

/**
 * The ground the heap beside a stockpile standing here takes once the
 * stock is full: where it stands, and its largest radius. The excavator
 * digs just beyond it, and Robots load clear of it.
 */
export function regolithHeapGround(stockpile: GroundPosition): {
  readonly position: GroundPosition;
  readonly radiusMetres: number;
} {
  return {
    position: heapPosition(stockpile),
    radiusMetres: largestRadius(),
  };
}

/** The radius of a cone of loose Regolith of this mass. */
function radiusHolding(kilograms: number): number {
  const cubicMetres = kilograms / BULK_DENSITY_KILOGRAMS_PER_CUBIC_METRE;
  // A cone's volume is a third of pi r² h, and its height r tan(slope).
  return Math.cbrt((3 * cubicMetres) / (Math.PI * Math.tan(SLOPE_RADIANS)));
}

function largestRadius(): number {
  return Math.max(
    radiusHolding(catalogue.digging.fullKilograms),
    SMALLEST_RADIUS_METRES,
  );
}

/**
 * Where the heap stands: just outside the stockpile's mat, on the side
 * away from the landing site, so that it never moves, even while the
 * Lander stands on a landing pad.
 */
function heapPosition(stockpile: GroundPosition): GroundPosition {
  const landingSite = catalogue.landingSite.landerPosition;
  const dx = stockpile.x - landingSite.x;
  const dy = stockpile.y - landingSite.y;
  const angle = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
  const reach =
    catalogue.stockpile.footprintRadiusMetres +
    GAP_FROM_MAT_METRES +
    largestRadius();
  return {
    x: stockpile.x + Math.cos(angle) * reach,
    y: stockpile.y + Math.sin(angle) * reach,
  };
}
