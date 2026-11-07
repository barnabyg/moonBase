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
  /**
   * If it can't work near a kind of Structure: the radius it must be kept clear
   * within, and the Structures there now that would stop it, each where it
   * stands and how far its footprint reaches.
   */
  readonly keepClear?: {
    readonly radiusMetres: number;
    readonly inTheWay: readonly {
      readonly position: GroundPosition;
      readonly footprintRadiusMetres: number;
    }[];
  };
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
  // The radius a Structure must be kept clear within, such as a dark radius.
  clearZone: new THREE.MeshBasicMaterial({
    color: 0x7fb8ff,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
  }),
  clearEdge: new THREE.MeshBasicMaterial({
    color: 0x7fb8ff,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  }),
  // A Structure within it that would stop the one being placed working.
  inTheWay: new THREE.MeshBasicMaterial({
    color: 0xff5a4a,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  }),
};

/**
 * A zone on the ground, a faint disc with a bright edge, of radius 1 so that it
 * can be scaled to the zone's radius: the Plume Ejecta danger zone, or the radius
 * a Structure must be kept clear within.
 */
function createZone(
  name: string,
  fill: THREE.Material,
  edgeMaterial: THREE.Material,
): THREE.Group {
  const zone = new THREE.Group();
  zone.name = name;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), fill);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.03;
  const edge = new THREE.Mesh(
    new THREE.RingGeometry(0.985, 1, 96),
    edgeMaterial,
  );
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = 0.04;
  zone.add(disc, edge);
  zone.visible = false;
  return zone;
}

/** The translucent preview of a Structure, drawn where the player is pointing. */
export function createPlacementPreview(scene: THREE.Scene) {
  const dangerZone = createZone(
    "Plume Ejecta danger zone",
    previewMaterials.dangerZone,
    previewMaterials.dangerEdge,
  );
  const clearZone = createZone(
    "Keep-clear radius",
    previewMaterials.clearZone,
    previewMaterials.clearEdge,
  );
  // Rings round the Structures within it, redrawn as they change.
  const inTheWay = new THREE.Group();
  inTheWay.name = "In the way";
  scene.add(dangerZone, clearZone, inTheWay);
  let inTheWayShown = "";
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

  /** The radius the Structure must be kept clear within, and what is in it now. */
  const showKeepClear = (preview: PlacementPreview | undefined) => {
    const keepClear = preview?.keepClear;
    clearZone.visible = preview !== undefined && keepClear !== undefined;
    if (preview === undefined || keepClear === undefined) {
      inTheWay.visible = false;
      return;
    }
    clearZone.position.copy(toScene(preview.position));
    clearZone.scale.setScalar(keepClear.radiusMetres);
    inTheWay.visible = true;
    const key = JSON.stringify(keepClear.inTheWay);
    if (key === inTheWayShown) return;
    inTheWayShown = key;
    for (const ring of inTheWay.children) {
      (ring as THREE.Mesh).geometry.dispose();
    }
    inTheWay.clear();
    for (const { position, footprintRadiusMetres } of keepClear.inTheWay) {
      const radius = footprintRadiusMetres + 0.6;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius - 0.3, radius, 32),
        previewMaterials.inTheWay,
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(toScene(position));
      ring.position.y = 0.05;
      inTheWay.add(ring);
    }
  };

  return {
    show(preview: PlacementPreview | undefined): void {
      const zone = preview?.plumeEjecta;
      dangerZone.visible = zone !== undefined;
      if (zone !== undefined) {
        dangerZone.position.copy(toScene(zone.position));
        dangerZone.scale.setScalar(zone.radiusMetres);
      }
      showKeepClear(preview);
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
