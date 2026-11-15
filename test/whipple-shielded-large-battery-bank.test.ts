import { describe, expect, it, vi } from "vitest";
import type { Catalogue } from "../src/catalogue";
import { scenario } from "./scenario";

// Whipple shielding is unlocked from the start, but not Large battery banks,
// with a full set of Components for every Whipple-shielded battery bank in
// the starting stock.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withDesigns } = await import("./with-designs");
  return {
    ...actual,
    catalogue: withDesigns(actual.catalogue, ["whipple-shielding"]),
  };
});

describe("a Whipple-shielded large battery bank", () => {
  // Planning one with both unlocked is in protection-micrometeorites.test.ts.
  it("can't be planned until Large battery banks are unlocked as well as Whipple shielding", () => {
    const game = scenario();
    const plan = {
      structureTypeId: "whipple-shielded-large-battery-bank",
      position: { x: 20, y: 12 },
    };

    expect(game.campaign.checkPlacement(plan)).toMatchObject({
      ok: false,
      reason: "design-locked",
      message:
        "The Whipple-shielded large battery bank needs the Large battery banks Design unlocked first.",
    });
    expect(game.campaign.planConstruction(plan).ok).toBe(false);
    expect(game.state.constructions).toEqual([]);
  });
});
