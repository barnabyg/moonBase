import { describe, expect, it } from "vitest";
import { createCampaign, loadCampaign, type Snapshot } from "../src/simulation";
import { loadSample } from "./sample-saves";
import { DEFAULT_SEED } from "./scenario";

function stock(state: Snapshot, stockId: string) {
  return state.lifeSupport.find((line) => line.stockId === stockId);
}

describe("the sample save of format version 43", () => {
  // The storage-tanks try scenario as it was then: a base with a water tank and
  // an oxygen tank half full, a few hours before Night.
  it("loads with both tanks in the limits and holding their shares", () => {
    const state = loadSample("version-43.moonbase").snapshot();

    expect(stock(state, "water")).toMatchObject({
      kilograms: 700,
      limitKilograms: 1400,
    });
    expect(stock(state, "oxygen")).toMatchObject({
      kilograms: 200,
      limitKilograms: 400,
    });
    expect(
      state.structures.find(
        ({ structureTypeId }) => structureTypeId === "oxygen-tank",
      )?.tank?.heldKilograms,
    ).toBe(150);
  });

  it("plays on through the Night, with the tanks drawing power and keeping what they hold", () => {
    const campaign = loadSample("version-43.moonbase");

    campaign.advance(24 * 60);

    const state = campaign.snapshot();
    expect(state.lunation.part).toBe("night");
    expect(stock(state, "oxygen")?.kilograms).toBe(200);
    expect(
      state.structures.find(
        ({ structureTypeId }) => structureTypeId === "water-tank",
      )?.powered,
    ).toBe(true);
  });
});

describe("a save from before the storage tanks", () => {
  /**
   * A save of format version 42: nothing else in the format differs, so it is a
   * Campaign of now, with the Launch items of then on its manifest and the
   * Design that brought them unlocked.
   */
  function version42(
    lines: readonly { itemId: string; count: number }[],
    leg?: "travelling-to-moon",
  ): string {
    const campaign = createCampaign({ seed: DEFAULT_SEED });
    const document = JSON.parse(campaign.save()) as {
      version: number;
      state: {
        launchManifest: unknown;
        unlockedDesignIds: string[];
        launchFeePaidMillionDollars: number | null;
        lander: { trip: unknown };
      };
    };
    document.version = 42;
    document.state.launchManifest = lines;
    document.state.unlockedDesignIds.push(
      "water-electrolysis",
      "bulk-supply-tanks",
    );
    if (leg !== undefined) {
      document.state.lander.trip = {
        leg,
        legStartedAtMinute: 0,
        legEndsAtMinute: 60,
      };
      document.state.launchFeePaidMillionDollars = 150;
    }
    return JSON.stringify(document);
  }

  function loaded(save: string) {
    const result = loadCampaign(save);
    if (!result.ok) throw new Error(result.message);
    return result.campaign;
  }

  it("keeps Bulk supply tanks unlocked, which now offers the tanks to build", () => {
    const state = loaded(version42([])).snapshot();

    expect(state.unlockedDesignIds).toContain("bulk-supply-tanks");
  });

  it("takes the removed Launch items off a manifest not yet paid for, and keeps the rest", () => {
    const state = loaded(
      version42([
        { itemId: "water", count: 1 },
        { itemId: "liquid-oxygen-tank", count: 1 },
        { itemId: "bulk-water-tank", count: 2 },
        { itemId: "spare-component", count: 3 },
      ]),
    ).snapshot();

    expect(state.launchManifest.items).toEqual([
      { itemId: "water", count: 1 },
      { itemId: "spare-component", count: 3 },
    ]);
  });

  it("has a Lander on its way to the Moon bring what was paid for, as the same oxygen and water in resupply items", () => {
    const campaign = loaded(
      version42(
        [
          { itemId: "water", count: 1 },
          { itemId: "liquid-oxygen-tank", count: 1 },
          { itemId: "bulk-water-tank", count: 2 },
        ],
        "travelling-to-moon",
      ),
    );
    const state = campaign.snapshot();

    // 150 kg of oxygen and 600 kg of water, on top of the 50 kg already there.
    expect(state.launchManifest.items).toEqual([
      { itemId: "oxygen", count: 6 },
      { itemId: "water", count: 13 },
    ]);
    expect(state.launchManifest.locked).toBe(true);

    campaign.advance(60);

    // Up to what the base holds, the rest lost on landing.
    const landed = campaign.snapshot();
    expect(landed.launchManifest.items).toEqual([]);
    expect(stock(landed, "oxygen")?.kilograms).toBe(100);
    expect(stock(landed, "water")?.kilograms).toBe(400);
  });
});
