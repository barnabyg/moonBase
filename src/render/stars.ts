import * as THREE from "three";
import type { LunationSnapshot } from "../simulation";
import { FAR_PLANE_METRES, HIGHEST_IN_VIEW } from "./camera";
import { fixedRandom, SURROUNDINGS_RADIUS } from "./scenery";

// A sparse scatter of faint stars in the black sky at Night. They are unlit
// points, not lights, so they leave the base as dark as it was.
//
// The top of the view never reaches much above the horizon, so the stars lie
// in a band just above the hills rather than over the whole sky, where most
// would never be seen. Their number is chosen for the dozen or so on screen
// when the view is tilted low.

const STAR_COUNT = 80;
const LOWEST_ELEVATION = THREE.MathUtils.degToRad(0.5);
const HIGHEST_ELEVATION = HIGHEST_IN_VIEW - THREE.MathUtils.degToRad(1);
/**
 * Beyond the land, whose hills and Earth above them hide the stars behind
 * them, and well inside the camera's far plane.
 */
const SKY_RADIUS_METRES = (SURROUNDINGS_RADIUS + FAR_PLANE_METRES) / 2;
/** Across, in CSS pixels: Three.js scales it by the screen's pixel ratio. */
const STAR_SIZE_PIXELS = 2;
/** The brightest and faintest, in linear colour. */
const BRIGHTEST = 0.55;
const FAINTEST = 0.05;

export interface Stars {
  /** What to add to the scene. */
  readonly object: THREE.Object3D;
  /**
   * Shows the stars at Night only, and keeps them centred on the camera, so
   * that they stay put against each other and the horizon as it moves. Call
   * once a frame, before drawing.
   */
  update(lunation: LunationSnapshot, cameraPosition: THREE.Vector3): void;
}

export function createStars(): Stars {
  const random = fixedRandom(1610);
  const positions = new Float32Array(STAR_COUNT * 3);
  const colours = new Float32Array(STAR_COUNT * 3);
  const lowest = Math.sin(LOWEST_ELEVATION);
  const highest = Math.sin(HIGHEST_ELEVATION);
  for (let index = 0; index < STAR_COUNT; index++) {
    // Spread evenly over the band of sky, as stars are.
    const azimuth = random() * Math.PI * 2;
    const height = THREE.MathUtils.lerp(lowest, highest, random());
    const across = Math.sqrt(1 - height * height);
    positions.set(
      [
        Math.cos(azimuth) * across * SKY_RADIUS_METRES,
        height * SKY_RADIUS_METRES,
        Math.sin(azimuth) * across * SKY_RADIUS_METRES,
      ],
      index * 3,
    );
    // Most are faint, a few brighter; some a little warmer, some bluer.
    const brightness = THREE.MathUtils.lerp(FAINTEST, BRIGHTEST, random() ** 3);
    const tint = random() - 0.5;
    colours.set(
      [
        brightness * (1 + 0.1 * tint),
        brightness,
        brightness * (1 - 0.1 * tint),
      ],
      index * 3,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));

  const points = new THREE.Points(
    geometry,
    // Unlit and untoned, a fixed number of pixels across however far away.
    new THREE.PointsMaterial({
      size: STAR_SIZE_PIXELS,
      sizeAttenuation: false,
      vertexColors: true,
      toneMapped: false,
      fog: false,
      depthWrite: false,
    }),
  );
  points.name = "Stars";
  return {
    object: points,
    update(lunation, cameraPosition) {
      points.visible = lunation.part === "night";
      points.position.copy(cameraPosition);
    },
  };
}
