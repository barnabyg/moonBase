import { describe, expect, it, vi } from "vitest";
import {
  catalogue,
  type Catalogue,
  type StructureType,
} from "../src/catalogue";
import {
  createCampaign,
  loadCampaign,
  type Campaign,
  type GroundPosition,
  type Snapshot,
} from "../src/simulation";
import { unlock } from "./designs";
import { DEFAULT_SEED } from "./scenario";
import { changed, withScience, type SavedState } from "./worn";

// The Habitat needs no power, no Solar Particle Event comes, and the base can
// hold far more oxygen and water than its own tanks do, so that stocking a Large-scale
// Crew Habitat needs no storage tanks built first; the Robot and the excavator
// stand idle rather than digging Regolith.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutDigging } = await import("./without-digging");
  const { safeHabitat } = await import("./safe-habitat");
  return {
    ...actual,
    catalogue: safeHabitat(withoutDigging(actual.catalogue), [
      "power",
      "solar-particle-events",
      "life-support",
    ]),
  };
});

function crewHabitatType(): StructureType & {
  readonly stockedWith: NonNullable<StructureType["stockedWith"]>;
} {
  const type = catalogue.structureTypes.find(
    (candidate) => candidate.id === "crew-habitat",
  );
  if (type?.stockedWith === undefined) {
    throw new Error(
      "expected a Large-scale Crew Habitat stocked from the base",
    );
  }
  return { ...type, stockedWith: type.stockedWith };
}
const crewHabitat = crewHabitatType();

/** What stocking it takes of a life support stock, and the reserve it must leave. */
function fillOf(stockId: string): { kilograms: number; reserve: number } {
  const fill = crewHabitat.stockedWith.find(
    (candidate) => candidate.stockId === stockId,
  );
  const usePerEarthDay = catalogue.lifeSupportStocks.find(
    ({ id }) => id === stockId,
  )?.usePerEarthDayKilograms;
  if (fill === undefined || usePerEarthDay === undefined) {
    throw new Error(`expected it to be stocked with ${stockId}`);
  }
  return {
    kilograms: fill.kilograms,
    reserve: fill.reserveEarthDays * usePerEarthDay,
  };
}
const oxygen = fillOf("oxygen");
const water = fillOf("water");

const habitatSite: GroundPosition = { x: 25, y: -20 };
const crewHabitatSite: GroundPosition = { x: 60, y: -20 };

function runUntil(
  campaign: Campaign,
  done: (state: Snapshot) => boolean,
  limitHours = 40 * 24,
): void {
  for (let hours = 0; !done(campaign.snapshot()); hours++) {
    if (hours > limitHours) throw new Error("It never happened.");
    campaign.advance(60);
  }
}

function plan(
  campaign: Campaign,
  structureTypeId: string,
  position: GroundPosition,
): string {
  const result = campaign.planConstruction({ structureTypeId, position });
  if (!result.ok) throw new Error(result.message);
  return result.constructionId;
}

function inStock(state: Snapshot, stockId: string): number {
  return (
    state.lifeSupport.find((stock) => stock.stockId === stockId)?.kilograms ??
    Number.NaN
  );
}

function withStocks(oxygenKilograms: number, waterKilograms: number) {
  return (state: SavedState) => {
    for (const stock of state.lifeSupport) {
      if (stock.stockId === "oxygen") stock.kilograms = oxygenKilograms;
      if (stock.stockId === "water") stock.kilograms = waterKilograms;
    }
  };
}

function withItsComponents(state: SavedState): void {
  for (const need of crewHabitat.components) {
    const stock = state.stockpile.components.find(
      (candidate) => candidate.componentId === need.componentId,
    );
    if (stock === undefined) {
      state.stockpile.components.push({
        componentId: need.componentId,
        count: need.count,
      });
    } else {
      stock.count += need.count;
    }
  }
}

/**
 * The saved text of a base with the Mission Director living in its Habitat and
 * the Large-scale Crew Habitat's Design unlocked. Built once, and loaded afresh
 * for each test.
 */
let baseText: string | undefined;
function base(): Campaign {
  if (baseText === undefined) {
    const begun = withScience(
      createCampaign({ seed: DEFAULT_SEED }),
      catalogue.designs.reduce((sum, design) => sum + design.scienceCost, 0),
    );
    const habitatId = plan(begun, "habitat", habitatSite);
    runUntil(begun, (state) => state.constructions.length === 0);
    const movedIn = begun.moveMissionDirectorIn(habitatId);
    if (!movedIn.ok) throw new Error(movedIn.message);
    unlock(begun, crewHabitat.designId);
    baseText = begun.save();
  }
  const loaded = loadCampaign(baseText);
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.campaign;
}

/** The base with the Large-scale Crew Habitat's Components in stock, and the oxygen and water given. */
function readyBase(oxygenKilograms: number, waterKilograms: number): Campaign {
  return changed(base(), (state) => {
    withItsComponents(state);
    withStocks(oxygenKilograms, waterKilograms)(state);
  });
}

describe("building a Large-scale Crew Habitat", () => {
  it("waits, saying why, until there is the oxygen and water to stock it and leave the Mission Director a reserve, then takes them both as its Assembly starts", () => {
    const enoughWater = water.kilograms + water.reserve + 100;
    const short = readyBase(
      oxygen.kilograms + oxygen.reserve - 20,
      enoughWater,
    );
    const id = plan(short, crewHabitat.id, crewHabitatSite);
    runUntil(
      short,
      (state) =>
        state.constructions.find((c) => c.id === id)?.stage === "assembly",
    );
    short.advance(12 * 60);

    const construction = short
      .snapshot()
      .constructions.find((c) => c.id === id);
    expect(construction).toMatchObject({ stage: "assembly", stageProgress: 0 });
    expect(construction?.waiting).toMatchObject({
      reason: "water-reserve",
      stockId: "oxygen",
    });
    // Nothing is taken until both can be.
    expect(inStock(short.snapshot(), "water")).toBeGreaterThan(water.kilograms);

    const topped = changed(
      short,
      withStocks(oxygen.kilograms + oxygen.reserve + 100, enoughWater),
    );
    topped.advance(60);
    expect(inStock(topped.snapshot(), "oxygen")).toBeLessThan(
      oxygen.reserve + 100,
    );
    expect(inStock(topped.snapshot(), "water")).toBeLessThan(
      water.reserve + 100,
    );
    runUntil(topped, (state) => state.constructions.length === 0);
    expect(
      topped
        .snapshot()
        .structures.some((s) => s.structureTypeId === crewHabitat.id),
    ).toBe(true);
    expect(topped.snapshot().ended).toBeUndefined();
  });

  it("can't be moved into: nobody lives in it until Crew come", () => {
    const campaign = readyBase(
      oxygen.kilograms + oxygen.reserve + 100,
      water.kilograms + water.reserve + 100,
    );
    plan(campaign, crewHabitat.id, crewHabitatSite);
    runUntil(campaign, (state) => state.constructions.length === 0);
    const built = campaign
      .snapshot()
      .structures.find((s) => s.structureTypeId === crewHabitat.id);
    if (built === undefined) throw new Error("expected it built");

    expect(campaign.moveMissionDirectorIn(built.id).ok).toBe(false);
  });
});

describe("the Campaign's last Milestone", () => {
  it("is reached as a Large-scale Crew Habitat is commissioned, and not before", () => {
    const last = catalogue.milestones.at(-1);
    const campaign = readyBase(
      oxygen.kilograms + oxygen.reserve + 100,
      water.kilograms + water.reserve + 100,
    );
    const id = plan(campaign, crewHabitat.id, crewHabitatSite);
    runUntil(
      campaign,
      (state) =>
        state.constructions.find((c) => c.id === id)?.stage === "commissioning",
    );
    expect(campaign.snapshot().milestones.reachedIds).not.toContain(last?.id);

    const reached: string[] = [];
    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 10 * 24) throw new Error("It was never commissioned.");
      for (const event of campaign.advance(60)) {
        if (event.kind === "milestone-reached") reached.push(event.milestoneId);
      }
    }

    expect(last?.condition).toEqual({
      kind: "structure-commissioned",
      structureTypeId: crewHabitat.id,
    });
    expect(reached).toContain(last?.id);
  });
});
