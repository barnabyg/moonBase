import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  markStructure,
  pickStructure,
  type StructureSite,
} from "../src/render/picking";

/** A view of a Structure as the renderer draws one: a group with parts in it. */
function view(structureId: string): {
  group: THREE.Group;
  model: THREE.Group;
  part: THREE.Mesh;
} {
  const group = new THREE.Group();
  markStructure(group, structureId);
  const model = new THREE.Group();
  const part = new THREE.Mesh();
  model.add(part);
  group.add(model);
  return { group, model, part };
}

/** A ray hit on an object, at a distance along the ray. */
function hit(object: THREE.Object3D, distance: number): THREE.Intersection {
  return { object, distance, point: new THREE.Vector3() };
}

const noSites: readonly StructureSite[] = [];

describe("picking a Structure clicked in the 3D view", () => {
  it("picks the Structure whose part the pointer is over", () => {
    const array = view("s1");
    expect(pickStructure([hit(array.part, 10)], undefined, noSites)).toBe("s1");
  });

  it("picks the nearest of two Structures in line", () => {
    const near = view("near");
    const far = view("far");
    expect(
      pickStructure([hit(near.part, 5), hit(far.part, 12)], undefined, noSites),
    ).toBe("near");
  });

  it("looks through parts that aren't drawn, such as a model not yet assembled", () => {
    const planned = view("planned");
    planned.model.visible = false;
    const behind = view("behind");
    expect(
      pickStructure(
        [hit(planned.part, 5), hit(behind.part, 12)],
        undefined,
        noSites,
      ),
    ).toBe("behind");
  });

  it("ignores anything that isn't part of a Structure", () => {
    expect(
      pickStructure([hit(new THREE.Mesh(), 5)], undefined, noSites),
    ).toBeUndefined();
  });

  it("picks a Structure whose site the pointer is over, though nothing of it stands there yet", () => {
    const sites: StructureSite[] = [
      { structureId: "far", position: { x: 40, y: 0 }, radiusMetres: 3 },
      { structureId: "site", position: { x: 10, y: 5 }, radiusMetres: 3 },
    ];
    expect(pickStructure([], { x: 11, y: 6.5 }, sites)).toBe("site");
  });

  it("picks nothing on empty ground or in the sky", () => {
    const sites: StructureSite[] = [
      { structureId: "site", position: { x: 10, y: 5 }, radiusMetres: 3 },
    ];
    expect(pickStructure([], { x: 14, y: 5 }, sites)).toBeUndefined();
    expect(pickStructure([], undefined, sites)).toBeUndefined();
  });
});
