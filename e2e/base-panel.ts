import type { Locator, Page } from "@playwright/test";

/**
 * The Base panel's list of Structures, with every group in it. The one place
 * the end-to-end tests say how to find it, so a change to how the list is
 * built changes only this.
 */
export function structuresList(page: Page): Locator {
  return page.getByRole("group", { name: "Structures", exact: true });
}

/** Every entry in the Base panel's list of Structures. */
export function structureEntries(page: Page): Locator {
  return structuresList(page).getByRole("listitem");
}

/** The Base panel's entries for Structures whose text matches `label`. */
export function structureEntry(page: Page, label: string | RegExp): Locator {
  return structureEntries(page).filter({ hasText: label });
}
