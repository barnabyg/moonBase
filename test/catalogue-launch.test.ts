import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { designsUnlockedWith } from "./catalogue-helpers";

/**
 * The data catalogue's launch.ts: the Programme Grant, the Launch rules and
 * what a Launch can bring.
 */

describe("the data catalogue", () => {
  it("starts the Campaign with a Programme Grant, and sets a Payload Mass limit and a Launch fee", () => {
    expect(catalogue.programmeGrantMillionDollars).toBeGreaterThan(0);
    expect(catalogue.launch.payloadMassLimitKilograms).toBeGreaterThan(0);
    expect(catalogue.launch.feeMillionDollars).toBeGreaterThan(0);
    expect(catalogue.launch.feeMillionDollars).toBeLessThan(
      catalogue.programmeGrantMillionDollars,
    );
  });

  it("can ship every Component once, oxygen and water in set amounts, and a Robot, each with a mass and a price that one Launch on the Programme Grant can carry", () => {
    const { items, payloadMassLimitKilograms, feeMillionDollars } =
      catalogue.launch;

    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    const shipped = items.map(({ brings }) => {
      switch (brings.kind) {
        case "component":
          return brings.componentId;
        case "life-support":
          return brings.stockId;
        case "robot":
          return "a Robot";
      }
    });
    // Each Component as one item; oxygen and water in tanks of more than
    // one size.
    const stockIds = catalogue.lifeSupportStocks.map((stock) => stock.id);
    expect(shipped.filter((id) => !stockIds.includes(id)).toSorted()).toEqual(
      [
        ...catalogue.componentTypes.map((type) => type.id),
        "a Robot",
      ].toSorted(),
    );
    expect(new Set(shipped.filter((id) => stockIds.includes(id)))).toEqual(
      new Set(stockIds),
    );
    for (const item of items) {
      if (item.brings.kind === "life-support") {
        expect(item.brings.kilograms).toBeGreaterThan(0);
        expect(item.massKilograms).toBeGreaterThanOrEqual(
          item.brings.kilograms,
        );
      }
      expect(item.massKilograms).toBeGreaterThan(0);
      expect(item.massKilograms).toBeLessThanOrEqual(payloadMassLimitKilograms);
      expect(item.priceMillionDollars).toBeGreaterThan(0);
      expect(feeMillionDollars + item.priceMillionDollars).toBeLessThanOrEqual(
        catalogue.programmeGrantMillionDollars,
      );
    }
  });

  it("ships exactly one Robot item, a few hundred kilograms, behind a Mobility Design that isn't a starting one, and has it climb down from the Lander in a whole number of game-minutes", () => {
    const robots = catalogue.launch.items.filter(
      (item) => item.brings.kind === "robot",
    );

    expect(robots).toHaveLength(1);
    const [robot] = robots;
    expect(robot?.massKilograms).toBeGreaterThanOrEqual(100);
    expect(robot?.massKilograms).toBeLessThan(1000);
    expect(
      catalogue.designs.find((design) => design.id === robot?.designId),
    ).toMatchObject({ category: "mobility", starting: false });
    const { climbingDownHours } = catalogue.robot;
    expect(climbingDownHours).toBeGreaterThan(0);
    expect(Number.isInteger(climbingDownHours * 60)).toBe(true);
  });

  it("lets a Launch bring every Structure type's Components once its Design is unlocked, a full set within one Launch's Payload Mass, but for a Buried Habitat, which is meant to take several", () => {
    for (const type of catalogue.structureTypes) {
      const unlocked = designsUnlockedWith(type.designId);
      let mass = 0;
      for (const need of type.components) {
        const item = catalogue.launch.items.find(
          (candidate) =>
            candidate.brings.kind === "component" &&
            candidate.brings.componentId === need.componentId,
        );
        expect(item).toBeDefined();
        expect(unlocked).toContain(item?.designId);
        mass += (item?.massKilograms ?? Infinity) * need.count;
      }
      if (type.buried === true) continue;
      expect(mass).toBeLessThanOrEqual(
        catalogue.launch.payloadMassLimitKilograms,
      );
    }
  });
});
