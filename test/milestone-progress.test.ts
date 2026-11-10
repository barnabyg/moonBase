import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { loadCampaign, type Snapshot } from "../src/simulation";
import { scenario } from "./scenario";
import { tryScenarios } from "./try-scenarios";

/** The parts of a saved state these tests set up. */
interface SavedState {
  reachedMilestoneIds: string[];
  bulkResources: { resourceId: string; kilograms: number }[];
  lifeSupport: { stockId: string; kilograms: number }[];
  exportsToLoad: { resourceId: string; kilograms: number }[];
  selfSufficiency: {
    stockId: string;
    records: { producedKilograms: number; usedKilograms: number }[];
  }[];
  spareComponentSufficiency: { records: { made: number; used: number }[] };
}

/** The Milestones as a new Campaign reads them, from a save changed like this. */
function milestonesOf(
  change: (state: SavedState) => void,
): Snapshot["milestones"] {
  const document = JSON.parse(scenario().campaign.save()) as {
    state: SavedState;
  };
  change(document.state);
  const loaded = loadCampaign(JSON.stringify(document));
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.campaign.snapshot().milestones;
}

/** The ids of every Milestone before this one, in catalogue order. */
function before(milestoneId: string): string[] {
  const ids = catalogue.milestones.map((milestone) => milestone.id);
  const index = ids.indexOf(milestoneId);
  if (index === -1) throw new Error(`There is no Milestone "${milestoneId}".`);
  return ids.slice(0, index);
}

/** The Milestones with this one current, in a save changed like this besides. */
function withCurrent(
  milestoneId: string,
  change: (state: SavedState) => void = () => undefined,
): Snapshot["milestones"] {
  const milestones = milestonesOf((state) => {
    state.reachedMilestoneIds = before(milestoneId);
    change(state);
  });
  expect(milestones.currentId).toBe(milestoneId);
  return milestones;
}

const inAct = (actId: string): number =>
  catalogue.milestones.filter((milestone) => milestone.actId === actId).length;

function setStock(
  stocks: { resourceId: string; kilograms: number }[],
  resourceId: string,
  kilograms: number,
): void {
  const stock = stocks.find((candidate) => candidate.resourceId === resourceId);
  if (stock === undefined) throw new Error(`No stock of ${resourceId}.`);
  stock.kilograms = kilograms;
}

describe("the current Milestone's place", () => {
  it("is its number among its Act's Milestones, in catalogue order, and how many the Act has", () => {
    expect(scenario().state.milestones.place).toEqual({
      number: 1,
      of: inAct("act-1"),
    });
    expect(withCurrent("landing-pad").place).toEqual({
      number: 5,
      of: inAct("act-1"),
    });
    expect(withCurrent("workshop-running").place).toEqual({
      number: 1,
      of: inAct("act-2"),
    });
    expect(withCurrent("metals-sold").place).toEqual({
      number: inAct("act-2"),
      of: inAct("act-2"),
    });
  });

  it("is the same whatever has been reached later on", () => {
    expect(
      milestonesOf((state) => {
        state.reachedMilestoneIds = ["first-research-task", "landing-pad"];
      }).place,
    ).toEqual({ number: 1, of: inAct("act-1") });
  });

  it("is none once every Milestone is reached", () => {
    const milestones = milestonesOf((state) => {
      state.reachedMilestoneIds = catalogue.milestones.map(({ id }) => id);
    });

    expect(milestones.place).toBeUndefined();
    expect(milestones.measures).toEqual([]);
  });
});

describe("what there is to measure of the current Milestone", () => {
  it("is nothing for one that is either done or not, such as power storage", () => {
    expect(scenario().state.milestones.measures).toEqual([]);
    expect(withCurrent("first-propellant").measures).toEqual([]);
  });

  it("is the share of the Mission Director's use the base has made, for self-sufficiency in a life support stock", () => {
    expect(withCurrent("oxygen-self-sufficient").measures).toEqual([
      {
        kind: "life-support-made",
        stockId: "oxygen",
        share: undefined,
        windowComplete: false,
      },
    ]);

    const water = withCurrent("water-self-sufficient", (state) => {
      const history = state.selfSufficiency.find(
        (candidate) => candidate.stockId === "water",
      );
      history?.records.push({ producedKilograms: 3, usedKilograms: 4 });
    });
    expect(water.measures).toEqual([
      {
        kind: "life-support-made",
        stockId: "water",
        share: 0.75,
        windowComplete: false,
      },
    ]);
  });

  it("is the share of the spare Components used that the base has made, for self-sufficiency in them", () => {
    const milestones = withCurrent(
      "spare-components-self-sufficient",
      (state) => {
        state.spareComponentSufficiency.records.push({ made: 1, used: 4 });
      },
    );

    expect(milestones.measures).toEqual([
      { kind: "spare-components-made", share: 0.25, windowComplete: false },
    ]);
  });

  it("is the Return Mass and the Exports loaded against the mass to carry, for tripling the Return Mass", () => {
    const { returnMassKilograms, propellant } = catalogue.lander;

    expect(withCurrent("return-mass-tripled").measures).toEqual([
      {
        kind: "return-mass",
        kilograms: returnMassKilograms,
        targetKilograms: 300,
      },
      { kind: "exports-loaded", kilograms: 0, targetKilograms: 300 },
    ]);

    // Propellant in stock lifts more, and what is set to load counts.
    const saved = withCurrent("return-mass-tripled", (state) => {
      setStock(state.bulkResources, propellant.resourceId, 200);
      setStock(state.bulkResources, "circuit-boards", 150);
      state.exportsToLoad = [{ resourceId: "circuit-boards", kilograms: 120 }];
    });
    expect(saved.measures).toEqual([
      {
        kind: "return-mass",
        kilograms:
          returnMassKilograms + 200 / propellant.kilogramsPerReturnKilogram,
        targetKilograms: 300,
      },
      { kind: "exports-loaded", kilograms: 120, targetKilograms: 300 },
    ]);
  });

  it("is each life support stock against what a Structure is stocked with and the reserve, for commissioning one that is stocked", () => {
    const stocked =
      catalogue.structureTypes.find((type) => type.id === "crew-habitat")
        ?.stockedWith ?? [];
    const use = (stockId: string): number =>
      catalogue.lifeSupportStocks.find((stock) => stock.id === stockId)
        ?.usePerEarthDayKilograms ?? 0;

    const milestones = withCurrent("crew-habitat-commissioned", (state) => {
      for (const stock of state.lifeSupport) stock.kilograms = 125;
    });

    expect(stocked.map((fill) => fill.stockId)).toEqual(["oxygen", "water"]);
    expect(milestones.measures).toEqual(
      stocked.map((fill) => ({
        kind: "stocked-with",
        stockId: fill.stockId,
        kilograms: 125,
        targetKilograms:
          fill.kilograms + fill.reserveEarthDays * use(fill.stockId),
        limitKilograms: catalogue.lifeSupportStocks.find(
          (stock) => stock.id === fill.stockId,
        )?.storageLimitKilograms,
      })),
    );
  });

  it("is each stock at what it takes, once a Structure being built has been stocked", () => {
    const save = tryScenarios.find(({ id }) => id === "crew-habitat")?.save();
    if (save === undefined) throw new Error("expected the scenario");
    const loaded = loadCampaign(save);
    if (!loaded.ok) throw new Error(loaded.message);
    const { milestones, constructions } = loaded.campaign.snapshot();

    expect(milestones.currentId).toBe("crew-habitat-commissioned");
    expect(constructions.map((construction) => construction.stage)).toEqual([
      "commissioning",
    ]);
    expect(milestones.measures).toHaveLength(2);
    for (const measure of milestones.measures) {
      if (measure.kind !== "stocked-with") throw new Error("expected a stock");
      expect(measure.kilograms).toBe(measure.targetKilograms);
    }
  });
});
