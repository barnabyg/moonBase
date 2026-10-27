import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { findDesign, unlock } from "./designs";
import { scenario } from "./scenario";

/** The Structures of the Power and Construction Designs beyond the starting ones. */
const unlockable = catalogue.structureTypes.filter((type) => {
  const design = findDesign(type.designId);
  return (
    ["power", "construction"].includes(design.category) && !design.starting
  );
});
const site = { x: 30, y: 25 };

describe.each(unlockable)("the $label", (type) => {
  const design = findDesign(type.designId);
  /** The Launch items its Design brings: any Components of its own. */
  const ownItems = catalogue.launch.items.filter(
    (item) => item.designId === design.id,
  );

  it("can't be planned, nor any Components of its own put on the Launch manifest, until its Design is unlocked, each refusal naming the Design", () => {
    const { campaign } = scenario();

    const refusals = [
      campaign.planConstruction({ structureTypeId: type.id, position: site }),
      ...ownItems.map((item) =>
        campaign.setLaunchManifest([{ itemId: item.id, count: 1 }]),
      ),
    ];

    for (const result of refusals) {
      expect(result).toMatchObject({ ok: false, reason: "design-locked" });
      if (result.ok) throw new Error("expected a refusal");
      expect(result.message).toContain(design.label);
    }
    expect(campaign.snapshot().constructions).toEqual([]);
  });

  it("can be planned, and any Components of its own shipped, once its Design is unlocked", () => {
    const game = scenario();
    const { campaign } = game;
    unlock(campaign, design.id);
    // Shielding goes over a commissioned Habitat.
    if (type.shieldsHabitat) {
      game.plan("habitat", site);
      for (let hours = 0; game.state.constructions.length > 0; hours++) {
        if (hours > 5 * 24) throw new Error("The Habitat was never built.");
        game.advance({ hours: 1 });
      }
    }

    if (ownItems.length > 0) {
      expect(
        campaign.setLaunchManifest(
          ownItems.map((item) => ({ itemId: item.id, count: 1 })),
        ),
      ).toEqual({ ok: true });
    }
    expect(
      campaign.planConstruction({ structureTypeId: type.id, position: site }),
    ).toMatchObject({ ok: true });
  });
});

describe("the Power and Construction Designs", () => {
  it("each unlock at least one Structure", () => {
    const designs = catalogue.designs.filter(
      (design) =>
        ["power", "construction"].includes(design.category) && !design.starting,
    );

    for (const design of designs) {
      expect(unlockable.map((type) => type.designId)).toContain(design.id);
    }
  });
});
