import * as THREE from "three";
import type { ParkingBays } from "../catalogue";
import { materials, part } from "./materials";
import type { StructureModel } from "./models";
import {
  SHIELDING_HEIGHT,
  shieldingRadiusAt,
} from "./regolith-shielding-surface";

// The landing pads and parking areas, and where the regolith printer lays what
// it prints.

/** How many panels a landing pad is laid from, as the data catalogue has it. */
const PAD_PANELS = 8;
/** The share of Assembly spent laying the panels, before the beacon goes up. */
const PAD_PANELS_SHARE = 0.85;
/** How tall a pad light's post stands at a lit landing pad's edge. */
const PAD_LIGHT_HEIGHT = 2.6;

/** The parts of a landing pad's model. */
interface LandingPadShape {
  readonly name: string;
  /** How many pad lights stand round its edge, spaced evenly, clear of the beacon. */
  readonly padLights: number;
}

export const LANDING_PAD: LandingPadShape = {
  name: "Landing pad",
  padLights: 0,
};

/**
 * A lit landing pad: a landing pad with a pad light on a short post at
 * each quarter of its edge, its head tilted in over the pad.
 */
export const LIT_LANDING_PAD: LandingPadShape = {
  name: "Lit landing pad",
  padLights: 4,
};

/**
 * A landing pad: a disc of interlocking panels laid flat on the graded
 * ground, with a painted ring for the Lander to aim at, a beacon at its
 * edge and any pad lights round it, which glow while they are on. During
 * Assembly the panels go down one by one, then the beacon and pad lights
 * go up. Its radius is the data catalogue's footprint.
 */
export function createLandingPadModel(shape: LandingPadShape): StructureModel {
  const pad = new THREE.Group();
  pad.name = shape.name;
  const radius = 6.9;
  const thickness = 0.12;
  const panels = Array.from({ length: PAD_PANELS }, (_, index) => {
    const panel = part(
      new THREE.CylinderGeometry(
        radius,
        radius,
        thickness,
        6,
        1,
        false,
        (index / PAD_PANELS) * Math.PI * 2,
        (Math.PI * 2) / PAD_PANELS - 0.02,
      ),
      materials.padPanel,
      [0, thickness / 2, 0],
    );
    pad.add(panel);
    return panel;
  });
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.6, 3.9, 48),
    materials.padMarking,
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = thickness + 0.01;
  pad.add(ring);

  const statusLightMaterial = materials.statusOff.clone();
  const beacon = new THREE.Group();
  beacon.position.set(radius - 0.5, thickness, 0);
  beacon.add(
    part(
      new THREE.CylinderGeometry(0.08, 0.1, 1.4, 6),
      materials.darkMetal,
      [0, 0.7, 0],
    ),
    part(
      new THREE.SphereGeometry(0.16, 10, 8),
      statusLightMaterial,
      [0, 1.5, 0],
    ),
  );
  pad.add(beacon);

  const lightMaterial = materials.statusOff.clone();
  const padLights = new THREE.Group();
  for (let index = 0; index < shape.padLights; index++) {
    // Halfway between the beacon's place and the next quarter round.
    const angle = ((index + 0.5) / shape.padLights) * Math.PI * 2;
    const padLight = new THREE.Group();
    padLight.position.set(
      Math.cos(angle) * (radius - 0.35),
      thickness,
      -Math.sin(angle) * (radius - 0.35),
    );
    // Facing the pad's centre, its head tilted down over it.
    padLight.rotation.y = angle + Math.PI;
    const head = new THREE.Group();
    head.position.y = PAD_LIGHT_HEIGHT;
    head.rotation.z = -Math.PI / 6;
    head.add(
      part(
        new THREE.BoxGeometry(0.3, 0.36, 0.6),
        materials.darkMetal,
        [0, 0, 0],
      ),
      part(new THREE.BoxGeometry(0.04, 0.3, 0.52), lightMaterial, [0.16, 0, 0]),
    );
    padLight.add(
      part(
        new THREE.CylinderGeometry(0.06, 0.09, PAD_LIGHT_HEIGHT, 6),
        materials.aluminium,
        [0, PAD_LIGHT_HEIGHT / 2, 0],
      ),
      head,
    );
    padLights.add(padLight);
  }
  pad.add(padLights);

  return {
    group: pad,
    // The scene's one light for the pad lights hangs over the pad's
    // centre, high enough to shine past a Lander standing on it.
    ...(shape.padLights > 0 ? { lightHeight: 10 } : {}),
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      const laid = Math.min(f / PAD_PANELS_SHARE, 1) * PAD_PANELS;
      for (const [index, panel] of panels.entries()) {
        panel.visible = laid - index > 0;
      }
      ring.visible = laid >= PAD_PANELS;
      beacon.visible = f > PAD_PANELS_SHARE;
      padLights.visible = f > PAD_PANELS_SHARE;
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

/** The share of Assembly spent setting up the bay sockets, before the bays are marked out. */
const BAY_SOCKETS_SHARE = 0.8;
/** How tall a bay socket's post stands. */
const BAY_SOCKET_HEIGHT = 0.9;

/**
 * A parking area: a disc of graded ground, a shade smoother and darker
 * than the ground round it, with each bay marked out as a painted circle
 * and a power socket on a short post just beyond the bay, on the side away
 * from the middle, a cable coiled at its foot. A post at the edge carries
 * the status light. During Assembly the sockets go up one by one, then the
 * bays are painted. The bays stand where the data catalogue has them, so
 * that what is parked in one stands in its circle.
 */
export function createParkingAreaModel(
  footprintRadius: number,
  bays: ParkingBays,
): StructureModel {
  const area = new THREE.Group();
  area.name = "Parking area";
  const thickness = 0.04;
  const discRadius = footprintRadius - 0.1;
  const ground = part(
    new THREE.CylinderGeometry(discRadius, footprintRadius, thickness, 32),
    materials.padPanel,
    [0, thickness / 2, 0],
  );
  ground.castShadow = false;
  area.add(ground);

  const markings = new THREE.Group();
  const bayRadius = bays.bayRadiusMetres;
  const sockets = bays.bayOffsets.map((offset) => {
    // Ground y runs north, the scene's z south.
    const centre = new THREE.Vector3(offset.x, thickness + 0.005, -offset.y);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(bayRadius - 0.1, bayRadius, 32),
      materials.padMarking,
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(centre);
    markings.add(ring);
    // Just outside the bay, on the side away from the middle, so that
    // nothing parked in it stands over the post, but inside the disc.
    const out = Math.hypot(centre.x, centre.z);
    const reach = Math.min(bayRadius + 0.15, discRadius - 0.15 - out);
    const socketAt = new THREE.Vector3(
      out === 0 ? reach : centre.x + (centre.x / out) * reach,
      thickness,
      out === 0 ? 0 : centre.z + (centre.z / out) * reach,
    );
    const coil = part(
      new THREE.TorusGeometry(0.16, 0.03, 4, 12),
      materials.darkMetal,
      [0, 0.03, 0],
    );
    coil.rotation.x = Math.PI / 2;
    const socket = new THREE.Group();
    socket.position.copy(socketAt);
    socket.add(
      part(
        new THREE.CylinderGeometry(0.06, 0.08, BAY_SOCKET_HEIGHT, 6),
        materials.aluminium,
        [0, BAY_SOCKET_HEIGHT / 2, 0],
      ),
      part(new THREE.BoxGeometry(0.22, 0.28, 0.16), materials.darkMetal, [
        0,
        BAY_SOCKET_HEIGHT - 0.1,
        0,
      ]),
      coil,
    );
    area.add(socket);
    return socket;
  });
  area.add(markings);

  const statusLightMaterial = materials.statusOff.clone();
  const statusPost = new THREE.Group();
  statusPost.position.set(footprintRadius - 0.4, thickness, 0);
  statusPost.add(
    part(
      new THREE.CylinderGeometry(0.05, 0.07, 1.1, 6),
      materials.darkMetal,
      [0, 0.55, 0],
    ),
    part(
      new THREE.SphereGeometry(0.12, 10, 8),
      statusLightMaterial,
      [0, 1.2, 0],
    ),
  );
  area.add(statusPost);

  return {
    group: area,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      const raised = Math.min(f / BAY_SOCKETS_SHARE, 1) * sockets.length;
      for (const [index, socket] of sockets.entries()) {
        socket.visible = raised - index > 0;
      }
      markings.visible = f >= 1;
      statusPost.visible = f > 0;
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
    setLit: () => undefined,
  };
}

/** The radius of a sintered landing pad, just inside its footprint, and its thickness. */
const SINTERED_PAD_RADIUS = 6.9;
const SINTERED_PAD_THICKNESS = 0.18;
/** How many rings the regolith printer lays a sintered landing pad in, from the middle out. */
const SINTERED_PAD_RINGS = 9;
/** How far out the raised ring the Lander aims at runs. */
const SINTERED_PAD_AIM_RADIUS = 3.75;

/**
 * A sintered landing pad: a seamless disc of dark, fused Regolith, printed
 * in rings from the middle out, with a raised ring for the Lander to aim at
 * and a low lip round its edge, rather than painted panels and a beacon. A
 * small lamp set flush at its edge is its status light. During Assembly the
 * rings go down one by one.
 */
export function createSinteredLandingPadModel(): StructureModel {
  const pad = new THREE.Group();
  pad.name = "Sintered landing pad";
  const width = SINTERED_PAD_RADIUS / SINTERED_PAD_RINGS;
  // Alternate rings a shade apart, so that the courses show.
  const shades = [materials.sinteredRegolith, materials.padPanel];
  const rings = Array.from({ length: SINTERED_PAD_RINGS }, (_, index) => {
    const inner = index * width;
    const outer = inner + width;
    // A rectangular cross-section, turned round the middle.
    const ring = part(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(inner, 0),
          new THREE.Vector2(outer, 0),
          new THREE.Vector2(outer, SINTERED_PAD_THICKNESS),
          new THREE.Vector2(inner, SINTERED_PAD_THICKNESS),
          new THREE.Vector2(inner, 0),
        ],
        36,
      ),
      shades[index % 2] ?? materials.sinteredRegolith,
      [0, 0, 0],
    );
    ring.name = `Ring ${index + 1}`;
    pad.add(ring);
    return ring;
  });

  const ridge = (radius: number, thickness: number) => {
    const torus = part(
      new THREE.TorusGeometry(radius, thickness, 4, 48),
      materials.sinteredGlaze,
      [0, SINTERED_PAD_THICKNESS, 0],
    );
    torus.rotation.x = Math.PI / 2;
    return torus;
  };
  const aim = ridge(SINTERED_PAD_AIM_RADIUS, 0.09);
  const lip = ridge(SINTERED_PAD_RADIUS - 0.12, 0.14);
  pad.add(aim, lip);

  const statusLightMaterial = materials.statusOff.clone();
  const statusLight = part(
    new THREE.CylinderGeometry(0.14, 0.14, 0.06, 10),
    statusLightMaterial,
    [SINTERED_PAD_RADIUS - 0.5, SINTERED_PAD_THICKNESS + 0.03, 0],
  );
  pad.add(statusLight);

  return {
    group: pad,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      const printed = f * SINTERED_PAD_RINGS;
      for (const [index, ring] of rings.entries()) {
        ring.visible = printed - index > 0;
      }
      aim.visible = printed * width > SINTERED_PAD_AIM_RADIUS;
      lip.visible = f >= 1;
      statusLight.visible = f >= 1;
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
    setLit: () => undefined,
  };
}

/**
 * Where the regolith printer is laying Regolith on a Structure it prints,
 * as Assembly goes from 0 to 1: how high above the ground, and how far out
 * from the Structure's centre the ring it follows runs. A sintered landing
 * pad is laid flat from the middle out; shielding rises over the Habitat's
 * dome layer by layer.
 */
export function printingAt(
  structureTypeId: string,
  progress: number,
): { readonly height: number; readonly radius: number } {
  const f = THREE.MathUtils.clamp(progress, 0, 1);
  if (structureTypeId === "sintered-landing-pad") {
    return {
      height: SINTERED_PAD_THICKNESS,
      radius: Math.max(f, 0.05) * SINTERED_PAD_RADIUS,
    };
  }
  const height = f * SHIELDING_HEIGHT;
  return { height, radius: shieldingRadiusAt(height) };
}
