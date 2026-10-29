import { describe, expect, it } from "vitest";
import { catalogue, type GroundPosition } from "../src/catalogue";
import {
  chooseParkingSpot,
  chooseWorkSpot,
  distance,
  footprintRadius,
  type Site,
  type StructureState,
} from "../src/simulation/construction";
import { machineFootprintRadius } from "../src/simulation/machines";
import { nextFraction, seedRandom } from "../src/simulation/random";
import {
  obstaclesFor,
  stepTowards,
  type Obstacle,
} from "../src/simulation/walking";

/**
 * Seeded random bases packed closely with real Structures, walked across by
 * a Robot, the excavator and the Rover to the kinds of spot they really go
 * to, checked against routes found independently on a grid.
 */

/** Something that walks or is driven across the base. */
interface Walker {
  readonly name: string;
  /** How far it goes in a game-minute. */
  readonly step: number;
  /** Its footprint's radius, by which it keeps further from everything. */
  readonly radius: number;
}

const walkers: readonly Walker[] = [
  {
    name: "Robot",
    step: catalogue.robot.walkingSpeedMetresPerHour / 60,
    radius: 0,
  },
  {
    name: "excavator",
    step: 30 / 60,
    radius: machineFootprintRadius("excavator"),
  },
  {
    name: "Rover",
    step: catalogue.rover.drivingSpeedMetresPerHour / 60,
    radius: catalogue.rover.footprintRadiusMetres,
  },
];

/** The Structure types that stand on their own ground. */
const standalone = catalogue.structureTypes.filter(
  (type) => !type.shieldsHabitat && type.waterWall === undefined,
);

/** A base of Structures packed closely, as the placement rules allow. */
function packedBase(seed: number): Site {
  const random = seedRandom(seed);
  const between = (low: number, high: number) =>
    low + nextFraction(random) * (high - low);
  const lander = { position: { x: 0, y: 0 }, trip: undefined };
  const stockpile = { position: catalogue.landingSite.stockpilePosition };
  const structures: StructureState[] = [];
  const count = 8 + Math.floor(between(0, 9));
  for (let tries = 0; structures.length < count && tries < 2000; tries++) {
    const type =
      standalone[Math.floor(between(0, standalone.length))] ?? standalone[0];
    if (type === undefined) break;
    const radius = type.footprintRadiusMetres;
    // Mostly right beside another, a few metres apart at most.
    const beside = structures[Math.floor(between(0, structures.length))];
    const angle = between(0, 2 * Math.PI);
    const position =
      beside !== undefined && between(0, 1) < 0.8
        ? {
            x:
              beside.position.x +
              Math.cos(angle) *
                (footprintRadius(beside.structureTypeId) +
                  radius +
                  between(0, 3)),
            y:
              beside.position.y +
              Math.sin(angle) *
                (footprintRadius(beside.structureTypeId) +
                  radius +
                  between(0, 3)),
          }
        : { x: between(-30, 30), y: between(-30, 30) };
    const clear =
      Math.abs(position.x) + radius <= 35 &&
      Math.abs(position.y) + radius <= 35 &&
      distance(position, lander.position) >=
        radius + catalogue.lander.footprintRadiusMetres &&
      distance(position, stockpile.position) >=
        radius + catalogue.stockpile.footprintRadiusMetres &&
      structures.every(
        (other) =>
          distance(position, other.position) >=
          radius + footprintRadius(other.structureTypeId),
      );
    if (!clear) continue;
    structures.push({
      id: `structure-${structures.length + 1}`,
      structureTypeId: type.id,
      position,
      powered: false,
      lit: false,
      storedKilowattHours: 0,
      conditionPercent: 100,
      dustCoatingPercent: 0,
      recipeId: undefined,
      batch: undefined,
      plantStop: undefined,
      switchedOff: false,
    });
  }
  return {
    lander,
    stockpile,
    constructions: [],
    structures,
    dismantlings: [],
    machines: [],
    rovers: [],
  };
}

/** Whether a straight walk keeps out of every obstacle, worked out independently of the walking code. */
function keepsClear(
  a: GroundPosition,
  b: GroundPosition,
  obstacles: readonly Obstacle[],
): boolean {
  return obstacles.every(({ centre, radius }) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const along =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((centre.x - a.x) * dx + (centre.y - a.y) * dy) / lengthSquared,
            ),
          );
    return (
      distance({ x: a.x + along * dx, y: a.y + along * dy }, centre) >= radius
    );
  });
}

const CELL = 0.5;
const REACH = 50;
const SIDE = Math.round((2 * REACH) / CELL) + 1;
/**
 * How far a grid point must be outside an obstacle to count as clear. More
 * than half a cell's diagonal, so a step between clear neighbours never
 * cuts into one.
 */
const GRID_MARGIN = 0.4;

function cellAt(index: number): GroundPosition {
  return {
    x: -REACH + (index % SIDE) * CELL,
    y: -REACH + Math.floor(index / SIDE) * CELL,
  };
}

/**
 * The length of the shortest route from a point to a destination found on
 * a half-metre grid of points clear of the obstacles, joined to its ends by
 * straight walks that keep clear, or Infinity if the grid finds none. Every
 * such route keeps out of the obstacles, so the shortest way round them is
 * never longer.
 */
function gridRouteLength(
  from: GroundPosition,
  to: GroundPosition,
  obstacles: readonly Obstacle[],
): number {
  if (keepsClear(from, to, obstacles)) return distance(from, to);
  const clear = Array.from({ length: SIDE * SIDE }, (_, index) =>
    obstacles.every(
      ({ centre, radius }) =>
        distance(cellAt(index), centre) >= radius + GRID_MARGIN,
    ),
  );
  /** The clear grid points a point can walk straight to, close by. */
  const linked = (point: GroundPosition) =>
    clear.flatMap((isClear, index) =>
      isClear &&
      distance(point, cellAt(index)) <= 1.5 &&
      keepsClear(point, cellAt(index), obstacles)
        ? [index]
        : [],
    );
  // Dijkstra's algorithm from the destination, over a binary heap.
  const lengths = new Float64Array(SIDE * SIDE).fill(Infinity);
  const heap: number[] = [];
  const push = (index: number) => {
    heap.push(index);
    for (let at = heap.length - 1; at > 0;) {
      const up = (at - 1) >> 1;
      if ((lengths[heap[up] ?? 0] ?? 0) <= (lengths[index] ?? 0)) break;
      heap[at] = heap[up] ?? 0;
      heap[up] = index;
      at = up;
    }
  };
  const pop = (): number | undefined => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length === 0 || last === undefined) return top;
    heap[0] = last;
    for (let at = 0; ;) {
      const left = at * 2 + 1;
      const right = left + 1;
      let least = at;
      for (const child of [left, right]) {
        if (
          child < heap.length &&
          (lengths[heap[child] ?? 0] ?? 0) < (lengths[heap[least] ?? 0] ?? 0)
        ) {
          least = child;
        }
      }
      if (least === at) break;
      heap[at] = heap[least] ?? 0;
      heap[least] = last;
      at = least;
    }
    return top;
  };
  for (const index of linked(to)) {
    lengths[index] = distance(cellAt(index), to);
    push(index);
  }
  const done = new Uint8Array(SIDE * SIDE);
  for (let index = pop(); index !== undefined; index = pop()) {
    if (done[index] === 1) continue;
    done[index] = 1;
    const column = index % SIDE;
    const row = Math.floor(index / SIDE);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const next = (row + dy) * SIDE + column + dx;
        if (
          (dx === 0 && dy === 0) ||
          column + dx < 0 ||
          column + dx >= SIDE ||
          row + dy < 0 ||
          row + dy >= SIDE ||
          clear[next] !== true
        ) {
          continue;
        }
        const length =
          (lengths[index] ?? Infinity) +
          (dx === 0 || dy === 0 ? 1 : Math.SQRT2) * CELL;
        if (length < (lengths[next] ?? Infinity)) {
          lengths[next] = length;
          push(next);
        }
      }
    }
  }
  return Math.min(
    ...linked(from).map(
      (index) => distance(from, cellAt(index)) + (lengths[index] ?? Infinity),
    ),
    Infinity,
  );
}

/** Steps a walker to its destination, returning every position it stood on. */
function walk(
  from: GroundPosition,
  to: GroundPosition,
  obstacles: readonly Obstacle[],
  step: number,
): GroundPosition[] {
  const positions = [from];
  let position = from;
  for (let minute = 0; minute < 20_000; minute++) {
    if (position.x === to.x && position.y === to.y) return positions;
    position = stepTowards(position, to, obstacles, step);
    positions.push(position);
  }
  throw new Error(
    `It never arrived: it stopped at (${position.x}, ${position.y}).`,
  );
}

function lengthOf(positions: readonly GroundPosition[]): number {
  return positions.reduce(
    (sum, position, index) =>
      sum + distance(positions[index - 1] ?? position, position),
    0,
  );
}

describe("Walking across bases packed closely with Structures", () => {
  it("gets every Robot, Machine and Rover to every spot it is sent to, round every footprint and little further than a route found on a grid", () => {
    let walks = 0;
    let checked = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const site = packedBase(seed);
      const { structures } = site;
      for (const walker of walkers) {
        const obstacles = obstaclesFor(
          { ...site, dismantlings: [] },
          walker.radius,
        );
        // Where it goes beside a Structure: a Robot to its working spot, a
        // Machine or Rover to a spot to park it at.
        const spotBeside = (index: number, from: GroundPosition) => {
          const structure = structures[index % structures.length];
          if (structure === undefined) throw new Error("expected a Structure");
          return walker.radius === 0
            ? chooseWorkSpot(site, structure)
            : chooseParkingSpot(
                site,
                structure,
                { id: walker.name, position: from, radius: walker.radius },
                [],
              );
        };
        const rim = { x: 48 * Math.cos(seed), y: 48 * Math.sin(seed) };
        const destination = spotBeside(seed, rim);
        const starts = [
          rim,
          spotBeside(seed + 1, destination),
          spotBeside(seed + 3, destination),
        ];
        for (const start of starts) {
          const positions = walk(start, destination, obstacles, walker.step);
          walks += 1;
          const isClearOf = (point: GroundPosition) =>
            obstacles.every(
              ({ centre, radius }) => distance(point, centre) >= radius,
            );
          if (!isClearOf(start) || !isClearOf(destination)) continue;
          const grid = gridRouteLength(start, destination, obstacles);
          if (grid === Infinity) continue;
          checked += 1;
          const where = `base ${seed}, ${walker.name} from (${start.x}, ${start.y})`;
          for (const position of positions) {
            expect(isClearOf(position), where).toBe(true);
          }
          // The grid's routes zigzag and keep further out, so they are
          // longer than the shortest way round; going round the polygons
          // could at worst come out a few per cent longer than one.
          expect(lengthOf(positions), where).toBeLessThanOrEqual(grid * 1.05);
        }
      }
    }
    // Most walks start and end clear, with a way round to check against.
    expect(checked).toBeGreaterThanOrEqual(walks / 2);
  });
});
