import type {
  BulkResource,
  Catalogue,
  ComponentType,
  LaunchItem,
} from "../src/catalogue";

// A data catalogue crowded with made-up Launch items and bulk resources, as a
// later Act's might be, to see how the screens cope. It is only ever swapped
// in while developing: `crowdedCatalogueModule` appends a call to it to the
// data catalogue's module as the browser fetches it, so the game runs on it
// from the first line, with nothing in the game itself knowing.

/** How many Launch items a crowded catalogue has, all told. */
export const CROWDED_LAUNCH_ITEMS = 80;
/** How many bulk resources a crowded catalogue has, all told. */
export const CROWDED_BULK_RESOURCES = 15;

/** Adds to the catalogue in place, up to the crowded numbers, and returns it. */
export function crowdCatalogue(catalogue: Catalogue): Catalogue {
  const components = catalogue.componentTypes as ComponentType[];
  const items = catalogue.launch.items as LaunchItem[];
  const resources = catalogue.bulkResources as BulkResource[];
  // Spread across every starting Design, so they all show from the landing.
  const startingDesignIds = catalogue.designs
    .filter((design) => design.starting)
    .map((design) => design.id);
  for (let n = 1; items.length < CROWDED_LAUNCH_ITEMS; n++) {
    const id = `made-up-part-${n}`;
    components.push({ id, label: `Made-up part ${n}` });
    items.push({
      id,
      designId: startingDesignIds[n % startingDesignIds.length] ?? "",
      brings: { kind: "component", componentId: id },
      massKilograms: 10 + n,
      priceMillionDollars: 1 + (n % 7),
    });
  }
  for (let n = 1; resources.length < CROWDED_BULK_RESOURCES; n++) {
    resources.push({
      id: `made-up-resource-${n}`,
      label: `Made-up resource ${n}`,
    });
  }
  return catalogue;
}

/**
 * The data catalogue module's code as Vite has compiled it, crowded: it imports
 * this file and crowds the catalogue as it is defined, before anything else
 * can read it. Used by `e2e/crowded.ts` and `scripts/try.mjs`.
 */
export function crowdedCatalogueModule(compiled: string): string {
  return `${compiled}
import { crowdCatalogue as __crowdCatalogue } from "/test/crowded-catalogue.ts";
__crowdCatalogue(catalogue);
`;
}
