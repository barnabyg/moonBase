import type { Locator } from "@playwright/test";

/**
 * Picks a Design in the open Tech Tree screen, as a click on it in the tree
 * does, and returns the panel that says what it brings and has its Unlock
 * button. Picking the Design already picked would put it down again.
 */
export async function pickDesign(
  tree: Locator,
  label: string,
): Promise<Locator> {
  await designInTree(tree, label).click();
  return tree.getByRole("region", { name: "Selected Design" });
}

/** A Design as the tree draws it. */
export function designInTree(tree: Locator, label: string): Locator {
  return tree
    .getByRole("group", { name: "Designs" })
    .getByRole("button", { name: label, exact: true });
}
