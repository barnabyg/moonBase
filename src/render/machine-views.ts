import * as THREE from "three";
import {
  regolithHeapGround,
  type ConstructionSnapshot,
  type GroundPosition,
  type MachineSnapshot,
} from "../simulation";
import { between, facingAngle, toScene, type Frame } from "./interpolation";
import {
  createExcavatorModel,
  createRegolithPrinterModel,
  type ExcavatorModel,
  type RegolithPrinterModel,
} from "./machine-models";
import { printingAt } from "./models";

/** How fast the excavator's arm digs in and draws back while grading, in cycles per real second. */
const DIG_CYCLES_PER_SECOND = 0.4;
/** How far the upper body sweeps either side of the site while grading, in radians. */
const SWEEP_ANGLE = 0.45;
/** How often the beacon flashes while the Machine works, in flashes per real second. */
const BEACON_FLASHES_PER_SECOND = 1;
/** How fast the print head sweeps to and fro along the layer it is printing, in cycles per real second. */
const PRINT_SWEEPS_PER_SECOND = 0.15;
/** How far in from the outer edge of what it prints the print head lays Regolith, as a share of its radius. */
const PRINT_LINE_SHARE = 0.85;
/** How far out the printer's head is while it is parked, in metres. */
const PRINTER_PARKED_REACH = 1.7;
/** How far from its centre the excavator digs, on the side away from the stockpile, in metres. */
const DIGGING_REACH = 3;
/** How long the excavator takes to scoop up Regolith, swing round, tip it onto the heap and swing back, in real seconds. */
const TIPPING_CYCLE_SECONDS = 8;

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
 * or digging Regolith beside the stockpile, and the regolith printer laying
 * Regolith shielding down layer by layer.
 */
export function createMachineViews(scene: THREE.Scene) {
  const views = new Map<string, MachineView>();

  return {
    /** Forgets every Machine drawn, for a Campaign loaded in place of the last. */
    clear(): void {
      for (const view of views.values()) {
        scene.remove(view.machine.model.group);
      }
      views.clear();
    },
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
        const digging = diggingSpot(frame, machine);
        const beaconOn =
          (site !== undefined || digging !== undefined) &&
          Math.floor(realSeconds * BEACON_FLASHES_PER_SECOND * 2) % 2 === 0;
        model.setBeacon(beaconOn);
        if (view.machine.kind === "excavator") {
          showGrading(
            view.machine.model,
            view.heading,
            position,
            site?.position ?? digging,
            {
              realSeconds,
              heap:
                digging === undefined
                  ? undefined
                  : regolithHeapGround(frame.current.stockpile.position)
                      .position,
            },
          );
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

/**
 * Works the excavator's arm over the ground it grades or digs, or tucks it
 * in. Digging, it swings round now and then to tip what it has scooped up
 * onto the heap of Regolith.
 */
function showGrading(
  model: ExcavatorModel,
  heading: number,
  position: THREE.Vector3,
  ground: GroundPosition | undefined,
  {
    realSeconds,
    heap,
  }: {
    readonly realSeconds: number;
    readonly heap: GroundPosition | undefined;
  },
): void {
  if (ground === undefined) {
    model.setSlew(0);
    model.setReach(0);
    return;
  }
  const cycle = realSeconds * DIG_CYCLES_PER_SECOND * Math.PI * 2;
  const digging =
    facingAngle(position, toScene(ground)) + Math.sin(cycle / 3) * SWEEP_ANGLE;
  const tipping = heap === undefined ? 0 : tippingShare(realSeconds);
  const towardsHeap =
    heap === undefined
      ? 0
      : turnBetween(digging, facingAngle(position, toScene(heap)));
  model.setSlew(digging + towardsHeap * tipping - heading);
  model.setReach(
    THREE.MathUtils.lerp(0.5 + Math.sin(cycle) * 0.5, 0.6, tipping),
  );
}

/**
 * How far round towards the heap the excavator has swung, from 0 (over
 * where it digs) to 1 (over the heap): scooping for half of each cycle,
 * swinging round, tipping, and swinging back.
 */
function tippingShare(realSeconds: number): number {
  const phase = (realSeconds / TIPPING_CYCLE_SECONDS) % 1;
  if (phase < 0.5) return 0;
  if (phase < 0.65) return THREE.MathUtils.smoothstep(phase, 0.5, 0.65);
  if (phase < 0.85) return 1;
  return 1 - THREE.MathUtils.smoothstep(phase, 0.85, 1);
}

/** The shortest turn from one angle to another, in radians, from -pi to pi. */
function turnBetween(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * Sweeps the printer's head to and fro along the ring of Regolith it is
 * printing: rising with Regolith shielding as it grows, or reaching further
 * out over a sintered landing pad as it spreads. Or parks it.
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
  const printing = printingAt(site.structureTypeId, progress);
  const height = printing.height;
  const radius = printing.radius * PRINT_LINE_SHARE;
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

/** Where a Machine digging by itself digs: just beside it, on the side away from the stockpile. */
function diggingSpot(
  frame: Frame,
  machine: MachineSnapshot,
): GroundPosition | undefined {
  if (machine.activity.kind !== "digging") return undefined;
  const stockpile = frame.current.stockpile.position;
  const angle = Math.atan2(
    machine.position.y - stockpile.y,
    machine.position.x - stockpile.x,
  );
  return {
    x: machine.position.x + Math.cos(angle) * DIGGING_REACH,
    y: machine.position.y + Math.sin(angle) * DIGGING_REACH,
  };
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
