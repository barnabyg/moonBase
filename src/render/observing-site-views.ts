import * as THREE from "three";
import type { KeepClearOf } from "../catalogue";
import type { ObservingSiteSnapshot } from "../simulation";
import { toScene } from "./interpolation";
import { createZone } from "./placement-preview";

// The dark and radio-quiet sites Surveys have found, each a faint disc with a
// bright edge on the ground where it lies: violet for a dark site, green for a
// radio-quiet one, so that the player can see where to build the telescopes.

const COLOURS: Record<KeepClearOf, number> = {
  lit: 0xb48cff,
  plants: 0x6fe0b4,
};

export interface ObservingSiteViews {
  /** Draws every site found, adding any new since the last frame. */
  update(sites: readonly ObservingSiteSnapshot[]): void;
  /** Where a site of the kind is drawn, if one has been found. */
  positionOf(kindId: string): THREE.Vector3 | undefined;
  /** How far its circle reaches, if one has been found. */
  radiusOf(kindId: string): number | undefined;
  /** Forgets every site, for a Campaign loaded in place of the last. */
  clear(): void;
}

export function createObservingSiteViews(
  scene: THREE.Scene,
): ObservingSiteViews {
  const drawn = new Map<
    string,
    { zone: THREE.Group; position: THREE.Vector3; radiusMetres: number }
  >();
  const materials = (of: KeepClearOf) => {
    const color = COLOURS[of];
    return [
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      }),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    ] as const;
  };
  return {
    update(sites) {
      for (const site of sites) {
        if (drawn.has(site.kindId)) continue;
        const [fill, edge] = materials(site.keptClearOf);
        const zone = createZone(site.label, fill, edge);
        const position = toScene(site.position);
        zone.position.copy(position);
        zone.scale.setScalar(site.radiusMetres);
        zone.visible = true;
        scene.add(zone);
        drawn.set(site.kindId, {
          zone,
          position,
          radiusMetres: site.radiusMetres,
        });
      }
    },
    positionOf(kindId) {
      return drawn.get(kindId)?.position.clone();
    },
    radiusOf(kindId) {
      return drawn.get(kindId)?.radiusMetres;
    },
    clear() {
      for (const { zone } of drawn.values()) scene.remove(zone);
      drawn.clear();
    },
  };
}
