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

/** How many of a model's parts there are, by the shape of their geometry. */
function geometryKinds(object: THREE.Object3D): string {
  const kinds: string[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const geometry = child.geometry as THREE.BoxGeometry;
      kinds.push(`${geometry.type}:${JSON.stringify(geometry.parameters)}`);
    }
  });
  return kinds.sort().join();
}

const newStructures = [
  ["concentrator-tower", "Concentrator tower"],
  ["array-works", "Array works"],
  ["thermal-store", "Thermal store"],
  ["cold-trap-ice-line", "Cold-trap ice line"],
  ["propellant-plant", "Propellant plant"],
  ["large-propellant-plant", "Large propellant plant"],
  ["optics-works", "Optics works"],
  ["grinding-line", "Grinding line"],
] as const;

describe.each(newStructures)("the %s's model", (id, name) => {
  const type = catalogue.structureTypes.find(
    (candidate) => candidate.id === id,
  );
  if (type === undefined) throw new Error(`expected a Structure type ${id}`);

  it("is its own, unlike any other Structure's, standing on the ground within its footprint", () => {
    const model = models.createStructureModel(id);
    expect(model.group.name).toBe(name);
    model.setAssembled(1);

    const box = boundsOf(model.group);
    expect(box.min.y).toBeCloseTo(0, 1);
    const reach = Math.hypot(
      Math.max(-box.min.x, box.max.x),
      Math.max(-box.min.z, box.max.z),
    );
    expect(reach).toBeLessThanOrEqual(type.footprintRadiusMetres);

    const own = geometryKinds(model.group);
    for (const other of catalogue.structureTypes) {
      if (other.id === id) continue;
      expect(
        geometryKinds(models.createStructureModel(other.id).group),
      ).not.toBe(own);
    }
  });

  it("rises as it is assembled", () => {
    const model = models.createStructureModel(id);
    model.setAssembled(0.2);
    const part = boundsOf(model.group).max.y;
    model.setAssembled(1);
    expect(boundsOf(model.group).max.y).toBeGreaterThan(part);
  });
});

describe("the concentrator tower's mirrors", () => {
  it("turn to follow the sun", () => {
    const model = models.createStructureModel("concentrator-tower");
    model.setAssembled(1);
    const faces = () => {
      const angles: number[] = [];
      model.group.traverse((child) => {
        if (child.name === "" && child instanceof THREE.Group) {
          angles.push(child.rotation.y);
        }
      });
      return angles;
    };
    model.setFacing(1.2);
    expect(faces()).toContain(1.2);
  });
});
