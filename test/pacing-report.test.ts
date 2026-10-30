import { describe, expect, it } from "vitest";
import { catalogue, type StructureType } from "../src/catalogue";
import {
  beatenDesigns,
  designsByDepth,
  exportEconomics,
  formatPacingReport,
  plantEarnings,
  realTimes,
  scienceEarners,
  scienceTimeline,
} from "./pacing-report";
import {
  bulk,
  design,
  launchItem,
  madeUp,
  structure,
} from "./made-up-catalogue";

describe("the real time a span of game time takes", () => {
  it("is given for every game speed but the pause", () => {
    expect(realTimes(madeUp(), 300)).toEqual([
      { speed: "1x", seconds: 72000 },
      { speed: "20x", seconds: 3600 },
    ]);
  });
});

describe("the Science timeline", () => {
  it("adds up the Research Tasks run back to back, and what the Designs cost", () => {
    const timeline = scienceTimeline(
      madeUp({
        researchTasks: [
          { id: "a", label: "A", lengthHours: 24, science: 10 },
          { id: "b", label: "B", lengthHours: 12, science: 5 },
        ],
        designs: [design("start", 0), design("x", 8)],
      }),
    );

    expect(timeline.researchEarthDays).toBe(1.5);
    expect(timeline.scienceEarned).toBe(15);
    expect(timeline.designsCost).toBe(8);
  });

  it("runs the shortest task on offer, and unlocks the cheapest Design it can as soon as it can", () => {
    const timeline = scienceTimeline(
      madeUp({
        researchTasks: [
          { id: "long", label: "Long", lengthHours: 48, science: 30 },
          { id: "short", label: "Short", lengthHours: 24, science: 10 },
          // Offered only once the Design it needs is unlocked.
          {
            id: "gated",
            label: "Gated",
            lengthHours: 6,
            science: 1,
            requiresDesignId: "cheap",
          },
        ],
        designs: [design("cheap", 10), design("dear", 25, ["cheap"])],
      }),
    );

    expect(timeline.steps).toEqual([
      {
        earthDay: 1,
        taskId: "short",
        earned: 10,
        spent: 10,
        unlockedDesignIds: ["cheap"],
      },
      {
        earthDay: 1.25,
        taskId: "gated",
        earned: 11,
        spent: 10,
        unlockedDesignIds: [],
      },
      {
        earthDay: 3.25,
        taskId: "long",
        earned: 41,
        spent: 35,
        unlockedDesignIds: ["dear"],
      },
    ]);
    expect(timeline.lockedDesignIds).toEqual([]);
    expect(timeline.unreachedTaskIds).toEqual([]);
  });

  it("says what stays out of reach", () => {
    const timeline = scienceTimeline(
      madeUp({
        researchTasks: [
          { id: "a", label: "A", lengthHours: 24, science: 1 },
          {
            id: "gated",
            label: "Gated",
            lengthHours: 6,
            science: 1,
            requiresDesignId: "dear",
          },
        ],
        designs: [design("dear", 10)],
      }),
    );

    expect(timeline.lockedDesignIds).toEqual(["dear"]);
    expect(timeline.unreachedTaskIds).toEqual(["gated"]);
  });
});

describe("the Designs' cost by depth in the Tech Tree", () => {
  it("counts the starting ones as depth 0, and any other as one past its deepest prerequisite", () => {
    expect(
      designsByDepth(
        madeUp({
          designs: [
            design("root", 0),
            design("one-a", 10, ["root"]),
            design("one-b", 30),
            design("two", 50, ["root", "one-a"]),
          ],
        }),
      ),
    ).toEqual([
      { depth: 0, designs: 1, totalCost: 0, cheapest: 0, dearest: 0 },
      { depth: 1, designs: 2, totalCost: 40, cheapest: 10, dearest: 30 },
      { depth: 2, designs: 1, totalCost: 50, cheapest: 50, dearest: 50 },
    ]);
  });
});

describe("what a Plant earns", () => {
  const plantCatalogue = (kilogramsPerHour: number) =>
    madeUp({
      exports: [
        { resourceId: "gems", priceMillionDollarsPerKilogram: 2 },
        { resourceId: "rough", priceMillionDollarsPerKilogram: 1 },
      ],
      launch: {
        payloadMassLimitKilograms: 1000,
        feeMillionDollars: 50,
        items: [launchItem("press", "x", 40, 100)],
      },
      structureTypes: [
        structure("gem-plant", "x", {
          components: [{ componentId: "press", count: 2 }],
          recipes: [
            {
              id: "gems",
              label: "Gems",
              inputs: [
                {
                  resource: bulk("rough"),
                  kilogramsPerHour: kilogramsPerHour / 2,
                },
              ],
              outputs: [{ resource: bulk("gems"), kilogramsPerHour }],
              drawKilowatts: 1,
            },
            {
              id: "nothing-to-sell",
              label: "Slag",
              inputs: [],
              outputs: [{ resource: bulk("slag"), kilogramsPerHour: 1 }],
              drawKilowatts: 1,
            },
          ],
        }),
        structure("water-plant", "x", {
          recipes: [
            {
              id: "water",
              label: "Water",
              inputs: [],
              outputs: [
                {
                  resource: { kind: "life-support", stockId: "water" },
                  kilogramsPerHour: 5,
                },
              ],
              drawKilowatts: 1,
            },
          ],
        }),
      ],
    });

  it("counts only the recipes that make an Export, by the value they add, running through Daylight", () => {
    // 0.1 kg/h of gems ($0.2M) from 0.05 kg/h of rough ($0.05M) adds $0.15M an
    // hour; through 20 Earth Days of a 30-day Lunation that's $2.4M an Earth Day.
    const [earning, ...others] = plantEarnings(plantCatalogue(0.1));

    expect(others).toEqual([]);
    expect(earning).toMatchObject({
      structureTypeId: "gem-plant",
      recipeId: "gems",
      costMillionDollars: 80,
      exportKilogramsPerEarthDay: expect.closeTo(1.6, 6) as number,
      returnMassLimited: false,
    });
    expect(earning?.millionDollarsPerEarthDay).toBeCloseTo(2.4, 6);
    expect(earning?.paybackEarthDays).toBeCloseTo(80 / 2.4, 6);
  });

  it("is capped by what the Lander can carry away", () => {
    // 10 kg/h is 160 kg an Earth Day, and the Lander carries 100 kg in the 10 of a round trip.
    const [earning] = plantEarnings(plantCatalogue(10));

    expect(earning?.returnMassLimited).toBe(true);
    expect(earning?.exportKilogramsPerEarthDay).toBeCloseTo(10, 6);
    expect(earning?.millionDollarsPerEarthDay).toBeCloseTo(15, 6);
  });
});

describe("what a Design earns in Science", () => {
  it("is the Research Tasks it offers, with how long they take to pay it back, if they do", () => {
    const earners = scienceEarners(
      madeUp({
        designs: [design("paid", 10), design("unpaid", 100), design("idle", 5)],
        researchTasks: [
          {
            id: "a",
            label: "A",
            lengthHours: 48,
            science: 20,
            requiresDesignId: "paid",
          },
          {
            id: "b",
            label: "B",
            lengthHours: 24,
            science: 20,
            requiresDesignId: "unpaid",
          },
        ],
      }),
    );

    expect(earners).toEqual([
      {
        designId: "paid",
        scienceCost: 10,
        taskScience: 20,
        sciencePerLunation: 0,
        paybackEarthDays: 1,
      },
      {
        designId: "unpaid",
        scienceCost: 100,
        taskScience: 20,
        sciencePerLunation: 0,
        paybackEarthDays: undefined,
      },
    ]);
  });

  it("includes a telescope's Science at Night, with its Design paid back in Lunations", () => {
    const [earner] = scienceEarners(
      madeUp({
        designs: [design("scope", 60)],
        structureTypes: [structure("telescope", "scope", { telescope: true })],
      }),
    );

    // 10 Earth Days of Night is 240 hours: 10 rounds of 24 hours, 10 Science each.
    expect(earner).toEqual({
      designId: "scope",
      scienceCost: 60,
      taskScience: 0,
      sciencePerLunation: 100,
      paybackEarthDays: 18,
    });
  });
});

describe("what a Launch earns, for each Export", () => {
  const economics = exportEconomics(
    madeUp({
      exports: [
        { resourceId: "gems", priceMillionDollarsPerKilogram: 2 },
        { resourceId: "dross", priceMillionDollarsPerKilogram: 0.25 },
      ],
      launch: {
        payloadMassLimitKilograms: 1000,
        feeMillionDollars: 50,
        items: [
          launchItem("press", "x", 600, 800),
          launchItem("saw", "x", 100, 700),
        ],
      },
    }),
  );

  it("is a full Return Mass's price less the Launch fee", () => {
    expect(economics.exports).toEqual([
      {
        resourceId: "gems",
        incomeMillionDollars: 200,
        feeMillionDollars: 50,
        profitMillionDollars: 150,
        launchesToBuyEverything: 5,
      },
      {
        resourceId: "dross",
        incomeMillionDollars: 25,
        feeMillionDollars: 50,
        profitMillionDollars: -25,
        launchesToBuyEverything: undefined,
      },
    ]);
  });

  it("adds up one of every Launch item, and how many Launches it takes to carry them", () => {
    expect(economics.everyItem).toEqual({
      millionDollars: 700,
      kilograms: 1500,
      launchesToCarry: 2,
    });
  });
});

describe("Designs that something cheaper beats outright", () => {
  const array = (
    id: string,
    designId: string,
    generationKilowatts: number,
    panels = 1,
  ): StructureType =>
    structure(id, designId, {
      components: [{ componentId: "panel", count: panels }],
      power: {
        generationKilowatts,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0,
      },
    });
  const launch = {
    payloadMassLimitKilograms: 1000,
    feeMillionDollars: 50,
    items: [launchItem("panel", "base", 5, 50)],
  };

  it("names one no better than a Design that costs less", () => {
    const beaten = beatenDesigns(
      madeUp({
        designs: [design("base", 0), design("worse", 40)],
        launch,
        structureTypes: [
          array("good-array", "base", 10),
          array("worse-array", "worse", 10),
        ],
      }),
    );

    expect(beaten).toEqual([
      {
        designId: "worse",
        beaten: [{ thing: "worse-array", by: "good-array" }],
      },
    ]);
  });

  it("leaves one that does anything better, or costs less in any way", () => {
    expect(
      beatenDesigns(
        madeUp({
          designs: [
            design("base", 0),
            design("better", 40),
            design("light", 40),
          ],
          launch,
          structureTypes: [
            array("base-array", "base", 10, 2),
            array("better-array", "better", 15, 2),
            array("light-array", "light", 10, 1),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("doesn't compare things that do different jobs", () => {
    expect(
      beatenDesigns(
        madeUp({
          designs: [design("base", 0), design("pad", 40)],
          structureTypes: [
            structure("habitat", "base", { habitat: true }),
            structure("pad", "pad", { landingPad: true }),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("compares a Plant recipe by recipe, so one with a recipe the other can't match isn't beaten", () => {
    const recipe = (
      id: string,
      outputId: string,
      kilogramsPerHour: number,
    ) => ({
      id,
      label: id,
      inputs: [],
      outputs: [{ resource: bulk(outputId), kilogramsPerHour }],
      drawKilowatts: 1,
    });

    const beaten = beatenDesigns(
      madeUp({
        designs: [design("base", 0), design("worse", 40), design("wider", 40)],
        structureTypes: [
          structure("base-plant", "base", {
            recipes: [recipe("gems", "gems", 2)],
          }),
          structure("worse-plant", "worse", {
            recipes: [recipe("gems", "gems", 1)],
          }),
          structure("wider-plant", "wider", {
            recipes: [recipe("gems", "gems", 1), recipe("dross", "dross", 1)],
          }),
        ],
      }),
    );

    expect(beaten.map((entry) => entry.designId)).toEqual(["worse"]);
  });

  it("compares oxygen or water Launch items by what each kilogram costs and weighs", () => {
    const tank = (id: string, designId: string, price: number) => ({
      id,
      designId,
      brings: {
        kind: "life-support" as const,
        stockId: "water",
        kilograms: 100,
      },
      massKilograms: 120,
      priceMillionDollars: price,
    });

    const beaten = beatenDesigns(
      madeUp({
        designs: [design("base", 0), design("dearer", 40), design("bulk", 40)],
        launch: {
          payloadMassLimitKilograms: 1000,
          feeMillionDollars: 50,
          items: [
            tank("water", "base", 10),
            tank("dear-water", "dearer", 20),
            tank("bulk-water", "bulk", 5),
          ],
        },
      }),
    );

    expect(beaten.map((entry) => entry.designId)).toEqual(["dearer"]);
  });
});

describe("the pacing report on today's catalogue", () => {
  const report = formatPacingReport(catalogue).join("\n");

  it("gives the Research Tasks' length and the Designs' cost", () => {
    expect(report).toContain("315.5 Earth Days");
    expect(report).toContain("2225 Science");
  });

  it("gives how many Launches' profit buys one of every Launch item", () => {
    expect(report).toContain("$1020M");
    expect(report).toMatch(/Circuit boards.*7 Launches/);
  });

  it("says what it assumes", () => {
    expect(report).toContain("Assumes");
  });
});
