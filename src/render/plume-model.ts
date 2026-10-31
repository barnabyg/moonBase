import * as THREE from "three";

// The dust a Lander's engine blasts out over the ground.

export interface PlumeModel {
  readonly group: THREE.Group;
  /**
   * Shows the dust blasted out over the ground: its strength from 0 (none)
   * to 1 (the engine firing right over the ground), how far it has spread,
   * from 0 to 1, out to the given radius, and how high above the ground the
   * engine's exhaust starts.
   */
  show(
    strength: number,
    spread: number,
    exhaustHeight: number,
    realSeconds: number,
  ): void;
}

const plumeMaterials = {
  dust: new THREE.MeshStandardMaterial({
    color: 0xbdb7ac,
    roughness: 1,
    metalness: 0,
    transparent: true,
    depthWrite: false,
  }),
  haze: new THREE.MeshBasicMaterial({
    color: 0x9d978c,
    transparent: true,
    depthWrite: false,
  }),
  exhaust: new THREE.MeshBasicMaterial({
    color: 0xffe2b0,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }),
};

/** How many billows of dust roll out round the Lander. */
const PLUME_BILLOWS = 28;

/**
 * The Plume Ejecta of a Lander taking off or landing: billows of dust
 * rolling out over the ground from under it, a low haze, and the engine's
 * glow. It stands on the ground at its origin.
 */
export function createPlumeModel(radius: number): PlumeModel {
  const group = new THREE.Group();
  group.name = "Plume";
  const billowGeometry = new THREE.IcosahedronGeometry(1, 1);
  const billows = Array.from({ length: PLUME_BILLOWS }, (_, index) => {
    const billow = new THREE.Mesh(billowGeometry, plumeMaterials.dust);
    group.add(billow);
    // Each a little different, but the same on every load.
    return {
      billow,
      angle: (index / PLUME_BILLOWS) * Math.PI * 2,
      size: 0.8 + ((index * 7) % 5) * 0.15,
      lag: ((index * 11) % 6) / 12,
    };
  });
  const haze = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    plumeMaterials.haze,
  );
  haze.rotation.x = -Math.PI / 2;
  haze.position.y = 0.05;
  const exhaustLength = 6;
  const exhaust = new THREE.Mesh(
    new THREE.ConeGeometry(0.7, exhaustLength, 12, 1, true),
    plumeMaterials.exhaust,
  );
  // Pointing down from the engine bell.
  exhaust.rotation.x = Math.PI;
  group.add(haze, exhaust);
  group.visible = false;
  return {
    group,
    show(strength, spread, exhaustHeight, realSeconds) {
      group.visible = strength > 0;
      if (!group.visible) return;
      for (const { billow, angle, size, lag } of billows) {
        const reach = Math.max(spread - lag * spread, 0.08) * radius;
        const turn = angle + realSeconds * 0.15;
        const puff = size * (0.5 + reach * 0.04) * (0.5 + strength * 0.5);
        billow.position.set(
          Math.cos(turn) * reach,
          puff * 0.6,
          Math.sin(turn) * reach,
        );
        billow.scale.set(puff, puff * 0.7, puff);
      }
      haze.scale.setScalar(Math.max(spread, 0.08) * radius);
      exhaust.position.y = exhaustHeight - exhaustLength / 2;
      plumeMaterials.dust.opacity = 0.4 * strength;
      plumeMaterials.haze.opacity = 0.35 * strength;
      plumeMaterials.exhaust.opacity = 0.35 + 0.25 * Math.sin(realSeconds * 40);
    },
  };
}
