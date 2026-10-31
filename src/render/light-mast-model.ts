import * as THREE from "three";
import { materials, part } from "./materials";
import type { StructureModel } from "./models";

// The Light Masts.

/** The share of Assembly spent raising the pole, before the light goes on top. */
const POLE_SHARE = 0.7;

/** The sizes and parts of a Light Mast's model, in metres. */
interface LightMastShape {
  readonly name: string;
  /** The height of its light above the ground. */
  readonly height: number;
  /** The radius of its weighted base at the ground. */
  readonly baseRadius: number;
  readonly poleRadius: number;
  /** How many bars of lights cross on top, each with a light at both ends. */
  readonly lightBars: number;
  /** Whether guy wires hold the pole up, from three anchors round the base. */
  readonly guyed: boolean;
}

export const LIGHT_MAST: LightMastShape = {
  name: "Light mast",
  height: 6,
  baseRadius: 0.65,
  poleRadius: 0.09,
  lightBars: 1,
  guyed: false,
};

/**
 * A tall Light Mast: a pole nearly twice as tall and stouter, held by three
 * guy wires, with two bars of lights crossed on top, one for each light
 * head.
 */
export const TALL_LIGHT_MAST: LightMastShape = {
  name: "Tall Light Mast",
  height: 11,
  baseRadius: 1,
  poleRadius: 0.14,
  lightBars: 2,
  guyed: true,
};

/**
 * A Light Mast: a tall pole on a weighted base, with a bar of lights on top
 * that glow while they are on. During Assembly the pole rises and then the
 * light bar goes on top.
 */
export function createLightMastModel(shape: LightMastShape): StructureModel {
  const mast = new THREE.Group();
  mast.name = shape.name;
  const baseHeight = 0.25 * (shape.baseRadius / LIGHT_MAST.baseRadius);
  const scale = shape.baseRadius / LIGHT_MAST.baseRadius;

  const statusLightMaterial = materials.statusOff.clone();
  mast.add(
    part(
      new THREE.CylinderGeometry(
        shape.baseRadius - 0.1 * scale,
        shape.baseRadius,
        baseHeight,
        8,
      ),
      materials.darkMetal,
      [0, baseHeight / 2, 0],
    ),
    part(new THREE.SphereGeometry(0.07, 8, 6), statusLightMaterial, [
      0.45 * scale,
      baseHeight + 0.05,
      0.3 * scale,
    ]),
  );

  const poleLength = shape.height - baseHeight;
  const pole = part(
    new THREE.CylinderGeometry(shape.poleRadius * 0.67, shape.poleRadius, 1, 8),
    materials.hull,
    [0, 0, 0],
  );
  mast.add(pole);

  // The bars of lights face every way, so the light falls all round.
  const lightMaterial = materials.statusOff.clone();
  const head = new THREE.Group();
  head.position.y = shape.height;
  for (let bar = 0; bar < shape.lightBars; bar++) {
    const lights = new THREE.Group();
    lights.rotation.y = (bar * Math.PI) / shape.lightBars;
    lights.position.y = bar * 0.14;
    lights.add(
      part(
        new THREE.BoxGeometry(1.2, 0.12, 0.12),
        materials.darkMetal,
        [0, 0, 0],
      ),
      ...[-0.45, 0.45].map((x) =>
        part(new THREE.BoxGeometry(0.32, 0.22, 0.32), lightMaterial, [
          x,
          -0.1,
          0,
        ]),
      ),
    );
    head.add(lights);
  }
  mast.add(head);

  // Guy wires from three quarters of the way up to anchors round the base,
  // fitted once the pole is up.
  const guys = new THREE.Group();
  if (shape.guyed) {
    const top = new THREE.Vector3(0, shape.height * 0.75, 0);
    for (let index = 0; index < 3; index++) {
      const angle = (index / 3) * Math.PI * 2 + Math.PI / 6;
      const anchor = new THREE.Vector3(
        Math.cos(angle) * (shape.baseRadius + 0.05),
        0.05,
        Math.sin(angle) * (shape.baseRadius + 0.05),
      );
      const wire = part(
        new THREE.CylinderGeometry(0.012, 0.012, top.distanceTo(anchor), 4),
        materials.aluminium,
        [0, 0, 0],
      );
      wire.position.copy(top.clone().add(anchor).multiplyScalar(0.5));
      wire.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        top.clone().sub(anchor).normalize(),
      );
      guys.add(
        wire,
        part(
          new THREE.CylinderGeometry(0.06, 0.08, 0.1, 6),
          materials.darkMetal,
          [anchor.x, 0.05, anchor.z],
        ),
      );
    }
  }
  mast.add(guys);

  return {
    group: mast,
    lightHeight: shape.height,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      const raised = Math.max(Math.min(f / POLE_SHARE, 1), 0.01);
      pole.scale.y = poleLength * raised;
      pole.position.y = baseHeight + (poleLength * raised) / 2;
      head.visible = f > POLE_SHARE;
      guys.visible = f > POLE_SHARE;
    },
    setFacing: () => undefined,
    setStatusLight(state) {
      const source = {
        off: materials.statusOff,
        testing: materials.statusTesting,
        on: materials.statusOn,
      }[state];
      statusLightMaterial.color.copy(source.color);
      statusLightMaterial.emissive.copy(source.emissive);
    },
    setCharge: () => undefined,
    setLit(on) {
      lightMaterial.color.set(on ? 0xfff4dc : 0x222222);
      lightMaterial.emissive.set(on ? 0xfff0d0 : 0x000000);
    },
  };
}
