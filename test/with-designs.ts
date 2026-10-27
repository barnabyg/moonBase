import type { Catalogue } from "../src/catalogue";

/**
 * The data catalogue with some Designs unlocked from the start, needing
 * nothing first and costing nothing, and a full set of Components for each
 * of their Structure types added to the starting stock, for a test of what
 * one of those Structures does once it is built, without earning the
 * Science or shipping the Components first. A test file swaps it in with:
 *
 *     vi.mock("../src/catalogue", async (importOriginal) => {
 *       const actual = await importOriginal<{ catalogue: Catalogue }>();
 *       const { withDesigns } = await import("./with-designs");
 *       return {
 *         ...actual,
 *         catalogue: withDesigns(actual.catalogue, ["hardened-habitat"]),
 *       };
 *     });
 */
export function withDesigns(
  catalogue: Catalogue,
  designIds: readonly string[],
): Catalogue {
  const kits = catalogue.structureTypes
    .filter((type) => designIds.includes(type.designId))
    .flatMap((type) => type.components);
  return {
    ...catalogue,
    designs: catalogue.designs.map((design) =>
      designIds.includes(design.id)
        ? {
            ...design,
            starting: true,
            scienceCost: 0,
            prerequisiteDesignIds: [],
          }
        : design,
    ),
    startingStock: [...catalogue.startingStock, ...kits],
  };
}
