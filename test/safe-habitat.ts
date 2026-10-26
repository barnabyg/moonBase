import type { Catalogue } from "../src/catalogue";

/**
 * The data catalogue with a Habitat that needs no power, for a test of
 * another danger that has to keep the Mission Director in the Habitat for
 * longer than its power lasts: with the starting cargo, a Habitat can't get
 * through a Night. A test file swaps it in for the real one with:
 *
 *     vi.mock("../src/catalogue", async (importOriginal) => {
 *       const actual = await importOriginal<{ catalogue: Catalogue }>();
 *       const { safeHabitat } = await import("./safe-habitat");
 *       return { ...actual, catalogue: safeHabitat(actual.catalogue) };
 *     });
 */
export function safeHabitat(catalogue: Catalogue): Catalogue {
  return {
    ...catalogue,
    structureTypes: catalogue.structureTypes.map((type) =>
      type.habitat
        ? {
            ...type,
            power: { ...type.power, drawKilowatts: 0, nightDrawKilowatts: 0 },
          }
        : type,
    ),
  };
}
