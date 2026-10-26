import * as THREE from "three";
import { between, facingAngle, toScene, type Frame } from "./interpolation";
import { createRoverModel, type RoverModel } from "./models";

interface RoverView {
  readonly model: RoverModel;
  heading: number;
  lastPosition: THREE.Vector3 | undefined;
}

/**
 * Draws each Rover where the simulation says it is, interpolated between
 * ticks, turning to face the way it is driven.
 */
export function createRoverViews(scene: THREE.Scene) {
  const views = new Map<string, RoverView>();

  return {
    /** Forgets every Rover drawn, for a Campaign loaded in place of the last. */
    clear(): void {
      for (const view of views.values()) scene.remove(view.model.group);
      views.clear();
    },
    update(frame: Frame): void {
      for (const rover of frame.current.rovers) {
        let view = views.get(rover.id);
        if (view === undefined) {
          const model = createRoverModel();
          scene.add(model.group);
          view = { model, heading: 0, lastPosition: undefined };
          views.set(rover.id, view);
        }
        const before = frame.previous?.rovers.find(
          (other) => other.id === rover.id,
        );
        const position = toScene(
          between(before?.position, rover.position, frame.tickProgress),
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
      }
    },
  };
}
