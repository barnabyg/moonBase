import * as THREE from "three";
import { catalogue } from "../catalogue";
import type {
  ConstructionSnapshot,
  DismantlingSnapshot,
  GroundPosition,
} from "../simulation";
import { toScene, type Frame } from "./interpolation";
import {
  createCrateModel,
  createStructureModel,
  LIGHT_MAST_HEIGHT,
  type StructureModel,
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
  readonly model: StructureModel;
  /** How much energy the Structure can store, to show how full it is. */
  readonly storageKilowattHours: number;
  /** The light that lights the ground round it at Night, if it has one. */
  readonly light: THREE.PointLight | undefined;
}

/** How bright a Light Mast's light is, in candela. */
const MAST_LIGHT_INTENSITY = 180;

/**
 * Draws every Construction as it stands, stage by stage: the ground graded
 * during Site Preparation, the Components' crates delivered and then used up,
 * and the Structure put together during Assembly, such as a solar array
 * unfolding. A commissioned Structure keeps its Construction's id, so the
 * same view carries on, until it has been dismantled.
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
     * Forgets every Construction and Structure drawn, for a Campaign loaded
     * in place of the last, which may give the same ids to others.
     */
    clear(): void {
      for (const view of views.values()) scene.remove(view.group);
      views.clear();
    },
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
          progressOf(frame, construction, frame.previous?.constructions),
          realSeconds,
        );
        if (sunFacing !== undefined) view.model.setFacing(sunFacing);
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
        view.model.group.visible = true;
        view.model.setAssembled(1);
        // A Plant has power only while it runs, so its light shows it is
        // commissioned and in working order.
        view.model.setStatusLight(
          structure.powered ||
            (structure.plant !== undefined && structure.conditionPercent > 0)
            ? "on"
            : "off",
        );
        view.model.setRunning?.(structure.plant?.running === true, realSeconds);
        showLit(view, structure.lit, structure.lightRadiusMetres);
        view.model.setCharge(
          view.storageKilowattHours === 0
            ? 0
            : structure.storedKilowattHours / view.storageKilowattHours,
        );
        if (sunFacing !== undefined) view.model.setFacing(sunFacing);
      }
      for (const dismantling of frame.current.dismantlings) {
        // Until the Robot starts taking it apart, it is drawn as a Structure.
        if (seen.has(dismantling.id)) continue;
        seen.add(dismantling.id);
        const view = viewFor(
          dismantling.id,
          dismantling.structureTypeId,
          dismantling.position,
        );
        showDismantling(
          view,
          dismantling,
          progressOf(frame, dismantling, frame.previous?.dismantlings),
        );
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

/** Anything with stages of work, such as a Construction or dismantling. */
interface StagedWork {
  readonly id: string;
  readonly stage: string;
  readonly stageProgress: number;
}

/** The stage's progress, interpolated between ticks while the stage carries on. */
function progressOf(
  frame: Frame,
  work: StagedWork,
  previous: readonly StagedWork[] | undefined,
): number {
  const before = previous?.find((other) => other.id === work.id);
  if (before === undefined || before.stage !== work.stage) {
    return work.stageProgress;
  }
  return THREE.MathUtils.lerp(
    before.stageProgress,
    work.stageProgress,
    frame.tickProgress,
  );
}

/**
 * Draws a Structure being dismantled: it comes apart in the reverse of its
 * Assembly, then the crates of recovered Components wait on the site until
 * the Robot picks them up.
 */
function showDismantling(
  view: StructureView,
  dismantling: DismantlingSnapshot,
  progress: number,
): void {
  view.graded.scale.setScalar(1);
  view.footprint.visible = true;
  const takingApart = dismantling.stage === "taking-apart";
  view.model.group.visible = takingApart;
  view.model.setAssembled(takingApart ? 1 - progress : 0);
  view.model.setStatusLight("off");
  view.model.setRunning?.(false, 0);
  showLit(view, false);
  const cratesHere = dismantling.collected
    ? 0
    : dismantling.recovered.reduce((total, count) => total + count.count, 0);
  for (const [index, crate] of view.crates.entries()) {
    crate.visible = index < cratesHere;
  }
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

  // Delivery is half loading at the stockpile, half unloading here; Assembly
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

  const assembled = stage === "assembly" || stage === "commissioning";
  view.model.group.visible = assembled;
  view.model.setAssembled(stage === "assembly" ? progress : 1);
  const blinkOn =
    Math.floor(realSeconds * TEST_BLINKS_PER_SECOND * 2) % 2 === 0;
  view.model.setStatusLight(
    stage === "commissioning" && blinkOn ? "testing" : "off",
  );
  showLit(view, false);
}

/**
 * Switches a Structure's light on or off, reaching as far as its Condition
 * allows. Its light joins the scene with the view and is only dimmed
 * between Daylight and Night, because changing the number of lights makes
 * Three.js recompile every material; that cost then comes only when a Light
 * Mast is planned or removed.
 */
function showLit(
  view: StructureView,
  lit: boolean,
  lightRadiusMetres = 0,
): void {
  view.model.setLit(lit);
  if (view.light !== undefined) {
    view.light.intensity = lit ? MAST_LIGHT_INTENSITY : 0;
    if (lit) {
      view.light.distance = Math.hypot(lightRadiusMetres, LIGHT_MAST_HEIGHT);
    }
  }
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

  const model = createStructureModel(structureTypeId);
  model.group.visible = false;
  group.add(graded, footprint, ...crates, model.group);

  // Without shadows: a shadow map for every Light Mast would cost too much.
  const lightRadius = type?.lightRadiusMetres ?? 0;
  const light =
    lightRadius > 0
      ? new THREE.PointLight(
          0xfff0d6,
          0,
          Math.hypot(lightRadius, LIGHT_MAST_HEIGHT),
        )
      : undefined;
  if (light !== undefined) {
    light.name = "Light mast light";
    light.position.y = LIGHT_MAST_HEIGHT - 0.3;
    group.add(light);
  }
  return {
    group,
    graded,
    footprint,
    crates,
    model,
    storageKilowattHours: type?.power.storageKilowattHours ?? 0,
    light,
  };
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
