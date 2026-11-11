import { expect, test, type Page } from "@playwright/test";

/** The room between the side columns, in pixels, as a share of the window's width. */
async function mapShare(page: Page): Promise<number> {
  await page.goto("/");
  await expect(page.getByRole("status", { name: "Game clock" })).toHaveText(
    /Earth Day 1, /,
  );
  const left = await page
    .getByRole("complementary", { name: "Status panel" })
    .boundingBox();
  const right = await page
    .getByRole("complementary", { name: "Base" })
    .boundingBox();
  if (left === null || right === null) throw new Error("A column isn't shown.");
  const width = page.viewportSize()?.width ?? 0;
  return (right.x - (left.x + left.width)) / width;
}

test.describe("on the smallest window the game is laid out for", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("the columns leave the map well over half of it", async ({ page }) => {
    expect(await mapShare(page)).toBeGreaterThan(0.55);
  });
});

test.describe("on a wide window", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("the columns keep their full width", async ({ page }) => {
    await mapShare(page);
    const left = await page
      .getByRole("complementary", { name: "Status panel" })
      .boundingBox();
    const right = await page
      .getByRole("complementary", { name: "Base" })
      .boundingBox();
    expect(left?.width).toBe(340);
    expect(right?.width).toBe(300);
  });
});
