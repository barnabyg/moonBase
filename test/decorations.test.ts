import { describe, expect, it, vi } from "vitest";
import {
  catalogue,
  type Catalogue,
  type StructureType,
} from "../src/catalogue";
import type { GroundPosition, StructureSnapshot } from "../src/simulation";
import { describeStructure } from "../src/ui/describe";
import { structureStatus } from "../src/ui/structure-state";
import { shipped } from "./catalogue-helpers";
import { scenario, type Scenario } from "./scenario";

// Decorations, built from a starting stock that holds a kit for each, with the
// Habitat keeping the Mission Director safe and no Micrometeorites, so that
// only Dust wears them.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withDesigns } = await import("./with-designs");
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  const { safeHabitat } = await import("./safe-habitat");
  return {
    ...actual,
    catalogue: withDesigns(
      safeHabitat(withoutMicrometeorites(actual.catalogue), [
        "power",
        "radiation",
        "solar-particle-events",
      ]),
      ["decorations"],
    ),
  };
});

// The real catalogue, without the kits the mock adds to the starting stock.
const actual = await vi.importActual<{ catalogue: Catalogue }>(
  "../src/catalogue",
);

const DECORATION_IDS = [
  "flag-pole",
  "founding-memorial",
  "rock-garden",
  "viewing-area",
];

function typeOf(id: string): StructureType {
  const type = catalogue.structureTypes.find(
    (candidate) => candidate.id === id,
  );
  if (type === undefined) throw new Error(`expected a ${id}`);
  return type;
}

const decorations = DECORATION_IDS.map(typeOf);
const shippedDecorations = decorations.filter(
  (type) => type.components.length > 0,
);
const lightMast = typeOf("light-mast");

/** What a Structure type says about itself beyond what every one says. */
const EVERY_STRUCTURE_SAYS = new Set([
  "id",
  "label",
  "designId",
  "listGroup",
  "footprintRadiusMetres",
  "components",
  "dismantlingSpareComponents",
  "stageHours",
  "stageMachines",
  "commissioningFailureChance",
  "dustWearPercentPerHour",
  "hazardMultipliers",
  "power",
  "lightRadiusMetres",
  "habitat",
  "shieldsHabitat",
  "landingPad",
]);

describe("the Decorations in the data catalogue", () => {
  it("are four Structures in a Decoration group of their own, listed last, behind one starting Construction Design", () => {
    expect(catalogue.structureListGroups.at(-1)).toEqual({
      id: "decoration",
      label: "Decoration",
    });
    expect(
      catalogue.structureTypes
        .filter(({ listGroup }) => listGroup === "decoration")
        .map(({ id }) => id),
    ).toEqual(DECORATION_IDS);
    expect(decorations.map(({ label }) => label)).toEqual([
      "Flag pole",
      "Founding memorial",
      "Rock garden",
      "Mission Director's viewing area",
    ]);

    const design = catalogue.designs.find(({ id }) => id === "decorations");
    expect(design).toMatchObject({
      label: "Decorations",
      category: "construction",
      starting: true,
      scienceCost: 0,
      prerequisiteDesignIds: [],
    });
    for (const type of decorations) expect(type.designId).toBe("decorations");
  });

  it("do nothing but stand: no power, light, cable or anything else a working Structure has", () => {
    for (const type of decorations) {
      expect(
        Object.keys(type).filter((key) => !EVERY_STRUCTURE_SAYS.has(key)),
        type.id,
      ).toEqual([]);
      expect(type.power).toEqual({
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0,
      });
      expect(type.lightRadiusMetres).toBe(0);
      expect(type.habitat || type.shieldsHabitat || type.landingPad).toBe(
        false,
      );
    }
  });

  it("wear slowly: those shipped from Earth at under a quarter of a Light Mast's rate, the rock garden not at all", () => {
    for (const type of shippedDecorations) {
      expect(type.dustWearPercentPerHour, type.id).toBeGreaterThan(0);
      expect(type.dustWearPercentPerHour, type.id).toBeLessThan(
        lightMast.dustWearPercentPerHour / 4,
      );
    }
    expect(typeOf("rock-garden").dustWearPercentPerHour).toBe(0);
  });

  it("ship the flag pole, memorial and viewing area as one light, cheap Component each, which the starting stock doesn't hold, the flag pole the lightest and cheapest", () => {
    expect(shippedDecorations.map(({ id }) => id)).toEqual([
      "flag-pole",
      "founding-memorial",
      "viewing-area",
    ]);
    const lightMastCost = shipped(lightMast);
    for (const type of shippedDecorations) {
      expect(type.components, type.id).toHaveLength(1);
      expect(type.components[0]?.count, type.id).toBe(1);
      const cost = shipped(type);
      expect(cost.kilograms, type.id).toBeLessThan(lightMastCost.kilograms);
      expect(cost.millionDollars, type.id).toBeLessThanOrEqual(
        lightMastCost.millionDollars,
      );
      expect(cost.kilograms, type.id).toBeGreaterThanOrEqual(
        shipped(typeOf("flag-pole")).kilograms,
      );
      expect(type.dismantlingSpareComponents, type.id).toBe(1);
    }
    const { startingStock } = actual.catalogue;
    for (const type of shippedDecorations) {
      expect(
        startingStock.some(
          ({ componentId }) => componentId === type.components[0]?.componentId,
        ),
        type.id,
      ).toBe(false);
    }
  });

  it("make the rock garden from Regolith alone: the excavator digs the rocks and the Robot arranges them, giving no spares back", () => {
    const garden = typeOf("rock-garden");
    expect(garden.components).toEqual([]);
    expect(garden.dismantlingSpareComponents).toBe(0);
    expect(garden.stageMachines).toEqual({ sitePreparation: "excavator" });
  });
});

const sites: Record<string, GroundPosition> = {
  "flag-pole": { x: 14, y: 8 },
  "founding-memorial": { x: 18, y: -6 },
  "rock-garden": { x: 26, y: 10 },
  "viewing-area": { x: 24, y: -14 },
};

function runUntilBuilt(game: Scenario): void {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
}

function built(state: Scenario["state"], typeId: string): StructureSnapshot {
  const found = state.structures.find(
    ({ structureTypeId }) => structureTypeId === typeId,
  );
  if (found === undefined) throw new Error(`expected a ${typeId}`);
  return found;
}

describe("building Decorations", () => {
  it("builds each one from a new Campaign, standing commissioned with no cable, wearing slowly", () => {
    const game = scenario();
    for (const id of DECORATION_IDS) game.plan(id, sites[id] ?? { x: 0, y: 0 });
    runUntilBuilt(game);

    for (const id of DECORATION_IDS) {
      const structure = built(game.state, id);
      expect(structureStatus(structure, false), id).toBe("commissioned");
      expect(
        game.state.cables.some(
          ({ toStructureId }) => toStructureId === structure.id,
        ),
        id,
      ).toBe(false);
    }

    const before = new Map(
      DECORATION_IDS.map((id) => [id, built(game.state, id).conditionPercent]),
    );
    game.advance({ earthDays: 10 });
    for (const id of DECORATION_IDS) {
      const type = typeOf(id);
      const lost =
        (before.get(id) ?? 0) - built(game.state, id).conditionPercent;
      expect(lost, id).toBeCloseTo(type.dustWearPercentPerHour * 10 * 24, 5);
    }
  });
});

describe("what the game says of a Decoration", () => {
  it("says it is there for how it looks, and does nothing else", () => {
    for (const type of decorations) {
      expect(describeStructure(type), type.id).toMatch(
        /^It is there for how it looks and what it means, and does nothing else\. It needs no power\. Dismantled, it gives (nothing back|back 1 spare component)\.$/,
      );
    }
  });
});
