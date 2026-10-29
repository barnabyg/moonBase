import { catalogue, type GroundPosition } from "../catalogue";

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
  const radiusMetres = radiusHolding(kilograms);
  return {
    position: heapPosition(stockpile),
    radiusMetres,
    heightMetres: radiusMetres * Math.tan(slopeRadians()),
  };
}

/**
 * The ground the heap beside a stockpile standing here takes once the
 * stock is full: where it stands, and its largest radius. The excavator
 * digs just beyond it, and Robots stand clear of it.
 */
export function regolithHeapGround(stockpile: GroundPosition): {
  readonly position: GroundPosition;
  readonly radiusMetres: number;
} {
  return {
    position: heapPosition(stockpile),
    radiusMetres: radiusHolding(catalogue.digging.fullKilograms),
  };
}

/**
 * The radius of a cone of loose Regolith of this mass, up to the stock
 * digging fills, and no smaller than the smallest heap.
 */
function radiusHolding(kilograms: number): number {
  const { bulkDensityKilogramsPerCubicMetre, smallestRadiusMetres } =
    catalogue.stockpile.regolithHeap;
  const cubicMetres =
    Math.min(kilograms, catalogue.digging.fullKilograms) /
    bulkDensityKilogramsPerCubicMetre;
  // A cone's volume is a third of pi r² h, and its height r tan(slope).
  return Math.max(
    Math.cbrt((3 * cubicMetres) / (Math.PI * Math.tan(slopeRadians()))),
    smallestRadiusMetres,
  );
}

function slopeRadians(): number {
  return (catalogue.stockpile.regolithHeap.slopeDegrees * Math.PI) / 180;
}

/**
 * Where the heap stands: just outside the stockpile's footprint, on the
 * side away from the landing site, so that it never moves, even while the
 * Lander stands on a landing pad.
 */
function heapPosition(stockpile: GroundPosition): GroundPosition {
  const landingSite = catalogue.landingSite.landerPosition;
  const dx = stockpile.x - landingSite.x;
  const dy = stockpile.y - landingSite.y;
  const angle = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
  const reach =
    catalogue.stockpile.footprintRadiusMetres +
    catalogue.stockpile.regolithHeap.gapFromFootprintMetres +
    radiusHolding(catalogue.digging.fullKilograms);
  return {
    x: stockpile.x + Math.cos(angle) * reach,
    y: stockpile.y + Math.sin(angle) * reach,
  };
}
