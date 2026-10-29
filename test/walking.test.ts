import { describe, expect, it } from "vitest";
import type { GroundPosition } from "../src/catalogue";
import { nextFraction, seedRandom } from "../src/simulation/random";
import {
  obstaclesFor,
  stepTowards,
  type Obstacle,
} from "../src/simulation/walking";

/** A Robot's walk in one game-minute, in metres. */
const ROBOT_STEP = 12 / 60;

function distanceBetween(a: GroundPosition, b: GroundPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Steps a walker towards its destination until it gets there, returning
 * every position it stood on, or fails after far more steps than any
 * sensible route would take.
 */
function walk(
  from: GroundPosition,
  destination: GroundPosition,
  obstacles: readonly Obstacle[],
  maxStep = ROBOT_STEP,
  maxSteps = 100_000,
): GroundPosition[] {
  const positions = [from];
  let position = from;
  for (let step = 0; step < maxSteps; step++) {
    if (position.x === destination.x && position.y === destination.y) {
      return positions;
    }
    const next = stepTowards(position, destination, obstacles, maxStep);
    expect(distanceBetween(position, next)).toBeLessThanOrEqual(maxStep + 1e-9);
    position = next;
    positions.push(position);
  }
  throw new Error(
    `The walker never arrived: it stopped at (${position.x}, ${position.y}).`,
  );
}

/** Says whether a position stands inside an obstacle, allowing for rounding. */
function isInside(position: GroundPosition, obstacle: Obstacle): boolean {
  return distanceBetween(position, obstacle.centre) < obstacle.radius - 1e-6;
}

function expectNeverInside(
  positions: readonly GroundPosition[],
  obstacles: readonly Obstacle[],
): void {
  for (const position of positions) {
    for (const obstacle of obstacles) {
      expect(isInside(position, obstacle)).toBe(false);
    }
  }
}

/** The length of a walk through the positions stood on. */
function lengthOf(positions: readonly GroundPosition[]): number {
  return positions
    .slice(1)
    .reduce(
      (sum, position, index) =>
        sum + distanceBetween(positions[index] ?? position, position),
      0,
    );
}

describe("Walking round obstacles", () => {
  it("walks straight to a destination in plain sight, a full step at a time", () => {
    const obstacles = [{ centre: { x: 0, y: 10 }, radius: 4 }];

    const positions = walk({ x: -5, y: 0 }, { x: 5, y: 0 }, obstacles);

    expect(positions).toHaveLength(Math.ceil(10 / ROBOT_STEP) + 1);
    for (const position of positions) expect(position.y).toBe(0);
  });

  it("goes round an obstacle the short way, little further than round its edge", () => {
    const radius = 4;
    const obstacles = [{ centre: { x: 0, y: 0.5 }, radius }];
    const from = { x: -10, y: 0 };
    const to = { x: 10, y: 0 };

    const positions = walk(from, to, obstacles);

    expectNeverInside(positions, obstacles);
    expect(
      Math.max(...positions.map((position) => position.y)),
    ).toBeLessThanOrEqual(0);
    // Along tangents to the obstacle's edge and round it between them.
    const reach = distanceBetween(from, obstacles[0]?.centre ?? from);
    const tangent = Math.sqrt(reach * reach - radius * radius);
    const arc = radius * (Math.PI - 2 * Math.acos(radius / reach));
    expect(lengthOf(positions)).toBeLessThan((2 * tangent + arc) * 1.06);
  });

  it("walks round two touching obstacles lying across its path", () => {
    const obstacles = [
      { centre: { x: 0, y: -3 }, radius: 3 },
      { centre: { x: 0, y: 3 }, radius: 3 },
    ];

    const positions = walk({ x: -10, y: 0.5 }, { x: 10, y: -0.5 }, obstacles);

    expectNeverInside(positions, obstacles);
  });

  it("walks round a wall of overlapping obstacles", () => {
    const obstacles = [-8, -4, 0, 4, 8].map((y) => ({
      centre: { x: 0, y },
      radius: 2.5,
    }));

    const positions = walk({ x: -6, y: 1 }, { x: 6, y: -1 }, obstacles);

    expectNeverInside(positions, obstacles);
  });

  it("reaches a destination in a gap between obstacles", () => {
    // Three obstacles round the destination, open to the east.
    const obstacles = [
      { centre: { x: -4, y: 0 }, radius: 3 },
      { centre: { x: 0, y: 4 }, radius: 3 },
      { centre: { x: 0, y: -4 }, radius: 3 },
    ];

    const positions = walk({ x: -12, y: 1 }, { x: 0, y: 0 }, obstacles);

    expectNeverInside(positions, obstacles);
  });

  it("reaches a destination boxed in by obstacles all round", () => {
    const obstacles = [0, 1, 2, 3, 4, 5].map((index) => ({
      centre: {
        x: Math.cos((index * Math.PI) / 3) * 5,
        y: Math.sin((index * Math.PI) / 3) * 5,
      },
      radius: 3,
    }));

    walk({ x: -15, y: 2 }, { x: 0, y: 0 }, obstacles);
  });

  it("walks out of an obstacle it starts inside, and round the rest", () => {
    const inside = { centre: { x: 0, y: 0 }, radius: 4 };
    const across = { centre: { x: 8, y: 0 }, radius: 3 };

    const positions = walk({ x: 1, y: 0 }, { x: 16, y: 0 }, [inside, across]);

    expectNeverInside(positions, [across]);
    const outside = positions.findIndex(
      (position) => !isInside(position, inside),
    );
    expect(
      positions.slice(outside).some((position) => isInside(position, inside)),
    ).toBe(false);
  });

  it("goes round an obstacle it starts just inside, rather than across it", () => {
    // Such as a Robot that has laid cable to the edge of a Structure's footprint.
    const obstacle = { centre: { x: 0, y: 0 }, radius: 4.5 };

    const positions = walk({ x: 4, y: 0 }, { x: -15, y: 1 }, [obstacle]);

    for (const position of positions) {
      expect(distanceBetween(position, obstacle.centre)).toBeGreaterThanOrEqual(
        4 - 1e-6,
      );
    }
  });

  it("reaches a destination inside an obstacle from its near side", () => {
    const obstacle = { centre: { x: 0, y: 0 }, radius: 5 };
    const destination = { x: 4, y: 0 };

    const positions = walk({ x: -10, y: 0.5 }, destination, [obstacle]);

    for (const position of positions) {
      expect(distanceBetween(position, obstacle.centre)).toBeGreaterThanOrEqual(
        4 - 1e-6,
      );
    }
  });

  it("reaches a destination at the centre of an obstacle", () => {
    const obstacle = { centre: { x: 3, y: 3 }, radius: 5 };

    walk({ x: -10, y: 0 }, obstacle.centre, [obstacle]);
  });

  describe("in many random, closely packed layouts", () => {
    const random = seedRandom(100);
    const between = (low: number, high: number) =>
      low + nextFraction(random) * (high - low);
    /** A Robot's, a Machine's and a Rover's step in a game-minute. */
    const steps = [ROBOT_STEP, 20 / 60, 240 / 60];
    const layouts = Array.from({ length: 150 }, (_, index) => {
      const obstacles = Array.from(
        { length: 2 + Math.floor(between(0, 14)) },
        () => ({
          centre: { x: between(-20, 20), y: between(-20, 20) },
          radius: between(0.8, 8),
        }),
      );
      const onRim = () => {
        const angle = between(0, 2 * Math.PI);
        return { x: Math.cos(angle) * 50, y: Math.sin(angle) * 50 };
      };
      const anywhere = () => ({ x: between(-25, 25), y: between(-25, 25) });
      return {
        index,
        obstacles,
        maxStep: steps[index % steps.length] ?? ROBOT_STEP,
        rim: { from: onRim(), to: onRim() },
        inside: { from: anywhere(), to: anywhere() },
      };
    });

    it.each(layouts)(
      "walks round the obstacles between two points outside them all (layout $index)",
      ({ obstacles, maxStep, rim }) => {
        const positions = walk(rim.from, rim.to, obstacles, maxStep);

        expectNeverInside(positions, obstacles);
        // Never further than straight there and once round every obstacle.
        const roundEvery = obstacles.reduce(
          (sum, { radius }) => sum + 2 * Math.PI * (radius + 0.5),
          0,
        );
        expect(lengthOf(positions)).toBeLessThanOrEqual(
          distanceBetween(rim.from, rim.to) + roundEvery,
        );
      },
    );

    it.each(layouts)(
      "arrives between any two points, inside the obstacles or boxed in by them (layout $index)",
      ({ obstacles, maxStep, inside }) => {
        walk(inside.from, inside.to, obstacles, maxStep);
      },
    );
  });
});

describe("What walkers go round on the base", () => {
  const habitat = {
    id: "structure-1",
    structureTypeId: "habitat",
    position: { x: 20, y: 0 },
  };
  const ground = {
    lander: { position: { x: 0, y: 0 } },
    structures: [],
    constructions: [],
    dismantlings: [],
  };

  it("keeps half a metre clear of the Lander and every footprint, and further for something wider", () => {
    const site = {
      ...ground,
      structures: [habitat],
      constructions: [
        { ...habitat, id: "structure-2", position: { x: -20, y: 0 } },
      ],
    };

    expect(obstaclesFor(site, 1.5)).toEqual([
      { centre: { x: 0, y: 0 }, radius: 4 + 0.5 + 1.5 },
      { centre: { x: 20, y: 0 }, radius: 4 + 0.5 + 1.5 },
      { centre: { x: -20, y: 0 }, radius: 4 + 0.5 + 1.5 },
    ]);
  });

  it("goes round a Structure being taken apart, but not its empty site once it has been", () => {
    const takingApart = {
      ...ground,
      structures: [habitat],
      dismantlings: [{ ...habitat, stage: "taking-apart" as const }],
    };
    const takenApart = {
      ...ground,
      dismantlings: [{ ...habitat, stage: "returning-components" as const }],
    };

    expect(obstaclesFor(takingApart)).toEqual([
      { centre: { x: 0, y: 0 }, radius: 4.5 },
      { centre: { x: 20, y: 0 }, radius: 4.5 },
    ]);
    expect(obstaclesFor(takenApart)).toEqual([
      { centre: { x: 0, y: 0 }, radius: 4.5 },
    ]);
  });
});
