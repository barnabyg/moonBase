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
let plants: typeof import("../src/render/plant-models");

beforeAll(async () => {
  models = await import("../src/render/models");
  plants = await import("../src/render/plant-models");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

/**
 * The box round everything in a model that shows, in the model's own frame,
 * leaving out any part named `leaveOut`.
 */
function boundsOf(object: THREE.Object3D, leaveOut?: string): THREE.Box3 {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const visit = (child: THREE.Object3D) => {
    if (!child.visible || child.name === leaveOut) return;
    if (child instanceof THREE.Mesh) {
      box.union(new THREE.Box3().setFromObject(child, true));
    }
    child.children.forEach(visit);
  };
  visit(object);
  return box;
}

/** The one part of a model with the given name, or undefined if it has none. */
function partNamed(
  object: THREE.Object3D,
  name: string,
): THREE.Object3D | undefined {
  const found: THREE.Object3D[] = [];
  object.traverse((child) => {
    if (child.name === name) found.push(child);
  });
  expect(found.length).toBeLessThanOrEqual(1);
  return found[0];
}

// Every Plant built on a plinth, and the concentrator tower, which is drawn
// in as much detail. The Greenhouse's dome and the Growing hall, dug into the
// ground, have models of their own.
const detailed = catalogue.structureTypes.filter(
  (type) =>
    (type.recipes !== undefined &&
      type.id !== "greenhouse" &&
      type.id !== "growing-hall") ||
    type.id === "concentrator-tower",
);

describe.each(detailed.map((type) => [type.id, type] as const))(
  "the %s's model",
  (_, type) => {
    // A haul line is scenery that runs out beyond the footprint without taking
    // the ground it crosses (see below), so it is left out here.
    it("stands on the ground within its footprint", () => {
      const model = models.createStructureModel(type.id);
      model.setAssembled(1);
      model.setFacing(0.7);

      const box = boundsOf(model.group, plants.HAUL_LINE_NAME);
      expect(box.min.y).toBeCloseTo(0, 1);
      const reach = Math.hypot(
        Math.max(-box.min.x, box.max.x),
        Math.max(-box.min.z, box.max.z),
      );
      expect(reach).toBeLessThanOrEqual(type.footprintRadiusMetres);
    });

    it("rises as it is assembled, with nothing standing at full height early", () => {
      const model = models.createStructureModel(type.id);
      model.setAssembled(1);
      const full = boundsOf(model.group).max.y;
      model.setAssembled(0.2);
      expect(boundsOf(model.group).max.y).toBeLessThan(full * 0.5);
    });
  },
);

// The cold-trap ice line's haul line runs out from its tank to the head in the
// crater, as scenery: the footprint stays the tank end's, so the haul line
// doesn't stop anything being built, walked or parked where it runs.
describe("the cold-trap ice line's haul line", () => {
  const haulLineOf = (model: { readonly group: THREE.Object3D }) => {
    const haulLine = partNamed(model.group, plants.HAUL_LINE_NAME);
    if (haulLine === undefined) throw new Error("expected a haul line");
    return haulLine;
  };
  const iceLineShape = () => {
    const shape = plants.PLANT_SHAPES["cold-trap-ice-line"];
    if (shape?.haulLine === undefined) throw new Error("expected a haul line");
    return { shape, haulLine: shape.haulLine };
  };

  it("is the only Plant's", () => {
    for (const id of Object.keys(plants.PLANT_SHAPES)) {
      const model = models.createStructureModel(id);
      expect(partNamed(model.group, plants.HAUL_LINE_NAME) !== undefined).toBe(
        id === "cold-trap-ice-line",
      );
    }
  });

  it("runs 15 to 20 m straight back from its tank, low and narrow", () => {
    const { haulLine } = iceLineShape();
    expect(haulLine.heading).toBe(0);
    const [tankX, tankZ] = haulLine.from;
    const model = models.createStructureModel("cold-trap-ice-line");
    model.setAssembled(1);

    const box = boundsOf(haulLineOf(model));
    expect(box.min.y).toBeCloseTo(0, 1);
    expect(box.max.y).toBeLessThan(1.5);
    expect(tankZ - box.min.z).toBeGreaterThanOrEqual(15);
    expect(tankZ - box.min.z).toBeLessThanOrEqual(20);
    expect(box.max.z).toBeLessThanOrEqual(tankZ + 0.5);
    expect(box.min.x).toBeGreaterThan(tankX - 1);
    expect(box.max.x).toBeLessThan(tankX + 1);
  });

  it("turns with its heading, anticlockwise seen from above", () => {
    const { shape, haulLine } = iceLineShape();
    const model = plants.createPlantModel({
      ...shape,
      haulLine: { ...haulLine, heading: Math.PI / 2 },
    });
    model.setAssembled(1);

    // A quarter turn takes it from the back of the plinth to the left.
    const box = boundsOf(haulLineOf(model));
    expect(haulLine.from[0] - box.min.x).toBeGreaterThanOrEqual(15);
    expect(box.max.z - box.min.z).toBeLessThan(2);
  });

  it("rises with the rest of the Plant as it is assembled", () => {
    const model = models.createStructureModel("cold-trap-ice-line");
    model.setAssembled(1);
    const full = boundsOf(haulLineOf(model)).max.y;
    model.setAssembled(0.2);
    expect(boundsOf(haulLineOf(model)).max.y).toBeLessThan(full * 0.5);
  });

  it("is drawn in a handful of meshes", () => {
    const model = models.createStructureModel("cold-trap-ice-line");
    let meshes = 0;
    haulLineOf(model).traverse((child) => {
      if (child instanceof THREE.Mesh) meshes += 1;
    });
    expect(meshes).toBeGreaterThan(0);
    expect(meshes).toBeLessThanOrEqual(6);
  });

  it("picks its Structure when clicked, far beyond the footprint", async () => {
    const { markStructure, pickStructure } =
      await import("../src/render/picking");
    const view = new THREE.Group();
    markStructure(view, "ice-line");
    const model = models.createStructureModel("cold-trap-ice-line");
    model.setAssembled(1);
    view.add(model.group);
    view.updateMatrixWorld(true);

    // Straight down onto the pipe, 10 m back from the tank.
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(-1.5, 10, -10),
      new THREE.Vector3(0, -1, 0),
    );
    const hits = raycaster.intersectObjects([view], true);
    expect(hits.length).toBeGreaterThan(0);
    expect(pickStructure(hits, undefined, [])).toBe("ice-line");
  });
});
