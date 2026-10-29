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

const area = catalogue.structureTypes.find(
  (type) => type.id === "parking-area",
);
if (area?.parking === undefined) throw new Error("expected a parking area");
const { bayOffsets } = area.parking;

/** The box round each part of a model that shows, each in the model's frame. */
function partBounds(object: THREE.Object3D): THREE.Box3[] {
  object.updateMatrixWorld(true);
  const boxes: THREE.Box3[] = [];
  object.traverseVisible((child) => {
    if (child instanceof THREE.Mesh) {
      boxes.push(new THREE.Box3().setFromObject(child, true));
    }
  });
  return boxes;
}

describe("the parking area's model", () => {
  it("stays within its footprint once assembled", () => {
    const model = models.createStructureModel("parking-area");
    model.setAssembled(1);

    // Each part is round or small, so the circle round its box's widest
    // side holds it.
    for (const box of partBounds(model.group)) {
      const centre = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      expect(
        Math.hypot(centre.x, centre.z) + Math.max(size.x, size.z) / 2,
      ).toBeLessThanOrEqual(area.footprintRadiusMetres + 1e-6);
    }
  });

  it("leaves every bay clear of anything standing up, for the largest Machine or Rover parked in it", () => {
    const largest = Math.max(
      catalogue.rover.footprintRadiusMetres,
      ...catalogue.machineTypes.map((type) => type.footprintRadiusMetres),
    );
    const model = models.createStructureModel("parking-area");
    model.setAssembled(1);
    const standing = partBounds(model.group).filter((box) => box.max.y > 0.1);

    expect(standing.length).toBeGreaterThan(0);
    for (const offset of bayOffsets) {
      // Ground y runs north, the scene's z south.
      const bay = new THREE.Vector3(offset.x, 0, -offset.y);
      for (const box of standing) {
        const nearest = new THREE.Vector3(
          THREE.MathUtils.clamp(bay.x, box.min.x, box.max.x),
          0,
          THREE.MathUtils.clamp(bay.z, box.min.z, box.max.z),
        );
        expect(nearest.distanceTo(bay)).toBeGreaterThanOrEqual(largest);
      }
    }
  });

  it("puts up a socket for each bay during Assembly, and none before", () => {
    const model = models.createStructureModel("parking-area");
    const posts = () =>
      partBounds(model.group).filter((box) => box.max.y > 0.5).length;

    model.setAssembled(0);
    expect(posts()).toBe(0);
    model.setAssembled(1);
    // A socket's post and box each stand that tall, as does the status
    // light's post and its light.
    expect(posts()).toBe(2 * bayOffsets.length + 2);
  });
});
