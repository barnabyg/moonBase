import { describe, expect, it } from "vitest";
import { catalogue, type LaunchItem } from "../src/catalogue";
import type { ManifestLine } from "../src/simulation";
import { scenario } from "./scenario";

const { launch, programmeGrantMillionDollars: programmeGrant } = catalogue;

function item(id: string): LaunchItem {
  const found = launch.items.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`expected a Launch item "${id}"`);
  return found;
}

const emptyManifest = {
  items: [],
  payloadMassKilograms: 0,
  costMillionDollars: 0,
  locked: false,
};

describe("Funding", () => {
  it("starts the Campaign at the Programme Grant", () => {
    expect(scenario().state.fundingMillionDollars).toBe(programmeGrant);
  });

  it("isn't spent as time passes or on setting the manifest", () => {
    const game = scenario();
    game.campaign.setLaunchManifest([{ itemId: "solar-panel", count: 2 }]);

    game.advance({ earthDays: 3 });

    expect(game.state.fundingMillionDollars).toBe(programmeGrant);
  });
});

describe("the Launch manifest", () => {
  it("starts empty, and costs nothing while it is empty", () => {
    expect(scenario().state.launchManifest).toEqual(emptyManifest);
  });

  it("costs the Launch fee plus each item's price, and adds up each item's mass", () => {
    const game = scenario();
    const panel = item("solar-panel");
    const water = item("water");

    const result = game.campaign.setLaunchManifest([
      { itemId: "solar-panel", count: 2 },
      { itemId: "water", count: 1 },
    ]);

    expect(result).toEqual({ ok: true });
    expect(game.state.launchManifest).toEqual({
      items: [
        { itemId: "solar-panel", count: 2 },
        { itemId: "water", count: 1 },
      ],
      payloadMassKilograms: panel.massKilograms * 2 + water.massKilograms,
      costMillionDollars:
        launch.feeMillionDollars +
        panel.priceMillionDollars * 2 +
        water.priceMillionDollars,
      locked: false,
    });
  });

  it("costs nothing once it has been emptied again", () => {
    const game = scenario();
    game.campaign.setLaunchManifest([{ itemId: "airlock", count: 1 }]);

    expect(game.campaign.setLaunchManifest([])).toEqual({ ok: true });

    expect(game.state.launchManifest).toEqual(emptyManifest);
  });

  it("lists its items in catalogue order, adding up any item given twice and leaving out any given none of", () => {
    const game = scenario();

    game.campaign.setLaunchManifest([
      { itemId: "water", count: 1 },
      { itemId: "solar-panel", count: 1 },
      { itemId: "oxygen", count: 0 },
      { itemId: "water", count: 2 },
    ]);

    expect(game.state.launchManifest.items).toEqual([
      { itemId: "solar-panel", count: 1 },
      { itemId: "water", count: 3 },
    ]);
  });

  it("can be filled up to the Payload Mass limit, refusing one more item that would go over it", () => {
    const game = scenario();
    const pole = item("mast-pole");
    const fits = launch.payloadMassLimitKilograms / pole.massKilograms;
    // The poles fill the Launch exactly, and the Funding isn't what limits them.
    expect(Number.isInteger(fits)).toBe(true);
    expect(
      launch.feeMillionDollars + (fits + 1) * pole.priceMillionDollars,
    ).toBeLessThan(programmeGrant);

    expect(
      game.campaign.setLaunchManifest([{ itemId: "mast-pole", count: fits }]),
    ).toEqual({ ok: true });
    expect(game.state.launchManifest.payloadMassKilograms).toBe(
      launch.payloadMassLimitKilograms,
    );

    const oneMore = game.campaign.setLaunchManifest([
      { itemId: "mast-pole", count: fits + 1 },
    ]);

    expect(oneMore).toEqual({
      ok: false,
      reason: "over-payload-mass",
      message: `That would bring the manifest's Payload Mass to ${launch.payloadMassLimitKilograms + pole.massKilograms} kg, over the Launch's limit of ${launch.payloadMassLimitKilograms} kg.`,
    });
    expect(game.state.launchManifest.items).toEqual([
      { itemId: "mast-pole", count: fits },
    ]);
  });

  it("refuses an item the Funding balance can't pay for", () => {
    const game = scenario();
    const core = item("habitat-core");
    const affordable = Math.floor(
      (programmeGrant - launch.feeMillionDollars) / core.priceMillionDollars,
    );
    // One more would be within the Payload Mass limit, so only the Funding stops it.
    expect(affordable).toBeGreaterThan(0);
    expect((affordable + 1) * core.massKilograms).toBeLessThanOrEqual(
      launch.payloadMassLimitKilograms,
    );
    game.campaign.setLaunchManifest([
      { itemId: "habitat-core", count: affordable },
    ]);

    const oneMore = game.campaign.setLaunchManifest([
      { itemId: "habitat-core", count: affordable + 1 },
    ]);

    const cost =
      launch.feeMillionDollars + (affordable + 1) * core.priceMillionDollars;
    expect(oneMore).toEqual({
      ok: false,
      reason: "over-funding",
      message: `That would bring the manifest's cost to $${cost}M, more than the Funding balance of $${programmeGrant}M.`,
    });
    expect(game.state.launchManifest.items).toEqual([
      { itemId: "habitat-core", count: affordable },
    ]);
  });

  it.each<[string, ManifestLine, string, string]>([
    [
      "an item a Launch can't bring",
      { itemId: "castle", count: 1 },
      "unknown-item",
      'A Launch can\'t bring anything called "castle".',
    ],
    [
      "a fractional count",
      { itemId: "water", count: 1.5 },
      "invalid-count",
      "How many of an item a Launch brings must be a whole number from 0 up.",
    ],
    [
      "a negative count",
      { itemId: "water", count: -1 },
      "invalid-count",
      "How many of an item a Launch brings must be a whole number from 0 up.",
    ],
  ])(
    "refuses %s, keeping the manifest as it was",
    (_, line, reason, message) => {
      const game = scenario();
      game.campaign.setLaunchManifest([{ itemId: "oxygen", count: 1 }]);
      const before = game.state.launchManifest;

      expect(game.campaign.setLaunchManifest([line])).toEqual({
        ok: false,
        reason,
        message,
      });
      expect(game.state.launchManifest).toEqual(before);
    },
  );
});
