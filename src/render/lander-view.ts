import * as THREE from "three";
import { catalogue } from "../catalogue";
import { toScene, type Frame } from "./interpolation";
import { createLanderModel } from "./lander-model";
import { createPlumeModel } from "./models";

/**
 * How long the Lander is seen climbing away after it takes off, and coming
 * down before it lands, in game-minutes. The rest of its round trip it is
 * off the map.
 */
const FLIGHT_MINUTES = 20;
/** How high it is when it climbs out of sight, in metres. */
const FLIGHT_CEILING_METRES = 300;
/** Above this height its engine no longer blasts dust off the ground, in metres. */
const PLUME_HEIGHT_METRES = 60;
/** Where the engine bell's exhaust starts, above the Lander's feet. */
const EXHAUST_TOP_METRES = 0.55;

/**
 * Draws the Lander from the simulation's state: standing where it landed,
 * climbing away on its plume at the start of its round trip and coming down
 * on it at the end, and off the map in between.
 */
export function createLanderView(scene: THREE.Scene) {
  const lander = createLanderModel(catalogue.lander.footprintRadiusMetres);
  // The dust rolls out as far as the Plume Ejecta reaches.
  const plume = createPlumeModel(catalogue.plumeEjecta.radiusMetres);
  scene.add(lander.group, plume.group);

  return {
    update(frame: Frame, realSeconds: number): void {
      const { lander: state, clock } = frame.current;
      // Between the latest two game-minutes, so the climb looks smooth.
      const now =
        frame.previous === undefined
          ? clock.elapsedMinutes
          : frame.previous.clock.elapsedMinutes +
            (clock.elapsedMinutes - frame.previous.clock.elapsedMinutes) *
              frame.tickProgress;
      const minutesInFlight =
        state.state === "travelling-to-earth"
          ? now - (state.legStartedAtMinute ?? now)
          : state.state === "travelling-to-moon"
            ? (state.legEndsAtMinute ?? now) - now
            : state.state === "turnaround"
              ? Infinity
              : 0;
      const onMap = minutesInFlight < FLIGHT_MINUTES;
      // Speeding up as it climbs away, slowing down as it comes in to land.
      const height = onMap
        ? FLIGHT_CEILING_METRES *
          (Math.max(minutesInFlight, 0) / FLIGHT_MINUTES) ** 2
        : 0;
      const ground = toScene(state.position);
      lander.group.visible = onMap;
      lander.group.position.copy(ground).setY(height);
      lander.setCrewAboard(
        frame.current.missionDirector.residence === "lander",
      );
      const strength =
        onMap && minutesInFlight > 0
          ? Math.max(1 - height / PLUME_HEIGHT_METRES, 0)
          : 0;
      plume.group.position.copy(ground);
      plume.show(
        strength,
        Math.min(minutesInFlight / (FLIGHT_MINUTES / 4), 1),
        height + EXHAUST_TOP_METRES,
        realSeconds,
      );
    },
  };
}
