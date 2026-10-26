import * as THREE from "three";
import { catalogue } from "../catalogue";
import type { GroundPosition, PlumeEjectaSnapshot } from "../simulation";
import { createFootprintRing } from "./construction-views";
import { toScene } from "./interpolation";
import { createStructureModel } from "./models";

/**
 * A Structure the player is about to place, whether it may go there, and
 * the ground the Lander's next take-off or landing will blast with Plume
 * Ejecta, if any.
 */
export interface PlacementPreview {
  readonly structureTypeId: string;
  readonly position: GroundPosition;
  readonly allowed: boolean;
  readonly plumeEjecta: PlumeEjectaSnapshot | undefined;
}

const previewMaterials = {
  allowed: new THREE.MeshBasicMaterial({
    color: 0x7dffa8,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  }),
  refused: new THREE.MeshBasicMaterial({
    color: 0xff5a4a,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  }),
  // Placing inside it is allowed, so it warns rather than refuses.
  dangerZone: new THREE.MeshBasicMaterial({
    color: 0xffa040,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  }),
  dangerEdge: new THREE.MeshBasicMaterial({
    color: 0xffa040,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  }),
};

/**
 * The Plume Ejecta danger zone, a faint disc with a bright edge, of radius 1
 * so that it can be scaled to the zone's radius.
 */
function createDangerZone(): THREE.Group {
  const zone = new THREE.Group();
  zone.name = "Plume Ejecta danger zone";
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 64),
    previewMaterials.dangerZone,
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.03;
  const edge = new THREE.Mesh(
    new THREE.RingGeometry(0.985, 1, 64),
    previewMaterials.dangerEdge,
  );
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = 0.04;
  zone.add(disc, edge);
  zone.visible = false;
  return zone;
}

/** The translucent preview of a Structure, drawn where the player is pointing. */
export function createPlacementPreview(scene: THREE.Scene) {
  const dangerZone = createDangerZone();
  scene.add(dangerZone);
  let shown:
    | { structureTypeId: string; group: THREE.Group; meshes: THREE.Mesh[] }
    | undefined;

  const build = (structureTypeId: string) => {
    const radius =
      catalogue.structureTypes.find((type) => type.id === structureTypeId)
        ?.footprintRadiusMetres ?? 1;
    const model = createStructureModel(structureTypeId);
    model.setAssembled(1);
    const group = new THREE.Group();
    group.name = "Placement preview";
    group.add(
      model.group,
      createFootprintRing(radius, previewMaterials.allowed),
    );
    const meshes: THREE.Mesh[] = [];
    group.traverse((object) => {
      if ((object as Partial<THREE.Mesh>).isMesh === true) {
        const mesh = object as THREE.Mesh;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        meshes.push(mesh);
      }
    });
    scene.add(group);
    return { structureTypeId, group, meshes };
  };

  return {
    show(preview: PlacementPreview | undefined): void {
      const zone = preview?.plumeEjecta;
      dangerZone.visible = zone !== undefined;
      if (zone !== undefined) {
        dangerZone.position.copy(toScene(zone.position));
        dangerZone.scale.setScalar(zone.radiusMetres);
      }
      if (preview === undefined) {
        if (shown !== undefined) shown.group.visible = false;
        return;
      }
      if (shown?.structureTypeId !== preview.structureTypeId) {
        if (shown !== undefined) scene.remove(shown.group);
        shown = build(preview.structureTypeId);
      }
      shown.group.visible = true;
      shown.group.position.copy(toScene(preview.position));
      const material = preview.allowed
        ? previewMaterials.allowed
        : previewMaterials.refused;
      for (const mesh of shown.meshes) mesh.material = material;
    },
  };
}
