import type { GroundPosition } from "../catalogue";

/** A round obstacle a walker must go round, such as the Lander or a Structure. */
export interface Obstacle {
  readonly centre: GroundPosition;
  /** How close to the centre a walker may come. */
  readonly radius: number;
}

/** How far outside an obstacle's radius a walker goes round it. */
const DETOUR_GAP = 0.2;
/**
 * How many corners the polygon has that a walker goes round an obstacle by.
 * Its sides are tangents to a circle just outside the obstacle, so a walker
 * going round it never comes inside.
 */
const CORNERS = 8;
/**
 * Rounding can leave a walker a hair inside an obstacle it is going round,
 * or a corner a hair inside a neighbouring one; that counts as outside, or
 * a walker could lose its way where it is plainly clear.
 */
const TOLERANCE = 1e-9;
/** How many routes are kept worked out, for walkers going the same way again. */
const ROUTES_KEPT = 64;

/**
 * The ways round a set of obstacles to one destination: the corners a
 * walker may go round them by, each with how far it is from there to the
 * destination along the shortest way, or Infinity if there is no way.
 */
interface Routes {
  readonly corners: readonly GroundPosition[];
  readonly distances: readonly number[];
}

/**
 * The routes most recently used, the latest first. Keeping them only saves
 * working them out again: it never changes where a walker goes, so the
 * simulation stays deterministic.
 */
const routesKept: (Routes & {
  readonly destination: GroundPosition;
  readonly obstacles: readonly Obstacle[];
})[] = [];

/**
 * Moves a walker one step of up to the given length along the shortest way
 * to its destination, round every obstacle in the way. Calling this again
 * and again always reaches the destination.
 *
 * Each obstacle is gone round by a polygon just outside it, and the way is
 * the shortest one from corner to corner, so every step brings the walker
 * the length of the step closer to the destination along it, and no walker
 * can go back and forth. A walker starting inside an obstacle walks
 * straight out of it. A destination inside an obstacle is reached from its
 * nearest side: the obstacle shrinks to leave the destination just outside
 * it. If the obstacles box the walker or its destination in, it walks
 * straight there, through them.
 */
export function stepTowards(
  from: GroundPosition,
  destination: GroundPosition,
  obstacles: readonly Obstacle[],
  maxStep: number,
): GroundPosition {
  const around = obstaclesAround(destination, obstacles);
  let position = { x: from.x, y: from.y };
  let left = maxStep;
  // Each corner reached is closer to the destination along the way than the
  // last, so the walker passes each corner at most once.
  for (let leg = 0; left > 0 && leg <= around.length * CORNERS; leg++) {
    const waypoint = nextWaypoint(position, destination, around);
    const gap = distance(position, waypoint);
    if (gap > left) {
      return {
        x: position.x + ((waypoint.x - position.x) / gap) * left,
        y: position.y + ((waypoint.y - position.y) / gap) * left,
      };
    }
    position = { x: waypoint.x, y: waypoint.y };
    left -= gap;
    if (waypoint === destination) break;
  }
  return position;
}

/**
 * The obstacles as a walker to a destination goes round them: one with the
 * destination inside shrinks to leave it on its edge, and one with the
 * destination at its centre is left out.
 */
function obstaclesAround(
  destination: GroundPosition,
  obstacles: readonly Obstacle[],
): Obstacle[] {
  return obstacles.flatMap((obstacle) => {
    const reach = distance(destination, obstacle.centre);
    if (reach >= obstacle.radius) return [obstacle];
    return reach > 0 ? [{ centre: obstacle.centre, radius: reach }] : [];
  });
}

/**
 * Heads straight for the destination when the way is clear, leaving out any
 * obstacle the walker is inside. Otherwise heads for the corner in sight
 * that the shortest way goes by, or straight for the destination if there
 * is no way round.
 */
function nextWaypoint(
  from: GroundPosition,
  destination: GroundPosition,
  obstacles: readonly Obstacle[],
): GroundPosition {
  const inTheWay = obstacles.filter((obstacle) => !isInside(from, obstacle));
  if (isClear(from, destination, inTheWay)) return destination;
  const { corners, distances } = routesTo(destination, obstacles);
  // The corner the shortest way goes by is nearly always among the first
  // few tried, cheapest first.
  const costs = corners.map((corner, index) =>
    distance(from, corner) > TOLERANCE
      ? distance(from, corner) + (distances[index] ?? Infinity)
      : Infinity,
  );
  for (;;) {
    let cheapest = -1;
    let cheapestCost = Infinity;
    for (const [index, cost] of costs.entries()) {
      if (cost < cheapestCost) {
        cheapest = index;
        cheapestCost = cost;
      }
    }
    const corner = corners[cheapest];
    if (corner === undefined) return destination;
    if (isClear(from, corner, inTheWay)) return corner;
    costs[cheapest] = Infinity;
  }
}

/**
 * The ways round the obstacles to a destination, worked out once and kept
 * while walkers go on using them.
 */
function routesTo(
  destination: GroundPosition,
  obstacles: readonly Obstacle[],
): Routes {
  const index = routesKept.findIndex(
    (kept) =>
      samePlace(kept.destination, destination) &&
      kept.obstacles.length === obstacles.length &&
      kept.obstacles.every((obstacle, at) => {
        const other = obstacles[at];
        return (
          other !== undefined &&
          samePlace(obstacle.centre, other.centre) &&
          obstacle.radius === other.radius
        );
      }),
  );
  const kept = routesKept[index];
  if (kept !== undefined) {
    // Kept as the most recently used.
    routesKept.splice(index, 1);
    routesKept.unshift(kept);
    return kept;
  }
  const routes = {
    destination: { x: destination.x, y: destination.y },
    obstacles: obstacles.map(({ centre, radius }) => ({
      centre: { x: centre.x, y: centre.y },
      radius,
    })),
    ...findRoutes(destination, obstacles),
  };
  routesKept.unshift(routes);
  routesKept.length = Math.min(routesKept.length, ROUTES_KEPT);
  return routes;
}

/**
 * Works out the shortest way from every corner to the destination, going
 * from corner to corner in sight of each other (Dijkstra's algorithm).
 */
function findRoutes(
  destination: GroundPosition,
  obstacles: readonly Obstacle[],
): Routes {
  const corners = obstacles
    .flatMap(cornersOf)
    .filter((corner) =>
      obstacles.every((obstacle) => !isInside(corner, obstacle)),
    );
  const distances = corners.map((corner) =>
    isClear(corner, destination, obstacles)
      ? distance(corner, destination)
      : Infinity,
  );
  const settled = corners.map(() => false);
  for (;;) {
    let nearest = -1;
    let nearestDistance = Infinity;
    for (const [index, reached] of distances.entries()) {
      if (!settled[index] && reached < nearestDistance) {
        nearest = index;
        nearestDistance = reached;
      }
    }
    const from = corners[nearest];
    if (from === undefined) break;
    settled[nearest] = true;
    for (const [index, corner] of corners.entries()) {
      const via = nearestDistance + distance(from, corner);
      if (
        !settled[index] &&
        via < (distances[index] ?? Infinity) &&
        isClear(from, corner, obstacles)
      ) {
        distances[index] = via;
      }
    }
  }
  return { corners, distances };
}

/** The corners of the polygon a walker goes round an obstacle by. */
function cornersOf({ centre, radius }: Obstacle): GroundPosition[] {
  const reach = (radius + DETOUR_GAP) / Math.cos(Math.PI / CORNERS);
  return Array.from({ length: CORNERS }, (_, index) => {
    const angle = (index * 2 * Math.PI) / CORNERS;
    return {
      x: centre.x + Math.cos(angle) * reach,
      y: centre.y + Math.sin(angle) * reach,
    };
  });
}

function isInside(position: GroundPosition, obstacle: Obstacle): boolean {
  return distance(position, obstacle.centre) < obstacle.radius - TOLERANCE;
}

/** Whether a straight walk from one point to another keeps out of every obstacle. */
function isClear(
  a: GroundPosition,
  b: GroundPosition,
  obstacles: readonly Obstacle[],
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  return obstacles.every(({ centre, radius }) => {
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
      distance({ x: a.x + along * dx, y: a.y + along * dy }, centre) >=
      radius - TOLERANCE
    );
  });
}

function samePlace(a: GroundPosition, b: GroundPosition): boolean {
  return a.x === b.x && a.y === b.y;
}

function distance(a: GroundPosition, b: GroundPosition): number {
  // Not Math.hypot, which is several times slower, and this is worked out
  // many times for every walker every game-minute.
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
