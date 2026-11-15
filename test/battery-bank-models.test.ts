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

/** The box round a complete model, in its own frame. */
function boundsOf(structureTypeId: string): THREE.Box3 {
  const model = models.createStructureModel(structureTypeId);
  model.setAssembled(1);
  model.group.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(model.group, true);
}

const footprint = (id: string) =>
  catalogue.structureTypes.find((type) => type.id === id)
    ?.footprintRadiusMetres ?? 0;

describe("the Whipple-shielded large battery bank's model", () => {
  it("is drawn as a large battery bank with bumper plates standing clear of it, within its footprint", () => {
    const plain = boundsOf("large-battery-bank");
    const shielded = boundsOf("whipple-shielded-large-battery-bank");

    // Wider and taller than the large bank, by its end and roof plates;
    // the back plate stands within the plinth.
    expect(shielded.max.x).toBeGreaterThan(plain.max.x);
    expect(shielded.max.y).toBeGreaterThan(plain.max.y);
    // Nowhere near as big as a small bank's, which it isn't.
    expect(shielded.max.x).toBeGreaterThan(
      boundsOf("battery-bank").max.x + 0.5,
    );
    const reach = Math.max(
      ...[shielded.min.x, shielded.max.x, shielded.min.z, shielded.max.z].map(
        Math.abs,
      ),
    );
    expect(reach).toBeLessThan(
      footprint("whipple-shielded-large-battery-bank"),
    );
  });
});
