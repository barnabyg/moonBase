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
const plantSite: GroundPosition = { x: 36, y: 12 };
const tankSite: GroundPosition = { x: 36, y: 24 };

const componentsOf = (structureTypeId: string) =>
  catalogue.structureTypes.find(({ id }) => id === structureTypeId)
    ?.components ?? [];

function propellantLine(state: Snapshot) {
  return state.bulkResources.find(
    ({ resourceId }) => resourceId === "propellant",
  );
}

function runUntilBuilt(game: Scenario): void {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 5 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
}

/** Unlocks each Design in turn, as the Science given allows. */
function unlockAll(game: Scenario, designIds: readonly string[]): void {
  for (const designId of designIds) {
    const unlocked = game.campaign.unlockDesign(designId);
    if (!unlocked.ok) throw new Error(unlocked.message);
  }
}

describe("from unlocking Propellant production to a raised limit", () => {
  it("is refused until the Design is unlocked, then ships the tank's Components and raises the limit once it is commissioned on a cable", () => {
    const locked = scenario();
    expect(
      locked.campaign.planConstruction({
        structureTypeId: "propellant-tank",
        position: tankSite,
      }),
    ).toMatchObject({ ok: false, reason: "design-locked" });
    expect(propellantLine(locked.state)?.limitKilograms).toBe(0);

    const design = catalogue.designs.find(
      ({ id }) => id === "propellant-production",
    );
    // Every Design on the way there, which is what Research Tasks would have earned.
    const needed = new Set<string>();
    const visit = (id: string): void => {
      const found = catalogue.designs.find((candidate) => candidate.id === id);
      if (found === undefined || found.starting || needed.has(id)) return;
      for (const before of found.prerequisiteDesignIds) visit(before);
      needed.add(id);
    };
    visit(design?.id ?? "");
    const science = [...needed].reduce(
      (sum, id) =>
        sum +
        (catalogue.designs.find((candidate) => candidate.id === id)
          ?.scienceCost ?? 0),
      0,
    );
    const game = scenarioOf(
      withFunding(withScience(locked.campaign, science), 5000),
    );
    unlockAll(game, [...needed]);
    expect(game.state.science).toBe(0);

    // Then the Mission Director moves in, so that the Lander can fly.
    game.plan("solar-array", solarSite).plan("habitat", habitatSite);
    runUntilBuilt(game);
    const home = game.state.structures.find(
      ({ structureTypeId }) => structureTypeId === "habitat",
    );
    const moved = game.campaign.moveMissionDirectorIn(home?.id ?? "");
    if (!moved.ok) throw new Error(moved.message);

    // One Launch brings a Plant and a tank: 1,400 kg and 600 kg just fit.
    const set = game.campaign.setLaunchManifest(
      [
        ...componentsOf("propellant-plant"),
        ...componentsOf("propellant-tank"),
      ].map(({ componentId, count }) => ({ itemId: componentId, count })),
    );
    if (!set.ok) throw new Error(set.message);
    const sent = game.campaign.sendLander();
    if (!sent.ok) throw new Error(sent.message);
    for (let skips = 0; game.state.lander.state !== "landed-free"; skips++) {
      if (skips > 100) throw new Error("The Lander never came back.");
      game.campaign.advanceToNextEvent();
    }

    game.plan("propellant-plant", plantSite);
    runUntilBuilt(game);
    expect(propellantLine(game.state)?.limitKilograms).toBe(450);

    game.plan("propellant-tank", tankSite);
    runUntilBuilt(game);
    expect(propellantLine(game.state)?.limitKilograms).toBe(1050);
    const tank = game.state.structures.find(
      ({ structureTypeId }) => structureTypeId === "propellant-tank",
    );
    expect(
      game.state.cables.some(
        ({ toStructureId, complete }) => complete && toStructureId === tank?.id,
      ),
    ).toBe(true);
  });

  it("brings the tank with the Plant's Design, costing no new Science, and needs no Launch item that brings propellant", () => {
    const type = catalogue.structureTypes.find(
      ({ id }) => id === "propellant-tank",
    );
    expect(type?.designId).toBe("propellant-production");
    expect(
      catalogue.designs.find(({ id }) => id === "propellant-production")
        ?.description,
    ).toMatch(/tank/);
    for (const { componentId } of type?.components ?? []) {
      const item = catalogue.launch.items.find(({ id }) => id === componentId);
      expect(item?.designId).toBe("propellant-production");
      expect(item?.brings).toEqual({ kind: "component", componentId });
    }
  });
});

describe("the data catalogue's figures for the Lander's ceiling", () => {
  it("has it out of reach of one Plant, and within reach of a second or a tank", () => {
    const { returnMassKilograms, propellant } = catalogue.lander;
    const ceiling =
      (propellant.mostReturnMassKilograms - returnMassKilograms) *
      propellant.kilogramsPerReturnKilogram;
    const holds = (id: string) =>
      catalogue.structureTypes.find((type) => type.id === id)?.ownStorage
        ?.kilograms ?? 0;
    const tank =
      catalogue.structureTypes.find(({ id }) => id === "propellant-tank")
        ?.storageTank?.kilograms ?? 0;

    expect(ceiling).toBe(600);
    expect(holds("propellant-plant")).toBeLessThan(ceiling);
    expect(holds("large-propellant-plant")).toBeLessThan(ceiling);
    expect(
      holds("propellant-plant") + holds("large-propellant-plant"),
    ).toBeGreaterThan(ceiling);
    expect(holds("propellant-plant") + tank).toBeGreaterThan(ceiling);
    // And one Plant still flies a tripled Return Mass, a batch below its limit.
    expect(holds("propellant-plant") - 3).toBeGreaterThanOrEqual(
      (300 - returnMassKilograms) * propellant.kilogramsPerReturnKilogram,
    );
  });
});
