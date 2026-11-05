import { describe, expect, it } from "vitest";
import { batchHoursOf, catalogue, resourceOutputs } from "../src/catalogue";

/**
 * The data catalogue's resources.ts: bulk resources, Exports, digging,
 * Components, the starting stock, life support stocks and self-sufficiency.
 */

describe("the data catalogue", () => {
  it("lists the Exports, wafers among them, each a different bulk resource with a price per kilogram", () => {
    const { exports } = catalogue;
    const ids = exports.map((sold) => sold.resourceId);

    expect(ids).toContain("wafers");
    expect(new Set(ids).size).toBe(ids.length);
    for (const sold of exports) {
      expect(catalogue.bulkResources.map((resource) => resource.id)).toContain(
        sold.resourceId,
      );
      expect(sold.priceMillionDollarsPerKilogram).toBeGreaterThan(0);
    }
  });

  it("sells a full Return Mass of wafers for no more than a Launch's fee, so wafers alone never pay for what a Launch brings", () => {
    const wafers = catalogue.exports.find(
      (sold) => sold.resourceId === "wafers",
    );

    expect(
      (wafers?.priceMillionDollarsPerKilogram ?? Infinity) *
        catalogue.lander.returnMassKilograms,
    ).toBeLessThanOrEqual(catalogue.launch.feeMillionDollars);
  });

  it("has bulk resources with unique ids and labels, Regolith first", () => {
    const { bulkResources } = catalogue;

    expect(bulkResources[0]).toEqual({ id: "regolith", label: "Regolith" });
    expect(new Set(bulkResources.map((resource) => resource.id)).size).toBe(
      bulkResources.length,
    );
    expect(new Set(bulkResources.map((resource) => resource.label)).size).toBe(
      bulkResources.length,
    );
  });

  it("has the excavator, which lands with the Lander, dig Regolith up to a level at a positive rate", () => {
    const { digging } = catalogue;

    expect(digging).toMatchObject({
      machineTypeId: "excavator",
      resourceId: "regolith",
    });
    expect(
      catalogue.landingSite.machines.map((machine) => machine.machineTypeId),
    ).toContain(digging.machineTypeId);
    expect(digging.refillBelowKilograms).toBeGreaterThan(0);
    // Each time it starts, it digs far more than a few kilograms.
    expect(digging.fullKilograms).toBeGreaterThanOrEqual(
      2 * digging.refillBelowKilograms,
    );
    expect(digging.kilogramsPerWorkingHour).toBeGreaterThan(0);
  });

  it("has the excavator top the Regolith up before Night from just below full, in time to dig it full from the refill level", () => {
    const { digging } = catalogue;

    expect(digging.topUpBelowKilograms).toBeGreaterThan(
      digging.refillBelowKilograms,
    );
    expect(digging.topUpBelowKilograms).toBeLessThan(digging.fullKilograms);
    // At least an hour's digging, so that a Robot isn't sent out for a few kilograms.
    expect(
      digging.fullKilograms - digging.topUpBelowKilograms,
    ).toBeGreaterThanOrEqual(digging.kilogramsPerWorkingHour);
    expect(digging.topUpHoursBeforeParking).toBeGreaterThan(
      (digging.fullKilograms - digging.refillBelowKilograms) /
        digging.kilogramsPerWorkingHour,
    );
  });

  it("has Components with unique ids and labels", () => {
    const { componentTypes } = catalogue;

    expect(new Set(componentTypes.map((type) => type.id)).size).toBe(
      componentTypes.length,
    );
    expect(new Set(componentTypes.map((type) => type.label)).size).toBe(
      componentTypes.length,
    );
  });

  it("only uses known Components, in positive whole numbers, for Structures and the starting stock", () => {
    const known = new Set(catalogue.componentTypes.map((type) => type.id));
    const counts = [
      ...catalogue.startingStock,
      ...catalogue.structureTypes.flatMap((type) => type.components),
    ];

    for (const { componentId, count } of counts) {
      expect(known).toContain(componentId);
      expect(Number.isInteger(count)).toBe(true);
      expect(count).toBeGreaterThan(0);
    }
  });

  it("counts self-sufficiency over a window of a whole number of records, one Lunation by default", () => {
    const { windowLunations, recordHours } = catalogue.selfSufficiency;
    const { daylightEarthDays, nightEarthDays } = catalogue.lunation;
    const windowHours =
      windowLunations * (daylightEarthDays + nightEarthDays) * 24;

    expect(windowLunations).toBe(1);
    expect(recordHours).toBeGreaterThan(0);
    expect(Number.isInteger(recordHours * 60)).toBe(true);
    expect(Number.isInteger(windowHours / recordHours)).toBe(true);
  });

  it("keeps a reserve of each life support stock that outlasts a Night and a Lander's round trip, and comes before the first warning", () => {
    const { lunation, lander } = catalogue;
    for (const stock of catalogue.lifeSupportStocks) {
      expect(stock.reserveEarthDays).toBeGreaterThan(lunation.nightEarthDays);
      expect(stock.reserveEarthDays).toBeGreaterThan(
        Object.values(lander.roundTripEarthDays).reduce(
          (sum, leg) => sum + leg,
          0,
        ),
      );
      expect(stock.reserveEarthDays).toBeGreaterThan(
        Math.max(...stock.warningEarthDaysLeft),
      );
    }
  });

  it("sets a storage limit for each life support stock, above what it starts with and its reserve", () => {
    for (const stock of catalogue.lifeSupportStocks) {
      expect(stock.storageLimitKilograms).toBeGreaterThan(
        stock.startingKilograms,
      );
      expect(stock.storageLimitKilograms).toBeGreaterThan(
        stock.reserveEarthDays * stock.usePerEarthDayKilograms,
      );
    }
  });

  it("has room for a whole batch of every recipe in the stock it makes, so that no Plant waits for ever", () => {
    for (const type of catalogue.structureTypes) {
      for (const recipe of type.recipes ?? []) {
        for (const { resource, kilogramsPerHour } of resourceOutputs(recipe)) {
          if (resource.kind !== "life-support") continue;
          const limit = catalogue.lifeSupportStocks.find(
            ({ id }) => id === resource.stockId,
          )?.storageLimitKilograms;
          expect(kilogramsPerHour * batchHoursOf(recipe)).toBeLessThan(
            limit ?? 0,
          );
        }
      }
    }
  });

  it("holds a water wall and its reserve with no tank, even a batch below the limit, where a Plant rests", () => {
    const water = catalogue.lifeSupportStocks.find(({ id }) => id === "water");
    const wall = catalogue.structureTypes.find(
      (type) => type.waterWall !== undefined,
    )?.waterWall;
    if (water === undefined || wall === undefined) {
      throw new Error("expected water and a water wall");
    }
    const biggestBatch = Math.max(
      ...catalogue.structureTypes.flatMap((type) =>
        (type.recipes ?? []).flatMap((recipe) =>
          resourceOutputs(recipe)
            .filter(
              ({ resource }) =>
                resource.kind === "life-support" &&
                resource.stockId === "water",
            )
            .map(
              ({ kilogramsPerHour }) => kilogramsPerHour * batchHoursOf(recipe),
            ),
        ),
      ),
    );

    expect(water.storageLimitKilograms - biggestBatch).toBeGreaterThan(
      wall.kilograms + wall.reserveEarthDays * water.usePerEarthDayKilograms,
    );
  });

  it("has oxygen and water stocks that are used up, with warnings before they run out", () => {
    const stocks = catalogue.lifeSupportStocks;

    expect(stocks.map((stock) => stock.id)).toEqual(["oxygen", "water"]);
    expect(new Set(stocks.map((stock) => stock.label)).size).toBe(
      stocks.length,
    );
    for (const stock of stocks) {
      expect(stock.startingKilograms).toBeGreaterThan(0);
      expect(stock.usePerEarthDayKilograms).toBeGreaterThan(0);
      const lastsEarthDays =
        stock.startingKilograms / stock.usePerEarthDayKilograms;
      const warnings = stock.warningEarthDaysLeft;
      expect(warnings.length).toBeGreaterThan(0);
      expect([...warnings].sort((a, b) => b - a)).toEqual(warnings);
      expect(new Set(warnings).size).toBe(warnings.length);
      for (const earthDays of warnings) {
        expect(earthDays).toBeGreaterThan(0);
        expect(earthDays).toBeLessThan(lastsEarthDays);
        expect(Number.isInteger(earthDays * 24 * 60)).toBe(true);
      }
    }
  });

  it.each(["solar-array", "battery-bank", "light-mast", "habitat"])(
    "brings the Components for a %s in the starting stock",
    (structureTypeId) => {
      const structureType = catalogue.structureTypes.find(
        (type) => type.id === structureTypeId,
      );

      expect(structureType).toBeDefined();
      for (const need of structureType?.components ?? []) {
        const inCargo = catalogue.startingStock
          .filter((stock) => stock.componentId === need.componentId)
          .reduce((total, stock) => total + stock.count, 0);
        expect(inCargo).toBeGreaterThanOrEqual(need.count);
      }
    },
  );
});
