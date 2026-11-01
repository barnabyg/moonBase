import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { breaches, exemptions, ruleFailures } from "./catalogue-rules";
import { designsTheLongGameUses, LONG_GAME_END_EARTH_DAY } from "./long-game";
import { researchEndsOnEarthDay } from "./pacing-report";
import {
  bulk,
  design,
  launchItem,
  madeUp,
  structure,
} from "./made-up-catalogue";

describe("the data catalogue's consistency rules", () => {
  it("hold for the real catalogue, apart from the agreed exemptions", () => {
    expect(ruleFailures(catalogue, designsTheLongGameUses, exemptions)).toEqual(
      [],
    );
  });

  it("have a reason for every exemption", () => {
    for (const { reason } of exemptions) {
      expect(reason.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("the rule that research fits the Campaign", () => {
  const task = (earthDays: number) => ({
    id: "task",
    label: "Task",
    lengthHours: earthDays * 24,
    science: 1,
  });
  // The guide starts its first Research Task on about Earth Day 16.
  const startsOn = researchEndsOnEarthDay(madeUp({ researchTasks: [] }));

  it("passes Research Tasks that finish on the last day", () => {
    expect(
      breaches(
        madeUp({
          researchTasks: [task(LONG_GAME_END_EARTH_DAY - startsOn)],
        }),
        [],
      ),
    ).toEqual([]);
  });

  it("fails Research Tasks that would run past it, saying when they finish", () => {
    expect(
      breaches(
        madeUp({
          researchTasks: [task(LONG_GAME_END_EARTH_DAY - startsOn + 1)],
        }),
        [],
      ),
    ).toEqual([
      {
        rule: "research-fits-the-campaign",
        item: "research-tasks",
        message:
          "research-fits-the-campaign: research-tasks finish on Earth Day 3001.0, back to back, past the long game's end on Earth Day 3000.",
      },
    ]);
  });

  it("fails today's Research Tasks with 15 Earth Days more of them, as a whole play once had to show", () => {
    const longer = {
      ...catalogue,
      researchTasks: [...catalogue.researchTasks, task(15)],
    };
    expect(researchEndsOnEarthDay(catalogue)).toBeLessThanOrEqual(
      LONG_GAME_END_EARTH_DAY,
    );
    expect(
      breaches(longer, designsTheLongGameUses).map(({ rule }) => rule),
    ).toContain("research-fits-the-campaign");
  });
});

describe("the rule that every Design has a purpose", () => {
  const twoDesigns = {
    designs: [design("first", 10), design("second", 10)],
    structureTypes: [
      structure("habitat", "first", { habitat: true }),
      structure("pad", "second", { landingPad: true }),
    ],
  };

  it("fails a Design the long game doesn't use and that offers no choice, naming it and the rule", () => {
    expect(breaches(madeUp(twoDesigns), ["first"])).toEqual([
      {
        rule: "design-has-a-purpose",
        item: "second",
        message:
          "design-has-a-purpose: second brings nothing the long-game play guide uses, and offers no choice: nothing from another Design does the same job.",
      },
    ]);
  });

  it("passes a Design the long game uses", () => {
    expect(breaches(madeUp(twoDesigns), ["first", "second"])).toEqual([]);
  });

  it("passes a Design with another way to do the same job, used or not", () => {
    expect(
      breaches(
        madeUp({
          designs: [design("first", 10), design("second", 10)],
          launch: {
            payloadMassLimitKilograms: 1000,
            feeMillionDollars: 50,
            items: [launchItem("envelope", "second", 1, 1)],
          },
          structureTypes: [
            structure("habitat", "first", {
              habitat: true,
              footprintRadiusMetres: 2,
            }),
            structure("big-habitat", "second", {
              habitat: true,
              components: [{ componentId: "envelope", count: 1 }],
              footprintRadiusMetres: 1,
            }),
          ],
        }),
        [],
      ),
    ).toEqual([]);
  });

  it("fails a Design that brings nothing at all", () => {
    expect(
      breaches(madeUp({ designs: [design("empty", 10)] }), []).map(
        ({ rule, item }) => [rule, item],
      ),
    ).toEqual([["design-has-a-purpose", "empty"]]);
  });
});

describe("the rule that no Design is beaten outright", () => {
  it("fails one that something cheaper beats, naming it, the rule and what beats it", () => {
    const [found] = breaches(
      madeUp({
        designs: [design("base", 0), design("worse", 40)],
        structureTypes: [
          structure("good-pad", "base", { landingPad: true }),
          structure("worse-pad", "worse", { landingPad: true }),
        ],
      }),
      ["base", "worse"],
    );

    expect(found).toEqual({
      rule: "design-not-beaten",
      item: "worse",
      message:
        "design-not-beaten: worse is beaten outright: good-pad is at least as cheap and as good as worse-pad.",
    });
  });
});

describe("the rule that every Export can be sold", () => {
  const recipe = {
    id: "gems",
    label: "Gems",
    inputs: [],
    outputs: [{ resource: bulk("gems"), kilogramsPerHour: 1 }],
    drawKilowatts: 1,
  };
  const sellable = {
    bulkResources: [{ id: "gems", label: "Gems" }],
    exports: [{ resourceId: "gems", priceMillionDollarsPerKilogram: 1 }],
    designs: [design("base", 0)],
    structureTypes: [structure("plant", "base", { recipes: [recipe] })],
  };

  it("passes one a Plant makes, with a Return Mass to carry it", () => {
    expect(breaches(madeUp(sellable), ["base"])).toEqual([]);
  });

  it("fails one no Plant makes, naming it and the rule", () => {
    expect(
      breaches(madeUp({ ...sellable, structureTypes: [] }), ["base"]),
    ).toContainEqual({
      rule: "export-can-be-sold",
      item: "gems",
      message: "export-can-be-sold: gems can't be sold: no Plant makes it.",
    });
  });

  it("fails one the Lander has no Return Mass to carry", () => {
    expect(
      breaches(
        madeUp({
          ...sellable,
          lander: { ...catalogue.lander, returnMassKilograms: 0 },
        }),
        ["base"],
      ),
    ).toContainEqual({
      rule: "export-can-be-sold",
      item: "gems",
      message:
        "export-can-be-sold: gems can't be sold: the Lander has no Return Mass to carry it.",
    });
  });
});

describe("the rule that every Export can be sold, for its price", () => {
  it("fails one that sells for nothing", () => {
    expect(
      breaches(
        madeUp({
          exports: [{ resourceId: "gems", priceMillionDollarsPerKilogram: 0 }],
          designs: [design("base", 0)],
          structureTypes: [
            structure("plant", "base", {
              recipes: [
                {
                  id: "gems",
                  label: "Gems",
                  inputs: [],
                  outputs: [{ resource: bulk("gems"), kilogramsPerHour: 1 }],
                  drawKilowatts: 1,
                },
              ],
            }),
          ],
        }),
        ["base"],
      ),
    ).toEqual([
      {
        rule: "export-can-be-sold",
        item: "gems",
        message:
          "export-can-be-sold: gems can't be sold: a full Return Mass of it sells for nothing.",
      },
    ]);
  });
});

describe("the rule that every bulk resource has a use", () => {
  it("fails one no Plant takes in and nobody buys, naming it and the rule", () => {
    expect(
      breaches(madeUp({ bulkResources: [{ id: "slag", label: "Slag" }] }), []),
    ).toEqual([
      {
        rule: "bulk-resource-has-a-use",
        item: "slag",
        message:
          "bulk-resource-has-a-use: slag has no use: no Plant takes it in, and it isn't an Export.",
      },
    ]);
  });

  it("passes one a Plant takes in", () => {
    expect(
      breaches(
        madeUp({
          bulkResources: [{ id: "ore", label: "Ore" }],
          designs: [design("base", 0)],
          structureTypes: [
            structure("plant", "base", {
              recipes: [
                {
                  id: "melt",
                  label: "Melt",
                  inputs: [{ resource: bulk("ore"), kilogramsPerHour: 1 }],
                  outputs: [],
                  drawKilowatts: 1,
                },
              ],
            }),
          ],
        }),
        ["base"],
      ),
    ).toEqual([]);
  });
});

describe("the exemption list", () => {
  const empty = madeUp({ designs: [design("empty", 10)] });

  it("excuses a breach it names", () => {
    expect(
      ruleFailures(
        empty,
        [],
        [
          {
            rule: "design-has-a-purpose",
            item: "empty",
            reason: "It's a test.",
          },
        ],
      ),
    ).toEqual([]);
  });

  it("doesn't excuse a breach of another rule", () => {
    expect(
      ruleFailures(
        empty,
        [],
        [{ rule: "design-not-beaten", item: "empty", reason: "It's a test." }],
      ),
    ).toContainEqual(expect.stringContaining("design-has-a-purpose: empty"));
  });

  it("fails an exemption for something that no longer breaks the rule", () => {
    expect(
      ruleFailures(
        madeUp(),
        [],
        [
          {
            rule: "design-has-a-purpose",
            item: "gone",
            reason: "It's a test.",
          },
        ],
      ),
    ).toEqual([
      "design-has-a-purpose: gone is on the exemption list, but no longer breaks the rule. Take it off.",
    ]);
  });
});
