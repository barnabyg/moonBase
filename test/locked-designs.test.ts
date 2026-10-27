import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { earnScience, findDesign, isStarting, unlock } from "./designs";
import { scenario } from "./scenario";

/** The first Launch item behind a Design that isn't unlocked when a Campaign begins. */
const lockedItem = catalogue.launch.items.find(
  (item) => !isStarting(item.designId),
);
if (lockedItem === undefined) {
  throw new Error("expected a Launch item behind a Design that isn't starting");
}

describe("a Launch item whose Design isn't unlocked", () => {
  it("is refused on the Launch manifest, naming the Design, and the manifest stays as it was", () => {
    const { campaign } = scenario();
    expect(
      campaign.setLaunchManifest([{ itemId: "solar-panel", count: 1 }]),
    ).toEqual({ ok: true });
    const before = campaign.snapshot().launchManifest;

    const result = campaign.setLaunchManifest([
      { itemId: "solar-panel", count: 1 },
      { itemId: lockedItem.id, count: 1 },
    ]);

    expect(result).toMatchObject({ ok: false, reason: "design-locked" });
    if (result.ok) throw new Error("expected a refusal");
    expect(result.message).toContain(findDesign(lockedItem.designId).label);
    expect(campaign.snapshot().launchManifest).toEqual(before);
  });
});

/** The first Structure type behind a Design that isn't unlocked when a Campaign begins. */
const lockedType = catalogue.structureTypes.find(
  (type) => !isStarting(type.designId),
);
if (lockedType === undefined) {
  throw new Error(
    "expected a Structure type behind a Design that isn't starting",
  );
}
const site = { x: 30, y: 25 };

describe("a Structure whose Design isn't unlocked", () => {
  it("can't be planned, naming the Design, and nothing is planned", () => {
    const { campaign } = scenario();
    const plan = { structureTypeId: lockedType.id, position: site };

    const checked = campaign.checkPlacement(plan);
    const planned = campaign.planConstruction(plan);

    for (const result of [checked, planned]) {
      expect(result).toMatchObject({ ok: false, reason: "design-locked" });
      if (result.ok) throw new Error("expected a refusal");
      expect(result.message).toContain(findDesign(lockedType.designId).label);
    }
    expect(campaign.snapshot().constructions).toEqual([]);
  });
});

describe("unlocking the Design", () => {
  it("adds nothing to the base, and then the Launch item goes on the Launch manifest and the Structure can be planned", () => {
    const { campaign } = scenario();
    const design = findDesign(lockedType.designId);
    expect(lockedItem.designId).toBe(design.id);
    for (const needed of design.prerequisiteDesignIds) unlock(campaign, needed);
    earnScience(campaign, design.scienceCost);
    const before = campaign.snapshot();

    expect(campaign.unlockDesign(design.id)).toMatchObject({ ok: true });

    const after = campaign.snapshot();
    expect(after.stockpile).toEqual(before.stockpile);
    expect(after.lander.cargo).toEqual(before.lander.cargo);
    expect(after.structures).toEqual(before.structures);
    expect(after.constructions).toEqual(before.constructions);
    expect(after.launchManifest).toEqual(before.launchManifest);
    expect(
      campaign.setLaunchManifest([{ itemId: lockedItem.id, count: 1 }]),
    ).toEqual({ ok: true });
    expect(campaign.snapshot().launchManifest.items).toEqual([
      { itemId: lockedItem.id, count: 1 },
    ]);
    const plan = { structureTypeId: lockedType.id, position: site };
    expect(campaign.checkPlacement(plan)).toEqual({ ok: true, position: site });
    expect(campaign.planConstruction(plan)).toMatchObject({ ok: true });
    expect(campaign.snapshot().constructions).toEqual([
      expect.objectContaining({ structureTypeId: lockedType.id }),
    ]);
  });
});
