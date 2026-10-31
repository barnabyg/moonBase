import { describe, expect, it } from "vitest";
import { catalogue, resourceOutputs } from "../src/catalogue";
import {
  loadCampaign,
  reserveKilograms,
  type Campaign,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { describeStructure } from "../src/ui/describe";
import {
  formatSelfSufficiency,
  withPlantsTaking,
} from "../src/ui/status-panel-text";
import { formatPlant, formatPlantRates } from "../src/ui/structure-state";
import { opticsBaseSave } from "./try-scenarios";

const HOUR = 60;
const EARTH_DAY = 24 * HOUR;

/** What an hour of each takes: the ticket's starting numbers. */
const OPTICS_WORKS_KILOGRAMS = 1;
const GRINDING_LINE_KILOGRAMS = 2.5;
/** What the Mission Director drinks in an Earth Day. */
const DRUNK_KILOGRAMS = 3.5;
/** A fortnight of what they drink. */
const RESERVE_KILOGRAMS = 49;

const saves = new Map<number, string>();

/** The base with water for so many batches above the reserve, prepared once as a save's text never changes. */
function base(batches: number): Campaign {
  let save = saves.get(batches);
  if (save === undefined) {
    save = opticsBaseSave(batches);
    saves.set(batches, save);
  }
  const loaded = loadCampaign(save);
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.campaign;
}

function water(state: Snapshot): number {
  return (
    state.lifeSupport.find(({ stockId }) => stockId === "water")?.kilograms ??
    Number.NaN
  );
}

function typed(state: Snapshot, id: string): StructureSnapshot {
  const structure = state.structures.find(
    ({ structureTypeId }) => structureTypeId === id,
  );
  if (structure === undefined) throw new Error(`expected a ${id}`);
  return structure;
}

function works(state: Snapshot): StructureSnapshot {
  return typed(state, "optics-works");
}

function waterForecast(campaign: Campaign) {
  const forecast = campaign
    .forecasts()
    .lifeSupport.find(({ stockId }) => stockId === "water");
  if (forecast === undefined) throw new Error("expected a water forecast");
  return forecast;
}

/** Advances until the optics works has stopped for the reserve. */
function untilAtReserve(campaign: Campaign): void {
  for (let minutes = 0; minutes < 3 * EARTH_DAY; minutes += 10) {
    if (works(campaign.snapshot()).plant?.stoppedFor?.reason === "reserve") {
      return;
    }
    campaign.advance(10);
  }
  throw new Error("The optics works never stopped at the reserve.");
}

function switchOnWaterPlant(campaign: Campaign): void {
  const on = campaign.switchPlant(
    typed(campaign.snapshot(), "water-processing-plant").id,
    "on",
  );
  if (!on.ok) throw new Error(on.message);
}

describe("the water an optics works and a grinding line use as coolant", () => {
  it.each([
    ["optics-works", OPTICS_WORKS_KILOGRAMS],
    ["grinding-line", GRINDING_LINE_KILOGRAMS],
  ])("%s takes water for its precision optics", (id, kilograms) => {
    const recipe = catalogue.structureTypes.find((type) => type.id === id)
      ?.recipes?.[0];

    expect(recipe?.inputs).toContainEqual({
      resource: { kind: "life-support", stockId: "water" },
      kilogramsPerHour: kilograms,
    });
  });

  it("takes a batch's water as each batch starts", () => {
    const campaign = base(6);
    const start = water(campaign.snapshot());

    campaign.advance(3 * HOUR);

    // Three batches have started, perhaps four, and the Mission Director has
    // drunk a little.
    const drunk = (DRUNK_KILOGRAMS * 3) / 24;
    const used = start - water(campaign.snapshot()) - drunk;
    expect(used).toBeGreaterThanOrEqual(3 * OPTICS_WORKS_KILOGRAMS - 1e-6);
    expect(used).toBeLessThanOrEqual(4 * OPTICS_WORKS_KILOGRAMS + 1e-6);
  });

  it("says so in the Base panel and the Guide", () => {
    const type = catalogue.structureTypes.find(
      ({ id }) => id === "optics-works",
    );
    if (type === undefined) throw new Error("expected an optics works");

    expect(formatPlantRates(works(base(6).snapshot()))).toBe(
      "making 0.2 kg of precision optics an hour from 0.8 kg of silicon, 0.2 kg of metals and 1 kg of water",
    );
    expect(describeStructure(type)).toContain("1 kg of water into");
    expect(describeStructure(type)).toContain(
      `below the Mission Director's reserve of ${RESERVE_KILOGRAMS} kg, 14 Earth Days of what they use`,
    );
  });
});

describe("the Mission Director's reserve", () => {
  it("is in the data catalogue, in Earth Days of what they use", () => {
    const stock = catalogue.lifeSupportStocks.find(({ id }) => id === "water");

    expect(stock?.reserveEarthDays).toBe(14);
    expect(reserveKilograms("water")).toBeCloseTo(RESERVE_KILOGRAMS, 9);
  });

  it("stops a Plant before a batch would take the stock below it, and says why", () => {
    const campaign = base(3);

    untilAtReserve(campaign);

    const stock = water(campaign.snapshot());
    expect(stock).toBeLessThan(RESERVE_KILOGRAMS + OPTICS_WORKS_KILOGRAMS);
    expect(stock).toBeGreaterThan(RESERVE_KILOGRAMS - 1);
    const { plant } = works(campaign.snapshot());
    if (plant === undefined) throw new Error("expected a Plant");
    expect(plant).toMatchObject({
      running: false,
      stoppedFor: {
        reason: "reserve",
        resource: { kind: "life-support", stockId: "water" },
        reserveKilograms: RESERVE_KILOGRAMS,
        kilogramsNeeded: RESERVE_KILOGRAMS + OPTICS_WORKS_KILOGRAMS,
      },
    });
    expect(formatPlant(plant)).toMatch(
      /^waiting for Water: [\d.]+ of 50 kg, to leave the Mission Director's reserve of 49 kg$/,
    );
  });

  it("leaves the rest to the Mission Director: the stock then falls only as they drink", () => {
    const campaign = base(1);
    untilAtReserve(campaign);
    const before = water(campaign.snapshot());

    campaign.advance(EARTH_DAY);

    expect(before - water(campaign.snapshot())).toBeCloseTo(DRUNK_KILOGRAMS, 6);
    expect(works(campaign.snapshot()).plant?.running).toBe(false);
  });

  it("lets a Plant start again once there is a batch's water above it", () => {
    const campaign = base(1);
    untilAtReserve(campaign);
    switchOnWaterPlant(campaign);

    let ran = false;
    for (let hours = 0; hours < 12; hours++) {
      campaign.advance(HOUR);
      ran ||= works(campaign.snapshot()).plant?.running === true;
    }

    expect(ran).toBe(true);
    expect(water(campaign.snapshot())).toBeGreaterThan(RESERVE_KILOGRAMS - 1);
  });

  it("is shared by two Plants: only one starts when there is one batch's water above it", () => {
    const save = JSON.parse(base(1).save()) as {
      state: {
        lifeSupport: { stockId: string; kilograms: number }[];
        structures: Record<string, unknown>[];
      };
    };
    const first = save.state.structures.find(
      ({ structureTypeId }) => structureTypeId === "optics-works",
    );
    if (first === undefined) throw new Error("expected an optics works");
    first.batch = null;
    save.state.structures.push({
      ...first,
      id: "second-optics-works",
      position: { x: 50, y: 15 },
    });
    for (const stock of save.state.lifeSupport) {
      if (stock.stockId === "water") {
        stock.kilograms = RESERVE_KILOGRAMS + 1.5 * OPTICS_WORKS_KILOGRAMS;
      }
    }
    const loaded = loadCampaign(JSON.stringify(save));
    if (!loaded.ok) throw new Error(loaded.message);

    loaded.campaign.advance(1);

    const state = loaded.campaign.snapshot();
    const running = state.structures.filter(
      ({ structureTypeId, plant }) =>
        structureTypeId === "optics-works" && plant?.running === true,
    );
    expect(running).toHaveLength(1);
    expect(water(state)).toBeGreaterThanOrEqual(RESERVE_KILOGRAMS);
  });
});

describe("the water forecast with a Plant taking water", () => {
  it("counts what running Plants use in how fast the stock changes", () => {
    expect(waterForecast(base(6)).kilogramsPerEarthDay).toBeCloseTo(
      -(OPTICS_WORKS_KILOGRAMS * 24 + DRUNK_KILOGRAMS),
      6,
    );
  });

  it("counts on the Plants stopping at the reserve, and the Mission Director drinking the rest", () => {
    const campaign = base(6);

    const hours = (waterForecast(campaign).minutesUntilEmpty ?? NaN) / HOUR;

    // Six batches at 1 kg an hour and what is drunk meanwhile, then a fortnight,
    // less what is drunk of it through the batch under way.
    const toReserve = 6 / (OPTICS_WORKS_KILOGRAMS + DRUNK_KILOGRAMS / 24);
    expect(hours).toBeGreaterThan(toReserve + 14 * 24 - 2);
    expect(hours).toBeLessThan(toReserve + 14 * 24 + 2);
  });

  it("forecasts the Mission Director's use alone once the Plants have stopped", () => {
    const campaign = base(1);
    untilAtReserve(campaign);
    const stock = water(campaign.snapshot());

    const forecast = waterForecast(campaign);

    expect(forecast.kilogramsPerEarthDay).toBeCloseTo(-DRUNK_KILOGRAMS, 6);
    expect((forecast.minutesUntilEmpty ?? NaN) / EARTH_DAY).toBeCloseTo(
      stock / DRUNK_KILOGRAMS,
      2,
    );
  });

  it("warns only as the reserve itself runs down, not as the Plants take what is above it", () => {
    const campaign = base(6);
    const warnings = (minutes: number) =>
      campaign
        .advance(minutes)
        .filter(
          (event) =>
            event.kind === "life-support-warning" && event.stockId === "water",
        );

    // The Plant is at the reserve within these two Earth Days, with 14 left.
    expect(warnings(2 * EARTH_DAY)).toEqual([]);
    expect(warnings(4 * EARTH_DAY)).toEqual([]);
    // Over 8 Earth Days left so far: the next two take it past the first
    // warning level, 7, with the Plant long stopped.
    expect(warnings(2 * EARTH_DAY)).toHaveLength(1);
  });

  it("explains the fall in the status panel: what is using it, and what is waiting at the reserve", () => {
    const say = (campaign: Campaign) =>
      withPlantsTaking(
        { value: "55.0 kg", note: "lasts 14d 6h" },
        "water",
        campaign.snapshot().structures,
      ).note;

    expect(say(base(6))).toBe("lasts 14d 6h, optics works using 24 kg a day");

    const waiting = base(1);
    untilAtReserve(waiting);
    expect(say(waiting)).toBe(
      "lasts 14d 6h, optics works waiting at the reserve",
    );
  });
});

describe("water self-sufficiency with a Plant taking water", () => {
  it("judges what Plants make against what the Mission Director uses, whatever Plants use", () => {
    const campaign = base(200);
    switchOnWaterPlant(campaign);
    const madePerHour =
      resourceOutputs(
        catalogue.structureTypes.find(
          ({ id }) => id === "water-processing-plant",
        )?.recipes?.[0],
      )[0]?.kilogramsPerHour ?? NaN;

    campaign.advance(2 * EARTH_DAY);

    const { missionDirector, selfSufficiency } = campaign.snapshot();
    const judged = selfSufficiency.find(({ stockId }) => stockId === "water");
    if (judged === undefined) throw new Error("expected a judgement");
    // Over these Earth Days the optics works used more than was made, and
    // counts for nothing: what was made is measured against what was drunk.
    expect(judged.coveredShare).toBeCloseTo(
      (madePerHour * 24) / DRUNK_KILOGRAMS,
      0,
    );
    expect(madePerHour).toBeLessThan(OPTICS_WORKS_KILOGRAMS);
    expect(
      formatSelfSufficiency(judged, missionDirector).explanation,
    ).toContain("of the Mission Director's use made at the base");
  });
});
