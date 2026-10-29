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
let robots: typeof import("../src/render/robot-model");

beforeAll(async () => {
  models = await import("../src/render/models");
  robots = await import("../src/render/robot-model");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

/** The box round everything in a model, in the model's own frame. */
function boundsOf(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object, true);
}

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

/**
 * The Robot as it drives a Rover: sitting at the seat's height over the
 * Rover's middle, facing the same way, with its arms forward at the top of
 * their swing.
 */
function driver(): THREE.Group {
  const robot = robots.createRobotModel();
  robot.pose({
    legSwing: 0,
    seated: true,
    leftArm: 1,
    rightArm: 1,
    lean: 0.1,
    carrying: false,
  });
  robot.group.position.y = models.MACHINE_SEAT_HEIGHT - robots.HIP_HEIGHT;
  return robot.group;
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

  it.each(["Console", "Battery"])(
    "keeps its %s clear of the seated Robot's legs and arms",
    (name) => {
      const fitting = models.createRoverModel().group.getObjectByName(name);
      expect(fitting).toBeDefined();
      if (fitting === undefined) return;
      const robotParts = partBounds(driver());

      const clashes = partBounds(fitting).flatMap((box) =>
        robotParts.filter((part) => part.intersectsBox(box)),
      );

      expect(clashes).toEqual([]);
    },
  );
});
