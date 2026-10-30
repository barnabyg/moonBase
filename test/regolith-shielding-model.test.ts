import * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { REGOLITH_TILE_METRES } from "../src/render/regolith-texture";

// The materials draw their textures on a canvas when they load; under Node
// there is none, so they fall back to plain colours, as in a browser that
// can't draw on one.
vi.stubGlobal("document", {
  createElement: () => ({ getContext: () => null }),
});

let models: typeof import("../src/render/models");
let materials: (typeof import("../src/render/materials"))["materials"];

beforeAll(async () => {
  models = await import("../src/render/models");
  ({ materials } = await import("../src/render/materials"));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const groundMaterial = new THREE.MeshStandardMaterial();

/** The dome's height, and its radius at the ground. */
const DOME_HEIGHT = 3.4;
const DOME_RADIUS = 3.95;
/** The Habitat's envelope under it: its deck's height, its radius and its height above the deck. */
const ENVELOPE = { deck: 0.3, radius: 3.4, height: 2.55 };

function domeRadiusAt(height: number): number {
  const share = Math.min(Math.max(height, 0) / DOME_HEIGHT, 1);
  return DOME_RADIUS * Math.sqrt(1 - share * share);
}

function layersOf(group: THREE.Group): THREE.Mesh[] {
  return group.children.filter(
    (child): child is THREE.Mesh => child instanceof THREE.Mesh,
  );
}

/** Each layer's points, where the finished model has them, in its frame. */
function pointsOf(group: THREE.Group): THREE.Vector3[][] {
  group.updateMatrixWorld(true);
  return layersOf(group).map((layer) => {
    const position = layer.geometry.getAttribute("position");
    return Array.from({ length: position.count }, (_, index) =>
      new THREE.Vector3()
        .fromBufferAttribute(position, index)
        .applyMatrix4(layer.matrixWorld),
    );
  });
}

function finished(): THREE.Group {
  const model = models.createStructureModel(
    "regolith-shielding",
    groundMaterial,
  );
  model.setAssembled(1);
  return model.group;
}

describe("Regolith shielding's model", () => {
  it("is drawn in the ground's own material, with a colour at each point", () => {
    for (const layer of layersOf(finished())) {
      expect(layer.material).toBe(groundMaterial);
      const colour = layer.geometry.getAttribute("color");
      const shades = Array.from({ length: colour.count }, (_, index) =>
        colour.getX(index),
      );
      expect(Math.max(...shades) - Math.min(...shades)).toBeGreaterThan(0.03);
    }
  });

  it("falls back to its plain material with no ground to match, as in the placement preview", () => {
    const { group } = models.createStructureModel("regolith-shielding");

    expect(layersOf(group)[0]?.material).toBe(materials.regolith);
  });

  it("has an uneven surface, close to the dome, that the Habitat doesn't poke through and that stays in its footprint", () => {
    const points = pointsOf(finished()).flat();
    // The foot of a straight-sided ring would all be at one radius.
    const foot = points
      .filter((point) => point.y <= 0)
      .map((point) => Math.hypot(point.x, point.z));
    expect(Math.max(...foot) - Math.min(...foot)).toBeGreaterThan(0.02);
    // Under the water wall's straps, which lie 3 cm off the dome.
    for (const point of points) {
      expect(
        Math.hypot(
          Math.hypot(point.x, point.z) / DOME_RADIUS,
          point.y / DOME_HEIGHT,
        ),
      ).toBeLessThan(1 + 0.03 / DOME_RADIUS);
    }
    for (const point of points) {
      const radius = Math.hypot(point.x, point.z);
      expect(radius).toBeLessThan(4);
      const up = (point.y - ENVELOPE.deck) / ENVELOPE.height;
      if (up > 0 && up < 1) {
        expect(radius).toBeGreaterThan(
          ENVELOPE.radius * Math.sqrt(1 - up * up) + 0.1,
        );
      }
    }
  });

  it("keeps a water wall's bladders pressed against its flank", () => {
    const flank = pointsOf(finished())
      .flat()
      .filter((point) => Math.abs(point.y - 1.1) < 0.2)
      .map((point) => domeRadiusAt(point.y) - Math.hypot(point.x, point.z));

    // The bladders' tubes reach 25 cm into the dome.
    expect(Math.max(...flank)).toBeLessThan(0.2);
  });

  it("has more faces than a clean stack of rings, with each layer meeting the next", () => {
    const layers = pointsOf(finished());
    const key = (point: THREE.Vector3) =>
      `${point.x.toFixed(4)},${point.y.toFixed(4)},${point.z.toFixed(4)}`;

    expect(layers.flat().length).toBeGreaterThan(12 * 20 * 3);
    for (const [index, layer] of layers.entries()) {
      const next = layers[index + 1];
      if (next === undefined) continue;
      const top = Math.max(...layer.map((point) => point.y));
      const nextKeys = new Set(next.map(key));
      const joint = layer.filter((point) => point.y > top - 0.15);
      // Each layer's top ring is also the next layer's foot.
      expect(joint.filter((point) => nextKeys.has(key(point))).length).toBe(72);
    }
  });

  it("closes over at the top, leaving no hole", () => {
    const top = pointsOf(finished()).at(-1) ?? [];
    const highest = top.filter((point) => Math.hypot(point.x, point.z) < 1e-6);

    expect(highest.length).toBeGreaterThan(0);
    for (const point of highest) expect(point.y).toBeCloseTo(DOME_HEIGHT, 5);
  });

  it("lays the texture without stretching it, up to the top of the dome", () => {
    const group = finished();
    group.updateMatrixWorld(true);
    let widest = 0;
    let narrowest = Infinity;
    for (const layer of layersOf(group)) {
      const position = layer.geometry.getAttribute("position");
      const uv = layer.geometry.getAttribute("uv");
      const indices = layer.geometry.getIndex();
      if (indices === null) throw new Error("expected indexed faces");
      for (let at = 0; at < indices.count; at += 3) {
        for (const [a, b] of [
          [indices.getX(at), indices.getX(at + 1)],
          [indices.getX(at + 1), indices.getX(at + 2)],
        ] as const) {
          const metres = new THREE.Vector3()
            .fromBufferAttribute(position, a)
            .distanceTo(new THREE.Vector3().fromBufferAttribute(position, b));
          // Longer than the small relief of a course's grooves.
          if (metres < 0.15) continue;
          const onTexture =
            Math.hypot(uv.getX(a) - uv.getX(b), uv.getY(a) - uv.getY(b)) *
            REGOLITH_TILE_METRES;
          widest = Math.max(widest, onTexture / metres);
          narrowest = Math.min(narrowest, onTexture / metres);
        }
      }
    }

    // A ratio of 1 is grains the size of the ground's. Below it they would
    // stretch; above it they are a little fine, round the foot of the dome.
    expect(narrowest).toBeGreaterThan(0.7);
    expect(widest).toBeLessThan(1.8);
  });

  it("builds up layer by layer from the ground", () => {
    const model = models.createStructureModel(
      "regolith-shielding",
      groundMaterial,
    );
    const shown = () =>
      layersOf(model.group).filter((layer) => layer.visible).length;

    model.setAssembled(0);
    expect(shown()).toBe(0);
    model.setAssembled(0.5 / 12);
    expect(shown()).toBe(1);
    expect(layersOf(model.group)[0]?.scale.y).toBeCloseTo(0.5, 6);
    model.setAssembled(6.5 / 12);
    expect(shown()).toBe(7);
    model.setAssembled(1);
    expect(shown()).toBe(12);
  });
});

describe("Sintered Regolith shielding's model", () => {
  it("keeps its darker, fused look with its glassy seams, whatever the ground", () => {
    const { group } = models.createStructureModel(
      "sintered-regolith-shielding",
      groundMaterial,
    );
    const layers = layersOf(group);

    expect(layers).toHaveLength(16);
    expect(layers[0]?.material).toBe(materials.sinteredRegolith);
    expect(layers[0]?.geometry).toBeInstanceOf(THREE.CylinderGeometry);
    expect(layers[0]?.children[0]).toBeInstanceOf(THREE.Mesh);
    expect((layers[0]?.children[0] as THREE.Mesh).material).toBe(
      materials.sinteredGlaze,
    );
  });
});
