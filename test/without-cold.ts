import type { Catalogue } from "../src/catalogue";

/**
 * The data catalogue with the cold of Night taken away from Machines, for a
 * test of power or of time passing that needs Machines to draw nothing and
 * wear nothing at Night, and the Robot never to park them: no Machine has a
 * heater or feels the cold, and every Machine is plugged in wherever it
 * stands, as long as there is a powered Structure. A test file swaps it in
 * with:
 *
 *     vi.mock("../src/catalogue", async (importOriginal) => {
 *       const actual = await importOriginal<{ catalogue: Catalogue }>();
 *       const { withoutCold } = await import("./without-cold");
 *       return { ...actual, catalogue: withoutCold(actual.catalogue) };
 *     });
 */
export function withoutCold(catalogue: Catalogue): Catalogue {
  return {
    ...catalogue,
    machineTypes: catalogue.machineTypes.map((type) => ({
      ...type,
      heaterKilowatts: 0,
      coldWearPercentPerNightHour: 0,
    })),
    cold: { ...catalogue.cold, plugInReachMetres: Number.POSITIVE_INFINITY },
  };
}
