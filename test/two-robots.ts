import type { Catalogue } from "../src/catalogue";

/**
 * The data catalogue with a second Robot at the landing site, for a test
 * of several Robots sharing the Work Orders. It starts on the other side
 * of the Lander from the first, clear of the stockpile, the Machines and
 * the Rover. A test file swaps it in with:
 *
 *     vi.mock("../src/catalogue", async (importOriginal) => {
 *       const actual = await importOriginal<{ catalogue: Catalogue }>();
 *       const { withTwoRobots } = await import("./two-robots");
 *       return { ...actual, catalogue: withTwoRobots(actual.catalogue) };
 *     });
 */
export function withTwoRobots(catalogue: Catalogue): Catalogue {
  return {
    ...catalogue,
    landingSite: {
      ...catalogue.landingSite,
      robotPositions: [...catalogue.landingSite.robotPositions, { x: 6, y: 3 }],
    },
  };
}
