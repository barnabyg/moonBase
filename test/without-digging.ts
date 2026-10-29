import type { Catalogue } from "../src/catalogue";

/**
 * The data catalogue with digging taken away, for a test of other work
 * that needs the Robot and the excavator to stand idle when no other Work
 * Order wants them: the base never needs any Regolith dug. A test file
 * swaps it in with:
 *
 *     vi.mock("../src/catalogue", async (importOriginal) => {
 *       const actual = await importOriginal<{ catalogue: Catalogue }>();
 *       const { withoutDigging } = await import("./without-digging");
 *       return { ...actual, catalogue: withoutDigging(actual.catalogue) };
 *     });
 */
export function withoutDigging(catalogue: Catalogue): Catalogue {
  return {
    ...catalogue,
    digging: {
      ...catalogue.digging,
      refillBelowKilograms: 0,
      fullKilograms: 0,
    },
  };
}
