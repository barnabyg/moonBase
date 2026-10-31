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

const greenhouse = catalogue.structureTypes.find(
  (type) => type.id === "greenhouse",
);
if (greenhouse === undefined) throw new Error("expected a Greenhouse");
const footprint = greenhouse.footprintRadiusMetres;

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

/** The named part of a model. */
function partOf(model: THREE.Object3D, name: string): THREE.Object3D {
  const found = model.getObjectByName(name);
  if (found === undefined) throw new Error(`expected ${name}`);
  return found;
}

/** The materials of what shows in a model that glow, with how brightly. */
function glowOf(model: THREE.Object3D): number {
  let glow = 0;
  model.traverseVisible((child) => {
    if (
      child instanceof THREE.Mesh &&
      child.material instanceof THREE.MeshStandardMaterial &&
      child.material.emissive.getHex() !== 0
    ) {
      glow += child.material.emissiveIntensity;
    }
  });
  return glow;
}

describe("the Greenhouse's model", () => {
  it("is its own model, a dome standing on the ground within its footprint", () => {
    const model = models.createStructureModel(greenhouse.id);
    model.setAssembled(1);

    expect(model.group.name).toBe("Greenhouse");
    const box = boundsOf(model.group);
    expect(box.min.y).toBeCloseTo(0, 2);
    expect(
      Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z),
    ).toBeLessThanOrEqual(footprint);
    expect(box.max.y).toBeGreaterThan(3);
  });

  it("is visibly lit at Night: its panes, lamps and crop all glow while its lamps are on, and none of them once they are off", () => {
    const model = models.createStructureModel(greenhouse.id);
    model.setAssembled(1);
    expect(glowOf(model.group)).toBe(0);

    model.setLit(true);

    const panes = partOf(model.group, "Panes") as THREE.Mesh;
    const material = panes.material as THREE.MeshStandardMaterial;
    expect(material.emissive.getHex()).not.toBe(0);
    expect(material.emissiveIntensity).toBeGreaterThan(0.5);
    // The panes, the three lamps and the six trays of crop.
    expect(glowOf(model.group)).toBeGreaterThan(0.5 + 3);

    model.setLit(false);
    expect(glowOf(model.group)).toBe(0);
  });

  it("shines its light from under the top of the dome, as the view places it, and goes up ribs first, then racks, then panes", () => {
    const model = models.createStructureModel(greenhouse.id);
    expect(model.lightHeight).toBeGreaterThan(1);

    model.setAssembled(0.2);
    expect(partOf(model.group, "Ribs").visible).toBe(true);
    expect(partOf(model.group, "Racks").visible).toBe(false);
    expect(partOf(model.group, "Panes").visible).toBe(false);

    model.setAssembled(0.5);
    expect(partOf(model.group, "Racks").visible).toBe(true);
    expect(partOf(model.group, "Panes").visible).toBe(false);

    model.setAssembled(1);
    expect(partOf(model.group, "Panes").visible).toBe(true);
  });
});
