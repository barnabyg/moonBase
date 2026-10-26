import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import type { GroundPosition, Snapshot } from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

// The Robot and the excavator stand idle when no other Work Order wants
// them, rather than digging Regolith.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutDigging } = await import("./without-digging");
  return { ...actual, catalogue: withoutDigging(actual.catalogue) };
});

const solarArray = catalogue.structureTypes.find(
  (type) => type.id === "solar-array",
);
if (solarArray === undefined) throw new Error("expected a solar array");
const site: GroundPosition = { x: 20, y: 12 };

/** Runs the game a game-minute at a time until the condition holds. */
function runUntil(game: Scenario, done: (state: Snapshot) => boolean): void {
  for (let minute = 0; minute < 5 * 24 * 60; minute++) {
    if (done(game.state)) return;
    game.advance({ minutes: 1 });
  }
  throw new Error("It never happened.");
}

describe("cancelling a Construction", () => {
  it("removes it and returns the Components the Robot is carrying to stock", () => {
    const game = scenario().plan("solar-array", site);
    const startingStock = game.state.stockpile.components;
    const id = game.state.constructions[0]?.id ?? "";
    runUntil(game, (state) => (state.robots[0]?.carrying.length ?? 0) > 0);
    expect(game.state.stockpile.components).not.toEqual(startingStock);

    const result = game.campaign.cancelConstruction(id);

    expect(result).toEqual({ ok: true, returned: solarArray.components });
    expect(game.state.constructions).toEqual([]);
    expect(game.state.stockpile.components).toEqual(startingStock);
    expect(game.state.robots[0]?.carrying).toEqual([]);
    game.advance({ hours: 1 });
    expect(game.state.robots[0]?.activity).toEqual({ kind: "idle" });
    expect(game.state.structures).toEqual([]);
  });

  it("returns only the Components not yet assembled, fewer as Assembly goes on, and none once Commissioning begins", () => {
    const game = scenario().plan("solar-array", site);
    const total = (counts: readonly { count: number }[]) =>
      counts.reduce((sum, { count }) => sum + count, 0);
    const unused: number[] = [];
    runUntil(game, (state) => {
      const [construction] = state.constructions;
      if (construction?.stage === "assembly") {
        unused.push(total(construction.unusedComponents));
      }
      return construction?.stage === "commissioning";
    });

    expect(unused[0]).toBe(total(solarArray.components));
    expect(unused).toEqual([...unused].sort((a, b) => b - a));
    expect(new Set(unused).size).toBe(total(solarArray.components));
    expect(game.state.constructions[0]?.unusedComponents).toEqual([]);
  });

  it("part-way through Assembly, puts the unassembled Components back in stock", () => {
    const game = scenario().plan("solar-array", site);
    const startingStock = game.state.stockpile.components;
    const id = game.state.constructions[0]?.id ?? "";
    runUntil(
      game,
      (state) =>
        state.constructions[0]?.stage === "assembly" &&
        state.constructions[0].stageProgress >= 0.5,
    );
    const unused = game.state.constructions[0]?.unusedComponents ?? [];
    const inStock = (componentId: string) =>
      game.state.stockpile.components.find(
        (stock) => stock.componentId === componentId,
      )?.count ?? 0;
    const before = startingStock.map((stock) => inStock(stock.componentId));

    const result = game.campaign.cancelConstruction(id);

    expect(result).toEqual({ ok: true, returned: unused });
    expect(unused.length).toBeGreaterThan(0);
    for (const [index, stock] of startingStock.entries()) {
      const returned =
        unused.find((count) => count.componentId === stock.componentId)
          ?.count ?? 0;
      expect(inStock(stock.componentId)).toBe((before[index] ?? 0) + returned);
      expect(inStock(stock.componentId)).toBeLessThanOrEqual(stock.count);
    }
    expect(game.state.stockpile.components).not.toEqual(startingStock);
  });

  it("during Site Preparation, takes nothing from stock and frees the excavator for the next Construction", () => {
    const game = scenario()
      .plan("solar-array", site)
      .plan("battery-bank", { x: -20, y: -15 });
    const startingStock = game.state.stockpile.components;
    const [cancelled, next] = game.state.constructions.map((c) => c.id);
    runUntil(game, (state) =>
      state.machines.some(
        (machine) =>
          "constructionId" in machine.activity &&
          machine.activity.constructionId === cancelled,
      ),
    );

    const result = game.campaign.cancelConstruction(cancelled ?? "");

    expect(result).toEqual({ ok: true, returned: [] });
    expect(game.state.stockpile.components).toEqual(startingStock);
    expect(game.state.machines[0]?.activity).toEqual({ kind: "idle" });
    runUntil(game, (state) => state.constructions.length === 0);
    expect(game.state.structures.map((structure) => structure.id)).toEqual([
      next,
    ]);
  });

  it("removes the cable being laid to it", () => {
    const game = scenario()
      .plan("solar-array", site)
      .plan("battery-bank", { x: 30, y: 25 });
    const batteryId = game.state.constructions[1]?.id ?? "";
    runUntil(game, (state) => (state.cables[0]?.route.length ?? 0) >= 2);

    game.campaign.cancelConstruction(batteryId);

    expect(game.state.cables).toEqual([]);
    game.advance({ hours: 1 });
    expect(game.state.cables).toEqual([]);
  });

  it("is refused for a Construction that doesn't exist or is already finished", () => {
    const game = scenario().plan("solar-array", site);
    const id = game.state.constructions[0]?.id ?? "";
    runUntil(game, (state) => state.constructions.length === 0);

    for (const unknown of [id, "no-such-construction"]) {
      expect(game.campaign.cancelConstruction(unknown)).toMatchObject({
        ok: false,
      });
    }
    expect(game.state.structures).toHaveLength(1);
  });
});
