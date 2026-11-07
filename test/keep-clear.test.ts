import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import {
  isOfKind,
  keepClearOf,
  structuresInTheWay,
  type StandingStructure,
} from "../src/simulation";

const at = { x: 0, y: 0 };
const radius = keepClearOf("infrared-telescope")?.radiusMetres ?? Number.NaN;
const mastFootprint =
  catalogue.structureTypes.find(({ id }) => id === "light-mast")
    ?.footprintRadiusMetres ?? Number.NaN;

function standing(
  id: string,
  structureTypeId: string,
  x: number,
  changes: Partial<StandingStructure> = {},
): StandingStructure {
  return {
    id,
    structureTypeId,
    position: { x, y: 0 },
    conditionPercent: 100,
    switchedOff: false,
    ...changes,
  };
}

describe("what a Structure is kept clear of", () => {
  it("is a lit Structure within an infrared telescope's dark radius", () => {
    expect(keepClearOf("infrared-telescope")).toEqual({
      of: "lit",
      radiusMetres: radius,
    });
    const near = standing("near", "light-mast", radius - 1);
    // Its centre is outside, but its footprint reaches in.
    const edge = standing("edge", "light-mast", radius + mastFootprint / 2);
    const far = standing("far", "light-mast", radius + mastFootprint + 1);
    const unlit = standing("unlit", "battery-bank", 5);

    expect(
      structuresInTheWay("infrared-telescope", at, [near, edge, far, unlit]),
    ).toEqual([near, edge]);
  });

  it("leaves out one that is Broken or switched off, and itself", () => {
    const broken = standing("broken", "light-mast", 10, {
      conditionPercent: 0,
    });
    const off = standing("off", "light-mast", 10, { switchedOff: true });
    const self = standing("self", "light-mast", 0);

    expect(
      structuresInTheWay("infrared-telescope", at, [broken, off, self], "self"),
    ).toEqual([]);
  });

  it("is nothing for a Structure kept clear of nothing", () => {
    expect(keepClearOf("light-mast")).toBeUndefined();
    expect(
      structuresInTheWay("light-mast", at, [standing("m", "light-mast", 1)]),
    ).toEqual([]);
  });

  it("knows lit Structures and Plants by their type", () => {
    expect(isOfKind("lit", "light-mast")).toBe(true);
    expect(isOfKind("lit", "tall-light-mast")).toBe(true);
    expect(isOfKind("lit", "telescope")).toBe(false);
    expect(isOfKind("plants", "propellant-plant")).toBe(true);
    expect(isOfKind("plants", "infrared-telescope")).toBe(true);
    expect(isOfKind("plants", "light-mast")).toBe(false);
    expect(isOfKind("plants", "made-up")).toBe(false);
  });
});
