import type { Catalogue } from "../src/catalogue";

/** A danger to the Mission Director in the Habitat that a test can take away. */
export type HabitatDanger = "power" | "radiation" | "life-support";

/**
 * The data catalogue with some of the Habitat's dangers taken away, for a
 * test of another danger that has to keep the Mission Director in the
 * Habitat for longer than they would otherwise live: with the starting
 * cargo, for one, a Habitat can't get through a Night. Taken away, the
 * Habitat needs no power, it lets in no radiation, or its oxygen and water
 * last a thousand times as long. A test file swaps it in for the real one
 * with:
 *
 *     vi.mock("../src/catalogue", async (importOriginal) => {
 *       const actual = await importOriginal<{ catalogue: Catalogue }>();
 *       const { safeHabitat } = await import("./safe-habitat");
 *       return { ...actual, catalogue: safeHabitat(actual.catalogue, ["power"]) };
 *     });
 */
export function safeHabitat(
  catalogue: Catalogue,
  from: readonly HabitatDanger[],
): Catalogue {
  const { radiation } = catalogue;
  return {
    ...catalogue,
    structureTypes: catalogue.structureTypes.map((type) =>
      type.habitat && from.includes("power")
        ? {
            ...type,
            power: { ...type.power, drawKilowatts: 0, nightDrawKilowatts: 0 },
          }
        : type,
    ),
    radiation: from.includes("radiation")
      ? {
          ...radiation,
          doseRateMillisievertsPerEarthDay: {
            ...radiation.doseRateMillisievertsPerEarthDay,
            habitat: 0,
          },
        }
      : radiation,
    lifeSupportStocks: catalogue.lifeSupportStocks.map((stock) =>
      from.includes("life-support")
        ? { ...stock, startingKilograms: stock.startingKilograms * 1000 }
        : stock,
    ),
  };
}
