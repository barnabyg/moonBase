import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { catalogue, type GroundPosition } from "../src/catalogue";
import { alongRoute, routeToHatch } from "../src/render/mission-director-walk";
import { toScene } from "../src/render/interpolation";
import { footprintRadius } from "../src/simulation/construction";

/** Where the foot of the Lander's ladder stands, as the Lander model has it. */
const LADDER_FOOT = {
  x: (catalogue.lander.footprintRadiusMetres - 0.2) * Math.SQRT1_2,
  y: -(catalogue.lander.footprintRadiusMetres - 0.2) * Math.SQRT1_2,
};
/** Where the Mission Director stands by a Habitat's airlock hatch, out along +x. */
const HATCH_STAND_OUT = 4.44 + 0.8;

interface Footing {
  readonly id: string;
  readonly structureTypeId: string;
  readonly position: GroundPosition;
}

function base({
  structures,
  constructions = [],
}: {
  structures: readonly Footing[];
  constructions?: readonly Footing[];
}) {
  return {
    lander: { position: { x: 0, y: 0 } },
    structures,
    constructions,
    dismantlings: [],
  };
}

function habitatAt(x: number, y: number): Footing {
  return { id: "habitat", structureTypeId: "habitat", position: { x, y } };
}

/** Every point along a route, a tenth of a metre or less apart. */
function pointsAlong(route: readonly THREE.Vector3[]): THREE.Vector3[] {
  return route.flatMap((to, index) => {
    const from = route[index - 1];
    if (from === undefined) return [to];
    const pieces = Math.max(1, Math.ceil(from.distanceTo(to) / 0.1));
    return Array.from({ length: pieces }, (_, piece) =>
      new THREE.Vector3().lerpVectors(from, to, (piece + 1) / pieces),
    );
  });
}

/**
 * Checks that a walk keeps half a metre clear of every Structure's and
 * Construction's footprint, as a Robot does, and never comes closer to the
 * Lander than the foot of its ladder.
 */
function expectRoundEverything(
  route: readonly THREE.Vector3[],
  { structures, constructions }: ReturnType<typeof base>,
): void {
  for (const point of pointsAlong(route)) {
    expect(point.distanceTo(toScene({ x: 0, y: 0 }))).toBeGreaterThanOrEqual(
      catalogue.lander.footprintRadiusMetres - 0.2 - 1e-6,
    );
    for (const { position, structureTypeId } of [
      ...structures,
      ...constructions,
    ]) {
      expect(point.distanceTo(toScene(position))).toBeGreaterThanOrEqual(
        footprintRadius(structureTypeId) + 0.5 - 1e-6,
      );
    }
  }
}

describe("The Mission Director's walk from the Lander to their Habitat", () => {
  it("goes round the Habitat to a hatch on its far side from the Lander", () => {
    const habitat = habitatAt(20, 0);
    const site = base({ structures: [habitat] });
    const hatch = { x: 20 + HATCH_STAND_OUT, y: 0 };

    const route = routeToHatch(site, LADDER_FOOT, hatch);

    expect(route[0]).toEqual(toScene(LADDER_FOOT));
    expect(route.at(-1)).toEqual(toScene(hatch));
    expectRoundEverything(route, site);
  });

  it("goes round another Structure between the Lander and the Habitat", () => {
    const site = base({
      structures: [
        habitatAt(30, 0),
        {
          id: "solar-array",
          structureTypeId: "solar-array",
          position: { x: 14, y: -1 },
        },
      ],
    });

    const route = routeToHatch(site, LADDER_FOOT, {
      x: 30 + HATCH_STAND_OUT,
      y: 0,
    });

    expectRoundEverything(route, site);
  });

  it("goes round a Construction in the way, and the Lander behind the ladder", () => {
    const site = base({
      structures: [habitatAt(-6, 24)],
      constructions: [
        {
          id: "habitat-2",
          structureTypeId: "habitat",
          position: { x: 0, y: 12 },
        },
      ],
    });

    const route = routeToHatch(site, LADDER_FOOT, {
      x: -6 + HATCH_STAND_OUT,
      y: 24,
    });

    expectRoundEverything(route, site);
  });
});

describe("Walking along a route", () => {
  // East, then north.
  const route = [
    toScene({ x: 0, y: 0 }),
    toScene({ x: 10, y: 0 }),
    toScene({ x: 10, y: 10 }),
  ];

  it("faces the way it walks on each leg", () => {
    const first = alongRoute(route, 5);
    const second = alongRoute(route, 15);

    expect(first.position.distanceTo(toScene({ x: 5, y: 0 }))).toBeCloseTo(0);
    // The model faces along its +z axis, which is south; east is a quarter
    // turn from it, and north a half turn.
    expect(first.facing).toBeCloseTo(Math.PI / 2);
    expect(second.position.distanceTo(toScene({ x: 10, y: 5 }))).toBeCloseTo(0);
    expect(Math.abs(second.facing)).toBeCloseTo(Math.PI);
  });

  it("stays at the end once there, facing the way it arrived", () => {
    const end = alongRoute(route, 25);

    expect(end.position.distanceTo(toScene({ x: 10, y: 10 }))).toBeCloseTo(0);
    expect(Math.abs(end.facing)).toBeCloseTo(Math.PI);
  });
});
