import { describe, expect, it } from "vitest";
import { catalogue, type LaunchItem } from "../src/catalogue";
import {
  formatItemsShown,
  groupLaunchItems,
  matchesItemFilter,
  offersItemFilter,
} from "../src/ui/launch-manifest-text";

const groups = groupLaunchItems(catalogue.launch.items);

function groupOf(itemId: string): string | undefined {
  return groups.find((group) => group.items.some((item) => item.id === itemId))
    ?.label;
}

const startingItems = catalogue.launch.items.filter(
  (item) =>
    catalogue.designs.find((design) => design.id === item.designId)
      ?.starting === true,
);

describe("how the Imports tab groups the Launch items", () => {
  it("lists every item once", () => {
    const listed = groups.flatMap((group) =>
      group.items.map((item) => item.id),
    );
    expect(listed.toSorted()).toEqual(
      catalogue.launch.items.map((item) => item.id).toSorted(),
    );
  });

  it("puts what a base keeps on buying first, then the Tech Tree's categories in its order", () => {
    expect(groups.map((group) => group.label)).toEqual([
      "Supplies",
      ...catalogue.designCategories.map((category) => category.label),
    ]);
  });

  it("has oxygen, water and spare Components as Supplies, whichever tanks they come in", () => {
    for (const id of [
      "oxygen",
      "water",
      "liquid-oxygen-tank",
      "bulk-water-tank",
      "spare-component",
    ]) {
      expect(groupOf(id)).toBe("Supplies");
    }
  });

  it("has anything else under the category of its Design, as the Tech Tree does", () => {
    expect(groupOf("solar-panel")).toBe("Power");
    expect(groupOf("habitat-core")).toBe("Life Support");
    expect(groupOf("robot")).toBe("Mobility");
  });

  it("keeps the catalogue's order within a group", () => {
    for (const group of groups) {
      const positions = group.items.map((item) =>
        catalogue.launch.items.indexOf(item),
      );
      expect(positions).toEqual(positions.toSorted((a, b) => a - b));
    }
  });

  it("leaves out a group with nothing in it", () => {
    const solarPanel = catalogue.launch.items.find(
      (item): item is LaunchItem => item.id === "solar-panel",
    );
    if (solarPanel === undefined) throw new Error("expected a solar panel");
    expect(groupLaunchItems([solarPanel]).map((group) => group.label)).toEqual([
      "Power",
    ]);
  });
});

describe("finding an item", () => {
  const text = "Solar panel The Components of a solar array. Power";

  it("matches everything with nothing typed", () => {
    expect(matchesItemFilter("", text)).toBe(true);
    expect(matchesItemFilter("   ", text)).toBe(true);
  });

  it("matches part of a word, in any case", () => {
    expect(matchesItemFilter("SOL", text)).toBe(true);
    expect(matchesItemFilter("telescope", text)).toBe(false);
  });

  it("needs every word typed, in any order", () => {
    expect(matchesItemFilter("array panel", text)).toBe(true);
    expect(matchesItemFilter("array telescope", text)).toBe(false);
  });
});

describe("when the Imports tab offers a box to find an item", () => {
  it("doesn't at the start of a Campaign, when the list is short", () => {
    expect(offersItemFilter(startingItems.length)).toBe(false);
  });

  it("does once every item the game has today is listed", () => {
    expect(offersItemFilter(catalogue.launch.items.length)).toBe(true);
  });
});

describe("what the Imports tab says it is showing", () => {
  it("says how many items are listed with nothing filtered out", () => {
    expect(formatItemsShown(61, 61)).toBe("61 items");
  });

  it("says how many of them are shown", () => {
    expect(formatItemsShown(5, 61)).toBe("Showing 5 of 61 items");
  });

  it("says so when none are", () => {
    expect(formatItemsShown(0, 61)).toBe("No items match");
  });
});
