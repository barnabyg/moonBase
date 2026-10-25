import * as THREE from "three";
import { catalogue } from "../catalogue";
import type { ConstructionSnapshot, GroundPosition } from "../simulation";
import { toScene, type Frame } from "./interpolation";
import {
  createCrateModel,
  createSolarArrayModel,
  type SolarArrayModel,
} from "./models";

const gradedGround = new THREE.MeshStandardMaterial({
  color: 0x8f8c87,
  roughness: 0.95,
  metalness: 0,
});
const footprintMarking = new THREE.MeshBasicMaterial({
  color: 0xf2c14e,
  transparent: true,
  opacity: 0.55,
});
/** How often the status light blinks while Commissioning, in blinks per real second. */
const TEST_BLINKS_PER_SECOND = 2;

interface StructureView {
  readonly group: THREE.Group;
  readonly graded: THREE.Mesh;
  readonly footprint: THREE.Mesh;
  readonly crates: THREE.Mesh[];
  readonly array: SolarArrayModel;
}

/**
 * Draws every Construction as it stands, stage by stage: the ground graded
 * during Site Preparation, the Components' crates delivered and then used up,
 * and the solar array unfolding during Assembly. A commissioned Structure
 * keeps its Construction's id, so the same view carries on.
 */
export function createConstructionViews(scene: THREE.Scene) {
  const views = new Map<string, StructureView>();

  const viewFor = (
    id: string,
    structureTypeId: string,
    position: GroundPosition,
  ) => {
    let view = views.get(id);
    if (view === undefined) {
      view = createView(structureTypeId);
      view.group.position.copy(toScene(position));
      scene.add(view.group);
      views.set(id, view);
    }
    return view;
  };

  return {
    /**
     * @param sunFacing The angle that turns a panel to face the sun, or
     *   undefined at Night, when panels stay as they are.
     */
    update(
      frame: Frame,
      realSeconds: number,
      sunFacing: number | undefined,
    ): void {
      const seen = new Set<string>();
      for (const construction of frame.current.constructions) {
        seen.add(construction.id);
        const view = viewFor(
          construction.id,
          construction.structureTypeId,
          construction.position,
        );
        showConstruction(
          view,
          construction,
          progressOf(frame, construction),
          realSeconds,
        );
        if (sunFacing !== undefined) view.array.setFacing(sunFacing);
      }
      for (const structure of frame.current.structures) {
        seen.add(structure.id);
        const view = viewFor(
          structure.id,
          structure.structureTypeId,
          structure.position,
        );
        view.graded.scale.setScalar(1);
        view.footprint.visible = false;
        for (const crate of view.crates) crate.visible = false;
        view.array.group.visible = true;
        view.array.setUnfolded(1);
        view.array.setStatusLight("on");
        if (sunFacing !== undefined) view.array.setFacing(sunFacing);
      }
      for (const [id, view] of views) {
        if (!seen.has(id)) {
          scene.remove(view.group);
          views.delete(id);
        }
      }
    },
  };
}

/** The stage's progress, interpolated between ticks while the stage carries on. */
function progressOf(frame: Frame, construction: ConstructionSnapshot): number {
  const before = frame.previous?.constructions.find(
    (other) => other.id === construction.id,
  );
  if (before === undefined || before.stage !== construction.stage) {
    return construction.stageProgress;
  }
  return THREE.MathUtils.lerp(
    before.stageProgress,
    construction.stageProgress,
    frame.tickProgress,
  );
}

function showConstruction(
  view: StructureView,
  construction: ConstructionSnapshot,
  progress: number,
  realSeconds: number,
): void {
  const { stage } = construction;
  view.footprint.visible = true;
  view.graded.scale.setScalar(
    stage === "site-preparation" ? Math.max(progress, 0.001) : 1,
  );

  // Delivery is half loading at the Lander, half unloading here; Assembly
  // then uses the crates up one by one.
  const crateCount = view.crates.length;
  const cratesHere =
    stage === "component-delivery"
      ? Math.round(Math.max(progress - 0.5, 0) * 2 * crateCount)
      : stage === "assembly"
        ? crateCount - Math.floor(progress * crateCount)
        : 0;
  for (const [index, crate] of view.crates.entries()) {
    crate.visible = index < cratesHere;
  }

  const building = stage === "assembly" || stage === "commissioning";
  view.array.group.visible = building;
  view.array.setUnfolded(stage === "assembly" ? progress : 1);
  const blinkOn =
    Math.floor(realSeconds * TEST_BLINKS_PER_SECOND * 2) % 2 === 0;
  view.array.setStatusLight(
    stage === "commissioning" && blinkOn ? "testing" : "off",
  );
}

function createView(structureTypeId: string): StructureView {
  const type = catalogue.structureTypes.find(
    (candidate) => candidate.id === structureTypeId,
  );
  const radius = type?.footprintRadiusMetres ?? 1;
  const group = new THREE.Group();
  group.name = `${type?.label ?? structureTypeId} site`;

  const graded = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 32),
    gradedGround,
  );
  graded.rotation.x = -Math.PI / 2;
  graded.position.y = 0.01;
  graded.receiveShadow = true;

  const footprint = createFootprintRing(radius, footprintMarking);

  const componentCount = (type?.components ?? []).reduce(
    (total, need) => total + need.count,
    0,
  );
  const crates = Array.from({ length: componentCount }, (_, index) => {
    const crate = createCrateModel();
    crate.position.set(
      radius * 0.55,
      0,
      (index - (componentCount - 1) / 2) * 0.7,
    );
    crate.visible = false;
    return crate;
  });

  const array = createSolarArrayModel();
  array.group.visible = false;
  group.add(graded, footprint, ...crates, array.group);
  return { group, graded, footprint, crates, array };
}

/** A thin ring marking a footprint's edge on the ground. */
export function createFootprintRing(
  radius: number,
  material: THREE.Material,
): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.08, radius, 48),
    material,
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  return ring;
}
