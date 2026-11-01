import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import { type GroundPosition, type Snapshot } from "../src/simulation";
import { scenario, scenarioOf, type Scenario } from "./scenario";
import { withFunding, withScience } from "./worn";

// The whole path, from a locked Design to a raised limit, at the real prices and
// Science costs. The Habitat needs no power and keeps the Mission Director safe,
// as a round trip takes longer than the starting stock keeps one powered.
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

const habitatSite: GroundPosition = { x: 25, y: -20 };
const solarSite: GroundPosition = { x: 20, y: 12 };
const waterTankSite: GroundPosition = { x: 34, y: 12 };
const oxygenTankSite: GroundPosition = { x: 44, y: 18 };

const componentsOf = (structureTypeId: string) =>
  catalogue.structureTypes.find(({ id }) => id === structureTypeId)
    ?.components ?? [];

function limit(state: Snapshot, stockId: string): number | undefined {
  return state.lifeSupport.find((line) => line.stockId === stockId)
    ?.limitKilograms;
}

function runUntilBuilt(game: Scenario): void {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 5 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
}

describe("from unlocking Bulk supply tanks to a raised limit", () => {
  it("is refused until the Design is unlocked, then ships the tanks' Components and raises the limits once they are commissioned on a cable", () => {
    const locked = scenario();
    expect(
      locked.campaign.planConstruction({
        structureTypeId: "water-tank",
        position: waterTankSite,
      }),
    ).toMatchObject({ ok: false, reason: "design-locked" });

    // What the Research Tasks would have earned, and what Exports would have.
    const game = scenarioOf(
      withFunding(withScience(locked.campaign, 240), 1000),
    );
    expect(game.campaign.unlockDesign("bulk-supply-tanks").ok).toBe(false);
    expect(game.campaign.unlockDesign("water-electrolysis").ok).toBe(true);
    expect(game.campaign.unlockDesign("bulk-supply-tanks").ok).toBe(true);
    expect(game.state.science).toBe(0);

    // Then the Mission Director moves in, so that the Lander can fly.
    game.plan("solar-array", solarSite).plan("habitat", habitatSite);
    runUntilBuilt(game);
    const home = game.state.structures.find(
      ({ structureTypeId }) => structureTypeId === "habitat",
    );
    const moved = game.campaign.moveMissionDirectorIn(home?.id ?? "");
    if (!moved.ok) throw new Error(moved.message);

    const set = game.campaign.setLaunchManifest(
      [...componentsOf("water-tank"), ...componentsOf("oxygen-tank")].map(
        ({ componentId, count }) => ({ itemId: componentId, count }),
      ),
    );
    if (!set.ok) throw new Error(set.message);
    const sent = game.campaign.sendLander();
    if (!sent.ok) throw new Error(sent.message);
    for (let skips = 0; game.state.lander.state !== "landed-free"; skips++) {
      if (skips > 100) throw new Error("The Lander never came back.");
      game.campaign.advanceToNextEvent();
    }
    expect(limit(game.state, "water")).toBe(400);
    expect(limit(game.state, "oxygen")).toBe(100);

    game.plan("water-tank", waterTankSite).plan("oxygen-tank", oxygenTankSite);
    runUntilBuilt(game);

    expect(limit(game.state, "water")).toBe(1400);
    expect(limit(game.state, "oxygen")).toBe(400);
    for (const typeId of ["water-tank", "oxygen-tank"]) {
      const tank = game.state.structures.find(
        ({ structureTypeId }) => structureTypeId === typeId,
      );
      expect(
        game.state.cables.some(
          ({ toStructureId, complete }) =>
            complete && toStructureId === tank?.id,
        ),
      ).toBe(true);
    }
  });

  it("no longer offers anything that brings oxygen or water behind the Design, while Life support resupply still does", () => {
    const items = catalogue.launch.items.filter(
      ({ designId }) => designId === "bulk-supply-tanks",
    );
    expect(items.length).toBeGreaterThan(0);
    for (const { brings } of items) expect(brings.kind).toBe("component");
    expect(
      catalogue.launch.items
        .filter(({ brings }) => brings.kind === "life-support")
        .map(({ id, designId }) => [id, designId]),
    ).toEqual([
      ["oxygen", "life-support-resupply"],
      ["water", "life-support-resupply"],
    ]);
  });

  it("still offers the Cryogenic boil-off trial, which fits what the Design now is", () => {
    expect(
      catalogue.researchTasks.find(
        ({ id }) => id === "cryogenic-boil-off-trial",
      ),
    ).toMatchObject({
      label: "Cryogenic boil-off trial",
      requiresDesignId: "bulk-supply-tanks",
    });
    expect(
      catalogue.designs.find(({ id }) => id === "bulk-supply-tanks")
        ?.description,
    ).toMatch(/boil/);
  });
});
