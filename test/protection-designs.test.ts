import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { findDesign, unlock } from "./designs";
import { scenario, scenarioOf, type Scenario } from "./scenario";
import { changed } from "./worn";

/**
 * The hardened Structures of the Protection Designs. The water wall, which
 * hardens nothing but goes over a Habitat's Regolith shielding, has tests
 * of its own (water-wall.test.ts).
 */
const hardened = catalogue.structureTypes.filter(
  (type) =>
    findDesign(type.designId).category === "protection" &&
    !findDesign(type.designId).starting &&
    type.waterWall === undefined,
);
const site = { x: 30, y: 25 };

describe.each(hardened)("the $label", (type) => {
  const design = findDesign(type.designId);
  /** The Launch items its Design brings: the Components of its own. */
  const ownItems = catalogue.launch.items.filter(
    (item) => item.designId === design.id,
  );

  it("can't be planned, nor its own Components put on the Launch manifest, until its Design is unlocked, each refusal naming the Design", () => {
    const { campaign } = scenario();

    const refusals = [
      campaign.planConstruction({ structureTypeId: type.id, position: site }),
      ...ownItems.map((item) =>
        campaign.setLaunchManifest([{ itemId: item.id, count: 1 }]),
      ),
    ];

    expect(ownItems.length).toBeGreaterThan(0);
    for (const result of refusals) {
      expect(result).toMatchObject({ ok: false, reason: "design-locked" });
      if (result.ok) throw new Error("expected a refusal");
      expect(result.message).toContain(design.label);
    }
    expect(campaign.snapshot().constructions).toEqual([]);
  });

  it("can be planned, and its Components shipped, once its Design is unlocked", () => {
    const { campaign } = scenario();
    unlock(campaign, design.id);

    expect(
      campaign.setLaunchManifest(
        ownItems.map((item) => ({ itemId: item.id, count: 1 })),
      ),
    ).toEqual({ ok: true });
    expect(
      campaign.planConstruction({ structureTypeId: type.id, position: site }),
    ).toMatchObject({ ok: true });
  });
});

describe("unlocking the Protection Designs", () => {
  /**
   * A base with a solar array, a battery bank and a Habitat, all
   * commissioned, and Science enough for every Protection Design, given it
   * through its save rather than earned by Research Tasks, which take far
   * longer to play.
   */
  function base(): Scenario {
    const game = scenario()
      .plan("solar-array", { x: 20, y: 12 })
      .plan("battery-bank", { x: 30, y: 25 })
      .plan("habitat", { x: 45, y: 0 });
    for (let hours = 0; game.state.constructions.length > 0; hours++) {
      if (hours > 10 * 24) throw new Error("The Constructions never finished.");
      game.advance({ hours: 1 });
    }
    const cost = catalogue.designs
      .filter((design) => hardened.some((type) => type.designId === design.id))
      .reduce((sum, design) => sum + design.scienceCost, 0);
    return scenarioOf(
      changed(game.campaign, (state) => {
        state.science = cost;
      }),
    );
  }

  it("leaves the Structures already on the base wearing down just as they did", () => {
    const unlocked = base();
    // The same base again, loaded from its save unchanged.
    const control = scenarioOf(changed(unlocked.campaign, () => undefined));
    for (const type of hardened) unlock(unlocked.campaign, type.designId);

    unlocked.advance({ earthDays: 10 });
    control.advance({ earthDays: 10 });

    expect(unlocked.state.unlockedDesignIds).not.toEqual(
      control.state.unlockedDesignIds,
    );
    expect(unlocked.state.structures).toHaveLength(3);
    expect(
      unlocked.state.structures.some((s) => s.conditionPercent < 100),
    ).toBe(true);
    expect(unlocked.state.structures).toEqual(control.state.structures);
    expect(unlocked.state.maintenance).toEqual(control.state.maintenance);
  });
});
