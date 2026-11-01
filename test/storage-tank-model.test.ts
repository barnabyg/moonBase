import * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { catalogue } from "../src/catalogue";

// The materials draw their textures on a canvas when they load; under Node
// there is none, so they fall back to plain colours, as in a browser that
// can't draw on one.
vi.stubGlobal("document", {
  createElement: () => ({ getContext: () => null }),
});

let models: typeof import("../src/render/models");

beforeAll(async () => {
  models = await import("../src/render/models");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const tanks = catalogue.structureTypes.filter(
  ({ storageTank }) => storageTank !== undefined,
);

function boundsOf(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3();
  object.traverseVisible((child) => {
    if (child instanceof THREE.Mesh) {
      box.union(new THREE.Box3().setFromObject(child, true));
    }
  });
  return box;
}

/** How many of a model's small flat lights are lit. */
function lightsLit(object: THREE.Object3D): number {
  let lit = 0;
  object.traverse((child) => {
    if (
      child instanceof THREE.Mesh &&
      child.geometry instanceof THREE.BoxGeometry &&
      child.geometry.parameters.depth === 0.03 &&
      child.material instanceof THREE.MeshStandardMaterial &&
      child.material.emissive.getHex() !== 0
    ) {
      lit += 1;
    }
  });
  return lit;
}

describe("a storage tank's model", () => {
  it.each(
    tanks.map(
      ({ id, label, footprintRadiusMetres }) =>
        [id, label, footprintRadiusMetres] as const,
    ),
  )(
    "%s has a model of its own, named %s, that stands on the ground within its footprint",
    (id, label, footprint) => {
      const model = models.createStructureModel(id);
      model.setAssembled(1);

      expect(model.group.name).toBe(label);
      const box = boundsOf(model.group);
      expect(box.min.y).toBeCloseTo(0, 1);
      expect(box.max.x).toBeLessThanOrEqual(footprint);
      expect(-box.min.x).toBeLessThanOrEqual(footprint);
      expect(box.max.z).toBeLessThanOrEqual(footprint);
      expect(-box.min.z).toBeLessThanOrEqual(footprint);
    },
  );

  it("draws the oxygen tank as a large sphere, and the water tank as a long capsule", () => {
    const sized = (id: string) => {
      const model = models.createStructureModel(id);
      model.setAssembled(1);
      const vessel = model.group.getObjectByName("Vessel");
      if (vessel === undefined) throw new Error("expected a vessel");
      return boundsOf(vessel).getSize(new THREE.Vector3());
    };

    const sphere = sized("oxygen-tank");
    expect(sphere.x).toBeCloseTo(sphere.z, 1);
    expect(sphere.z).toBeGreaterThan(3);
    const capsule = sized("water-tank");
    expect(capsule.x).toBeGreaterThan(1.8 * capsule.z);
  });

  it("draws the propellant tank as a fat capsule, with radiators on top, unlike either of the others", () => {
    const model = models.createStructureModel("propellant-tank");
    model.setAssembled(1);
    const vessel = model.group.getObjectByName("Vessel");
    if (vessel === undefined) throw new Error("expected a vessel");
    const size = boundsOf(vessel).getSize(new THREE.Vector3());

    expect(size.x).toBeGreaterThan(1.5 * size.z);
    const water = models.createStructureModel("water-tank");
    water.setAssembled(1);
    const waterVessel = water.group.getObjectByName("Vessel");
    if (waterVessel === undefined) throw new Error("expected a vessel");
    expect(size.z).toBeGreaterThan(
      boundsOf(waterVessel).getSize(new THREE.Vector3()).z,
    );
    // A radiator's height stands above the top of the vessel itself.
    expect(boundsOf(vessel).max.y).toBeGreaterThan(1.9 + 1.5 + 0.5);
  });

  it("shows how full the propellant tank is on its own column of lights", () => {
    const model = models.createStructureModel("propellant-tank");
    model.setAssembled(1);

    model.setCharge(0.5);
    expect(lightsLit(model.group)).toBe(4);
    model.setCharge(1);
    expect(lightsLit(model.group)).toBe(8);
  });

  it("goes up during Assembly: nothing at first, then the cradle, then the vessel", () => {
    const model = models.createStructureModel("oxygen-tank");
    const vessel = model.group.getObjectByName("Vessel");
    const cradle = model.group.getObjectByName("Cradle");

    model.setAssembled(0);
    expect(cradle?.visible).toBe(false);
    expect(vessel?.visible).toBe(false);

    model.setAssembled(0.2);
    expect(cradle?.visible).toBe(true);
    expect(vessel?.visible).toBe(false);

    model.setAssembled(1);
    expect(vessel?.visible).toBe(true);
    expect(vessel?.scale.x).toBe(1);
  });

  it("shows how full it is on a column of lights, none when empty and all when full, even with a stock over its share", () => {
    const model = models.createStructureModel("water-tank");
    model.setAssembled(1);

    model.setCharge(0);
    expect(lightsLit(model.group)).toBe(0);

    model.setCharge(0.5);
    expect(lightsLit(model.group)).toBe(3);

    model.setCharge(1);
    expect(lightsLit(model.group)).toBe(6);

    model.setCharge(1.7);
    expect(lightsLit(model.group)).toBe(6);
  });
});
