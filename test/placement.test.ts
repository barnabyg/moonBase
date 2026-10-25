import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { scenario } from "./scenario";

const solarArray = catalogue.structureTypes.find(
  (type) => type.id === "solar-array",
);
if (solarArray === undefined) throw new Error("expected a solar array");
const { footprintRadiusMetres: arrayRadius } = solarArray;
const landerRadius = catalogue.lander.footprintRadiusMetres;
const mapEdge = catalogue.map.widthMetres / 2;

describe("planning a Construction", () => {
  it("turns a solar array placed on clear ground into a Construction at Site Preparation", () => {
    const game = scenario();

    const result = game.campaign.planConstruction({
      structureTypeId: "solar-array",
      position: { x: 20, y: 10 },
    });

    expect(result.ok).toBe(true);
    expect(game.state.constructions).toEqual([
      expect.objectContaining({
        structureTypeId: "solar-array",
        position: { x: 20, y: 10 },
        stage: "site-preparation",
        stageProgress: 0,
      }),
    ]);
  });

  it("refuses a placement that overlaps the Lander, and plans nothing", () => {
    const game = scenario();
    const touching = landerRadius + arrayRadius;

    const result = game.campaign.planConstruction({
      structureTypeId: "solar-array",
      position: { x: touching - 0.1, y: 0 },
    });

    expect(result).toMatchObject({ ok: false, reason: "overlaps-lander" });
    expect(game.state.constructions).toEqual([]);
    expect(
      game.campaign.planConstruction({
        structureTypeId: "solar-array",
        position: { x: touching + 0.1, y: 0 },
      }).ok,
    ).toBe(true);
  });

  it("refuses a placement that overlaps another planned Structure", () => {
    const game = scenario().plan("solar-array", { x: 30, y: 30 });

    const result = game.campaign.planConstruction({
      structureTypeId: "solar-array",
      position: { x: 30 + arrayRadius, y: 30 },
    });

    expect(result).toMatchObject({ ok: false, reason: "overlaps-structure" });
    expect(game.state.constructions).toHaveLength(1);
  });

  it("refuses a placement that overlaps a commissioned Structure", () => {
    const game = scenario().plan("solar-array", { x: 30, y: 30 });
    game.campaign.advanceToNextEvent();
    expect(game.state.structures).toHaveLength(1);

    const result = game.campaign.planConstruction({
      structureTypeId: "solar-array",
      position: { x: 30, y: 30 + arrayRadius },
    });

    expect(result).toMatchObject({ ok: false, reason: "overlaps-structure" });
    expect(game.state.constructions).toEqual([]);
  });

  it("refuses a placement that would stick out over the edge of the map", () => {
    const result = scenario().campaign.planConstruction({
      structureTypeId: "solar-array",
      position: { x: mapEdge - arrayRadius + 0.1, y: 0 },
    });

    expect(result).toMatchObject({ ok: false, reason: "off-map" });
  });

  it("refuses a Structure that isn't in the data catalogue", () => {
    const result = scenario().campaign.planConstruction({
      structureTypeId: "space-elevator",
      position: { x: 50, y: 50 },
    });

    expect(result).toMatchObject({
      ok: false,
      reason: "unknown-structure-type",
    });
  });

  it("explains every refusal in words the player can read", () => {
    const result = scenario().campaign.planConstruction({
      structureTypeId: "solar-array",
      position: { x: 0, y: 0 },
    });

    expect(result).toMatchObject({
      ok: false,
      message: "The solar array would overlap the Lander.",
    });
  });

  it("can check a placement without planning anything, for the placement preview", () => {
    const game = scenario();
    const plan = { structureTypeId: "solar-array", position: { x: 0, y: 0 } };

    expect(game.campaign.checkPlacement(plan)).toMatchObject({
      ok: false,
      reason: "overlaps-lander",
    });
    expect(
      game.campaign.checkPlacement({ ...plan, position: { x: 40, y: 0 } }),
    ).toEqual({ ok: true });
    expect(game.state.constructions).toEqual([]);
  });
});
