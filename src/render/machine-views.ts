import * as THREE from "three";
import type { ConstructionSnapshot, MachineSnapshot } from "../simulation";
import { between, facingAngle, toScene, type Frame } from "./interpolation";
import {
  createExcavatorModel,
  createRegolithPrinterModel,
  shieldingRadiusAt,
  SHIELDING_HEIGHT,
  type ExcavatorModel,
  type RegolithPrinterModel,
} from "./models";

/** How fast the excavator's arm digs in and draws back while grading, in cycles per real second. */
const DIG_CYCLES_PER_SECOND = 0.4;
/** How far the upper body sweeps either side of the site while grading, in radians. */
const SWEEP_ANGLE = 0.45;
/** How often the beacon flashes while the Machine works, in flashes per real second. */
const BEACON_FLASHES_PER_SECOND = 1;
/** How fast the print head sweeps to and fro along the layer it is printing, in cycles per real second. */
const PRINT_SWEEPS_PER_SECOND = 0.15;
/** How far in from the shielding's outer surface the print head lays Regolith, as a share of its radius. */
const PRINT_LINE_SHARE = 0.85;
/** How far out the printer's head is while it is parked, in metres. */
const PRINTER_PARKED_REACH = 1.7;

type MachineModel =
  | { readonly kind: "excavator"; readonly model: ExcavatorModel }
  | { readonly kind: "regolith-printer"; readonly model: RegolithPrinterModel };

interface MachineView {
  readonly machine: MachineModel;
  heading: number;
  lastPosition: THREE.Vector3 | undefined;
}

/**
 * Draws each Machine where the simulation says it is, interpolated between
 * ticks: turning to face the way it is driven, and working over the site
 * while it carries out its stage by itself, the excavator grading the ground
 * and the regolith printer laying Regolith shielding down layer by layer.
 */
export function createMachineViews(scene: THREE.Scene) {
  const views = new Map<string, MachineView>();

  return {
    update(frame: Frame, realSeconds: number): void {
      for (const machine of frame.current.machines) {
        let view = views.get(machine.id);
        if (view === undefined) {
          const created = createMachineModel(machine.machineTypeId);
          scene.add(created.model.group);
          view = { machine: created, heading: 0, lastPosition: undefined };
          views.set(machine.id, view);
        }
        const before = frame.previous?.machines.find(
          (other) => other.id === machine.id,
        );
        const position = toScene(
          between(before?.position, machine.position, frame.tickProgress),
        );
        if (
          view.lastPosition !== undefined &&
          position.distanceTo(view.lastPosition) > 1e-6
        ) {
          view.heading = facingAngle(view.lastPosition, position);
        }
        view.lastPosition = position.clone();
        const { model } = view.machine;
        model.group.position.copy(position);
        model.group.rotation.y = view.heading;

        const site = workSite(frame, machine);
        const beaconOn =
          site !== undefined &&
          Math.floor(realSeconds * BEACON_FLASHES_PER_SECOND * 2) % 2 === 0;
        model.setBeacon(beaconOn);
        if (view.machine.kind === "excavator") {
          showGrading(view.machine.model, view.heading, position, site, {
            realSeconds,
          });
        } else {
          showPrinting(view.machine.model, view.heading, position, site, {
            realSeconds,
            progress: site === undefined ? 0 : progressOf(frame, site),
          });
        }
      }
    },
  };
}

function createMachineModel(machineTypeId: string): MachineModel {
  return machineTypeId === "regolith-printer"
    ? { kind: "regolith-printer", model: createRegolithPrinterModel() }
    : { kind: "excavator", model: createExcavatorModel() };
}

/** Works the excavator's arm over the site while it grades the ground, or tucks it in. */
function showGrading(
  model: ExcavatorModel,
  heading: number,
  position: THREE.Vector3,
  site: ConstructionSnapshot | undefined,
  { realSeconds }: { readonly realSeconds: number },
): void {
  if (site === undefined) {
    model.setSlew(0);
    model.setReach(0);
    return;
  }
  const cycle = realSeconds * DIG_CYCLES_PER_SECOND * Math.PI * 2;
  model.setSlew(
    facingAngle(position, toScene(site.position)) -
      heading +
      Math.sin(cycle / 3) * SWEEP_ANGLE,
  );
  model.setReach(0.5 + Math.sin(cycle) * 0.5);
}

/**
 * Sweeps the printer's head to and fro along the top of the layer of
 * Regolith shielding it is printing, rising as the shielding grows, or parks
 * it.
 */
function showPrinting(
  model: RegolithPrinterModel,
  heading: number,
  position: THREE.Vector3,
  site: ConstructionSnapshot | undefined,
  {
    realSeconds,
    progress,
  }: { readonly realSeconds: number; readonly progress: number },
): void {
  if (site === undefined) {
    model.setSlew(0);
    model.setReach(PRINTER_PARKED_REACH);
    model.setNozzleHeight(0);
    return;
  }
  const centre = toScene(site.position);
  const height = progress * SHIELDING_HEIGHT;
  const radius = shieldingRadiusAt(height) * PRINT_LINE_SHARE;
  const away = Math.hypot(centre.x - position.x, centre.z - position.z);
  // Along the near side of the ring the layer follows, as far round as the
  // head can reach.
  const widest = Math.asin(Math.min((radius * 0.9) / away, 1));
  const sweep =
    Math.sin(realSeconds * PRINT_SWEEPS_PER_SECOND * Math.PI * 2) * widest;
  const across = away * Math.sin(sweep);
  model.setSlew(facingAngle(position, centre) - heading + sweep);
  model.setReach(
    away * Math.cos(sweep) -
      Math.sqrt(Math.max(radius * radius - across * across, 0)),
  );
  model.setNozzleHeight(height);
}

/** The Construction a Machine is working on by itself, if any. */
function workSite(
  frame: Frame,
  machine: MachineSnapshot,
): ConstructionSnapshot | undefined {
  const { activity } = machine;
  if (activity.kind !== "working") return undefined;
  return frame.current.constructions.find(
    (candidate) => candidate.id === activity.constructionId,
  );
}

/** A Construction's stage progress, interpolated between ticks while the stage carries on. */
function progressOf(frame: Frame, construction: ConstructionSnapshot): number {
  const before = frame.previous?.constructions.find(
    (other) => other.id === construction.id,
  );
  return before === undefined || before.stage !== construction.stage
    ? construction.stageProgress
    : THREE.MathUtils.lerp(
        before.stageProgress,
        construction.stageProgress,
        frame.tickProgress,
      );
}
