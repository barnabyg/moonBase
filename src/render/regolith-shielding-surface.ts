import * as THREE from "three";
import { layeredNoise, REGOLITH_TILE_METRES } from "./regolith-texture";
import { fixedRandom } from "./scenery";

/** How high Regolith shielding rises over the Habitat's dome. */
export const SHIELDING_HEIGHT = 3.4;
/** The radius of the shielding where it meets the ground, just inside its footprint. */
const SHIELDING_BASE_RADIUS = 3.95;

/** How many points go round each ring of a printed layer. */
const AROUND = 72;
/** About how far apart the rings up a printed layer are, along its slope. */
const RING_SPACING_METRES = 0.22;
/** The fewest rings' gaps up a printed layer, to give its course a rounded edge. */
const FEWEST_GAPS = 4;
/** How far the surface wanders in from the dome and out from it, in metres. */
const WANDER_IN_METRES = 0.07;
const WANDER_OUT_METRES = 0.02;
/** How far the surface sinks where the dome flattens towards its top, in metres. */
const WANDER_DOWN_METRES = 0.07;
/** How far from the top the wander dies away to nothing, so that the dome closes at a point, in metres. */
const WANDER_ENDS_METRES = 0.6;
/** How far in the groove between one printed course and the next goes, in metres. */
const COURSE_GROOVE_METRES = 0.03;
/** How much darker the groove between courses is. */
const COURSE_GROOVE_SHADE = 0.1;
/** Where on the texture the top of the dome goes: a part with no large crater to show on its flank. */
const TEXTURE_OFFSET = { u: 0.15, v: 0.7 } as const;
/** How far below the ground the foot of the first layer is sunk, so that no seam shows. */
const SUNK_METRES = 0.03;

const random = fixedRandom(1972);
/** The wander in the surface, across the way round and up the dome, from -1 to 1. */
const surfaceWander = layeredNoise(random, 10, 3);
/** Patches of darker and lighter Regolith, from -1 to 1. */
const shadeWander = layeredNoise(random, 14, 3);

/**
 * The radius of Regolith shielding's smooth outer surface at a height above
 * the ground: a rounded dome over the Habitat.
 */
export function shieldingRadiusAt(height: number): number {
  const h = THREE.MathUtils.clamp(height / SHIELDING_HEIGHT, 0, 1);
  return SHIELDING_BASE_RADIUS * Math.sqrt(1 - h * h);
}

/** How many steps the dome's slope is measured in, from the top down. */
const SLOPE_STEPS = 400;
/** How far it is down the dome's slope from the top to each step. */
const slopeLengths = (() => {
  const lengths = [0];
  let length = 0;
  for (let step = 1; step <= SLOPE_STEPS; step++) {
    const higher = SHIELDING_HEIGHT * (1 - (step - 1) / SLOPE_STEPS);
    const lower = SHIELDING_HEIGHT * (1 - step / SLOPE_STEPS);
    length += Math.hypot(
      higher - lower,
      shieldingRadiusAt(lower) - shieldingRadiusAt(higher),
    );
    lengths.push(length);
  }
  return lengths;
})();

/** How far it is down the dome's slope from the top to a height above the ground. */
function slopeLengthAt(height: number): number {
  const steps = (1 - height / SHIELDING_HEIGHT) * SLOPE_STEPS;
  const step = Math.min(Math.floor(steps), SLOPE_STEPS - 1);
  const higher = slopeLengths[step] ?? 0;
  const lower = slopeLengths[step + 1] ?? higher;
  return higher + (lower - higher) * (steps - step);
}

/**
 * The geometry of one printed course of Regolith shielding, standing with
 * its foot at its origin, to be raised to its place: a band of uneven
 * Regolith, its edges drawn in and darkened to show the course it was
 * printed in, with a colour at each point for the ground's material. Its
 * texture coordinates are laid out from the top of the dome, by the distance
 * down its slope and the way round, so that the grains don't stretch up the
 * dome, nor meet in a seam or a pinch at its top. They come out a little
 * finer round the foot, where the dome is widest.
 */
export function createPrintedCourseGeometry(
  index: number,
  layers: number,
): THREE.BufferGeometry {
  const layerHeight = SHIELDING_HEIGHT / layers;
  const bottom = index * layerHeight;
  const top = bottom + layerHeight;
  const gaps = Math.max(
    FEWEST_GAPS,
    Math.ceil(
      (slopeLengthAt(bottom) - slopeLengthAt(top)) / RING_SPACING_METRES,
    ),
  );
  const positions: number[] = [];
  const uvs: number[] = [];
  const colours: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= gaps; ring++) {
    const up = ring / gaps;
    // Evenly down the slope, not in height, as the dome flattens at its top.
    const height = heightDownSlope(
      THREE.MathUtils.lerp(slopeLengthAt(bottom), slopeLengthAt(top), up),
    );
    const smooth = shieldingRadiusAt(height);
    const fades = Math.min(smooth / WANDER_ENDS_METRES, 1);
    // Drawn in towards each edge of the course, along its rounded side.
    const edge = 1 - Math.sin(up * Math.PI);
    for (let step = 0; step < AROUND; step++) {
      const round = step / AROUND;
      const angle = round * Math.PI * 2;
      const wander = surfaceWander(round, height / SHIELDING_HEIGHT);
      const radius = Math.max(
        smooth +
          fades *
            (wander * (wander > 0 ? WANDER_OUT_METRES : WANDER_IN_METRES) -
              edge * COURSE_GROOVE_METRES),
        0,
      );
      // Sinking only, so that it never rises above the smooth dome.
      const sink =
        fades *
        Math.max(-wander, 0) *
        WANDER_DOWN_METRES *
        (1 - smooth / SHIELDING_BASE_RADIUS);
      const sunk = index === 0 && ring === 0 ? SUNK_METRES : 0;
      positions.push(
        Math.cos(angle) * radius,
        height - sink - bottom - sunk,
        Math.sin(angle) * radius,
      );
      const slope = slopeLengthAt(height);
      uvs.push(
        (Math.cos(angle) * slope) / REGOLITH_TILE_METRES + TEXTURE_OFFSET.u,
        (Math.sin(angle) * slope) / REGOLITH_TILE_METRES + TEXTURE_OFFSET.v,
      );
      const shade =
        0.97 +
        shadeWander(round, height / SHIELDING_HEIGHT) * 0.12 -
        edge * COURSE_GROOVE_SHADE;
      colours.push(shade, shade, shade);
    }
  }
  const at = (ring: number, step: number) => ring * AROUND + (step % AROUND);
  for (let ring = 0; ring < gaps; ring++) {
    for (let step = 0; step < AROUND; step++) {
      const a = at(ring, step);
      const b = at(ring, step + 1);
      const c = at(ring + 1, step);
      const d = at(ring + 1, step + 1);
      indices.push(a, c, b, b, c, d);
    }
  }
  // A lid over all but the last, which closes at a point, so that the course
  // being printed shows no gap round the Habitat from above. The next course
  // hides it, and the Habitat stands up through it.
  if (index < layers - 1) {
    const middle = positions.length / 3;
    positions.push(0, layerHeight, 0);
    uvs.push(TEXTURE_OFFSET.u, TEXTURE_OFFSET.v);
    colours.push(1, 1, 1);
    for (let step = 0; step < AROUND; step++) {
      indices.push(middle, at(gaps, step + 1), at(gaps, step));
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

/** The height above the ground this far down the dome's slope from the top. */
function heightDownSlope(length: number): number {
  let above = 0;
  let below = SLOPE_STEPS;
  while (below - above > 1) {
    const middle = Math.floor((above + below) / 2);
    if ((slopeLengths[middle] ?? 0) <= length) above = middle;
    else below = middle;
  }
  const higher = slopeLengths[above] ?? 0;
  const lower = slopeLengths[below] ?? higher;
  const steps = above + (length - higher) / Math.max(lower - higher, 1e-9);
  return Math.max(SHIELDING_HEIGHT * (1 - steps / SLOPE_STEPS), 0);
}
