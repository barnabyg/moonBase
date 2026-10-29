import * as THREE from "three";
import { uncoveredRegolithHeap } from "../simulation";
import { toScene, type Frame } from "./interpolation";
import { REGOLITH_TILE_METRES } from "./regolith-texture";
import { fixedRandom } from "./scenery";

/** How many points go round the heap, and how many rings rise from its foot to its top. */
const AROUND = 32;
const RINGS = 7;
/** How far the heap's outline wanders in and out about its average, as a share of its radius. */
const OUTLINE_WANDER = 0.14;
/** How far its surface rises and falls, as a share of its height. */
const SURFACE_WANDER = 0.08;
/** How far out from the middle the top is rounded off, as a share of the radius. */
const ROUNDED_TOP = 0.22;
/** How far below the ground the heap's foot is sunk, so that no seam shows. */
const SUNK_METRES = 0.02;
/** The size the texture is laid at, as if over the largest heap, so the grains look as large as the ground's. */
const TEXTURE_METRES = 2.5;

/**
 * A low, slightly lopsided mound reaching out to radius 1, as high as a
 * cone of radius 1 and height 1 with its top rounded off, standing on the
 * ground at its origin, to be scaled to the heap: a cone of loose Regolith
 * with a rounded top and an uneven outline and surface, with texture
 * coordinates across it and a colour at each point, darker towards the
 * foot, for the ground's material.
 */
export function createRegolithHeapGeometry(): THREE.BufferGeometry {
  const random = fixedRandom(1500);
  // Smooth wander round the outline: a few waves of random phase.
  const waves = Array.from({ length: 3 }, (_, index) => ({
    times: index + 2,
    phase: random() * Math.PI * 2,
    size: (random() * 0.5 + 0.5) / (index + 1),
  }));
  const total = waves.reduce((sum, wave) => sum + wave.size, 0);
  const wander = (angle: number) =>
    waves.reduce(
      (sum, wave) =>
        sum + Math.sin(angle * wave.times + wave.phase) * wave.size,
      0,
    ) / total;

  const positions: number[] = [];
  const uvs: number[] = [];
  const colours: number[] = [];
  const indices: number[] = [];
  // The top's single point, then each ring from the top down to the foot.
  const uvScale = TEXTURE_METRES / REGOLITH_TILE_METRES / 2;
  positions.push(0, profile(0), 0);
  uvs.push(uvScale, uvScale);
  colours.push(1, 1, 1);
  for (let ring = 1; ring <= RINGS; ring++) {
    const out = ring / RINGS;
    for (let step = 0; step < AROUND; step++) {
      const angle = (step / AROUND) * Math.PI * 2;
      // Wandering in from the radius, never out past it.
      const radius =
        (out * (1 + wander(angle) * OUTLINE_WANDER)) / (1 + OUTLINE_WANDER);
      const bumps =
        ring === RINGS ? 0 : (random() - 0.5) * 2 * SURFACE_WANDER * (1 - out);
      const height = ring === RINGS ? -SUNK_METRES : profile(out) * (1 + bumps);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      positions.push(x, height, z);
      uvs.push((x + 1) * uvScale, (z + 1) * uvScale);
      const shade = 0.92 + 0.08 * (1 - out) + (random() - 0.5) * 0.04;
      colours.push(shade, shade, shade);
    }
  }
  const at = (ring: number, step: number) =>
    ring === 0 ? 0 : 1 + (ring - 1) * AROUND + (step % AROUND);
  for (let step = 0; step < AROUND; step++) {
    indices.push(0, at(1, step + 1), at(1, step));
  }
  for (let ring = 1; ring < RINGS; ring++) {
    for (let step = 0; step < AROUND; step++) {
      const a = at(ring, step);
      const b = at(ring, step + 1);
      const c = at(ring + 1, step);
      const d = at(ring + 1, step + 1);
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** The heap's height at a share of the way out from its middle: a cone with its top rounded off. */
function profile(out: number): number {
  if (out >= ROUNDED_TOP) return 1 - out;
  // A curve meeting the cone's slope where the rounding ends.
  const rounded = 1 - ROUNDED_TOP / 2;
  return rounded - (out * out) / (2 * ROUNDED_TOP);
}

/**
 * Draws the heap of the base's Regolith beside the stockpile's mat,
 * growing and shrinking with the stock, in the ground's own material so
 * that it reads as dug ground.
 */
export function createRegolithHeapView(
  scene: THREE.Scene,
  groundMaterial: THREE.Material,
) {
  const mesh = new THREE.Mesh(createRegolithHeapGeometry(), groundMaterial);
  mesh.name = "Regolith heap";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.visible = false;
  scene.add(mesh);
  return {
    update(frame: Frame): void {
      const heap = uncoveredRegolithHeap(frame.current);
      mesh.visible = heap !== undefined;
      if (heap === undefined) return;
      mesh.position.copy(toScene(heap.position));
      mesh.scale.set(heap.radiusMetres, heap.heightMetres, heap.radiusMetres);
    },
  };
}
