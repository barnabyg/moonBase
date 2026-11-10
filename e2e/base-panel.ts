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

/**
 * The line of a Base panel entry that says what it is doing, if it says
 * anything. Its tooltip, the `title` attribute, says what a running Plant
 * makes and uses.
 */
export function doing(entry: Locator): Locator {
  return entry.locator(".entry__state");
}

/** The pop-up of the Structure it is open for. */
export function structurePopUp(page: Page): Locator {
  return page.locator('section[role="dialog"]:not([hidden])');
}

/**
 * Has the Robot dismantle the Structure a Base panel entry lists, as a
 * player does: its name opens its pop-up, which has Dismantle. The pop-up
 * is closed again, as it may stand over what the test uses next.
 */
export async function dismantle(page: Page, entry: Locator): Promise<void> {
  await entry.getByRole("button").first().click();
  const popUp = structurePopUp(page);
  await popUp.getByRole("button", { name: "Dismantle" }).click();
  await popUp.getByRole("button", { name: "Close" }).click();
}
