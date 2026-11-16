import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { isInBuildMenu, isOnSale } from "../src/simulation";
import { findStructureType } from "../src/simulation/construction";

const structureType = (id: string) => {
  const found = findStructureType(id);
  if (found === undefined) throw new Error(`expected a ${id}`);
  return found;
};

const launchItem = (id: string) => {
  const found = catalogue.launch.items.find((item) => item.id === id);
  if (found === undefined) throw new Error(`expected a ${id}`);
  return found;
};

describe("the battery banks", () => {
  it("come in two sizes, each in a plain cabinet or a Whipple-shielded one", () => {
    expect(
      catalogue.structureTypes
        .filter((type) => type.batteryBank !== undefined)
        .map((type) => [type.id, type.batteryBank]),
    ).toEqual([
      ["battery-bank", { large: false, shielded: false }],
      ["whipple-shielded-battery-bank", { large: false, shielded: true }],
      ["large-battery-bank", { large: true, shielded: false }],
      ["whipple-shielded-large-battery-bank", { large: true, shielded: true }],
    ]);
  });

  it("gives only the plain ones an entry in the build menu, the cabinet being a choice made in placing one", () => {
    expect(
      catalogue.structureTypes
        .filter((type) => type.batteryBank !== undefined)
        .filter(isInBuildMenu)
        .map(({ id }) => id),
    ).toEqual(["battery-bank", "large-battery-bank"]);
  });

  it("builds a Whipple-shielded large battery bank as a large battery bank in a large Whipple-shielded cabinet, which a strike takes a quarter as much from", () => {
    const plain = structureType("large-battery-bank");
    const shielded = structureType("whipple-shielded-large-battery-bank");

    expect(shielded.label).toBe("Whipple-shielded large battery bank");
    expect(shielded.components).toEqual([
      { componentId: "large-battery-module", count: 4 },
      { componentId: "large-whipple-cabinet", count: 1 },
    ]);
    expect(shielded.hazardMultipliers).toEqual({
      ...plain.hazardMultipliers,
      micrometeorites: 0.25,
    });
    expect(shielded.power).toEqual(plain.power);
  });

  it("makes the large Whipple-shielded cabinet clearly heavier and dearer than a large cabinet or a Whipple-shielded one", () => {
    const large = launchItem("large-whipple-cabinet");
    for (const other of ["large-battery-cabinet", "whipple-cabinet"]) {
      expect(large.massKilograms).toBeGreaterThan(
        launchItem(other).massKilograms + 100,
      );
      expect(large.priceMillionDollars).toBeGreaterThan(
        launchItem(other).priceMillionDollars + 5,
      );
    }
  });

  it("sells the large Whipple-shielded cabinet only once both Whipple shielding and Large battery banks are unlocked, whichever came first", () => {
    const cabinet = launchItem("large-whipple-cabinet");
    const starting = catalogue.designs
      .filter((design) => design.starting)
      .map(({ id }) => id);

    expect(isOnSale(cabinet, [...starting, "whipple-shielding"])).toBe(false);
    expect(isOnSale(cabinet, [...starting, "large-battery-banks"])).toBe(false);
    expect(
      isOnSale(cabinet, [
        ...starting,
        "large-battery-banks",
        "whipple-shielding",
      ]),
    ).toBe(true);
  });

  it("keeps the plain cabinets on sale beside the shielded ones", () => {
    const everything = catalogue.designs.map(({ id }) => id);
    for (const id of [
      "battery-cabinet",
      "whipple-cabinet",
      "large-battery-cabinet",
      "large-whipple-cabinet",
    ]) {
      expect(isOnSale(launchItem(id), everything)).toBe(true);
    }
  });
});
