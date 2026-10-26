import * as THREE from "three";
import { catalogue } from "../catalogue";
import type { GroundPosition } from "../simulation";
import { createFootprintRing } from "./construction-views";
import { toScene } from "./interpolation";
import { createStructureModel } from "./models";

/** A Structure the player is about to place, and whether it may go there. */
export interface PlacementPreview {
  readonly structureTypeId: string;
  readonly position: GroundPosition;
  readonly allowed: boolean;
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
};

/** The translucent preview of a Structure, drawn where the player is pointing. */
export function createPlacementPreview(scene: THREE.Scene) {
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
