import { expect, test } from "@playwright/test";
import { structureEntry, structurePopUp, structuresList } from "./base-panel";
import { placeOnClearGround } from "./placement";

test("a new Campaign's build menu offers the four Decorations last, and a rock garden built from Regolith alone stands commissioned under Decoration, doing nothing else", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const buildMenu = page.getByRole("complementary", { name: "Build menu" });
  const decoration = buildMenu.getByRole("group", { name: "Decoration" });
  // Its number is how many can be built from stock: none of the three made
  // from Components a Launch brings, and the rock garden, from Regolith
  // alone, isn't counted.
  await expect(
    buildMenu.locator(".build-group:not([hidden]) > summary").last(),
  ).toHaveText(/^Decoration\s*0(?!\d)/, { useInnerText: true });
  for (const name of [
    "Flag pole",
    "Founding memorial",
    "Rock garden",
    "Mission Director's viewing area",
  ]) {
    await expect(
      decoration.getByRole("button", { name: new RegExp(`^${name}`) }),
    ).toBeVisible();
  }

  await decoration.getByRole("button", { name: /^Rock garden/ }).click();
  await placeOnClearGround(page);
  await expect(page.getByRole("status", { name: "Placement" })).toHaveText(
    "Rock garden planned. The Robot will carry out its Construction.",
  );

  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "20x" })
    .click();
  await expect(page.getByRole("log", { name: "Notifications" })).toContainText(
    "Rock garden commissioned",
  );
  await expect(
    structuresList(page).getByRole("list", { name: "Decoration" }),
  ).toHaveText(/^Rock garden\s*Condition\s*100%$/, { useInnerText: true });

  await structureEntry(page, /^Rock garden/)
    .getByRole("button")
    .first()
    .click();
  await expect(structurePopUp(page)).toContainText(
    "there for how they look and what they mean rather than for what they do",
  );
});
