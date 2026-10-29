import * as THREE from "three";
import { beforeAll, describe, expect, it, vi } from "vitest";
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

/** The box round everything in a model, in the model's own frame. */
function boundsOf(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object, true);
}

describe("the Rover's model", () => {
  it("stands on the ground within the Rover's footprint", () => {
    const bounds = boundsOf(models.createRoverModel().group);
    const radius = catalogue.rover.footprintRadiusMetres;

    expect(bounds.min.y).toBeCloseTo(0, 1);
    for (const axis of ["x", "z"] as const) {
      expect(bounds.min[axis]).toBeGreaterThanOrEqual(-radius);
      expect(bounds.max[axis]).toBeLessThanOrEqual(radius);
    }
  });

  it("seats the Robot at the same height as a Machine does", () => {
    const rover = models.createRoverModel().group;
    const seat = rover.getObjectByName("Seat");

    expect(seat).toBeDefined();
    if (seat === undefined) return;
    expect(boundsOf(seat).max.y).toBeCloseTo(models.MACHINE_SEAT_HEIGHT, 3);
  });
});
