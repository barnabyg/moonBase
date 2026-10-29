import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type GameEvent,
  type GroundPosition,
  type ManifestLine,
  type Snapshot,
} from "../src/simulation";
import { scenario, scenarioOf, type Scenario } from "./scenario";
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

const habitatSite: GroundPosition = { x: 25, y: -20 };
const { launch, programmeGrantMillionDollars: programmeGrant } = catalogue;

/** Runs the game until the Robot has carried out every planned Construction. */
function buildAll(game: Scenario): Scenario {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
  return game;
}

/** The Mission Director living in a commissioned Habitat, so the Lander is free to fly. */
function landerFree(): Scenario {
  const game = buildAll(scenario().plan("habitat", habitatSite));
  const movedIn = game.campaign.moveMissionDirectorIn(
    game.state.structures[0]?.id ?? "",
  );
  if (!movedIn.ok) throw new Error(movedIn.message);
  return game;
}

function setManifest(game: Scenario, manifest: readonly ManifestLine[]): void {
  const result = game.campaign.setLaunchManifest(manifest);
  if (!result.ok) throw new Error(result.message);
}

function send(game: Scenario): void {
  const result = game.campaign.sendLander();
  if (!result.ok) throw new Error(result.message);
}

/** Skips from event to event until the Lander is in the given state, returning every event on the way. */
function skipUntil(
  game: Scenario,
  lander: Snapshot["lander"]["state"],
): GameEvent[] {
  const events: GameEvent[] = [];
  for (let skips = 0; game.state.lander.state !== lander; skips++) {
    if (skips > 100) throw new Error(`The Lander never got to ${lander}.`);
    events.push(...game.campaign.advanceToNextEvent());
  }
  return events;
}

function price(manifest: readonly ManifestLine[]): number {
  return manifest.reduce(
    (total, { itemId, count }) =>
      total +
      (launch.items.find((item) => item.id === itemId)?.priceMillionDollars ??
        0) *
        count,
    0,
  );
}

function inStock(state: Snapshot, componentId: string): number {
  return (
    state.stockpile.components.find(
      (stock) => stock.componentId === componentId,
    )?.count ?? 0
  );
}

function kilograms(state: Snapshot, stockId: string): number {
  return (
    state.lifeSupport.find((stock) => stock.stockId === stockId)?.kilograms ?? 0
  );
}

const cargo: readonly ManifestLine[] = [
  { itemId: "solar-panel", count: 2 },
  { itemId: "array-mast", count: 1 },
  { itemId: "oxygen", count: 2 },
];

describe("the Launch manifest during the round trip", () => {
  it("can still be changed while the Lander is in turnaround on Earth", () => {
    const game = landerFree();
    setManifest(game, [{ itemId: "water", count: 1 }]);
    send(game);
    skipUntil(game, "turnaround");

    expect(game.campaign.setLaunchManifest(cargo)).toEqual({ ok: true });
    expect(game.state.launchManifest).toMatchObject({
      items: cargo,
      locked: false,
    });
  });

  it("locks when the Lander leaves Earth, refusing changes until it has landed", () => {
    const game = landerFree();
    setManifest(game, cargo);
    send(game);
    skipUntil(game, "travelling-to-moon");

    expect(game.campaign.setLaunchManifest([])).toEqual({
      ok: false,
      reason: "manifest-locked",
      message:
        "The manifest is locked: the Lander has left Earth with it. A new one starts once it has landed.",
    });
    expect(game.state.launchManifest).toMatchObject({
      items: cargo,
      locked: true,
    });

    skipUntil(game, "landed-free");
    expect(game.campaign.setLaunchManifest(cargo)).toEqual({ ok: true });
  });
});

describe("paying for the Launch", () => {
  it("takes the manifest's cost from the Funding as the Lander leaves Earth, recording it on the event", () => {
    const game = landerFree();
    setManifest(game, cargo);
    const cost = launch.feeMillionDollars + price(cargo);
    expect(game.state.launchManifest.costMillionDollars).toBe(cost);
    send(game);

    skipUntil(game, "turnaround");
    expect(game.state.fundingMillionDollars).toBe(programmeGrant);
    const events = skipUntil(game, "travelling-to-moon");

    expect(events).toContainEqual({
      kind: "lander-left-earth",
      atMinute: game.state.clock.elapsedMinutes,
      chargedMillionDollars: cost,
    });
    expect(game.state.fundingMillionDollars).toBe(programmeGrant - cost);
  });

  it("keeps the Launch fee a manifest was paid with while it is locked, through a save, with the fee in force from the next Launch", () => {
    const game = landerFree();
    setManifest(game, cargo);
    send(game);
    skipUntil(game, "travelling-to-moon");

    // Paid at a fee other than the one in force now.
    const saved = scenarioOf(
      changed(game.campaign, (state) => {
        state.launchFeePaidMillionDollars = 100;
      }),
    );

    expect(saved.state.launchManifest).toMatchObject({
      locked: true,
      costMillionDollars: 100 + price(cargo),
      feeMillionDollars: 100,
    });
    skipUntil(saved, "landed-free");
    expect(saved.state.launchManifest.feeMillionDollars).toBe(
      launch.feeMillionDollars,
    );
  });

  it("charges nothing for an empty manifest", () => {
    const game = landerFree();
    send(game);

    const events = skipUntil(game, "travelling-to-moon");

    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "lander-left-earth",
        chargedMillionDollars: 0,
      }),
    );
    expect(game.state.fundingMillionDollars).toBe(programmeGrant);
  });

  it("never ends the Campaign when it leaves no Funding", () => {
    // A Habitat kit, with Funding left for it and the Launch fee and no more.
    const everything: ManifestLine[] = [
      { itemId: "habitat-core", count: 1 },
      { itemId: "habitat-envelope", count: 1 },
      { itemId: "airlock", count: 1 },
    ];
    const game = scenarioOf(
      withFunding(
        landerFree().campaign,
        launch.feeMillionDollars + price(everything),
      ),
    );
    setManifest(game, everything);
    send(game);

    skipUntil(game, "landed-free");
    game.advance({ earthDays: 5 });

    expect(game.state.fundingMillionDollars).toBe(0);
    expect(game.state.ended).toBeUndefined();
    expect(game.campaign.setLaunchManifest([])).toEqual({ ok: true });
    expect(
      game.campaign.setLaunchManifest([{ itemId: "water", count: 1 }]),
    ).toMatchObject({ ok: false, reason: "over-funding" });
  });
});

describe("the cargo", () => {
  it("joins the base's stock and the life support stocks as the Lander lands, and a new manifest starts empty", () => {
    const game = landerFree();
    setManifest(game, cargo);
    send(game);
    skipUntil(game, "travelling-to-moon");
    const before = game.state;

    const events = skipUntil(game, "landed-free");

    const { state } = game;
    expect(events.filter((event) => event.kind === "lander-landed")).toEqual([
      {
        kind: "lander-landed",
        atMinute: state.clock.elapsedMinutes,
        delivered: cargo,
      },
    ]);
    expect(inStock(state, "solar-panel")).toBe(
      inStock(before, "solar-panel") + 2,
    );
    expect(inStock(state, "array-mast")).toBe(
      inStock(before, "array-mast") + 1,
    );
    const tank = launch.items.find((item) => item.id === "oxygen")?.brings;
    if (tank?.kind !== "life-support") throw new Error("expected a tank");
    // Less what the Mission Director breathed while the Lander flew back.
    const breathed =
      (catalogue.lifeSupportStocks.find((stock) => stock.id === "oxygen")
        ?.usePerEarthDayKilograms ?? 0) *
      catalogue.lander.roundTripEarthDays.toMoon;
    expect(kilograms(state, "oxygen")).toBeCloseTo(
      kilograms(before, "oxygen") + 2 * tank.kilograms - breathed,
      6,
    );
    expect(state.launchManifest).toMatchObject({
      items: [],
      payloadMassKilograms: 0,
      costMillionDollars: 0,
      feeMillionDollars: launch.feeMillionDollars,
      locked: false,
    });
  });

  it("lets a Construction that was waiting for its Components go ahead", () => {
    const game = landerFree();
    // The starting stock has one solar array's Components, so the second waits.
    game.plan("solar-array", { x: 20, y: 12 }).plan("solar-array", {
      x: -25,
      y: 20,
    });
    setManifest(game, [
      { itemId: "solar-panel", count: 2 },
      { itemId: "array-mast", count: 1 },
    ]);
    send(game);
    game.advance({ earthDays: 2 });
    expect(game.state.constructions).toHaveLength(1);
    expect(game.state.constructions[0]?.waiting).toMatchObject({
      reason: "missing-components",
    });

    skipUntil(game, "landed-free");
    buildAll(game);

    expect(
      game.state.structures.filter((s) => s.structureTypeId === "solar-array"),
    ).toHaveLength(2);
  });

  it("is nothing for a Lander on its way back in a save of format version 4, which left Earth empty and unpaid", () => {
    const game = landerFree();
    setManifest(game, cargo);
    send(game);
    skipUntil(game, "travelling-to-moon");
    // As format version 4 had it: nothing paid, and the manifest still the next Launch's.
    const document = JSON.parse(game.campaign.save()) as {
      version: number;
      state: Record<string, unknown>;
    };
    document.version = 4;
    document.state["fundingMillionDollars"] = programmeGrant;

    const loaded = loadCampaign(JSON.stringify(document));
    if (!loaded.ok) throw new Error(loaded.message);
    const landing = loaded.campaign
      .advance(3 * 24 * 60)
      .filter((event) => event.kind === "lander-landed");

    expect(landing).toMatchObject([{ delivered: [] }]);
    expect(loaded.campaign.snapshot().fundingMillionDollars).toBe(
      programmeGrant,
    );
  });

  it("is the same after saving and loading on the way back from Earth", () => {
    const game = landerFree();
    setManifest(game, cargo);
    send(game);
    skipUntil(game, "travelling-to-moon");
    game.advance({ hours: 5 });

    const loaded = loadCampaign(game.campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.campaign.snapshot().launchManifest).toMatchObject({
      items: cargo,
      locked: true,
    });

    const rest = 3 * 24 * 60;
    expect(loaded.campaign.advance(rest)).toEqual(game.campaign.advance(rest));
    expect(loaded.campaign.snapshot()).toEqual(game.state);
    expect(inStock(game.state, "array-mast")).toBeGreaterThan(0);
  });
});
