import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FAR_PLANE_METRES, HIGHEST_IN_VIEW } from "../src/render/camera";
import { SURROUNDINGS_RADIUS } from "../src/render/scenery";
import { createStars } from "../src/render/stars";

const DAYLIGHT = { part: "daylight", minutesRemaining: 600 } as const;
const NIGHT = { part: "night", minutesRemaining: 600 } as const;

/** Where each star is drawn, in the scene, after an update with the camera here. */
function starsSeenFrom(camera: THREE.Vector3): THREE.Vector3[] {
  const stars = createStars();
  stars.update(NIGHT, camera);
  const points = stars.object as THREE.Points;
  points.updateMatrixWorld();
  const position = points.geometry.getAttribute("position");
  return Array.from({ length: position.count }, (_, index) =>
    new THREE.Vector3()
      .fromBufferAttribute(position, index)
      .applyMatrix4(points.matrixWorld),
  );
}

function elevation(direction: THREE.Vector3): number {
  return Math.asin(direction.y / direction.length());
}

describe("the stars", () => {
  it("show at Night and not in Daylight", () => {
    const stars = createStars();
    const camera = new THREE.Vector3(10, 20, 30);

    stars.update(NIGHT, camera);
    expect(stars.object.visible).toBe(true);

    stars.update(DAYLIGHT, camera);
    expect(stars.object.visible).toBe(false);
  });

  it("give no light, and stay fine points at every zoom without tone mapping dimming them", () => {
    const { object } = createStars();
    const lights: THREE.Object3D[] = [];
    object.traverse((part) => {
      if (part instanceof THREE.Light) lights.push(part);
    });

    expect(lights).toEqual([]);
    expect(object).toBeInstanceOf(THREE.Points);
    const material = (object as THREE.Points).material;
    expect(material).toBeInstanceOf(THREE.PointsMaterial);
    expect(material).toMatchObject({
      sizeAttenuation: false,
      toneMapped: false,
      fog: false,
    });
  });

  it("are a sparse scatter all round the band of sky the camera can see", () => {
    const camera = new THREE.Vector3(0, 2, 0);
    const directions = starsSeenFrom(camera).map((star) => star.sub(camera));

    expect(directions.length).toBeGreaterThan(30);
    expect(directions.length).toBeLessThan(150);
    for (const direction of directions) {
      expect(elevation(direction)).toBeGreaterThan(0);
      expect(elevation(direction)).toBeLessThan(HIGHEST_IN_VIEW);
    }
    // A few in every quarter of the horizon.
    const quarters = [0, 1, 2, 3].map(
      (quarter) =>
        directions.filter((direction) => {
          const azimuth = Math.atan2(direction.z, direction.x) + Math.PI;
          return Math.floor(azimuth / (Math.PI / 2)) % 4 === quarter;
        }).length,
    );
    for (const count of quarters) expect(count).toBeGreaterThanOrEqual(5);
  });

  it("are beyond the hills and Earth, and nearer than the far plane", () => {
    const camera = new THREE.Vector3(480, 1400, -480);
    for (const star of starsSeenFrom(camera)) {
      expect(star.distanceTo(camera)).toBeGreaterThan(
        SURROUNDINGS_RADIUS * 1.5,
      );
      expect(star.distanceTo(camera)).toBeLessThan(FAR_PLANE_METRES * 0.9);
    }
  });

  it("hold steady against each other and the horizon as the camera moves", () => {
    const here = new THREE.Vector3(0, 8, 0);
    const there = new THREE.Vector3(-450, 900, 300);
    const fromHere = starsSeenFrom(here).map((star) =>
      star.sub(here).normalize(),
    );
    const fromThere = starsSeenFrom(there).map((star) =>
      star.sub(there).normalize(),
    );

    expect(fromThere).toHaveLength(fromHere.length);
    for (const [index, direction] of fromHere.entries()) {
      const there = fromThere[index] ?? new THREE.Vector3();
      expect(direction.angleTo(there)).toBeLessThan(1e-6);
    }
  });

  it("are in the same places on every load", () => {
    const camera = new THREE.Vector3(0, 8, 0);

    expect(starsSeenFrom(camera)).toEqual(starsSeenFrom(camera));
  });

  it("are faint, and vary in brightness", () => {
    const points = createStars().object as THREE.Points;
    const colour = points.geometry.getAttribute("color");
    const brightness = Array.from({ length: colour.count }, (_, index) =>
      Math.max(colour.getX(index), colour.getY(index), colour.getZ(index)),
    );

    expect(Math.max(...brightness)).toBeLessThanOrEqual(0.8);
    expect(Math.max(...brightness) / Math.min(...brightness)).toBeGreaterThan(
      3,
    );
    expect(points.material).toMatchObject({ vertexColors: true });
  });
});
