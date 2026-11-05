import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogue, type ExpeditionType } from "../src/catalogue";
import { loadCampaign } from "../src/simulation";
import { scenarioOf, type Scenario } from "./scenario";
import { freshSaveWith } from "./try-scenarios";

const PROSPECTING = "prospecting-expeditions";
const SURVEYS = "survey-expeditions";

function typeOf(id: string): ExpeditionType {
  const found = catalogue.expeditions.types.find((type) => type.id === id);
  if (found === undefined) throw new Error(`expected an Expedition "${id}"`);
  return found;
}

/** A Campaign with these Designs unlocked. */
function baseWith(designs: readonly string[]): Scenario {
  const loaded = loadCampaign(
    freshSaveWith((state) => {
      state.unlockedDesignIds.push(...designs);
    }),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  return scenarioOf(loaded.campaign);
}

function bulk(game: Scenario, resourceId: string): number {
  return (
    game.state.bulkResources.find((stock) => stock.resourceId === resourceId)
      ?.kilograms ?? 0
  );
}

function untilBack(game: Scenario): void {
  for (let hours = 0; game.state.expedition !== undefined; hours++) {
    if (hours > 40 * 24) throw new Error("The Expedition never came back.");
    game.advance({ hours: 1 });
  }
}

describe("the types of Expedition", () => {
  it("offers only water ice until a Design brings another", () => {
    const game = baseWith([]);

    expect(game.campaign.startExpedition("survey")).toMatchObject({
      ok: false,
      reason: "design-locked",
    });
    expect(game.state.expedition).toBeUndefined();
    expect(game.campaign.startExpedition("water-ice")).toEqual({ ok: true });
  });

  it("refuses a type there is no such thing as", () => {
    expect(baseWith([]).campaign.startExpedition("treasure")).toMatchObject({
      ok: false,
      reason: "unknown-type",
    });
  });

  it("goes for water ice when no type is asked for", () => {
    const game = baseWith([]);

    game.campaign.startExpedition();

    expect(game.state.expedition?.typeId).toBe("water-ice");
  });

  it("allows only one under way, whatever its type", () => {
    const game = baseWith([SURVEYS]);
    game.campaign.startExpedition("water-ice");

    expect(game.campaign.startExpedition("survey")).toMatchObject({
      ok: false,
      reason: "under-way",
    });
  });

  it.each([
    ["prospecting-metals", "metals", 30],
    ["prospecting-silicon", "silicon", 20],
  ])("pays %s out in %s as the Robot returns", (id, resourceId, kilograms) => {
    const game = baseWith([PROSPECTING]);
    const before = bulk(game, resourceId);
    expect(game.campaign.startExpedition(id)).toEqual({ ok: true });
    game.advance({ hours: 24 });
    expect(bulk(game, resourceId)).toBe(before);

    untilBack(game);

    expect(bulk(game, resourceId)).toBe(before + kilograms);
  });

  it("pays a survey in Science, and brings back nothing to store", () => {
    const game = baseWith([SURVEYS]);
    const ice = bulk(game, "water-ice");
    expect(game.campaign.startExpedition("survey")).toEqual({ ok: true });
    const before = game.state.science;

    untilBack(game);

    expect(game.state.science).toBeGreaterThanOrEqual(before + 25);
    expect(bulk(game, "water-ice")).toBe(ice);
  });

  it("is away for as long as its type says", () => {
    const game = baseWith([PROSPECTING]);
    game.campaign.startExpedition("prospecting-metals");
    for (let hours = 0; game.state.expedition?.stage !== "away"; hours++) {
      if (hours > 240) throw new Error("It never left the map.");
      game.advance({ hours: 1 });
    }

    const { returnsAtMinute } = game.state.expedition;

    expect(
      (returnsAtMinute ?? 0) - game.state.clock.elapsedMinutes,
    ).toBeCloseTo(typeOf("prospecting-metals").awayEarthDays * 24 * 60, -2);
  });

  it("can't take the place of the Plants: prospecting without a pause brings less than one extraction plant makes", () => {
    const LUNATION_EARTH_DAYS = 29.5;
    const DAYLIGHT_HOURS = (LUNATION_EARTH_DAYS / 2) * 24;
    // An extraction plant making metals and silicon, as its recipe has it,
    // through each Daylight only.
    const plantPerEarthDay = (kilogramsPerHour: number): number =>
      (kilogramsPerHour * DAYLIGHT_HOURS) / LUNATION_EARTH_DAYS;
    const perEarthDay = (id: string): number => {
      const type = typeOf(id);
      if (type.kind !== "bulk-resource") throw new Error("expected a resource");
      return type.kilograms / type.awayEarthDays;
    };

    expect(perEarthDay("prospecting-metals")).toBeLessThan(
      plantPerEarthDay(0.6),
    );
    expect(perEarthDay("prospecting-silicon")).toBeLessThan(
      plantPerEarthDay(0.4),
    );
  });

  it("can't pay for a Launch: a Prospecting load sells for less than the Launch fee", () => {
    const type = typeOf("prospecting-metals");
    if (type.kind !== "bulk-resource") throw new Error("expected a resource");
    const price =
      catalogue.exports.find((sold) => sold.resourceId === type.resourceId)
        ?.priceMillionDollarsPerKilogram ?? Infinity;

    expect(type.kilograms * price).toBeLessThan(
      catalogue.launch.feeMillionDollars,
    );
  });

  it("comes only past a Design that has to be earned, so that Prospecting can't be how a base starts", () => {
    const prerequisites = catalogue.designs.filter((design) =>
      catalogue.designs
        .find(({ id }) => id === PROSPECTING)
        ?.prerequisiteDesignIds.includes(design.id),
    );

    expect(prerequisites.length).toBeGreaterThan(0);
    for (const design of prerequisites) {
      expect(design.starting).toBe(false);
    }
  });

  // The first extraction plant comes on the second Launch, which lands about
  // 12 Earth Days after the first Research Task. Prospecting has to be had by
  // then, with the water wall's Design bought first, or it comes once the
  // Plants already make metals and silicon and has nothing left to do (#249).
  it("can be had before the first extraction plant runs: it, what it needs and the water wall's Design cost no more than 10 Earth Days of the first Research Tasks pay", () => {
    const RESEARCH_HOURS = 10 * 24;
    const designOf = (id: string) => {
      const found = catalogue.designs.find((design) => design.id === id);
      if (found === undefined) throw new Error(`expected a Design "${id}"`);
      return found;
    };
    const withWhatItNeeds = (id: string): Set<string> => {
      const ids = new Set<string>([id]);
      for (const needed of designOf(id).prerequisiteDesignIds) {
        for (const each of withWhatItNeeds(needed)) ids.add(each);
      }
      return ids;
    };
    const tasksFirst = catalogue.researchTasks
      .filter((task) => task.requiresDesignId === undefined)
      .toSorted((a, b) => a.lengthHours - b.lengthHours);
    let hours = 0;
    let science = 0;
    for (const task of tasksFirst) {
      if (hours + task.lengthHours > RESEARCH_HOURS) break;
      hours += task.lengthHours;
      science += task.science;
    }
    const designs = new Set([
      ...withWhatItNeeds(PROSPECTING),
      ...withWhatItNeeds("water-wall-shielding"),
    ]);
    const cost = [...designs].reduce(
      (sum, id) => sum + designOf(id).scienceCost,
      0,
    );

    expect(cost).toBeLessThanOrEqual(science);
  });

  it("carries on as water ice from an older save with one under way", () => {
    const game = baseWith([]);
    game.campaign.startExpedition("water-ice");
    const save = JSON.parse(game.campaign.save()) as {
      version: number;
      state: { expedition: { typeId?: string } };
    };
    delete save.state.expedition.typeId;
    save.version = 45;

    const loaded = loadCampaign(JSON.stringify(save));

    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.campaign.snapshot().expedition?.typeId).toBe("water-ice");
  });
});

describe("the sample save of format version 46", () => {
  it("loads with a Survey under way, which pays its Science", () => {
    const loaded = loadCampaign(
      readFileSync("test/saves/version-46.moonbase", "utf8"),
    );
    if (!loaded.ok) throw new Error(loaded.message);
    const game = scenarioOf(loaded.campaign);
    expect(game.state.expedition).toMatchObject({
      typeId: "survey",
      reward: { kind: "science", science: 25 },
    });
    const before = game.state.science;

    untilBack(game);

    expect(game.state.science).toBeGreaterThanOrEqual(before + 25);
  });
});
