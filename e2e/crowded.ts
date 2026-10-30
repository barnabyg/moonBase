import type { Page } from "@playwright/test";
import { crowdedCatalogueModule } from "../test/crowded-catalogue";

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
