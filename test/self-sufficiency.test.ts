import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  createCampaign,
  loadCampaign,
  lunationMinutes,
  type Campaign,
  type GameEvent,
  type GroundPosition,
  type SelfSufficiencySnapshot,
} from "../src/simulation";
import { DEFAULT_SEED } from "./scenario";
import { changed } from "./worn";

// Only the Plants and the Mission Director change the oxygen and water:
// nothing wears down, the Robot digs no Regolith, and the Habitat needs no
// power and keeps the Mission Director alive for as long as a test runs.
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
      ["power", "radiation", "life-support", "solar-particle-events"],
    ),
  };
});

const windowMinutes =
  lunationMinutes(catalogue.lunation).lunation *
  catalogue.selfSufficiency.windowLunations;
const recordMinutes = catalogue.selfSufficiency.recordHours * 60;
const plans: readonly [string, GroundPosition][] = [
  ["solar-array", { x: 20, y: 12 }],
  ["battery-bank", { x: -30, y: 4 }],
  ["habitat", { x: 30, y: -30 }],
  ["extraction-plant", { x: 30, y: 22 }],
  ["water-processing-plant", { x: -25, y: 20 }],
];

/**
 * The saved text of a base with an extraction plant and a water-processing
 * plant built from Components brought as Launches would, Regolith and water
 * ice in stock, and, if asked, the Mission Director moved into its Habitat.
 * Built once for each, and loaded afresh for each test.
 */
const bases = new Map<boolean, string>();
function base(movedIn = true): Campaign {
  let text = bases.get(movedIn);
  if (text === undefined) {
    const campaign = changed(
      createCampaign({ seed: DEFAULT_SEED }),
      (state) => {
        for (const type of catalogue.structureTypes) {
          if (type.recipes === undefined) continue;
          for (const need of type.components) {
            const stock = state.stockpile.components.find(
              (candidate) => candidate.componentId === need.componentId,
            );
            if (stock !== undefined) stock.count += need.count;
          }
        }
      },
    );
    for (const [structureTypeId, position] of plans) {
      const planned = campaign.planConstruction({ structureTypeId, position });
      if (!planned.ok) throw new Error(planned.message);
    }
    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 10 * 24) throw new Error("The Constructions never finished.");
      campaign.advance(60);
    }
    if (movedIn) {
      const habitat = campaign
        .snapshot()
        .structures.find(
          (structure) => structure.structureTypeId === "habitat",
        );
      const result = campaign.moveMissionDirectorIn(habitat?.id ?? "");
      if (!result.ok) throw new Error(result.message);
    }
    text = withStocks(campaign, { regolith: 20_000, ice: 5_000 }).save();
    bases.set(movedIn, text);
  }
  return loaded(text);
}

function withStocks(
  campaign: Campaign,
  stocks: { readonly regolith?: number; readonly ice?: number },
): Campaign {
  return changed(campaign, (state) => {
    for (const stock of state.bulkResources) {
      if (stock.resourceId === "regolith" && stocks.regolith !== undefined) {
        stock.kilograms = stocks.regolith;
      }
      if (stock.resourceId === "water-ice" && stocks.ice !== undefined) {
        stock.kilograms = stocks.ice;
      }
    }
  });
}

function judged(campaign: Campaign, stockId: string): SelfSufficiencySnapshot {
  const found = campaign
    .snapshot()
    .selfSufficiency.find((candidate) => candidate.stockId === stockId);
  if (found === undefined) throw new Error(`expected ${stockId}`);
  return found;
}

/**
 * The base moved in, played once through its first window and until it has
 * become self-sufficient in oxygen and water: every event on the way, and
 * what the tests look at along the way. The tests only read this, and load
 * the saved texts afresh.
 */
interface FirstWindow {
  /** Every event from the base on. */
  readonly events: readonly GameEvent[];
  /** The saved text and the event, just after becoming self-sufficient in a stock. */
  readonly gains: ReadonlyMap<
    string,
    { readonly text: string; readonly gained: GameEvent }
  >;
  /** The saved text one record short of the first whole window since the Campaign began. */
  readonly recordShort: string;
  /** The game-minute of `recordShort`. */
  readonly recordShortMinute: number;
  /** The judgements two records on from `recordShort`. */
  readonly twoRecordsOn: readonly SelfSufficiencySnapshot[];
}

let firstWindowPlayed: FirstWindow | undefined;
function firstWindow(): FirstWindow {
  if (firstWindowPlayed !== undefined) return firstWindowPlayed;
  const campaign = base();
  const clock = () => campaign.snapshot().clock.elapsedMinutes;
  const recordShortMinute = windowMinutes - recordMinutes;
  const events: GameEvent[] = [];
  const gains = new Map<string, { text: string; gained: GameEvent }>();
  let recordShort: string | undefined;
  let twoRecordsOn: readonly SelfSufficiencySnapshot[] | undefined;
  // Every stop is on a whole game-hour, as the base is built an hour at a time.
  for (let hours = 0; gains.size < 2 || twoRecordsOn === undefined; hours++) {
    if (hours > (3 * windowMinutes) / 60) {
      throw new Error("The base never became self-sufficient.");
    }
    const minute = clock();
    if (minute === recordShortMinute) recordShort = campaign.save();
    if (minute === recordShortMinute + 2 * recordMinutes) {
      twoRecordsOn = campaign.snapshot().selfSufficiency;
    }
    const passed = campaign.advance(60);
    events.push(...passed);
    for (const event of passed) {
      if (event.kind === "self-sufficiency-gained") {
        gains.set(event.stockId, { text: campaign.save(), gained: event });
      }
    }
  }
  if (recordShort === undefined) throw new Error("expected a save");
  firstWindowPlayed = {
    events,
    gains,
    recordShort,
    recordShortMinute,
    twoRecordsOn,
  };
  return firstWindowPlayed;
}

function loaded(text: string): Campaign {
  const result = loadCampaign(text);
  if (!result.ok) throw new Error(result.message);
  return result.campaign;
}

/** The base just after it has become self-sufficient in a stock, loaded afresh. */
function gainedIn(stockId: string): { campaign: Campaign; gained: GameEvent } {
  const played = firstWindow().gains.get(stockId);
  if (played === undefined) throw new Error(`expected ${stockId}`);
  return { campaign: loaded(played.text), gained: played.gained };
}

/**
 * The base just after it has become self-sufficient in oxygen, out of
 * Regolith so that the extraction plant stops for good. All its oxygen surplus
 * is in the window's oldest record, three times what the whole window used,
 * and the rest fall just short: a stand-in for the Lunation of surplus the
 * window would otherwise take to move past. So only the window moving on can
 * lose it, as what is used up to then can't come near that record. Water's are
 * scaled until they only just cover what was used, so that it stays
 * self-sufficient only if the water-processing plant carries on.
 */
function oxygenPlantStopped(): Campaign {
  return changed(gainedIn("oxygen").campaign, (state) => {
    for (const stock of state.bulkResources) {
      if (stock.resourceId === "regolith") stock.kilograms = 0;
    }
    for (const { stockId, records } of state.selfSufficiency) {
      const used = records.reduce(
        (total, record) => total + record.usedKilograms,
        0,
      );
      if (stockId === "oxygen") {
        for (const record of records) {
          record.producedKilograms = 0.99 * record.usedKilograms;
        }
        const oldest = records[0];
        if (oldest !== undefined) oldest.producedKilograms = 3 * used;
      } else {
        const produced = records.reduce(
          (total, record) => total + record.producedKilograms,
          0,
        );
        for (const record of records) {
          record.producedKilograms *= (1.001 * used) / produced;
        }
      }
    }
  });
}

describe("self-sufficiency", () => {
  it.each(["oxygen", "water"])(
    "comes in %s once a whole window has passed with the Plants making more than the Mission Director used",
    (stockId) => {
      const { campaign, gained } = gainedIn(stockId);

      expect(gained.atMinute).toBeGreaterThanOrEqual(windowMinutes);
      expect(gained.atMinute % recordMinutes).toBe(0);
      expect(judged(campaign, stockId)).toMatchObject({
        selfSufficient: true,
        windowComplete: true,
      });
      expect(judged(campaign, stockId).coveredShare).toBeGreaterThanOrEqual(1);
    },
  );

  it("doesn't come before a whole window has passed since the Campaign began", () => {
    const campaign = loaded(firstWindow().recordShort);
    expect(campaign.snapshot().clock.elapsedMinutes).toBe(
      windowMinutes - recordMinutes,
    );

    for (const stockId of ["oxygen", "water"]) {
      expect(judged(campaign, stockId)).toMatchObject({
        selfSufficient: false,
        windowComplete: false,
      });
      expect(judged(campaign, stockId).coveredShare).toBeGreaterThan(1);
    }
  });

  it("never comes while the Mission Director lives aboard the Lander, using nothing", () => {
    // A record short of a whole window of the Plants making it and nobody
    // using it: a stand-in for playing a whole Lunation first.
    const campaign = changed(base(false), (state) => {
      for (const history of state.selfSufficiency) {
        history.records = Array.from(
          { length: windowMinutes / recordMinutes - 1 },
          () => ({ producedKilograms: 1, usedKilograms: 0 }),
        );
      }
    });

    const events = campaign.advance(3 * recordMinutes);

    expect(
      events.filter((event) => event.kind === "self-sufficiency-gained"),
    ).toEqual([]);
    expect(judged(campaign, "oxygen")).toMatchObject({
      selfSufficient: false,
      windowComplete: true,
      coveredShare: undefined,
    });
  });

  it("stays through a Night in which the Plants stand idle", () => {
    const { campaign } = gainedIn("oxygen");
    // Into the next Night, and through it.
    const { lunation } = campaign.snapshot();
    const toNightEnd =
      lunation.part === "night"
        ? lunation.minutesRemaining
        : lunation.minutesRemaining +
          catalogue.lunation.nightEarthDays * 24 * 60;

    const events = campaign.advance(toNightEnd);

    expect(
      events.filter((event) => event.kind === "self-sufficiency-lost"),
    ).toEqual([]);
    expect(judged(campaign, "oxygen").selfSufficient).toBe(true);
    expect(judged(campaign, "water").selfSufficient).toBe(true);
  });

  it("is lost once the Plants stop making it, as the window moves on", () => {
    const campaign = oxygenPlantStopped();

    let lost: GameEvent | undefined;
    for (
      let hours = 0;
      lost === undefined && hours < windowMinutes / 60;
      hours++
    ) {
      lost = campaign
        .advance(60)
        .find(
          (event) =>
            event.kind === "self-sufficiency-lost" &&
            event.stockId === "oxygen",
        );
    }

    expect(lost).toBeDefined();
    expect(judged(campaign, "oxygen").selfSufficient).toBe(false);
    expect(judged(campaign, "oxygen").coveredShare).toBeLessThan(1);
    // The water plant carries on.
    expect(judged(campaign, "water").selfSufficient).toBe(true);
  });

  it("keeps its Milestone reached once the base stops being self-sufficient", () => {
    const { campaign: gainedBase } = gainedIn("oxygen");
    expect(gainedBase.snapshot().milestones.reachedIds).toContain(
      "oxygen-self-sufficient",
    );
    const campaign = oxygenPlantStopped();

    const events: GameEvent[] = [];
    for (let hours = 0; judged(campaign, "oxygen").selfSufficient; hours++) {
      if (hours > windowMinutes / 60) throw new Error("It was never lost.");
      events.push(...campaign.advance(60));
    }

    expect(events.map((event) => event.kind)).not.toContain(
      "milestone-reached",
    );
    expect(campaign.snapshot().milestones.reachedIds).toContain(
      "oxygen-self-sufficient",
    );
  });

  it("reaches the oxygen and water self-sufficiency Milestones in the game-minute each is gained", () => {
    const { events } = firstWindow();

    for (const [stockId, milestoneId] of [
      ["oxygen", "oxygen-self-sufficient"],
      ["water", "water-self-sufficient"],
    ] as const) {
      const gained = events.find(
        (event) =>
          event.kind === "self-sufficiency-gained" && event.stockId === stockId,
      );
      const reached = events.find(
        (event) =>
          event.kind === "milestone-reached" &&
          event.milestoneId === milestoneId,
      );
      expect(gained).toBeDefined();
      expect(reached?.atMinute).toBe(gained?.atMinute);
    }
  });

  it("goes on the same way through saving and loading", () => {
    const { events, recordShort, recordShortMinute, twoRecordsOn } =
      firstWindow();
    const reloaded = loaded(recordShort);

    // On past the end of the first window, when it becomes self-sufficient.
    const original = events.filter(
      (event) =>
        event.atMinute > recordShortMinute &&
        event.atMinute <= recordShortMinute + 2 * recordMinutes,
    );
    const carriedOn = reloaded.advance(2 * recordMinutes);
    expect(original.map((event) => event.kind)).toContain(
      "self-sufficiency-gained",
    );

    expect(carriedOn).toEqual(original);
    expect(reloaded.snapshot().selfSufficiency).toEqual(twoRecordsOn);
  });
});
