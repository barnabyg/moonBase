import { expect, test } from "@playwright/test";

test("the Mission Director's Report, beside the Guide, says what pleases and concerns them", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();

  await page.getByRole("button", { name: "Mission Director's Report" }).click();
  const report = page.getByRole("dialog", {
    name: "Mission Director's Report",
  });

  // At the landing they live aboard the Lander, which keeps them safe but
  // can't fly, and nothing earns Science yet.
  await expect(
    report.getByRole("region", { name: "Pleased about" }),
  ).toContainText("Aboard the Lander I'm safe from radiation");
  const concerned = report.getByRole("region", { name: "Concerned about" });
  await expect(concerned).toContainText("The Lander can't fly");
  await expect(concerned).toContainText("The base earns no Science.");

  await page.keyboard.press("Escape");
  await expect(report).toBeHidden();
});
