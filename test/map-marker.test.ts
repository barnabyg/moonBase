import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createMapMarker,
  MARKED_SECONDS,
  type MapSubject,
  type Marked,
} from "../src/render/map-marker";

const array: MapSubject = { kind: "structure", id: "structure-1" };
const robot: MapSubject = { kind: "robot", id: "robot-1" };

/** Where each thing on a made-up map stands; the Robot is away on an Expedition. */
/** A camera 50 m above the solar array. */
const above = new THREE.Vector3(30, 50, -20);

const where = (subject: MapSubject): Marked | undefined =>
  subject.kind === "structure"
    ? { position: new THREE.Vector3(30, 0, -20), radiusMetres: 6 }
    : undefined;

describe("marking something on the base map", () => {
  it("marks what the player asked to be shown, where it stands, for a few seconds", () => {
    const marker = createMapMarker(new THREE.Scene());
    expect(marker.update(0, where, above)).toBeUndefined();
    expect(marker.ring.visible).toBe(false);

    marker.show(array, 10);

    expect(marker.update(10, where, above)).toEqual(array);
    expect(marker.ring.visible).toBe(true);
    expect(marker.ring.position.x).toBe(30);
    expect(marker.ring.position.z).toBe(-20);
    expect(marker.update(10 + MARKED_SECONDS - 0.1, where, above)).toEqual(
      array,
    );
    expect(
      marker.update(10 + MARKED_SECONDS + 0.1, where, above),
    ).toBeUndefined();
    expect(marker.ring.visible).toBe(false);
  });

  it("marks what is pointed out for as long as it is, ahead of what was shown", () => {
    const marker = createMapMarker(new THREE.Scene());
    const bank: MapSubject = { kind: "structure", id: "structure-2" };
    marker.show(array, 0);

    marker.pointOut(bank);
    expect(marker.update(1, where, above)).toEqual(bank);

    marker.pointOut(undefined);
    expect(marker.update(2, where, above)).toEqual(array);

    // Long after what was shown has stopped being marked.
    marker.pointOut(bank);
    expect(marker.update(1000, where, above)).toEqual(bank);
    marker.pointOut(undefined);
    expect(marker.update(1001, where, above)).toBeUndefined();
  });

  it("marks nothing for something that isn't on the map", () => {
    const marker = createMapMarker(new THREE.Scene());
    marker.show(robot, 0);

    expect(marker.update(1, where, above)).toBeUndefined();
    expect(marker.ring.visible).toBe(false);
  });

  it("rings its footprint from close by, and stays wide enough to see from far off", () => {
    const marker = createMapMarker(new THREE.Scene());
    marker.show(array, 0);

    marker.update(0, where, new THREE.Vector3(30, 40, -20));
    const close = marker.ring.scale.x;
    marker.update(0, where, new THREE.Vector3(30, 1200, -20));
    const far = marker.ring.scale.x;

    // Its site reaches 6 m, and the ring goes round it.
    expect(close).toBeGreaterThan(6);
    expect(close).toBeLessThan(9);
    // A ring of under 9 m would be a pixel or two across from 1,200 m.
    expect(far).toBeGreaterThan(25);
  });

  it("forgets what it marked, for a Campaign loaded in place of the last", () => {
    const marker = createMapMarker(new THREE.Scene());
    marker.show(array, 0);
    marker.pointOut(array);

    marker.clear();

    expect(marker.update(0, where, above)).toBeUndefined();
  });
});
