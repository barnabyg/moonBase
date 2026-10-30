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
  const loaded = loadCampaign(text);
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.campaign;
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

/** Advances until the base becomes self-sufficient in a stock, returning the event. */
function untilGained(campaign: Campaign, stockId: string): GameEvent {
  for (let hours = 0; hours < 3 * 30 * 24; hours++) {
    const gained = campaign
      .advance(60)
      .find(
        (event) =>
          event.kind === "self-sufficiency-gained" && event.stockId === stockId,
      );
    if (gained !== undefined) return gained;
  }
  throw new Error(`The base never became self-sufficient in ${stockId}.`);
}

/**
 * The base moved into, played until it has just become self-sufficient in a
 * stock: its saved text and the event. Played once for each stock, and
 * loaded afresh for each test.
 */
const gains = new Map<
  string,
  { readonly text: string; readonly gained: GameEvent }
>();
function gainedIn(stockId: string): { campaign: Campaign; gained: GameEvent } {
  let played = gains.get(stockId);
  if (played === undefined) {
    const campaign = base();
    const gained = untilGained(campaign, stockId);
    played = { text: campaign.save(), gained };
    gains.set(stockId, played);
  }
  const loaded = loadCampaign(played.text);
  if (!loaded.ok) throw new Error(loaded.message);
  return { campaign: loaded.campaign, gained: played.gained };
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
    const campaign = base();
    campaign.advance(
      windowMinutes - recordMinutes - campaign.snapshot().clock.elapsedMinutes,
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
    const campaign = base(false);

    const events = campaign.advance(windowMinutes + 2 * recordMinutes);

    expect(
      events.filter((event) => event.kind === "self-sufficiency-gained"),
    ).toEqual([]);
    expect(judged(campaign, "oxygen")).toMatchObject({
      selfSufficient: false,
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
    const { campaign: gainedBase } = gainedIn("oxygen");
    // No more Regolith, so the extraction plant stops for good.
    const campaign = withStocks(gainedBase, { regolith: 0 });

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
    // No more Regolith, so the extraction plant stops for good.
    const campaign = withStocks(gainedBase, { regolith: 0 });

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
    const campaign = base();
    const events: GameEvent[] = [];
    for (
      let hours = 0;
      !judged(campaign, "oxygen").selfSufficient ||
      !judged(campaign, "water").selfSufficient;
      hours++
    ) {
      if (hours > (3 * windowMinutes) / 60) throw new Error("It never came.");
      events.push(...campaign.advance(60));
    }

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
    const campaign = base();
    campaign.advance(windowMinutes / 2);
    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    // On past the end of the first window, when it becomes self-sufficient.
    const original = campaign.advance(windowMinutes / 2);
    const reloaded = loaded.campaign.advance(windowMinutes / 2);
    expect(original.map((event) => event.kind)).toContain(
      "self-sufficiency-gained",
    );

    expect(reloaded).toEqual(original);
    expect(loaded.campaign.snapshot().selfSufficiency).toEqual(
      campaign.snapshot().selfSufficiency,
    );
  });
});
