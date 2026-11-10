import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { SHOWN_FROM_METRES, viewOf } from "../src/render/camera";

describe("moving the camera to show something on the base map", () => {
  it("looks at it from the same side, as steeply and from as far as before", () => {
    const view = viewOf(
      new THREE.Vector3(17, 8, 21),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(100, 0, -50),
    );

    expect(view.focus.toArray()).toEqual([100, 0, -50]);
    expect(view.position.toArray()).toEqual([117, 8, -29]);
  });

  it("closes in on it from far away, still from the same side and as steeply", () => {
    // 1,000 m off, where a Structure is a few pixels across.
    const view = viewOf(
      new THREE.Vector3(0, 800, 600),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 0, 10),
    );

    expect(view.focus.toArray()).toEqual([10, 0, 10]);
    expect(view.position.x).toBeCloseTo(10);
    expect(view.position.y).toBeCloseTo(0.8 * SHOWN_FROM_METRES);
    expect(view.position.z).toBeCloseTo(10 + 0.6 * SHOWN_FROM_METRES);
  });

  it("looks at the ground under something raised above it, such as a Robot aboard a Machine", () => {
    const view = viewOf(
      new THREE.Vector3(0, 30, 40),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(5, 1.2, 5),
    );

    expect(view.focus.toArray()).toEqual([5, 0, 5]);
    expect(view.position.toArray()).toEqual([5, 30, 45]);
  });
});
