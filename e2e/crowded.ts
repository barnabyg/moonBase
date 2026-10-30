import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import {
  CROWDED_BULK_RESOURCES,
  crowdedCatalogueModule,
} from "../test/crowded-catalogue";

/**
 * Runs the page's game on a catalogue crowded with made-up Launch items and
 * bulk resources (`test/crowded-catalogue.ts`). Call it before `page.goto`.
 */
export async function useCrowdedCatalogue(page: Page): Promise<void> {
  await page.route("**/src/catalogue/catalogue.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: crowdedCatalogueModule(await response.text()),
    });
  });
}

/** A save file to hand to the Load button's file chooser. */
export interface SaveFile {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

/** The parts of a sample save these tests edit. */
export interface PlantBaseState {
  bulkResources: { resourceId: string; kilograms: number }[];
  structures: { structureTypeId: string }[];
}

/**
 * A sample save, in Daylight, of a base with a solar array, an extraction
 * plant and a vacuum fabrication plant running, edited as given.
 */
export function plantBaseSave(edit: (state: PlantBaseState) => void): SaveFile {
  const save = JSON.parse(
    readFileSync(
      new URL("../test/saves/version-35.moonbase", import.meta.url),
      "utf8",
    ),
  ) as { state: PlantBaseState };
  edit(save.state);
  return {
    name: "plant-base.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(save)),
  };
}

/**
 * That base with some of each bulk resource on the crowded catalogue, and
 * little enough silicon that the vacuum fabrication plant will soon use it up.
 */
export function crowdedSave(): SaveFile {
  return plantBaseSave((state) => {
    const kilograms: Readonly<Record<string, number>> = {
      regolith: 1500,
      metals: 12,
      silicon: 18,
      wafers: 46,
      "circuit-boards": 7,
      "water-ice": 200,
    };
    const known = Object.keys(kilograms);
    const madeUp = Array.from(
      { length: CROWDED_BULK_RESOURCES - known.length },
      (_, index) => `made-up-resource-${index + 1}`,
    );
    state.bulkResources = [...known, ...madeUp].map((resourceId, index) => ({
      resourceId,
      kilograms: kilograms[resourceId] ?? 40 + index * 25,
    }));
  });
}
