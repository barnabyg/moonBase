import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  createCampaign,
  loadCampaign,
  lunationMinutes,
  type Campaign,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { formatLaunchStorage } from "../src/ui/launch-manifest-text";
import { formatEvent } from "../src/ui/notifications-text";
import {
  formatLifeSupport,
  summariseMissionDirector,
} from "../src/ui/status-panel-text";
import { formatPlant } from "../src/ui/structure-state";
import { DEFAULT_SEED } from "./scenario";
import { changed } from "./worn";

// Only the Plants and the Mission Director change the oxygen and water: nothing
// wears down, the Robot digs no Regolith, and the Habitat needs no power and
// keeps the Mission Director safe from radiation.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutDigging } = await import("./without-digging");
  const { withoutDust } = await import("./without-dust");
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  const { withoutCold } = await import("./without-cold");
  const { safeHabitat } = await import("./safe-habitat");
  return {
    ...actual,
    catalogue: safeHabitat(
      withoutCold(
        withoutMicrometeorites(withoutDust(withoutDigging(actual.catalogue))),
      ),
      ["power", "radiation", "solar-particle-events"],
    ),
  };
});

const HOUR = 60;
const EARTH_DAY = 24 * HOUR;

/** The ticket's figures, against which the data catalogue is checked. */
const WATER_LIMIT = 400;
const OXYGEN_LIMIT = 100;
/** What a water-processing plant makes in an hour, its batch. */
const WATER_BATCH = 0.9;
/** What the extraction plant's default recipe makes of oxygen in an hour. */
const EXTRACTED_OXYGEN = 0.15;
const WATER_USE_PER_EARTH_DAY = 3.5;

const windowMinutes =
  lunationMinutes(catalogue.lunation).lunation *
  catalogue.selfSufficiency.windowLunations;

const plans: readonly [string, GroundPosition][] = [
  ["solar-array", { x: 20, y: 12 }],
  ["solar-array", { x: 20, y: 28 }],
  ["solar-array", { x: 20, y: 44 }],
  ["habitat", { x: 30, y: -30 }],
  ["water-processing-plant", { x: -25, y: 20 }],
  ["electrolysis-plant", { x: -25, y: 40 }],
];

function typed(state: Snapshot, id: string): StructureSnapshot {
  const found = state.structures.find(
    ({ structureTypeId }) => structureTypeId === id,
  );
  if (found === undefined) throw new Error(`expected ${id}`);
  return found;
}

function stock(state: Snapshot, stockId: string): number {
  return (
    state.lifeSupport.find((candidate) => candidate.stockId === stockId)
      ?.kilograms ?? Number.NaN
  );
}

function bulk(state: Snapshot, resourceId: string): number {
  return (
    state.bulkResources.find((candidate) => candidate.resourceId === resourceId)
      ?.kilograms ?? Number.NaN
  );
}

/**
 * A base with a water-processing plant and an electrolysis plant running in
 * Daylight on water ice to spare, and the Mission Director moved into its
 * Habitat. Built once, and loaded afresh for each test.
 */
let baseText: string | undefined;
function base(): Campaign {
  if (baseText === undefined) {
    const campaign = changed(
      createCampaign({ seed: DEFAULT_SEED }),
      (state) => {
        (
          state as unknown as { unlockedDesignIds: string[] }
        ).unlockedDesignIds.push(
          "water-processing",
          "water-electrolysis",
          "regolith-extraction",
          "life-support-resupply",
        );
        for (const type of catalogue.structureTypes) {
          if (type.recipes === undefined) continue;
          for (const need of type.components) {
            const held = state.stockpile.components.find(
              (candidate) => candidate.componentId === need.componentId,
            );
            // Enough for two of each.
            if (held !== undefined) held.count += 2 * need.count;
          }
        }
        for (const need of catalogue.structureTypes.find(
          ({ id }) => id === "solar-array",
        )?.components ?? []) {
          const held = state.stockpile.components.find(
            (candidate) => candidate.componentId === need.componentId,
          );
          if (held !== undefined) held.count += 3 * need.count;
        }
      },
    );
    for (const [structureTypeId, position] of plans) {
      const planned = campaign.planConstruction({ structureTypeId, position });
      if (!planned.ok) throw new Error(planned.message);
    }
    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 10 * 24) throw new Error("The Constructions never finished.");
      campaign.advance(HOUR);
    }
    const moved = campaign.moveMissionDirectorIn(
      typed(campaign.snapshot(), "habitat").id,
    );
    if (!moved.ok) throw new Error(moved.message);
    // Early in a Daylight, so that the tests have days of it to play in.
    for (let hours = 0; ; hours++) {
      const { lunation } = campaign.snapshot();
      if (
        lunation.part === "daylight" &&
        lunation.minutesRemaining > 5 * EARTH_DAY
      ) {
        break;
      }
      if (hours > 40 * 24) throw new Error("Daylight never came.");
      campaign.advance(HOUR);
    }
    baseText = changed(campaign, (state) => {
      for (const held of state.bulkResources) {
        if (held.resourceId === "water-ice") held.kilograms = 5_000;
      }
    }).save();
  }
  const loaded = loadCampaign(baseText);
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.campaign;
}

/** The Campaign as saved, with the stocks given. */
function withStocks(
  campaign: Campaign,
  stocks: { readonly water?: number; readonly oxygen?: number },
): Campaign {
  return changed(campaign, (state) => {
    for (const held of state.lifeSupport) {
      const kilograms = stocks[held.stockId as "water" | "oxygen"];
      if (kilograms !== undefined) held.kilograms = kilograms;
    }
  });
}

/** Advances until a Plant is waiting for tank space, within the time given. */
function untilWaiting(campaign: Campaign, id: string): void {
  for (let minutes = 0; minutes < 2 * EARTH_DAY; minutes++) {
    const stop = typed(campaign.snapshot(), id).plant?.stoppedFor;
    if (stop?.reason === "output-full") return;
    campaign.advance(1);
  }
  throw new Error(`The ${id} never waited for tank space.`);
}

describe("the storage limit in the data catalogue", () => {
  it("is 400 kg of water and 100 kg of oxygen", () => {
    expect(
      catalogue.lifeSupportStocks.map((type) => [
        type.id,
        type.storageLimitKilograms,
      ]),
    ).toEqual([
      ["oxygen", OXYGEN_LIMIT],
      ["water", WATER_LIMIT],
    ]);
  });
});

describe("a Plant whose only output is full", () => {
  it("makes the stock up to the limit, then waits, taking no input and drawing no power, and says it is waiting for tank space", () => {
    const campaign = withStocks(base(), { water: WATER_LIMIT - 5 });

    untilWaiting(campaign, "water-processing-plant");

    const state = campaign.snapshot();
    const plant = typed(state, "water-processing-plant");
    const water = stock(state, "water");
    // No batch that wouldn't fit was started, so no water was wasted on it.
    expect(water).toBeLessThanOrEqual(WATER_LIMIT);
    expect(water).toBeGreaterThan(WATER_LIMIT - WATER_BATCH - 1e-9);
    expect(plant.powered).toBe(false);
    expect(plant.plant?.stoppedFor).toEqual({
      reason: "output-full",
      resource: { kind: "life-support", stockId: "water" },
      kilograms: water,
      limitKilograms: WATER_LIMIT,
    });
    if (plant.plant === undefined) throw new Error("expected a Plant");
    expect(formatPlant(plant.plant)).toBe(
      `waiting for tank space: Water is ${water.toFixed(1)} of ${WATER_LIMIT} kg`,
    );

    const ice = bulk(state, "water-ice");
    const electrolysisRan = () =>
      typed(campaign.snapshot(), "electrolysis-plant").plant?.batch;
    campaign.advance(2 * HOUR);
    // It takes no ice for a batch that has no room: only the other Plant does.
    expect(electrolysisRan()).toBeDefined();
    expect(typed(campaign.snapshot(), "water-processing-plant").powered).toBe(
      false,
    );
    expect(bulk(campaign.snapshot(), "water-ice")).toBeLessThan(ice);
  });

  it("starts again by itself once there is room for a whole batch", () => {
    const campaign = withStocks(base(), { water: WATER_LIMIT - 2 });
    untilWaiting(campaign, "water-processing-plant");

    // A batch takes about six Earth Hours of drinking to make room for.
    let ran = false;
    for (let hours = 0; hours < 24 && !ran; hours++) {
      campaign.advance(HOUR);
      ran = typed(campaign.snapshot(), "water-processing-plant").powered;
    }

    expect(ran).toBe(true);
    expect(stock(campaign.snapshot(), "water")).toBeLessThanOrEqual(
      WATER_LIMIT,
    );
  });

  it("leaves room for what other Plants' batches will make, so that two can't overfill it", () => {
    // Room for one of the two water-processing plants' batches, but not both.
    const planned = base();
    const built = planned.planConstruction({
      structureTypeId: "water-processing-plant",
      position: { x: -25, y: 60 },
    });
    if (!built.ok) throw new Error(built.message);
    for (let hours = 0; planned.snapshot().constructions.length > 0; hours++) {
      if (hours > 10 * 24) throw new Error("The Construction never finished.");
      planned.advance(HOUR);
    }
    const campaign = withStocks(planned, { water: WATER_LIMIT - 1.5 });

    campaign.advance(2);

    const working = campaign
      .snapshot()
      .structures.filter(
        (structure) =>
          structure.structureTypeId === "water-processing-plant" &&
          structure.plant?.batch !== undefined,
      );
    expect(working).toHaveLength(1);
  });

  it("finishes a batch it has started when something else fills the store, keeping what fits and losing the rest", () => {
    const running = withStocks(base(), { water: 200 });
    running.advance(1);
    expect(typed(running.snapshot(), "water-processing-plant").powered).toBe(
      true,
    );
    const campaign = withStocks(running, { water: WATER_LIMIT - 0.1 });

    campaign.advance(HOUR);

    const state = campaign.snapshot();
    expect(stock(state, "water")).toBeLessThanOrEqual(WATER_LIMIT);
    expect(stock(state, "water")).toBeGreaterThan(WATER_LIMIT - 0.1);
    expect(typed(state, "water-processing-plant").plant?.batch).toBeUndefined();
  });

  it("doesn't wait for tank space while it has too little of an input to run anyway", () => {
    const campaign = changed(
      withStocks(base(), { water: WATER_LIMIT }),
      (s) => {
        for (const held of s.bulkResources) {
          if (held.resourceId === "water-ice") held.kilograms = 0;
        }
      },
    );

    campaign.advance(5);

    expect(
      typed(campaign.snapshot(), "water-processing-plant").plant?.stoppedFor
        ?.reason,
    ).toBe("no-input");
  });
});

describe("a Plant with several outputs", () => {
  /** The base with an extraction plant in place of the others, with Regolith to use. */
  function withExtractionPlant(): Campaign {
    const campaign = withStocks(base(), { oxygen: OXYGEN_LIMIT });
    const planned = campaign.planConstruction({
      structureTypeId: "extraction-plant",
      position: { x: -25, y: 60 },
    });
    if (!planned.ok) throw new Error(planned.message);
    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 10 * 24) throw new Error("The Construction never finished.");
      campaign.advance(HOUR);
    }
    const switched = campaign.switchPlant(
      typed(campaign.snapshot(), "electrolysis-plant").id,
      "off",
    );
    if (!switched.ok) throw new Error(switched.message);
    return changed(campaign, (state) => {
      for (const held of state.bulkResources) {
        if (held.resourceId === "regolith") held.kilograms = 20_000;
      }
      for (const held of state.lifeSupport) {
        if (held.stockId === "oxygen") held.kilograms = OXYGEN_LIMIT;
      }
    });
  }

  it("keeps running when one is full, discarding what doesn't fit, so that oxygen can't block metals", () => {
    const campaign = withExtractionPlant();
    const metals = bulk(campaign.snapshot(), "metals");

    campaign.advance(3 * HOUR);

    const state = campaign.snapshot();
    expect(typed(state, "extraction-plant").powered).toBe(true);
    expect(bulk(state, "metals")).toBeGreaterThan(metals);
    expect(stock(state, "oxygen")).toBeLessThanOrEqual(OXYGEN_LIMIT);
    expect(stock(state, "oxygen")).toBeGreaterThan(OXYGEN_LIMIT - 1);
  });

  it("counts all that it made of the full stock as made, for self-sufficiency", () => {
    const campaign = withExtractionPlant();
    const made = () =>
      (
        JSON.parse(campaign.save()) as {
          state: {
            selfSufficiency: {
              stockId: string;
              current: { producedKilograms: number };
            }[];
          };
        }
      ).state.selfSufficiency.find((s) => s.stockId === "oxygen")?.current
        .producedKilograms ?? Number.NaN;
    // Early in a record, so that it isn't closed in the hours played here.
    campaign.advance(
      6 * HOUR - (campaign.snapshot().clock.elapsedMinutes % (6 * HOUR)),
    );
    const start = made();

    campaign.advance(3 * HOUR);

    expect(made() - start).toBeGreaterThanOrEqual(3 * EXTRACTED_OXYGEN - 1e-9);
  });

  it("holds the stock full in the forecast, as it can't rise any further", () => {
    const campaign = withExtractionPlant();

    campaign.advance(2 * HOUR);

    const forecast = campaign
      .forecasts()
      .lifeSupport.find(({ stockId }) => stockId === "oxygen");
    expect(forecast).toMatchObject({
      holdingFull: true,
      kilogramsPerEarthDay: 0,
    });
    expect(forecast?.minutesUntilEmpty).toBeUndefined();
  });
});

describe("the forecasts of a stock held full", () => {
  it("say it is holding full, rather than rising or running out", () => {
    const campaign = withStocks(base(), { water: WATER_LIMIT });
    campaign.advance(5);

    const state = campaign.snapshot();
    const forecasts = campaign.forecasts().lifeSupport;
    const forecast = forecasts.find(({ stockId }) => stockId === "water");
    const stat = state.lifeSupport.find(({ stockId }) => stockId === "water");
    if (stat === undefined) throw new Error("expected water");

    expect(forecast).toMatchObject({
      holdingFull: true,
      kilogramsPerEarthDay: 0,
    });
    expect(forecast?.minutesUntilEmpty).toBeUndefined();
    const said = formatLifeSupport(stat, forecast, state.missionDirector);
    expect(said.value).toBe(`${stat.kilograms.toFixed(1)} of 400 kg`);
    expect(said.note).toBe("holding full");
    expect(
      summariseMissionDirector(
        state.missionDirector,
        state.lifeSupport,
        forecasts,
      ),
    ).toContain("H₂O full");
  });

  it("go back to a forecast of its running out once no Plant can make it", () => {
    const campaign = withStocks(base(), { water: WATER_LIMIT });
    campaign.advance(5);

    // At once, even with the game paused.
    const switched = campaign.switchPlant(
      typed(campaign.snapshot(), "water-processing-plant").id,
      "off",
    );
    if (!switched.ok) throw new Error(switched.message);

    const forecast = campaign
      .forecasts()
      .lifeSupport.find(({ stockId }) => stockId === "water");
    expect(forecast?.holdingFull).toBe(false);
    expect(forecast?.minutesUntilEmpty).toBeGreaterThan(100 * EARTH_DAY);
  });

  it("say so of a stock over the limit too, and the panel shows it against the limit", () => {
    const campaign = withStocks(base(), { water: WATER_LIMIT + 50 });
    campaign.advance(5);
    const state = campaign.snapshot();
    const stat = state.lifeSupport.find(({ stockId }) => stockId === "water");
    if (stat === undefined) throw new Error("expected water");

    const said = formatLifeSupport(
      stat,
      campaign.forecasts().lifeSupport.find((f) => f.stockId === "water"),
      state.missionDirector,
    );

    expect(said.value).toBe("450.0 of 400 kg");
    expect(said.note).toBe("holding full, over the limit");
  });
});

describe("self-sufficiency while a stock is full", () => {
  it("isn't lost over a whole Lunation of holding full, and reaches the Water and Oxygen self-sufficiency Milestones", () => {
    const campaign = withStocks(base(), {
      water: WATER_LIMIT * 2,
      oxygen: OXYGEN_LIMIT * 2,
    });

    const events: GameEvent[] = [
      ...campaign.advance(windowMinutes + 2 * EARTH_DAY),
    ];

    const state = campaign.snapshot();
    // Over the limit throughout, so the Plants never ran.
    expect(stock(state, "water")).toBeGreaterThan(WATER_LIMIT);
    expect(stock(state, "oxygen")).toBeGreaterThan(OXYGEN_LIMIT);
    expect(
      state.selfSufficiency.map(({ stockId, selfSufficient }) => [
        stockId,
        selfSufficient,
      ]),
    ).toEqual([
      ["oxygen", true],
      ["water", true],
    ]);
    expect(state.milestones.reachedIds).toEqual(
      expect.arrayContaining([
        "oxygen-self-sufficient",
        "water-self-sufficient",
      ]),
    );
    expect(events.map(({ kind }) => kind)).not.toContain(
      "self-sufficiency-lost",
    );
  });

  it("holds with a Plant going in and out of waiting at the limit", () => {
    const campaign = withStocks(base(), {
      water: WATER_LIMIT,
      oxygen: OXYGEN_LIMIT,
    });

    campaign.advance(windowMinutes + 2 * EARTH_DAY);

    expect(
      campaign.snapshot().selfSufficiency.map((s) => s.selfSufficient),
    ).toEqual([true, true]);
    // What the Mission Director uses is made up, and no more than that is taken.
    expect(stock(campaign.snapshot(), "water")).toBeGreaterThan(
      WATER_LIMIT - 50,
    );
  });

  it("gives a switched-off Plant no credit for it, however full the store", () => {
    const campaign = withStocks(base(), { water: WATER_LIMIT * 2 });
    const switched = campaign.switchPlant(
      typed(campaign.snapshot(), "water-processing-plant").id,
      "off",
    );
    if (!switched.ok) throw new Error(switched.message);

    campaign.advance(windowMinutes + 2 * EARTH_DAY);

    const water = campaign
      .snapshot()
      .selfSufficiency.find(({ stockId }) => stockId === "water");
    expect(water?.selfSufficient).toBe(false);
    expect(water?.coveredShare).toBe(0);
  });
});

describe("a save with a stock already over a limit", () => {
  it("keeps the stock, with its Plants waiting until it falls, and no batch or landing takes any away", () => {
    const campaign = withStocks(base(), { water: WATER_LIMIT + 7 });

    campaign.advance(EARTH_DAY);

    const after = stock(campaign.snapshot(), "water");
    expect(after).toBeCloseTo(WATER_LIMIT + 7 - WATER_USE_PER_EARTH_DAY, 5);
    expect(
      typed(campaign.snapshot(), "water-processing-plant").plant?.stoppedFor
        ?.reason,
    ).toBe("output-full");

    campaign.advance(2 * EARTH_DAY);
    // By now there is room, and the Plant makes the stock up again.
    const water = stock(campaign.snapshot(), "water");
    expect(water).toBeLessThanOrEqual(WATER_LIMIT);
    expect(water).toBeGreaterThan(WATER_LIMIT - WATER_BATCH - 1);
  });

  it("doesn't lose what is over the limit when a batch under way finishes into it", () => {
    const running = withStocks(base(), { oxygen: 10 });
    running.advance(1);
    const campaign = withStocks(running, { oxygen: OXYGEN_LIMIT + 30 });

    campaign.advance(HOUR);

    expect(stock(campaign.snapshot(), "oxygen")).toBeGreaterThan(
      OXYGEN_LIMIT + 29,
    );
    expect(
      typed(campaign.snapshot(), "electrolysis-plant").plant?.batch,
    ).toBeUndefined();
  });
});

describe("what a Launch brings", () => {
  /** Sends the Lander with the manifest, and plays until it lands, returning that game-minute's events and those after it. */
  function land(campaign: Campaign): GameEvent[] {
    const sent = campaign.sendLander();
    if (!sent.ok) throw new Error(sent.message);
    for (let hours = 0; hours < 30 * 24; hours++) {
      const events = campaign.advance(HOUR);
      if (events.some(({ kind }) => kind === "lander-landed"))
        return [...events];
    }
    throw new Error("The Lander never landed.");
  }

  function setManifest(campaign: Campaign, water: number, oxygen = 0): void {
    const set = campaign.setLaunchManifest([
      { itemId: "water", count: water },
      { itemId: "oxygen", count: oxygen },
    ]);
    if (!set.ok) throw new Error(set.message);
  }

  it("is warned of on the manifest, with what doesn't fit, but not refused", () => {
    const campaign = withStocks(base(), { water: WATER_LIMIT - 40 });
    setManifest(campaign, 1);
    const { launchManifest } = campaign.snapshot();

    expect(launchManifest.overLimits).toEqual([
      { stockId: "water", kilograms: 50, spaceKilograms: 40 },
    ]);
    expect(formatLaunchStorage(launchManifest)).toBe(
      "Water: 50 kg on the manifest, room for 40 kg. What doesn't fit is lost on landing.",
    );
  });

  it("gives no warning with room for it all", () => {
    const campaign = withStocks(base(), { water: 200, oxygen: 10 });
    setManifest(campaign, 2, 1);

    const { launchManifest } = campaign.snapshot();
    expect(launchManifest.overLimits).toEqual([]);
    expect(formatLaunchStorage(launchManifest)).toBeUndefined();
  });

  it("stops at the limit on landing, the rest being lost, and says so", () => {
    const campaign = withStocks(base(), { water: WATER_LIMIT, oxygen: 90 });
    // No Plant to fill the room the Mission Director's use makes meanwhile.
    for (const id of ["water-processing-plant", "electrolysis-plant"]) {
      const off = campaign.switchPlant(
        typed(campaign.snapshot(), id).id,
        "off",
      );
      if (!off.ok) throw new Error(off.message);
    }
    setManifest(campaign, 1, 1);

    const events = land(campaign);

    const state = campaign.snapshot();
    expect(stock(state, "water")).toBeLessThanOrEqual(WATER_LIMIT);
    expect(stock(state, "water")).toBeGreaterThan(WATER_LIMIT - 1);
    expect(stock(state, "oxygen")).toBeLessThanOrEqual(OXYGEN_LIMIT);
    expect(stock(state, "oxygen")).toBeGreaterThan(OXYGEN_LIMIT - 1);
    const lost = events.filter((event) => event.kind === "lost-on-landing");
    expect(lost.map((event) => event.stockId)).toEqual(["oxygen", "water"]);
    const water = lost[1];
    if (water === undefined) throw new Error("expected water lost");
    expect(formatEvent(water)).toMatch(
      /^The base had no room for \d+(\.\d)? kg of the water the Lander brought, and it was lost$/,
    );
  });

  it("loses all that it brings of a stock already over its limit, leaving the stock as it is", () => {
    const campaign = withStocks(base(), { water: WATER_LIMIT + 200 });
    setManifest(campaign, 1);
    const before = stock(campaign.snapshot(), "water");

    land(campaign);

    expect(stock(campaign.snapshot(), "water")).toBeLessThan(before);
    expect(stock(campaign.snapshot(), "water")).toBeGreaterThan(WATER_LIMIT);
  });
});
