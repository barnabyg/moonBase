import { catalogue, type GroundPosition } from "../catalogue";
import { footprintRadius, type Footing } from "./construction";
import type { DismantlingStage } from "./dismantling";

/** A round obstacle a walker must go round, such as the Lander or a Structure. */
export interface Obstacle {
  readonly centre: GroundPosition;
  /** How close to the centre a walker may come. */
  readonly radius: number;
}

/** The parts of the Campaign state that walkers go round. */
export interface Grounds {
  readonly lander: { readonly position: GroundPosition };
  readonly structures: readonly Footing[];
  readonly constructions: readonly Footing[];
  readonly dismantlings: readonly (Footing & {
    readonly stage: DismantlingStage;
  })[];
}

/**
 * How far outside the Lander's footprint, and every Structure's, a walker
 * keeps on its way across the base.
 */
const CLEARANCE_METRES = 0.5;

/**
 * What a Robot, or a Machine or Rover it drives, goes round on its way
 * across the base: the Lander, every Structure, every Construction from the
 * moment it is planned, so that nothing is walked or driven across ground
 * being graded or built on, and every Structure being dismantled until it
 * has been taken apart, leaving only Components to carry away. Something
 * wider keeps that much further away.
 */
export function obstaclesFor(grounds: Grounds, radius = 0): Obstacle[] {
  const clearance = CLEARANCE_METRES + radius;
  // A Structure being taken apart is among the Structures as well until
  // the Robot starts, and is gone round once.
  const ground = new Map(
    [
      ...grounds.structures,
      ...grounds.constructions,
      ...grounds.dismantlings.filter(({ stage }) => stage === "taking-apart"),
    ].map((footing) => [footing.id, footing]),
  );
  return [
    {
      centre: grounds.lander.position,
      radius: catalogue.lander.footprintRadiusMetres + clearance,
    },
    ...[...ground.values()].map(({ position, structureTypeId }) => ({
      centre: position,
      radius: footprintRadius(structureTypeId) + clearance,
    })),
  ];
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
 * The routes most recently used, the latest first.
 *
 * This is the simulation's only state outside the Campaign state, and it is
 * safe there under ADR-0003. It only memoises a pure function, the routes
 * to a destination round a set of obstacles, keyed by their exact values,
 * so a route kept from another Campaign, or another test, is exactly the
 * one that would be worked out afresh: it never changes a result, only
 * saves time. It holds at most ROUTES_KEPT entries, so it can't grow, and
 * it needs no saving, as a loaded Campaign works out the same routes again.
 * Keeping it in the Campaign state instead would put it in every save.
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
 * can go back and forth. A destination inside an obstacle is reached from
 * its nearest side: the obstacle shrinks to leave the destination on its
 * edge. A walker starting inside an obstacle likewise makes its way out
 * from where it stands and round. If the obstacles box the walker or its
 * destination in, it walks straight out, or straight there, through them.
 */
export function stepTowards(
  from: GroundPosition,
  destination: GroundPosition,
  obstacles: readonly Obstacle[],
  maxStep: number,
): GroundPosition {
  const around = shrunkFrom(destination, obstacles);
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
 * The obstacles as seen from a point inside some of them: each obstacle with
 * the point inside shrinks to leave it on its edge, and one with the point
 * at its centre is left out.
 */
function shrunkFrom(
  point: GroundPosition,
  obstacles: readonly Obstacle[],
): Obstacle[] {
  return obstacles.flatMap((obstacle) => {
    const reach = distance(point, obstacle.centre);
    if (reach >= obstacle.radius) return [obstacle];
    return reach > 0 ? [{ centre: obstacle.centre, radius: reach }] : [];
  });
}

/**
 * Heads for the next point on the shortest way to the destination. A walker
 * inside an obstacle sees it shrunk to leave it on its edge, so it makes
 * its way out and round rather than across; if that leaves it no way, it
 * walks straight out instead, as if the obstacle were not there; and if
 * there is still no way, it heads straight for the destination.
 */
function nextWaypoint(
  from: GroundPosition,
  destination: GroundPosition,
  obstacles: readonly Obstacle[],
): GroundPosition {
  const shrunk = shrunkFrom(from, obstacles);
  const outside = obstacles.filter((obstacle) => !isInside(from, obstacle));
  return (
    waypointPast(from, destination, obstacles, shrunk) ??
    (outside.length < obstacles.length
      ? waypointPast(from, destination, obstacles, outside)
      : undefined) ??
    destination
  );
}

/**
 * Heads straight for the destination when the way is clear of the obstacles
 * in the way. Otherwise heads for the corner in sight that the shortest way
 * round all the obstacles goes by, if there is one.
 */
function waypointPast(
  from: GroundPosition,
  destination: GroundPosition,
  obstacles: readonly Obstacle[],
  inTheWay: readonly Obstacle[],
): GroundPosition | undefined {
  if (isClear(from, destination, inTheWay)) return destination;
  const { corners, distances } = routesTo(destination, obstacles);
  // Cheapest first: the corners further along the way round the obstacle
  // being gone round cost less but are out of sight behind it.
  const costs = corners.map((corner, index) =>
    distance(from, corner) > TOLERANCE
      ? distance(from, corner) + (distances[index] ?? Infinity)
      : Infinity,
  );
  const order = costs
    .flatMap((cost, index) => (cost < Infinity ? [index] : []))
    .sort((a, b) => (costs[a] ?? 0) - (costs[b] ?? 0));
  for (const index of order) {
    const corner = corners[index];
    if (corner !== undefined && isClear(from, corner, inTheWay)) return corner;
  }
  return undefined;
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
  for (const { centre, radius } of obstacles) {
    const reach = radius - TOLERANCE;
    // Quickly past one well clear of the whole walk.
    if (
      reach <= 0 ||
      centre.x + reach <= Math.min(a.x, b.x) ||
      centre.x - reach >= Math.max(a.x, b.x) ||
      centre.y + reach <= Math.min(a.y, b.y) ||
      centre.y - reach >= Math.max(a.y, b.y)
    ) {
      continue;
    }
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
    const offX = a.x + along * dx - centre.x;
    const offY = a.y + along * dy - centre.y;
    if (offX * offX + offY * offY < reach * reach) return false;
  }
  return true;
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
