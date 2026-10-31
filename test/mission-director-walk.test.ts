import * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { catalogue, type GroundPosition } from "../src/catalogue";
import { toScene } from "../src/render/interpolation";
import { footprintRadius } from "../src/simulation/construction";

// The materials draw their textures on a canvas when they load; under Node
// there is none, so they fall back to plain colours, as in a browser that
// can't draw on one.
vi.stubGlobal("document", {
  createElement: () => ({ getContext: () => null }),
});

let walking: typeof import("../src/render/mission-director-walk");
let landerModel: typeof import("../src/render/lander-model");
let models: typeof import("../src/render/models");

beforeAll(async () => {
  walking = await import("../src/render/mission-director-walk");
  landerModel = await import("../src/render/lander-model");
  models = await import("../src/render/models");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

interface Footing {
  readonly id: string;
  readonly structureTypeId: string;
  readonly position: GroundPosition;
}

function base({
  lander = { x: 0, y: 0 },
  structures,
  constructions = [],
}: {
  lander?: GroundPosition;
  structures: readonly Footing[];
  constructions?: readonly Footing[];
}) {
  return {
    lander: { position: lander },
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
  { lander, structures, constructions }: ReturnType<typeof base>,
): void {
  for (const point of pointsAlong(route)) {
    expect(point.distanceTo(toScene(lander.position))).toBeGreaterThanOrEqual(
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
  it("goes from the foot of the Lander's ladder round the Habitat to a hatch on its far side", () => {
    const habitat = habitatAt(24, -3);
    const site = base({ lander: { x: 4, y: -3 }, structures: [habitat] });

    const route = walking.routeToHatch(site, habitat);

    const start = route[0] ?? new THREE.Vector3(NaN);
    const ladderFoot = toScene(site.lander.position).add(
      landerModel.landerLadderFoot(catalogue.lander.footprintRadiusMetres),
    );
    expect(start.distanceTo(ladderFoot)).toBeCloseTo(0);
    // Level with the hatch, and just out from it.
    const end = route.at(-1) ?? new THREE.Vector3(NaN);
    const centre = toScene(habitat.position);
    expect(end.z).toBeCloseTo(centre.z);
    expect(end.x - centre.x).toBeGreaterThan(models.HABITAT_HATCH_OUT);
    expect(end.x - centre.x).toBeLessThan(models.HABITAT_HATCH_OUT + 1);
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

    const route = walking.routeToHatch(site, habitatAt(30, 0));

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

    const route = walking.routeToHatch(site, habitatAt(-6, 24));

    expectRoundEverything(route, site);
  });

  it("goes from the hatch of the Habitat they are leaving to the hatch of a Buried Habitat, which stands further out", () => {
    const leaving = habitatAt(0, 30);
    const buried = {
      id: "buried",
      structureTypeId: "buried-habitat",
      position: { x: 30, y: 30 },
    };
    const site = base({ structures: [leaving, buried] });

    const route = walking.routeToHatch(site, buried, leaving);

    const start = route[0] ?? new THREE.Vector3(NaN);
    const from = toScene(leaving.position);
    expect(start.z).toBeCloseTo(from.z);
    expect(start.x - from.x).toBeGreaterThan(models.HABITAT_HATCH_OUT);
    expect(start.x - from.x).toBeLessThan(models.HABITAT_HATCH_OUT + 1);
    const end = route.at(-1) ?? new THREE.Vector3(NaN);
    const to = toScene(buried.position);
    expect(end.x - to.x).toBeGreaterThan(models.BURIED_HABITAT_HATCH_OUT);
    expect(end.x - to.x).toBeLessThan(models.BURIED_HABITAT_HATCH_OUT + 1);
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
    const first = walking.alongRoute(route, 5);
    const second = walking.alongRoute(route, 15);

    expect(first.position.distanceTo(toScene({ x: 5, y: 0 }))).toBeCloseTo(0);
    // The model faces along its +z axis, which is south; east is a quarter
    // turn from it, and north a half turn.
    expect(first.facing).toBeCloseTo(Math.PI / 2);
    expect(second.position.distanceTo(toScene({ x: 10, y: 5 }))).toBeCloseTo(0);
    expect(Math.abs(second.facing)).toBeCloseTo(Math.PI);
  });

  it("stays at the end once there, facing the way it arrived", () => {
    const end = walking.alongRoute(route, 25);

    expect(end.position.distanceTo(toScene({ x: 10, y: 10 }))).toBeCloseTo(0);
    expect(Math.abs(end.facing)).toBeCloseTo(Math.PI);
  });
});
