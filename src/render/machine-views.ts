import * as THREE from "three";
import type { MachineSnapshot } from "../simulation";
import { between, facingAngle, toScene, type Frame } from "./interpolation";
import { createExcavatorModel, type ExcavatorModel } from "./models";

/** How fast the excavator's arm digs in and draws back while grading, in cycles per real second. */
const DIG_CYCLES_PER_SECOND = 0.4;
/** How far the upper body sweeps either side of the site while grading, in radians. */
const SWEEP_ANGLE = 0.45;
/** How often the beacon flashes while the Machine works, in flashes per real second. */
const BEACON_FLASHES_PER_SECOND = 1;

interface MachineView {
  readonly model: ExcavatorModel;
  heading: number;
  lastPosition: THREE.Vector3 | undefined;
}

/**
 * Draws each Machine where the simulation says it is, interpolated between
 * ticks: turning to face the way it is driven, and working its arm over the
 * site while it grades the ground by itself.
 */
export function createMachineViews(scene: THREE.Scene) {
  const views = new Map<string, MachineView>();

  return {
    update(frame: Frame, realSeconds: number): void {
      for (const machine of frame.current.machines) {
        let view = views.get(machine.id);
        if (view === undefined) {
          const model = createExcavatorModel();
          scene.add(model.group);
          view = { model, heading: 0, lastPosition: undefined };
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
        view.model.group.position.copy(position);
        view.model.group.rotation.y = view.heading;

        const site = workSite(frame, machine);
        if (site === undefined) {
          view.model.setSlew(0);
          view.model.setReach(0);
          view.model.setBeacon(false);
          continue;
        }
        const cycle = realSeconds * DIG_CYCLES_PER_SECOND * Math.PI * 2;
        view.model.setSlew(
          facingAngle(position, site) -
            view.heading +
            Math.sin(cycle / 3) * SWEEP_ANGLE,
        );
        view.model.setReach(0.5 + Math.sin(cycle) * 0.5);
        view.model.setBeacon(
          Math.floor(realSeconds * BEACON_FLASHES_PER_SECOND * 2) % 2 === 0,
        );
      }
    },
  };
}

/** The site a Machine is working on by itself, if any. */
function workSite(
  frame: Frame,
  machine: MachineSnapshot,
): THREE.Vector3 | undefined {
  const { activity } = machine;
  if (activity.kind !== "working") return undefined;
  const construction = frame.current.constructions.find(
    (candidate) => candidate.id === activity.constructionId,
  );
  return construction === undefined
    ? undefined
    : toScene(construction.position);
}
