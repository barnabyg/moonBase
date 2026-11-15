import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import {
  designBrings,
  designById,
  designSteps,
  designsLeadingFrom,
  designsNeededBefore,
  pathToDesign,
} from "../src/ui/tech-tree-graph";

const starting = catalogue.designs
  .filter((design) => design.starting)
  .map((design) => design.id);

describe("the Tech Tree's shape", () => {
  const steps = designSteps();

  it("puts the starting Designs at step 0 and every other one below all it needs", () => {
    for (const design of catalogue.designs) {
      const step = steps.get(design.id) ?? -1;
      if (design.starting) expect(step).toBe(0);
      else expect(step).toBeGreaterThan(0);
      for (const id of design.prerequisiteDesignIds) {
        expect(steps.get(id) ?? Infinity).toBeLessThan(step);
      }
    }
  });

  it("puts a Design one step below the furthest along of those it needs", () => {
    expect(steps.get("large-battery-banks")).toBe(1);
    expect(steps.get("tall-light-masts")).toBe(2);
    // Needs nothing, but has to be unlocked.
    expect(steps.get("robots")).toBe(1);
  });

  it("knows which Designs each one leads to", () => {
    expect(designsLeadingFrom("large-battery-banks")).toEqual([
      "tall-light-masts",
      "thermal-storage",
    ]);
    expect(designsLeadingFrom("crew-habitats")).toEqual([]);
  });

  it("knows everything a Design needs first, however far back", () => {
    expect([...designsNeededBefore("landing-pad-lights")].toSorted()).toEqual(
      [
        "battery-banks",
        "landing-pads",
        "large-battery-banks",
        "light-masts",
        "tall-light-masts",
      ].toSorted(),
    );
    expect(designsNeededBefore("robots").size).toBe(0);
  });
});

describe("the way to a Design", () => {
  it("lists what is still to unlock, each after all it needs, ending with the Design", () => {
    const path = pathToDesign("cold-trap-mining", starting).map(({ id }) => id);
    expect(path).toEqual([
      "water-electrolysis",
      "molten-regolith-electrolysis",
      "parts-machining",
      "cold-trap-mining",
    ]);
    for (const [index, id] of path.entries()) {
      for (const prerequisite of designById(id).prerequisiteDesignIds) {
        if (starting.includes(prerequisite)) continue;
        expect(path.indexOf(prerequisite)).toBeLessThan(index);
      }
    }
  });

  it("leaves out what is unlocked, and is empty for a Design unlocked", () => {
    expect(
      pathToDesign("cold-trap-mining", [
        ...starting,
        "molten-regolith-electrolysis",
      ]).map(({ id }) => id),
    ).toEqual(["water-electrolysis", "parts-machining", "cold-trap-mining"]);
    expect(pathToDesign("solar-arrays", starting)).toEqual([]);
  });

  it("lists a Design needed twice over only once", () => {
    const path = pathToDesign("vault-cistern", starting).map(({ id }) => id);
    expect(new Set(path).size).toBe(path.length);
    expect(path).toContain("water-electrolysis");
    expect(path.at(-1)).toBe("vault-cistern");
  });
});

describe("what a Design brings, at a glance", () => {
  it("names its Structures", () => {
    expect(designBrings(designById("bulk-supply-tanks"))).toEqual([
      "Water tank",
      "Oxygen tank",
    ]);
  });

  it("names its types of Expedition", () => {
    expect(designBrings(designById("prospecting-expeditions"))).toEqual([
      "Prospecting for metals",
      "Prospecting for silicon",
    ]);
  });

  it("names what it ships when it brings no Structure", () => {
    expect(designBrings(designById("robots"))).toEqual(["Robots"]);
    expect(designBrings(designById("life-support-resupply"))).toEqual([
      "Oxygen",
      "Water",
    ]);
    expect(designBrings(designById("thin-film-solar-cells"))).toHaveLength(1);
  });

  it("brings something for every Design", () => {
    for (const design of catalogue.designs) {
      expect(designBrings(design), design.id).not.toHaveLength(0);
    }
  });
});
