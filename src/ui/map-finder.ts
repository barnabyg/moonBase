import type { MapSubject, Renderer } from "../render/renderer";
import type { ChoiceResult } from "./refusal";
import type { StructurePopUp } from "./structure-pop-up";

/** Finds on the base map what a panel lists: a Structure, Robot, Machine or Rover. */
export interface MapFinder {
  /**
   * Moves the camera to it and marks it there, and opens a Structure's
   * pop-up, as clicking it on the map does. Says why not if it can't be
   * shown.
   */
  find(subject: MapSubject): ChoiceResult;
  /** Marks it on the map, without moving the camera, for as long as it is pointed out, or stops. */
  pointOut(subject: MapSubject | undefined): void;
}

/**
 * Finds things on the base map the renderer draws. Without one, as when
 * the browser can't draw the map, a Structure's pop-up still opens, so
 * that what it offers can still be reached.
 */
export function createMapFinder(
  map: Pick<Renderer, "showOnMap" | "pointOut"> | undefined,
  popUp: Pick<StructurePopUp, "open">,
): MapFinder {
  return {
    find(subject) {
      const shown = map?.showOnMap(subject) ?? false;
      if (subject.kind === "structure") {
        popUp.open(subject.id);
        return { ok: true };
      }
      if (map === undefined) {
        return {
          ok: false,
          message: "The base map isn't shown, so it can't be found on it.",
        };
      }
      return shown
        ? { ok: true }
        : {
            ok: false,
            message: "It is away on an Expedition, off the base map.",
          };
    },
    pointOut(subject) {
      map?.pointOut(subject);
    },
  };
}
