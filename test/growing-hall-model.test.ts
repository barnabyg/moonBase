import * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { catalogue } from "../src/catalogue";

// The materials draw their textures on a canvas when they load; under Node
// there is none, so they fall back to plain colours.
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

const footprintOf = (id: string) =>
  catalogue.structureTypes.find((type) => type.id === id)
    ?.footprintRadiusMetres ?? 0;

function halfWidth(object: THREE.Object3D): number {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3();
  object.traverseVisible((child) => {
    if (child instanceof THREE.Mesh) {
      box.union(new THREE.Box3().setFromObject(child, true));
    }
  });
  return Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z);
}

describe("the growing hall's model", () => {
  it("goes up racks, then vault, then light pipes, within its footprint", () => {
    const model = models.createStructureModel("growing-hall");

    expect(model.group.name).toBe("Growing hall");
    const named = (name: string) => model.group.getObjectByName(name);
    model.setAssembled(0.2);
    expect(named("Racks")?.visible).toBe(true);
    expect(named("Vault")?.visible).toBe(false);
    model.setAssembled(0.5);
    expect(named("Vault")?.visible).toBe(true);
    expect(named("Light pipes")?.visible).toBe(false);
    model.setAssembled(1);
    expect(named("Light pipes")?.visible).toBe(true);
    expect(halfWidth(model.group)).toBeLessThanOrEqual(
      footprintOf("growing-hall"),
    );
  });
});

describe("the vault cistern's model", () => {
  it("is a ring of cells laid one after another, round the Buried Habitat's mound", () => {
    const model = models.createStructureModel("vault-cistern");

    expect(model.group.name).toBe("Vault cistern");
    model.setAssembled(0);
    expect(model.group.getObjectByName("Cell 1")?.visible).toBe(false);
    model.setAssembled(0.5);
    expect(model.group.getObjectByName("Cell 1")?.visible).toBe(true);
    expect(model.group.getObjectByName("Cell 16")?.visible).toBe(false);
    model.setAssembled(1);
    expect(model.group.getObjectByName("Cell 16")?.visible).toBe(true);
    expect(halfWidth(model.group)).toBeLessThanOrEqual(
      footprintOf("vault-cistern") + 0.5,
    );
  });
});
