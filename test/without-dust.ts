import type { Catalogue } from "../src/catalogue";

/**
 * The data catalogue with Dust taken away, so that nothing wears down by
 * it, for a test of another Hazard or of Maintenance that needs Condition
 * to change only as the test says. A test file swaps it in with:
 *
 *     vi.mock("../src/catalogue", async (importOriginal) => {
 *       const actual = await importOriginal<{ catalogue: Catalogue }>();
 *       const { withoutDust } = await import("./without-dust");
 *       return { ...actual, catalogue: withoutDust(actual.catalogue) };
 *     });
 */
export function withoutDust(catalogue: Catalogue): Catalogue {
  return {
    ...catalogue,
    structureTypes: catalogue.structureTypes.map((type) => ({
      ...type,
      dustWearPercentPerHour: 0,
    })),
  };
}
