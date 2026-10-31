import { describe, expect, it, vi } from "vitest";
import type { Catalogue } from "../src/catalogue";
import type { Campaign, Snapshot } from "../src/simulation";
import { formatReturnMass } from "../src/ui/launch-manifest-text";
import { scenario } from "./scenario";
import { changed } from "./worn";

// The Mission Director has to live in the Habitat for a whole round trip,
// longer than the starting stock keeps a Habitat powered or the dose low.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { safeHabitat } = await import("./safe-habitat");
  return {
    ...actual,
    catalogue: safeHabitat(actual.catalogue, [
      "power",
      "radiation",
      "solar-particle-events",
    ]),
  };
});

/**
 * The Mission Director living in a commissioned Habitat, so the Lander is free
 * to fly from the landing site, with this much in the base's stock.
 */
function landerFreeWith(stock: Record<string, number>): Campaign {
  const game = scenario().plan("habitat", { x: 25, y: -20 });
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Habitat was never built.");
    game.advance({ hours: 1 });
  }
  const movedIn = game.campaign.moveMissionDirectorIn(
    game.state.structures[0]?.id ?? "",
  );
  if (!movedIn.ok) throw new Error(movedIn.message);
  return changed(game.campaign, (state) => {
    for (const line of state.bulkResources) {
      const kilograms = stock[line.resourceId];
      if (kilograms !== undefined) line.kilograms = kilograms;
    }
  });
}

function inStock(state: Snapshot, resourceId: string): number {
  return (
    state.bulkResources.find((line) => line.resourceId === resourceId)
      ?.kilograms ?? Number.NaN
  );
}

describe("the Return Mass", () => {
  it("is 100 kg with no propellant in stock", () => {
    const campaign = landerFreeWith({ metals: 500 });

    expect(campaign.snapshot().exports.returnMassKilograms).toBe(100);
    expect(
      campaign.loadExports([{ resourceId: "metals", kilograms: 100 }]).ok,
    ).toBe(true);
    const over = campaign.loadExports([
      { resourceId: "metals", kilograms: 101 },
    ]);
    expect(over).toMatchObject({ ok: false, reason: "over-return-mass" });
  });

  it("rises by a kilogram for every 2 kg of propellant in stock", () => {
    const campaign = landerFreeWith({ metals: 500, propellant: 60 });

    expect(campaign.snapshot().exports.returnMassKilograms).toBe(130);
    expect(
      campaign.loadExports([{ resourceId: "metals", kilograms: 130 }]).ok,
    ).toBe(true);
    expect(
      campaign.loadExports([{ resourceId: "metals", kilograms: 131 }]),
    ).toMatchObject({ ok: false, reason: "over-return-mass" });
  });

  it("stops rising at 400 kg, however much propellant there is", () => {
    const campaign = landerFreeWith({ metals: 900, propellant: 5000 });

    expect(campaign.snapshot().exports.returnMassKilograms).toBe(400);
  });

  it("doesn't count propellant loaded to be sold, as it can't be burned as well", () => {
    const campaign = landerFreeWith({ metals: 500, propellant: 60 });

    expect(
      campaign.loadExports([
        { resourceId: "propellant", kilograms: 20 },
        { resourceId: "metals", kilograms: 100 },
      ]).ok,
    ).toBe(true);
    expect(campaign.snapshot().exports.returnMassKilograms).toBe(120);

    // 20 sold and 120 carried in all takes 40 to burn, the rest of the 60.
    expect(
      campaign.loadExports([
        { resourceId: "propellant", kilograms: 20 },
        { resourceId: "metals", kilograms: 101 },
      ]),
    ).toMatchObject({ ok: false, reason: "over-return-mass" });
  });
});

describe("taking off", () => {
  it("burns 2 kg of propellant for each kilogram carried over 100 kg", () => {
    const campaign = landerFreeWith({ metals: 500, propellant: 100 });
    expect(
      campaign.loadExports([{ resourceId: "metals", kilograms: 130 }]).ok,
    ).toBe(true);
    expect(campaign.sendLander().ok).toBe(true);

    campaign.advance(1);

    const state = campaign.snapshot();
    expect(inStock(state, "propellant")).toBe(40);
    expect(inStock(state, "metals")).toBe(370);
    expect(state.exports.aboard).toEqual([
      { resourceId: "metals", kilograms: 130 },
    ]);
  });

  it("burns none for a load within 100 kg", () => {
    const campaign = landerFreeWith({ metals: 500, propellant: 100 });
    expect(
      campaign.loadExports([{ resourceId: "metals", kilograms: 100 }]).ok,
    ).toBe(true);
    expect(campaign.sendLander().ok).toBe(true);

    campaign.advance(1);

    expect(inStock(campaign.snapshot(), "propellant")).toBe(100);
  });
});

describe("the Launch manifest's Return Mass", () => {
  it("says the raised limit, and the propellant to burn only when there is any", () => {
    const campaign = landerFreeWith({ metals: 500, propellant: 60 });
    campaign.loadExports([{ resourceId: "metals", kilograms: 100 }]);
    expect(formatReturnMass(campaign.snapshot().exports)).toBe(
      "Return Mass: 100 of 130 kg",
    );

    campaign.loadExports([{ resourceId: "metals", kilograms: 120 }]);
    expect(formatReturnMass(campaign.snapshot().exports)).toBe(
      "Return Mass: 120 of 130 kg, burning 40 kg of propellant",
    );
  });
});

describe("the Return Mass with the Lander away", () => {
  it("covers what it carries, with nothing left to burn", () => {
    const campaign = landerFreeWith({ metals: 500, propellant: 400 });
    campaign.loadExports([{ resourceId: "metals", kilograms: 300 }]);
    campaign.sendLander();
    campaign.advance(2);

    expect(formatReturnMass(campaign.snapshot().exports)).toBe(
      "Return Mass: 300 of 300 kg",
    );
  });
});

describe("the Act 3 and 4 Milestones", () => {
  function reached(campaign: Campaign): readonly string[] {
    return campaign.snapshot().milestones.reachedIds;
  }

  it("reaches First propellant as soon as there is some in stock", () => {
    const campaign = landerFreeWith({ propellant: 1 });
    expect(reached(campaign)).not.toContain("first-propellant");

    campaign.advance(1);

    expect(reached(campaign)).toContain("first-propellant");
  });

  it("reaches Return Mass tripled on taking off with 300 kg, not with less", () => {
    const short = landerFreeWith({ metals: 500, propellant: 400 });
    short.loadExports([{ resourceId: "metals", kilograms: 299 }]);
    short.sendLander();
    short.advance(2);
    expect(reached(short)).not.toContain("return-mass-tripled");

    const full = landerFreeWith({ metals: 500, propellant: 400 });
    full.loadExports([{ resourceId: "metals", kilograms: 300 }]);
    full.sendLander();
    full.advance(2);
    expect(reached(full)).toContain("return-mass-tripled");
  });
});

describe("propellant as an Export", () => {
  it("sells at its own price as the Lander reaches Earth", () => {
    const campaign = landerFreeWith({ propellant: 100 });
    const before = campaign.snapshot().fundingMillionDollars;
    expect(
      campaign.loadExports([{ resourceId: "propellant", kilograms: 100 }]).ok,
    ).toBe(true);
    expect(campaign.sendLander().ok).toBe(true);

    campaign.advance(1 + 3 * 24 * 60);

    expect(campaign.snapshot().fundingMillionDollars - before).toBeCloseTo(
      120,
      6,
    );
  });
});
