import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue, type LaunchItem } from "../src/catalogue";
import type { GroundPosition, Snapshot } from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

// Bulk supply tanks are unlocked from the start. The Mission Director has
// to live in the Habitat for a whole round trip, longer than the starting
// stock keeps a Habitat powered or the dose low.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withDesigns } = await import("./with-designs");
  const { safeHabitat } = await import("./safe-habitat");
  return {
    ...actual,
    catalogue: withDesigns(
      safeHabitat(actual.catalogue, [
        "power",
        "radiation",
        "solar-particle-events",
      ]),
      ["bulk-supply-tanks"],
    ),
  };
});

const habitatSite: GroundPosition = { x: 25, y: -20 };

/** A bulk tank and what it brings. */
function tank(id: string): {
  item: LaunchItem;
  stockId: string;
  kilograms: number;
} {
  const item = catalogue.launch.items.find((candidate) => candidate.id === id);
  if (item?.brings.kind !== "life-support") throw new Error(`expected ${id}`);
  return { item, ...item.brings };
}
const oxygenTank = tank("liquid-oxygen-tank");
const waterTank = tank("bulk-water-tank");

function kilograms(state: Snapshot, stockId: string): number {
  return (
    state.lifeSupport.find((stock) => stock.stockId === stockId)?.kilograms ??
    Number.NaN
  );
}

/** Skips from event to event until the Lander is in the given state. */
function skipUntil(game: Scenario, lander: Snapshot["lander"]["state"]): void {
  for (let skips = 0; game.state.lander.state !== lander; skips++) {
    if (skips > 100) throw new Error(`The Lander never got to ${lander}.`);
    game.campaign.advanceToNextEvent();
  }
}

/** The Mission Director living in a commissioned Habitat, so the Lander is free to fly. */
function landerFree(): Scenario {
  const game = scenario().plan("habitat", habitatSite);
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 5 * 24) throw new Error("The Habitat was never built.");
    game.advance({ hours: 1 });
  }
  const movedIn = game.campaign.moveMissionDirectorIn(
    game.state.structures[0]?.id ?? "",
  );
  if (!movedIn.ok) throw new Error(movedIn.message);
  return game;
}

describe("the bulk supply tanks", () => {
  it("go on the Launch manifest at their mass and price, and bring what the data catalogue says as the Lander lands", () => {
    const game = landerFree();
    const set = game.campaign.setLaunchManifest([
      { itemId: oxygenTank.item.id, count: 1 },
      { itemId: waterTank.item.id, count: 2 },
    ]);
    if (!set.ok) throw new Error(set.message);
    expect(game.state.launchManifest).toMatchObject({
      payloadMassKilograms:
        oxygenTank.item.massKilograms + 2 * waterTank.item.massKilograms,
      costMillionDollars:
        catalogue.launch.feeMillionDollars +
        oxygenTank.item.priceMillionDollars +
        2 * waterTank.item.priceMillionDollars,
    });
    const sent = game.campaign.sendLander();
    if (!sent.ok) throw new Error(sent.message);
    skipUntil(game, "travelling-to-moon");
    const before = game.state;

    skipUntil(game, "landed-free");

    // Less what the Mission Director used while the Lander flew back.
    const used = (stockId: string) =>
      (catalogue.lifeSupportStocks.find((stock) => stock.id === stockId)
        ?.usePerEarthDayKilograms ?? Number.NaN) *
      catalogue.lander.roundTripEarthDays.toMoon;
    expect(kilograms(game.state, "oxygen")).toBeCloseTo(
      kilograms(before, "oxygen") + oxygenTank.kilograms - used("oxygen"),
      6,
    );
    expect(kilograms(game.state, "water")).toBeCloseTo(
      kilograms(before, "water") + 2 * waterTank.kilograms - used("water"),
      6,
    );
  });
});
