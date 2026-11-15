import { describe, expect, it } from "vitest";
import { loadSample } from "./sample-saves";

describe("a save from before Decorations", () => {
  it("loads with the Decorations Design unlocked after the Designs it had, and none of their kits in stock", () => {
    const campaign = loadSample("version-49.moonbase");
    const { unlockedDesignIds, stockpile } = campaign.snapshot();

    expect(unlockedDesignIds.at(-1)).toBe("decorations");
    expect(unlockedDesignIds.filter((id) => id === "decorations")).toHaveLength(
      1,
    );
    for (const componentId of [
      "flag-kit",
      "memorial-plaque",
      "viewing-area-kit",
    ]) {
      expect(
        stockpile.components.find((stock) => stock.componentId === componentId)
          ?.count,
      ).toBe(0);
    }
  });
});

describe("the sample save of format version 50", () => {
  // The decorations try scenario as it was then: a flag pole standing, and the
  // kits for a founding memorial and a viewing area in stock.
  it("loads with its flag pole standing, and builds a founding memorial from the kit in stock", () => {
    const campaign = loadSample("version-50.moonbase");
    const flag = campaign
      .snapshot()
      .structures.find(
        ({ structureTypeId }) => structureTypeId === "flag-pole",
      );
    expect(flag?.conditionPercent).toBeGreaterThan(99);

    const planned = campaign.planConstruction({
      structureTypeId: "founding-memorial",
      position: { x: 18, y: -6 },
    });
    expect(planned.ok).toBe(true);
    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 48) throw new Error("The memorial never went up.");
      campaign.advance(60);
    }
    expect(
      campaign
        .snapshot()
        .structures.some(
          ({ structureTypeId }) => structureTypeId === "founding-memorial",
        ),
    ).toBe(true);
  });
});
