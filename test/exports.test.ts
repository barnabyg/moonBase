import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type Campaign,
  type ExportLine,
  type GameEvent,
  type ManifestLine,
  type Snapshot,
} from "../src/simulation";
import { formatEvent } from "../src/ui/notifications-text";
import { formatLander } from "../src/ui/status-panel-text";
import { scenario } from "./scenario";
import { changed, withFunding } from "./worn";

// The Mission Director has to live in the Habitat for a whole round trip,
// longer than the starting stock keeps a Habitat powered or the dose low.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { safeHabitat } = await import("./safe-habitat");
  return {
    ...actual,
    catalogue: safeHabitat(actual.catalogue, [
      "power",
      "radiation",
      "solar-particle-events",
    ]),
  };
});

const {
  launch,
  programmeGrantMillionDollars: programmeGrant,
  lander: { returnMassKilograms: returnMass },
} = catalogue;
const waferPrice =
  catalogue.exports.find((sold) => sold.resourceId === "wafers")
    ?.priceMillionDollarsPerKilogram ?? Number.NaN;

/**
 * The Mission Director living in a commissioned Habitat, so the Lander is
 * free to fly, and the base's stock holding the wafers given, as if its
 * Plants had made them.
 */
function landerFreeWith(wafers: number): Campaign {
  const game = scenario().plan("habitat", { x: 25, y: -20 });
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Habitat was never built.");
    game.advance({ hours: 1 });
  }
  const movedIn = game.campaign.moveMissionDirectorIn(
    game.state.structures[0]?.id ?? "",
  );
  if (!movedIn.ok) throw new Error(movedIn.message);
  return withWafers(game.campaign, wafers);
}

/** The Campaign as saved, with the wafers in the base's stock set as given. */
function withWafers(campaign: Campaign, kilograms: number): Campaign {
  return changed(campaign, (state) => {
    for (const stock of state.bulkResources) {
      if (stock.resourceId === "wafers") stock.kilograms = kilograms;
    }
  });
}

function wafersInStock(state: Snapshot): number {
  return (
    state.bulkResources.find((stock) => stock.resourceId === "wafers")
      ?.kilograms ?? Number.NaN
  );
}

function load(campaign: Campaign, exports: readonly ExportLine[]): void {
  const result = campaign.loadExports(exports);
  if (!result.ok) throw new Error(result.message);
}

function setManifest(
  campaign: Campaign,
  manifest: readonly ManifestLine[],
): void {
  const result = campaign.setLaunchManifest(manifest);
  if (!result.ok) throw new Error(result.message);
}

function send(campaign: Campaign): void {
  const result = campaign.sendLander();
  if (!result.ok) throw new Error(result.message);
}

/** Skips from event to event until one of the kind happens, returning every event on the way. */
function skipUntil(campaign: Campaign, kind: GameEvent["kind"]): GameEvent[] {
  const events: GameEvent[] = [];
  for (let skips = 0; !events.some((event) => event.kind === kind); skips++) {
    if (skips > 100) throw new Error(`No ${kind} event came.`);
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

const wafers = (kilograms: number): ExportLine[] => [
  { resourceId: "wafers", kilograms },
];

describe("the Exports to load", () => {
  it("start with nothing to load and nothing aboard", () => {
    expect(scenario().state.exports).toEqual({
      toLoad: [],
      massKilograms: 0,
      returnMassKilograms: 100,
      propellantToBurnKilograms: 0,
      valueMillionDollars: 0,
      aboard: [],
      valueAboardMillionDollars: 0,
    });
  });

  it("are set in kilograms of each Export, adding up their mass and sale value, while they stay in the base's stock", () => {
    const campaign = landerFreeWith(60);

    const result = campaign.loadExports(wafers(40));

    expect(result).toEqual({ ok: true });
    const state = campaign.snapshot();
    expect(state.exports).toEqual({
      toLoad: wafers(40),
      massKilograms: 40,
      returnMassKilograms: 100,
      propellantToBurnKilograms: 0,
      valueMillionDollars: 40 * waferPrice,
      aboard: [],
      valueAboardMillionDollars: 0,
    });
    expect(wafersInStock(state)).toBe(60);
  });

  it("take the place of those set before, dropping any set to none", () => {
    const campaign = landerFreeWith(60);
    load(campaign, wafers(40));

    expect(campaign.loadExports(wafers(25))).toEqual({ ok: true });
    expect(campaign.snapshot().exports.toLoad).toEqual(wafers(25));
    expect(campaign.loadExports(wafers(0))).toEqual({ ok: true });
    expect(campaign.snapshot().exports.toLoad).toEqual([]);
  });

  it("are refused over the Lander's Return Mass, saying so, and left as they were", () => {
    const campaign = landerFreeWith(returnMass + 50);
    load(campaign, wafers(30));

    expect(campaign.loadExports(wafers(returnMass + 1))).toEqual({
      ok: false,
      reason: "over-return-mass",
      message: `That would bring the Exports to ${returnMass + 1} kg, over the Lander's Return Mass of ${returnMass} kg.`,
    });
    expect(campaign.snapshot().exports.toLoad).toEqual(wafers(30));
    expect(campaign.loadExports(wafers(returnMass))).toEqual({ ok: true });
  });

  it("are refused over what the base has in stock, saying so", () => {
    const campaign = landerFreeWith(35.5);

    expect(campaign.loadExports(wafers(36))).toEqual({
      ok: false,
      reason: "over-stock",
      message:
        "That would load 36 kg of wafers, more than the 35.5 kg in stock.",
    });
    expect(campaign.snapshot().exports.toLoad).toEqual([]);
    expect(campaign.loadExports(wafers(35.5))).toEqual({ ok: true });
  });

  it("give the stock rounded down when refusing over it, so it never reads as enough", () => {
    const campaign = landerFreeWith(29.97);

    expect(campaign.loadExports(wafers(30))).toMatchObject({
      reason: "over-stock",
      message:
        "That would load 30 kg of wafers, more than the 29.9 kg in stock.",
    });
  });

  it("are refused while the Lander is away, saying so", () => {
    const campaign = landerFreeWith(60);
    send(campaign);
    campaign.advance(24 * 60);

    expect(campaign.loadExports(wafers(10))).toEqual({
      ok: false,
      reason: "lander-away",
      message: "The Lander is away. Exports can be loaded once it has landed.",
    });
  });

  it("are refused for anything that isn't an Export, or an amount that isn't a number from 0 up", () => {
    const campaign = landerFreeWith(60);

    expect(
      campaign.loadExports([{ resourceId: "regolith", kilograms: 10 }]),
    ).toEqual({
      ok: false,
      reason: "unknown-export",
      message: `The base can't sell anything called "regolith" as an Export.`,
    });
    for (const kilograms of [-1, Number.NaN, Infinity]) {
      expect(campaign.loadExports(wafers(kilograms))).toEqual({
        ok: false,
        reason: "invalid-amount",
        message:
          "How many kilograms of an Export the Lander carries must be a number from 0 up.",
      });
    }
  });

  it("are refused once the Campaign has ended", () => {
    const loaded = loadCampaign(
      readFileSync(
        new URL("./saves/version-1-ended.moonbase", import.meta.url),
        "utf8",
      ),
    );
    if (!loaded.ok) throw new Error(loaded.message);

    expect(loaded.campaign.loadExports([])).toEqual({
      ok: false,
      reason: "campaign-ended",
      message: "The Campaign is over: the Mission Director has died.",
    });
  });
});

describe("the Lander taking off", () => {
  it("takes the Exports to load out of the base's stock and aboard, saying what went aboard", () => {
    const campaign = landerFreeWith(60);
    load(campaign, wafers(40));
    send(campaign);

    const takeOff = eventOf(
      skipUntil(campaign, "lander-took-off"),
      "lander-took-off",
    );

    const state = campaign.snapshot();
    expect(takeOff).toEqual({
      kind: "lander-took-off",
      atMinute: state.clock.elapsedMinutes,
      exports: wafers(40),
    });
    expect(formatEvent(takeOff)).toBe(
      "Lander took off for Earth with 40 kg of wafers",
    );
    expect(wafersInStock(state)).toBe(20);
    expect(state.exports).toEqual({
      toLoad: [],
      massKilograms: 0,
      returnMassKilograms: 100,
      propellantToBurnKilograms: 0,
      valueMillionDollars: 0,
      aboard: wafers(40),
      valueAboardMillionDollars: 40 * waferPrice,
    });
    expect(
      formatLander(
        state.lander,
        state.clock.elapsedMinutes,
        state.exports.aboard,
      ),
    ).toEqual({
      value: "travelling to Earth with 40 kg of wafers",
      note: expect.stringMatching(/^arrives in /) as unknown,
    });
  });

  it("takes what there is, if the stock has fallen below the Exports to load since they were set", () => {
    const set = landerFreeWith(60);
    load(set, wafers(40));
    const campaign = withWafers(set, 25);
    send(campaign);

    const takeOff = eventOf(
      skipUntil(campaign, "lander-took-off"),
      "lander-took-off",
    );

    expect(takeOff.exports).toEqual(wafers(25));
    expect(wafersInStock(campaign.snapshot())).toBe(0);
    expect(campaign.snapshot().exports.aboard).toEqual(wafers(25));
  });

  it("takes nothing aboard when there are no Exports to load", () => {
    const campaign = landerFreeWith(60);
    send(campaign);

    const takeOff = eventOf(
      skipUntil(campaign, "lander-took-off"),
      "lander-took-off",
    );

    expect(takeOff.exports).toEqual([]);
    expect(formatEvent(takeOff)).toBe("Lander took off for Earth");
    expect(wafersInStock(campaign.snapshot())).toBe(60);
  });
});

describe("the Lander reaching Earth", () => {
  it("sells the Exports aboard, raising the Funding by their value, before the manifest is charged as it leaves Earth", () => {
    const campaign = landerFreeWith(60);
    const manifest: ManifestLine[] = [{ itemId: "water", count: 1 }];
    setManifest(campaign, manifest);
    load(campaign, wafers(40));
    send(campaign);

    const reached = eventOf(
      skipUntil(campaign, "lander-reached-earth"),
      "lander-reached-earth",
    );

    const value = 40 * waferPrice;
    expect(reached).toEqual({
      kind: "lander-reached-earth",
      atMinute: campaign.snapshot().clock.elapsedMinutes,
      sold: wafers(40),
      earnedMillionDollars: value,
    });
    expect(formatEvent(reached)).toBe(
      `Lander reached Earth for turnaround, and sold 40 kg of wafers for $${value}M`,
    );
    expect(campaign.snapshot().fundingMillionDollars).toBe(
      programmeGrant + value,
    );
    expect(campaign.snapshot().exports.aboard).toEqual([]);
    expect(campaign.snapshot().exports.valueAboardMillionDollars).toBe(0);

    const left = eventOf(
      skipUntil(campaign, "lander-left-earth"),
      "lander-left-earth",
    );
    expect(campaign.snapshot().fundingMillionDollars).toBe(
      programmeGrant + value - left.chargedMillionDollars,
    );
  });

  it("sells nothing when nothing is aboard", () => {
    const campaign = landerFreeWith(60);
    send(campaign);

    const reached = eventOf(
      skipUntil(campaign, "lander-reached-earth"),
      "lander-reached-earth",
    );

    expect(reached).toMatchObject({ sold: [], earnedMillionDollars: 0 });
    expect(formatEvent(reached)).toBe("Lander reached Earth for turnaround");
    expect(campaign.snapshot().fundingMillionDollars).toBe(programmeGrant);
  });
});

describe("a manifest paid for by that trip's Exports", () => {
  // A Habitat kit, within a Launch's Payload Mass.
  const dear: ManifestLine[] = [
    { itemId: "habitat-core", count: 1 },
    { itemId: "habitat-envelope", count: 1 },
    { itemId: "airlock", count: 1 },
  ];
  const cost =
    launch.feeMillionDollars +
    dear.reduce(
      (total, { itemId, count }) =>
        total +
        (launch.items.find((item) => item.id === itemId)?.priceMillionDollars ??
          Number.NaN) *
          count,
      0,
    );
  // Funding that falls short of it by more than 2 kg of wafers sell for,
  // but not by what a full Return Mass of them sells for: what the Programme
  // Grant would have come down to after earlier Launches.
  const funding = cost - (2 * waferPrice + returnMass * waferPrice) / 2;
  const landerFreeWithFunding = (wafers: number) =>
    withFunding(landerFreeWith(wafers), funding);

  it("is accepted before the Exports are aboard, counting what the Exports to load will sell for", () => {
    const campaign = landerFreeWithFunding(returnMass);
    load(campaign, wafers(returnMass));
    expect(cost).toBeGreaterThan(funding);
    expect(cost).toBeLessThanOrEqual(funding + returnMass * waferPrice);

    expect(campaign.setLaunchManifest(dear)).toEqual({ ok: true });
  });

  it("is accepted while they are aboard, counting what they will sell for, and is paid for as the Lander leaves Earth", () => {
    const campaign = landerFreeWithFunding(returnMass);
    load(campaign, wafers(returnMass));
    send(campaign);
    skipUntil(campaign, "lander-took-off");

    expect(campaign.setLaunchManifest(dear)).toEqual({ ok: true });

    skipUntil(campaign, "lander-left-earth");
    expect(campaign.snapshot().fundingMillionDollars).toBe(
      funding + returnMass * waferPrice - cost,
    );
    expect(campaign.snapshot().fundingMillionDollars).toBeGreaterThanOrEqual(0);
  });

  it("is refused while they are aboard if it costs more than the Funding balance and their value together, saying both", () => {
    const campaign = landerFreeWithFunding(10);
    load(campaign, wafers(2));
    expect(cost).toBeGreaterThan(funding + 2 * waferPrice);
    send(campaign);
    skipUntil(campaign, "lander-took-off");

    expect(campaign.setLaunchManifest(dear)).toEqual({
      ok: false,
      reason: "over-funding",
      message: `That would bring the manifest's cost to $${cost}M, more than the Funding balance of $${funding}M and the $${2 * waferPrice}M the Exports aboard will sell for.`,
    });
  });
});

describe("a solar array paid for by the Exports to load", () => {
  // The Components of one solar array.
  const solarArray: ManifestLine[] = [
    { itemId: "solar-panel", count: 2 },
    { itemId: "array-mast", count: 1 },
  ];
  const cost =
    launch.feeMillionDollars +
    solarArray.reduce(
      (total, { itemId, count }) =>
        total +
        (launch.items.find((item) => item.id === itemId)?.priceMillionDollars ??
          Number.NaN) *
          count,
      0,
    );
  // Funding for the Launch fee alone, and wafers worth the rest and more.
  const funding = launch.feeMillionDollars;
  const loaded = 30;
  const landerFreeWithFee = () => withFunding(landerFreeWith(60), funding);

  function inStock(state: Snapshot, componentId: string): number {
    return (
      state.stockpile.components.find(
        (count) => count.componentId === componentId,
      )?.count ?? 0
    );
  }

  it("is accepted with the Exports to load, and once the Lander is back, it is delivered and the Funding is what it was, plus the sale, less the cost", () => {
    const campaign = landerFreeWithFee();
    load(campaign, wafers(loaded));
    expect(cost).toBeGreaterThan(funding);
    expect(cost).toBeLessThanOrEqual(funding + loaded * waferPrice);
    const before = campaign.snapshot();

    expect(campaign.setLaunchManifest(solarArray)).toEqual({ ok: true });
    send(campaign);
    const landed = eventOf(
      skipUntil(campaign, "lander-landed"),
      "lander-landed",
    );

    const state = campaign.snapshot();
    expect(landed.delivered).toEqual(solarArray);
    expect(inStock(state, "solar-panel")).toBe(
      inStock(before, "solar-panel") + 2,
    );
    expect(inStock(state, "array-mast")).toBe(
      inStock(before, "array-mast") + 1,
    );
    expect(state.fundingMillionDollars).toBe(
      funding + loaded * waferPrice - cost,
    );
  });

  it("shows on the manifest what it can be paid with, and whether it costs more, until it is paid for", () => {
    const campaign = landerFreeWithFee();
    load(campaign, wafers(loaded));
    setManifest(campaign, solarArray);

    expect(campaign.snapshot().launchManifest.funds).toEqual({
      fundingMillionDollars: funding,
      exportsMillionDollars: loaded * waferPrice,
      exportsCounted: "to-load",
      totalMillionDollars: funding + loaded * waferPrice,
      overFunding: false,
    });
    load(campaign, wafers(5));
    expect(campaign.snapshot().launchManifest.funds).toMatchObject({
      exportsMillionDollars: 5 * waferPrice,
      totalMillionDollars: funding + 5 * waferPrice,
      overFunding: true,
    });

    load(campaign, wafers(loaded));
    send(campaign);
    skipUntil(campaign, "lander-left-earth");
    expect(campaign.snapshot().launchManifest.funds).toBeUndefined();
  });

  it("counts only as much of the Exports to load as the base still has in stock, as the Lander takes no more", () => {
    const set = landerFreeWithFee();
    load(set, wafers(loaded));
    const campaign = withWafers(set, 5);
    expect(cost).toBeGreaterThan(funding + 5 * waferPrice);

    expect(campaign.snapshot().exports.valueMillionDollars).toBe(
      5 * waferPrice,
    );
    expect(campaign.setLaunchManifest(solarArray)).toEqual({
      ok: false,
      reason: "over-funding",
      message: `That would bring the manifest's cost to $${cost}M, more than the Funding balance of $${funding}M and the $${5 * waferPrice}M the Exports to load will sell for.`,
    });
  });

  it("keeps the Lander from leaving once the Exports to load are lowered below what the manifest needs, saying so, until they are raised again", () => {
    const campaign = landerFreeWithFee();
    load(campaign, wafers(loaded));
    expect(campaign.setLaunchManifest(solarArray)).toEqual({ ok: true });

    expect(campaign.loadExports(wafers(5))).toEqual({ ok: true });
    expect(campaign.sendLander()).toEqual({
      ok: false,
      reason: "over-funding",
      message: `The Lander can't leave with a Launch manifest that costs $${cost}M, more than the Funding balance of $${funding}M and the $${5 * waferPrice}M the Exports to load will sell for. Take something off the manifest or load more Exports first.`,
    });
    expect(campaign.snapshot().lander.state).toBe("landed-free");

    load(campaign, wafers(loaded));
    expect(campaign.sendLander()).toEqual({ ok: true });
  });

  it("keeps the Lander from leaving once the stock falls short of the Exports to load the manifest needs, saying so", () => {
    const set = landerFreeWithFee();
    load(set, wafers(loaded));
    expect(set.setLaunchManifest(solarArray)).toEqual({ ok: true });
    const campaign = withWafers(set, 5);

    expect(campaign.sendLander()).toEqual({
      ok: false,
      reason: "over-funding",
      message: `The Lander can't leave with a Launch manifest that costs $${cost}M, more than the Funding balance of $${funding}M and the $${5 * waferPrice}M the Exports to load will sell for, as the base has less in stock than them. Take something off the manifest, or wait until the stock covers them.`,
    });
  });

  it("is refused without the Exports to load, saying there are none", () => {
    const campaign = landerFreeWithFee();

    expect(campaign.setLaunchManifest(solarArray)).toEqual({
      ok: false,
      reason: "over-funding",
      message: `That would bring the manifest's cost to $${cost}M, more than the Funding balance of $${funding}M, with no Exports aboard or to load to sell first.`,
    });
  });
});

describe("Exports in a saved Campaign", () => {
  it("carry on as they would have, saved with Exports to load", () => {
    const campaign = landerFreeWith(60);
    load(campaign, wafers(40));

    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.campaign.snapshot()).toEqual(campaign.snapshot());

    send(campaign);
    send(loaded.campaign);
    const trip = 5 * 24 * 60;
    expect(loaded.campaign.advance(trip)).toEqual(campaign.advance(trip));
    expect(loaded.campaign.snapshot()).toEqual(campaign.snapshot());
  });

  it("carry on as they would have, saved with Exports aboard", () => {
    const campaign = landerFreeWith(60);
    load(campaign, wafers(40));
    send(campaign);
    campaign.advance(24 * 60);
    expect(campaign.snapshot().exports.aboard).toEqual(wafers(40));

    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.campaign.snapshot()).toEqual(campaign.snapshot());

    const trip = 5 * 24 * 60;
    expect(loaded.campaign.advance(trip)).toEqual(campaign.advance(trip));
    expect(loaded.campaign.snapshot()).toEqual(campaign.snapshot());
    expect(campaign.snapshot().fundingMillionDollars).toBe(
      programmeGrant + 40 * waferPrice,
    );
  });

  it("are none, to load or aboard, in a save of the previous format version", () => {
    const campaign = landerFreeWith(60);
    load(campaign, wafers(40));
    send(campaign);
    campaign.advance(24 * 60);
    const document = JSON.parse(campaign.save()) as {
      version: number;
      state: Record<string, unknown> & { lander: Record<string, unknown> };
    };
    document.version = 21;
    delete document.state["exportsToLoad"];
    delete document.state.lander["exports"];

    const loaded = loadCampaign(JSON.stringify(document));
    if (!loaded.ok) throw new Error(loaded.message);

    expect(loaded.campaign.snapshot().exports).toMatchObject({
      toLoad: [],
      aboard: [],
    });
  });
});
