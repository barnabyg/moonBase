import type { GroundPosition } from "../catalogue";

/** A round obstacle a walker must go round, such as the Lander. */
export interface Obstacle {
  readonly centre: GroundPosition;
  /** How close to the centre a walker may come. */
  readonly radius: number;
}

/** How far outside an obstacle's radius a walker goes round it. */
const DETOUR_GAP = 0.2;
/**
 * Rounding can leave a walker a hair outside the circle after reaching a
 * tangent point; it counts as on the circle, or it would creep forward by
 * ever smaller steps and never arrive.
 */
const ON_CIRCLE_TOLERANCE = 1e-6;

/**
 * Moves a walker up to one step towards its destination, going round the
 * obstacle when it stands in the way. Calling this again and again always
 * reaches the destination.
 */
export function stepTowards(
  from: GroundPosition,
  destination: GroundPosition,
  obstacle: Obstacle,
  maxStep: number,
): GroundPosition {
  const waypoint = nextWaypoint(from, destination, obstacle, maxStep);
  const gap = Math.hypot(waypoint.x - from.x, waypoint.y - from.y);
  if (gap <= maxStep) return { x: waypoint.x, y: waypoint.y };
  return {
    x: from.x + ((waypoint.x - from.x) / gap) * maxStep,
    y: from.y + ((waypoint.y - from.y) / gap) * maxStep,
  };
}

/**
 * Heads straight for the destination when the way is clear. Otherwise heads
 * for a circle just outside the obstacle along a tangent, then follows the
 * circle the shorter way round until the destination comes into view.
 */
function nextWaypoint(
  from: GroundPosition,
  destination: GroundPosition,
  { centre, radius }: Obstacle,
  maxStep: number,
): GroundPosition {
  const fromDistance = distance(from, centre);
  if (
    fromDistance <= radius ||
    distance(destination, centre) <= radius ||
    segmentClears(from, destination, centre, radius)
  ) {
    return destination;
  }
  const around = radius + DETOUR_GAP;
  const fromAngle = Math.atan2(from.y - centre.y, from.x - centre.x);
  const toAngle = Math.atan2(
    destination.y - centre.y,
    destination.x - centre.x,
  );
  const turn = normaliseAngle(toAngle - fromAngle);
  const direction = Math.sign(turn || 1);
  // Far out, aim where a tangent touches the circle; on it, step along it.
  const angle =
    fromDistance > around + ON_CIRCLE_TOLERANCE
      ? fromAngle + direction * Math.acos(around / fromDistance)
      : fromAngle + direction * Math.min(maxStep / around, Math.abs(turn));
  return {
    x: centre.x + Math.cos(angle) * around,
    y: centre.y + Math.sin(angle) * around,
  };
}

function segmentClears(
  a: GroundPosition,
  b: GroundPosition,
  centre: GroundPosition,
  radius: number,
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const along =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            ((centre.x - a.x) * dx + (centre.y - a.y) * dy) / lengthSquared,
          ),
        );
  return (
    distance({ x: a.x + along * dx, y: a.y + along * dy }, centre) > radius
  );
}

/** Wraps an angle into the range −π to π. */
function normaliseAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function distance(a: GroundPosition, b: GroundPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
