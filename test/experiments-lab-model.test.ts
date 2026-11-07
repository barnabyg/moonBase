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

const lab = catalogue.structureTypes.find(
  (type) => type.id === "experiments-lab",
);
if (lab === undefined) throw new Error("expected an automated experiments lab");

/** The box round everything in a model that shows, in the model's own frame. */
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

describe("the automated experiments lab's model", () => {
  it("is its own model, standing on the ground within its footprint", () => {
    const model = models.createStructureModel(lab.id);
    expect(model.group.name).toBe("Automated experiments lab");
    model.setAssembled(1);

    const box = boundsOf(model.group);
    expect(box.min.y).toBeCloseTo(0, 2);
    // Its corners are what reach furthest from its centre.
    const corner = Math.hypot(
      Math.max(-box.min.x, box.max.x),
      Math.max(-box.min.z, box.max.z),
    );
    expect(corner).toBeLessThanOrEqual(lab.footprintRadiusMetres);
  });

  it("goes up in stages through Assembly, the racks and radiator last", () => {
    const model = models.createStructureModel(lab.id);
    model.setAssembled(0.3);
    const part = boundsOf(model.group);
    model.setAssembled(1);
    const whole = boundsOf(model.group);

    expect(part.max.y).toBeLessThan(whole.max.y);
  });

  it("lights its ports while it runs", () => {
    const model = models.createStructureModel(lab.id);
    model.setAssembled(1);
    const glowing = () => {
      let any = false;
      model.group.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          child.material instanceof THREE.MeshStandardMaterial &&
          child.material.emissiveIntensity > 0 &&
          child.material.emissive.getHex() !== 0
        ) {
          any = true;
        }
      });
      return any;
    };

    model.setRunning?.(false, 0);
    const idle = glowing();
    model.setRunning?.(true, 1);

    expect(glowing()).toBe(true);
    expect(idle).toBe(false);
  });
});
