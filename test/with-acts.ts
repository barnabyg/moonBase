import type { Act, Catalogue, Milestone } from "../src/catalogue";

// The data catalogue's Milestones shared out among made-up Acts, to see how the
// game copes with several before their content is written. A test file swaps
// it in with:
//
//     vi.mock("../src/catalogue", async (importOriginal) => {
//       const actual = await importOriginal<{ catalogue: Catalogue }>();
//       const { withActs } = await import("./with-acts");
//       return { ...actual, catalogue: withActs(actual.catalogue, [2, 3]) };
//     });
//
// An end-to-end test swaps it in with `actsCatalogueModule`, as the crowded
// catalogue is (`crowded-catalogue.ts`).

/**
 * Changes the catalogue in place, and returns it. Each of the sizes is how
 * many Milestones an Act holds, in order, and one last Act holds the rest:
 * sizes of 2 and 3 make Act 1 of the first two Milestones, "Act 2: Made-up" of
 * the next three, and "Act 3: Made-up" of the others.
 */
export function withActs(
  catalogue: Catalogue,
  sizes: readonly number[],
): Catalogue {
  const acts: Act[] = [...sizes, 0].map((_, index) => ({
    id: `act-${index + 1}`,
    label: index === 0 ? "Act 1" : `Act ${index + 1}: Made-up`,
    asks: `Do what Act ${index + 1} asks.`,
  }));
  const actOfMilestone = (position: number): Act => {
    let end = 0;
    for (const [index, size] of sizes.entries()) {
      end += size;
      if (position < end) return acts[index] as Act;
    }
    return acts[sizes.length] as Act;
  };
  (catalogue.acts as Act[]).splice(0, catalogue.acts.length, ...acts);
  const milestones = catalogue.milestones as Milestone[];
  milestones.splice(
    0,
    milestones.length,
    ...milestones.map((milestone, position) => ({
      ...milestone,
      actId: actOfMilestone(position).id,
    })),
  );
  return catalogue;
}

/**
 * The data catalogue module's code as Vite has compiled it, with its Milestones
 * shared out among made-up Acts as it is defined, before anything else can read
 * it. Used by `e2e/milestones.spec.ts`.
 */
export function actsCatalogueModule(
  compiled: string,
  sizes: readonly number[],
): string {
  return `${compiled}
import { withActs as __withActs } from "/test/with-acts.ts";
__withActs(catalogue, ${JSON.stringify(sizes)});
`;
}
