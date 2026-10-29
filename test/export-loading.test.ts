import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type Campaign,
  type ExportLine,
  type ExportLoadingSnapshot,
  type GameEvent,
  type GroundPosition,
  type ManifestLine,
  type RobotActivity,
  type Snapshot,
} from "../src/simulation";
import {
  describeExportLoading,
  formatEvent,
  formatLander,
  formatReturnMass,
} from "../src/ui/format";
import { scenario, type Scenario } from "./scenario";
import { changed, worn } from "./worn";

// The Mission Director has to live in the Habitat through several round
// trips, and the Funding has to pay for more than one Launch. Dust wears
// nothing down, so that only Maintenance a test raises comes before the
// loading.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { safeHabitat } = await import("./safe-habitat");
  const { withoutDust } = await import("./without-dust");
  return {
    ...actual,
    catalogue: {
      ...safeHabitat(withoutDust(actual.catalogue), [
        "power",
        "radiation",
        "life-support",
        "solar-particle-events",
      ]),
      programmeGrantMillionDollars: 2000,
    },
  };
});

const padSite: GroundPosition = { x: 40, y: 25 };
const habitatSite: GroundPosition = { x: 60, y: -10 };
const mastSite: GroundPosition = { x: 10, y: 10 };
const returnMass = catalogue.lander.returnMassKilograms;
const handlingMinutes = Math.round(catalogue.lander.exportHandlingHours * 60);

const padType = catalogue.structureTypes.find((type) => type.landingPad);
if (padType === undefined) throw new Error("expected a landing pad");
const padComponents: ManifestLine[] = padType.components.map((need) => ({
  itemId: need.componentId,
  count: need.count,
}));

/** Runs the game until the Robot has carried out every planned Construction. */
function buildAll(game: Scenario): Scenario {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
  return game;
}

/** Skips from event to event until one of the kind happens, returning every event on the way. */
function skipUntil(campaign: Campaign, kind: GameEvent["kind"]): GameEvent[] {
  const events: GameEvent[] = [];
  for (let skips = 0; !events.some((event) => event.kind === kind); skips++) {
    if (skips > 200) throw new Error(`No ${kind} event came.`);
    events.push(...campaign.advanceToNextEvent());
  }
  return events;
}

function eventOf<K extends GameEvent["kind"]>(
  events: readonly GameEvent[],
  kind: K,
): Extract<GameEvent, { kind: K }> {
  const found = events.find(
    (event): event is Extract<GameEvent, { kind: K }> => event.kind === kind,
  );
  if (found === undefined) throw new Error(`expected a ${kind} event`);
  return found;
}

function send(campaign: Campaign): void {
  const result = campaign.sendLander();
  if (!result.ok) throw new Error(result.message);
}

function load(campaign: Campaign, exports: readonly ExportLine[]): void {
  const result = campaign.loadExports(exports);
  if (!result.ok) throw new Error(result.message);
}

const wafers = (kilograms: number): ExportLine[] => [
  { resourceId: "wafers", kilograms },
];

function wafersInStock(state: Snapshot): number {
  return (
    state.bulkResources.find((stock) => stock.resourceId === "wafers")
      ?.kilograms ?? Number.NaN
  );
}

/**
 * Saves of the Mission Director in a Habitat with a commissioned landing
 * pad: first with the Lander still at the landing site, back from bringing
 * the pad's Components, then landed on the pad after another round trip.
 * Made once, as they take a while to play through.
 */
const saves = (() => {
  let made: { site: string; pad: string } | undefined;
  return () => {
    if (made !== undefined) return made;
    const game = buildAll(
      scenario().plan("habitat", habitatSite).plan("light-mast", mastSite),
    );
    const habitat = game.state.structures.find(
      (structure) => structure.structureTypeId === "habitat",
    );
    const movedIn = game.campaign.moveMissionDirectorIn(habitat?.id ?? "");
    if (!movedIn.ok) throw new Error(movedIn.message);
    const manifest = game.campaign.setLaunchManifest(padComponents);
    if (!manifest.ok) throw new Error(manifest.message);
    send(game.campaign);
    skipUntil(game.campaign, "lander-landed");
    buildAll(game.plan(padType.id, padSite));
    const site = game.campaign.save();
    send(game.campaign);
    skipUntil(game.campaign, "lander-landed");
    made = { site, pad: game.campaign.save() };
    return made;
  };
})();

/** A Campaign from a save, with the wafers in the base's stock set as given, as if its Plants had made them. */
function from(save: string, kilograms: number): Campaign {
  const loaded = loadCampaign(save);
  if (!loaded.ok) throw new Error(loaded.message);
  return withWafers(loaded.campaign, kilograms);
}

function withWafers(campaign: Campaign, kilograms: number): Campaign {
  return changed(campaign, (state) => {
    for (const stock of state.bulkResources) {
      if (stock.resourceId === "wafers") stock.kilograms = kilograms;
    }
  });
}

/** The Lander landed on the landing pad, free to fly, with the wafers given in stock. */
function onPad(kilograms: number): Campaign {
  const campaign = from(saves().pad, kilograms);
  expect(campaign.snapshot().lander).toMatchObject({
    state: "landed-free",
    position: padSite,
    cargo: [],
  });
  return campaign;
}

/** Plays a game-minute at a time until the condition holds, returning every event on the way. */
function advanceUntil(
  campaign: Campaign,
  done: (state: Snapshot) => boolean,
): GameEvent[] {
  const events: GameEvent[] = [];
  for (let minutes = 0; !done(campaign.snapshot()); minutes++) {
    if (minutes > 2 * 24 * 60) throw new Error("It never happened.");
    events.push(...campaign.advance(1));
  }
  return events;
}

function loadingOf(state: Snapshot): ExportLoadingSnapshot {
  if (state.exportLoading === undefined) throw new Error("expected a loading");
  return state.exportLoading;
}

const collected = (state: Snapshot) => state.exportLoading?.collected === true;
const aboard = (state: Snapshot) => state.exportLoading === undefined;

/** What the Robot is doing, in words for comparing: its activity, and where it is walking to. */
function doing(activity: RobotActivity | undefined): string {
  if (activity === undefined) return "nothing";
  return "destination" in activity
    ? `${activity.kind} to the ${activity.destination}`
    : activity.kind;
}

describe("Exports to load with the Lander on a landing pad", () => {
  it("raise a loading Work Order: the Robot walks to the stockpile, loads them, carries them to the Lander and puts them aboard", () => {
    const campaign = onPad(60);
    const padId = campaign.snapshot().lander.landingPadId;

    load(campaign, wafers(40));

    let state = campaign.snapshot();
    expect(state.exportLoading).toEqual({
      landingPadId: padId,
      collected: false,
      stageProgress: 0,
      exports: wafers(40),
    });
    expect(wafersInStock(state)).toBe(60);
    expect(state.exports.aboard).toEqual([]);
    expect(describeExportLoading(loadingOf(state), state)).toBe(
      "Waiting for the Robot to load 40 kg of wafers at the stockpile",
    );

    const steps: string[] = [];
    const minutesDoing = new Map<string, number>();
    const events: GameEvent[] = [];
    let carrying: Snapshot | undefined;
    for (let minutes = 0; campaign.snapshot().exportLoading; minutes++) {
      if (minutes > 24 * 60) throw new Error("The Exports never went aboard.");
      events.push(...campaign.advance(1));
      state = campaign.snapshot();
      const step = doing(state.robots[0]?.activity);
      if (steps.at(-1) !== step) steps.push(step);
      minutesDoing.set(step, (minutesDoing.get(step) ?? 0) + 1);
      if (step === "walking to the lander") carrying ??= state;
    }

    expect(steps).toEqual([
      "walking to the stockpile",
      "loading-exports",
      "walking to the lander",
      "putting-exports-aboard",
    ]);
    expect(minutesDoing.get("loading-exports")).toBe(
      Math.floor(handlingMinutes / 2),
    );
    expect(minutesDoing.get("putting-exports-aboard")).toBe(
      handlingMinutes - Math.floor(handlingMinutes / 2),
    );
    // The stock falls as the Robot loads them, and it is seen carrying them.
    if (carrying === undefined) throw new Error("expected a carrying state");
    expect(wafersInStock(carrying)).toBe(20);
    expect(carrying.robots[0]?.carryingExports).toEqual(wafers(40));
    expect(carrying.exports.aboard).toEqual([]);
    expect(carrying.exportLoading).toMatchObject({ collected: true });
    expect(describeExportLoading(loadingOf(carrying), carrying)).toBe(
      "Robot carrying 40 kg of wafers to the Lander",
    );

    const loaded = eventOf(events, "lander-loaded");
    expect(loaded).toEqual({
      kind: "lander-loaded",
      atMinute: state.clock.elapsedMinutes,
      exports: wafers(40),
    });
    expect(formatEvent(loaded)).toBe(
      "Robot loaded the Lander: 40 kg of wafers now aboard",
    );
    expect(state.exports).toMatchObject({ toLoad: [], aboard: wafers(40) });
    expect(state.robots[0]?.carryingExports).toEqual([]);
    expect(wafersInStock(state)).toBe(20);
    expect(formatReturnMass(state.exports)).toBe(
      `Return Mass: 40 of ${returnMass} kg`,
    );
    expect(
      formatLander(
        state.lander,
        state.clock.elapsedMinutes,
        state.exports.aboard,
        state.exportLoading,
      ),
    ).toEqual({
      value: "landed on the landing pad with 40 kg of wafers aboard",
      note: "free to fly",
    });

    send(campaign);
    const takeOff = eventOf(
      skipUntil(campaign, "lander-took-off"),
      "lander-took-off",
    );
    expect(takeOff.exports).toEqual(wafers(40));
    expect(wafersInStock(campaign.snapshot())).toBe(20);
  });

  it("can't be sent while the Robot is loading them, until they are aboard", () => {
    const campaign = onPad(60);
    load(campaign, wafers(40));
    const refusal = {
      ok: false,
      reason: "exports-loading",
      message:
        "The Exports to load aren't aboard yet. The Robot has to finish loading them onto the Lander first.",
    };

    expect(campaign.sendLander()).toEqual(refusal);
    const state = campaign.snapshot();
    expect(
      formatLander(
        state.lander,
        state.clock.elapsedMinutes,
        state.exports.aboard,
        state.exportLoading,
      ),
    ).toEqual({
      value: "landed on the landing pad",
      note: "waiting for the Robot to load 40 kg of wafers",
    });
    advanceUntil(campaign, collected);
    expect(campaign.sendLander()).toEqual(refusal);

    advanceUntil(campaign, aboard);
    expect(campaign.sendLander()).toEqual({ ok: true });
  });

  it("come after Maintenance raised after them, as every Work Order does", () => {
    const set = onPad(60);
    load(set, wafers(40));
    const mast = set
      .snapshot()
      .structures.find(
        (structure) => structure.structureTypeId === "light-mast",
      );
    // With spare Components enough for it, and for any other Maintenance.
    const campaign = worn(set, mast?.id ?? "", 40, 20);

    const events = advanceUntil(
      campaign,
      (state) => state.maintenance.length === 0,
    );

    const state = campaign.snapshot();
    expect(state.exportLoading).toMatchObject({
      collected: false,
      stageProgress: 0,
    });
    expect(wafersInStock(state)).toBe(60);
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "maintenance-completed",
        target: expect.objectContaining({ structureId: mast?.id }) as unknown,
      }),
    );
    advanceUntil(campaign, aboard);
    expect(campaign.snapshot().exports.aboard).toEqual(wafers(40));
  });

  it("carry the new amounts when they change before the Robot has loaded them", () => {
    const campaign = onPad(60);
    load(campaign, wafers(40));
    campaign.advance(5);

    load(campaign, wafers(25));

    expect(campaign.snapshot().exportLoading?.exports).toEqual(wafers(25));
    const events = advanceUntil(campaign, aboard);
    expect(eventOf(events, "lander-loaded").exports).toEqual(wafers(25));
    expect(wafersInStock(campaign.snapshot())).toBe(35);
  });

  it("cancel the Work Order when they are cleared before the Robot has loaded them", () => {
    const campaign = onPad(60);
    load(campaign, wafers(40));
    campaign.advance(5);

    load(campaign, []);

    expect(campaign.snapshot().exportLoading).toBeUndefined();
    campaign.advance(1);
    expect(campaign.snapshot().robots[0]?.activity).toEqual({ kind: "idle" });
    expect(campaign.sendLander()).toEqual({ ok: true });
    skipUntil(campaign, "lander-took-off");
    expect(campaign.snapshot().exports.aboard).toEqual([]);
    expect(wafersInStock(campaign.snapshot())).toBe(60);
  });

  it("can't be changed once the Robot has loaded them, until they are aboard", () => {
    const campaign = onPad(60);
    load(campaign, wafers(40));
    advanceUntil(campaign, collected);

    for (const exports of [wafers(25), []]) {
      expect(campaign.loadExports(exports)).toEqual({
        ok: false,
        reason: "exports-collected",
        message:
          "The Robot is already carrying the Exports to load to the Lander. More can be loaded once they're aboard.",
      });
    }
    expect(campaign.snapshot().exports.toLoad).toEqual(wafers(40));
  });

  it("are still worth what the Robot carries once it has taken them out of the base's stock", () => {
    const campaign = onPad(40);
    load(campaign, wafers(40));
    advanceUntil(campaign, collected);

    const state = campaign.snapshot();
    expect(wafersInStock(state)).toBe(0);
    expect(state.exports.valueMillionDollars).toBe(
      40 *
        (catalogue.exports.find((sold) => sold.resourceId === "wafers")
          ?.priceMillionDollarsPerKilogram ?? Number.NaN),
    );
  });

  it("are as much as is left, if the stock has fallen below them before the Robot loads them", () => {
    const set = onPad(60);
    load(set, wafers(40));
    const campaign = withWafers(set, 25);

    const events = advanceUntil(campaign, aboard);

    expect(eventOf(events, "lander-loaded").exports).toEqual(wafers(25));
    expect(wafersInStock(campaign.snapshot())).toBe(0);
    expect(campaign.snapshot().exports.aboard).toEqual(wafers(25));
  });

  it("can be set again once they are aboard, going aboard with them in another round of loading, within the Return Mass", () => {
    const campaign = onPad(80);
    load(campaign, wafers(40));
    advanceUntil(campaign, aboard);

    expect(campaign.loadExports(wafers(returnMass - 30))).toEqual({
      ok: false,
      reason: "over-return-mass",
      message: `That would bring the Exports to ${returnMass + 10} kg with the 40 kg aboard, over the Lander's Return Mass of ${returnMass} kg.`,
    });
    load(campaign, wafers(20));

    expect(campaign.snapshot().exportLoading).toMatchObject({
      collected: false,
      exports: wafers(20),
    });
    expect(formatReturnMass(campaign.snapshot().exports)).toBe(
      `Return Mass: 60 of ${returnMass} kg`,
    );
    const events = advanceUntil(campaign, aboard);
    expect(eventOf(events, "lander-loaded").exports).toEqual(wafers(20));
    expect(campaign.snapshot().exports.aboard).toEqual(wafers(60));
    expect(wafersInStock(campaign.snapshot())).toBe(20);
  });

  it("carry on loading exactly as they would have after saving and loading", () => {
    const campaign = onPad(60);
    load(campaign, wafers(40));
    advanceUntil(campaign, collected);
    campaign.advance(2);

    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.campaign.snapshot()).toEqual(campaign.snapshot());

    expect(loaded.campaign.advance(12 * 60)).toEqual(campaign.advance(12 * 60));
    expect(loaded.campaign.snapshot()).toEqual(campaign.snapshot());
    expect(campaign.snapshot().exports.aboard).toEqual(wafers(40));
  });
});

describe("Exports to load with the Lander at the landing site", () => {
  it("raise no Work Order, and go aboard as the Lander takes off, even once a landing pad is built", () => {
    const campaign = from(saves().site, 60);
    expect(campaign.snapshot().lander).toMatchObject({
      state: "landed-free",
      landingPadId: undefined,
    });

    load(campaign, wafers(40));
    campaign.advance(3 * 60);

    expect(campaign.snapshot().exportLoading).toBeUndefined();
    expect(wafersInStock(campaign.snapshot())).toBe(60);
    send(campaign);
    const takeOff = eventOf(
      skipUntil(campaign, "lander-took-off"),
      "lander-took-off",
    );
    expect(takeOff.exports).toEqual(wafers(40));
    expect(wafersInStock(campaign.snapshot())).toBe(20);
  });
});

describe("Exports both aboard and to load as the Lander takes off from the landing site", () => {
  const waferPrice =
    catalogue.exports.find((sold) => sold.resourceId === "wafers")
      ?.priceMillionDollarsPerKilogram ?? Number.NaN;
  const waterPrice =
    catalogue.launch.items.find((item) => item.id === "water")
      ?.priceMillionDollars ?? Number.NaN;
  const water: ManifestLine[] = [{ itemId: "water", count: 1 }];
  const cost = catalogue.launch.feeMillionDollars + waterPrice;
  // 0.3 kg aboard and 21.6 kg to load, which the Lander sells as one line,
  // for a hair less than the two lines' values added up.
  const kilogramsAboard = 0.3;
  const kilogramsToLoad = 21.6;
  const sale = waferPrice * (kilogramsAboard + kilogramsToLoad);
  const valuedApart =
    waferPrice * kilogramsAboard + waferPrice * kilogramsToLoad;

  /**
   * The Lander back on the landing pad with wafers aboard, the pad then
   * Broken, so that it takes off as from the landing site, and a manifest
   * of water set against the Funding given and more wafers to load, which
   * are then lowered.
   */
  function aboardAndToLoad(fundingMillionDollars: number): Campaign {
    const loading = onPad(60);
    load(loading, wafers(kilogramsAboard));
    advanceUntil(loading, aboard);
    const pad = loading
      .snapshot()
      .structures.find(
        (structure) => structure.structureTypeId === padType?.id,
      );
    const campaign = changed(worn(loading, pad?.id ?? "", 0), (state) => {
      state.fundingMillionDollars = fundingMillionDollars;
    });
    load(campaign, wafers(30));
    const manifest = campaign.setLaunchManifest(water);
    if (!manifest.ok) throw new Error(manifest.message);
    load(campaign, wafers(kilogramsToLoad));
    return campaign;
  }

  it("are valued as they will be sold, so the Lander can't leave with a manifest the sale falls short of by a hair", () => {
    // The most Funding that, with the sale, falls short of the cost.
    let funding = cost - sale;
    while (funding + sale >= cost) funding = nextBelow(funding);
    expect(funding + valuedApart).toBeGreaterThanOrEqual(cost);
    const campaign = aboardAndToLoad(funding);

    expect(campaign.sendLander()).toMatchObject({
      ok: false,
      reason: "over-funding",
    });
  });

  it("pay for a manifest the sale just covers, leaving no Funding below none", () => {
    const funding = cost - sale;
    expect(funding + sale).toBeGreaterThanOrEqual(cost);
    const campaign = aboardAndToLoad(funding);

    send(campaign);
    const takeOff = eventOf(
      skipUntil(campaign, "lander-took-off"),
      "lander-took-off",
    );
    skipUntil(campaign, "lander-left-earth");

    expect(takeOff.exports).toEqual(wafers(kilogramsAboard + kilogramsToLoad));
    expect(campaign.snapshot().fundingMillionDollars).toBeGreaterThanOrEqual(0);
  });
});

/** The next number below a positive one that a double can hold. */
function nextBelow(value: number): number {
  const bits = new BigInt64Array(new Float64Array([value]).buffer);
  bits[0] = (bits[0] ?? 0n) - 1n;
  return new Float64Array(bits.buffer)[0] ?? Number.NaN;
}
