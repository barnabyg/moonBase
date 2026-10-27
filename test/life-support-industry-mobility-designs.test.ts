import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { findDesign, unlock } from "./designs";
import { scenario } from "./scenario";

const categories = ["life-support", "industry", "mobility"];

/** Whether something belongs to a Design of these categories beyond the starting ones. */
function isUnlockable({ designId }: { readonly designId: string }): boolean {
  const design = findDesign(designId);
  return categories.includes(design.category) && !design.starting;
}

/** The Structures of the Life Support, Industry and Mobility Designs beyond the starting ones. */
const structures = catalogue.structureTypes.filter(isUnlockable);
/** Their Launch items: the Components of those Structures, bulk tanks and Robots. */
const items = catalogue.launch.items.filter(isUnlockable);
const site = { x: 30, y: 25 };

describe.each(structures)("the $label", (type) => {
  const design = findDesign(type.designId);

  it("can't be planned until its Design is unlocked, the refusal naming the Design", () => {
    const { campaign } = scenario();
    const plan = { structureTypeId: type.id, position: site };

    for (const result of [
      campaign.checkPlacement(plan),
      campaign.planConstruction(plan),
    ]) {
      expect(result).toMatchObject({ ok: false, reason: "design-locked" });
      if (result.ok) throw new Error("expected a refusal");
      expect(result.message).toContain(design.label);
    }
    expect(campaign.snapshot().constructions).toEqual([]);
  });

  it("can be planned once its Design is unlocked, with every Component it needs shippable", () => {
    const { campaign } = scenario();
    unlock(campaign, design.id);

    expect(
      campaign.setLaunchManifest(
        type.components.map((need) => ({
          itemId: need.componentId,
          count: need.count,
        })),
      ),
    ).toEqual({ ok: true });
    expect(
      campaign.planConstruction({ structureTypeId: type.id, position: site }),
    ).toMatchObject({ ok: true });
  });
});

describe.each(items)("the Launch item $id", (item) => {
  const design = findDesign(item.designId);

  it("is refused on the Launch manifest until its Design is unlocked, naming the Design, and accepted after", () => {
    const { campaign } = scenario();

    const refused = campaign.setLaunchManifest([{ itemId: item.id, count: 1 }]);
    expect(refused).toMatchObject({ ok: false, reason: "design-locked" });
    if (refused.ok) throw new Error("expected a refusal");
    expect(refused.message).toContain(design.label);
    expect(campaign.snapshot().launchManifest.items).toEqual([]);

    unlock(campaign, design.id);

    expect(campaign.setLaunchManifest([{ itemId: item.id, count: 1 }])).toEqual(
      { ok: true },
    );
    expect(campaign.snapshot().launchManifest.items).toEqual([
      { itemId: item.id, count: 1 },
    ]);
  });
});

describe("the Life Support, Industry and Mobility Designs", () => {
  it("each unlock at least one Structure or Launch item", () => {
    const designs = catalogue.designs.filter(
      (design) => categories.includes(design.category) && !design.starting,
    );

    expect(designs.length).toBeGreaterThanOrEqual(6);
    for (const design of designs) {
      expect(
        [...structures, ...items].map((entry) => entry.designId),
      ).toContain(design.id);
    }
  });
});
