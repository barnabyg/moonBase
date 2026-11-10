import { describe, expect, it } from "vitest";
import type { MapSubject } from "../src/render/renderer";
import { createMapFinder } from "../src/ui/map-finder";

/** A base map that draws the things given, and records what it is asked. */
function mapWith(onMap: readonly string[]) {
  const shown: string[] = [];
  const pointedOut: (string | undefined)[] = [];
  return {
    shown,
    pointedOut,
    showOnMap(subject: MapSubject): boolean {
      if (!onMap.includes(subject.id)) return false;
      shown.push(subject.id);
      return true;
    },
    pointOut(subject: MapSubject | undefined): void {
      pointedOut.push(subject?.id);
    },
  };
}

/** A Structure pop-up that records which Structures it is opened for. */
function popUp() {
  const opened: string[] = [];
  return {
    opened,
    open(structureId: string): void {
      opened.push(structureId);
    },
  };
}

const array: MapSubject = { kind: "structure", id: "structure-1" };
const robot: MapSubject = { kind: "robot", id: "robot-1" };

describe("finding on the base map what a panel lists", () => {
  it("shows a Structure on the map and opens its pop-up", () => {
    const map = mapWith(["structure-1"]);
    const structurePopUp = popUp();

    const result = createMapFinder(map, structurePopUp).find(array);

    expect(result).toEqual({ ok: true });
    expect(map.shown).toEqual(["structure-1"]);
    expect(structurePopUp.opened).toEqual(["structure-1"]);
  });

  it("shows a Robot on the map, which has no pop-up", () => {
    const map = mapWith(["robot-1"]);
    const structurePopUp = popUp();

    expect(createMapFinder(map, structurePopUp).find(robot)).toEqual({
      ok: true,
    });
    expect(map.shown).toEqual(["robot-1"]);
    expect(structurePopUp.opened).toEqual([]);
  });

  it("says that a Robot off the map is away on an Expedition", () => {
    expect(createMapFinder(mapWith([]), popUp()).find(robot)).toEqual({
      ok: false,
      message: "It is away on an Expedition, off the base map.",
    });
  });

  it("without a base map, still opens a Structure's pop-up, and says why a Robot can't be found", () => {
    const structurePopUp = popUp();
    const finder = createMapFinder(undefined, structurePopUp);

    expect(finder.find(array)).toEqual({ ok: true });
    expect(structurePopUp.opened).toEqual(["structure-1"]);
    expect(finder.find(robot)).toEqual({
      ok: false,
      message: "The base map isn't shown, so it can't be found on it.",
    });
    // Nothing to mark it on, and nothing goes wrong.
    finder.pointOut(robot);
  });

  it("passes on what is pointed out, and that nothing is", () => {
    const map = mapWith(["robot-1"]);
    const finder = createMapFinder(map, popUp());

    finder.pointOut(robot);
    finder.pointOut(undefined);

    expect(map.pointedOut).toEqual(["robot-1", undefined]);
  });
});
