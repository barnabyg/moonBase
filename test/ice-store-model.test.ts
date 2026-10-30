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

const { containers, radiusMetres } = catalogue.stockpile.iceStore;

describe("the ice store's model", () => {
  const model = () => models.createIceStoreModel(containers);

  it("shows only the containers holding ice", () => {
    const store = model();
    const { group } = store;
    const shown = () =>
      group.children.filter(
        (child) => child.name === "Ice container" && child.visible,
      ).length;

    expect(shown()).toBe(0);
    store.showLevels([1, 0.5]);
    expect(shown()).toBe(2);
    store.showLevels([1, 1, 1, 1, 1, 1, 1]);
    expect(shown()).toBe(7);
    store.showLevels([0.25]);
    expect(shown()).toBe(1);
  });

  it("raises the ice in a container with its level", () => {
    const store = model();
    const { group } = store;
    const iceHeight = () =>
      new THREE.Box3().setFromObject(
        group.getObjectByName("Ice") ?? new THREE.Object3D(),
      ).max.y;

    store.showLevels([0.25]);
    const low = iceHeight();
    store.showLevels([1]);

    expect(iceHeight()).toBeGreaterThan(low * 2);
  });

  it("stands within the store's ground", () => {
    const store = model();
    const { group } = store;
    store.showLevels(Array.from({ length: containers }, () => 1));
    const box = new THREE.Box3().setFromObject(group);

    expect(
      Math.max(box.max.x, box.max.z, -box.min.x, -box.min.z),
    ).toBeLessThanOrEqual(radiusMetres);
  });
});
