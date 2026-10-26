import { expect, test } from "@playwright/test";

test("the Launch manifest screen totals the items chosen against the Payload Mass limit and the Funding, and refuses one the Funding can't pay for", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await expect(page.getByRole("status", { name: "Funding" })).toHaveText(
    "Funding: $400M",
  );

  await page.getByRole("button", { name: "Launch manifest" }).click();
  const screen = page.getByRole("dialog", { name: "Launch manifest" });
  const payloadMass = screen.getByRole("status", { name: "Payload Mass" });
  const cost = screen.getByRole("status", { name: "Launch cost" });
  await expect(screen.getByRole("row", { name: /Solar panel/ })).toContainText(
    "60 kg, $4M",
  );
  // An empty manifest costs nothing, so the Launch fee isn't shown yet.
  await expect(payloadMass).toHaveText("Payload Mass: 0 of 2000 kg");
  await expect(cost).toHaveText(
    "Cost: nothing of $400M Funding, while the manifest is empty",
  );

  await screen.getByRole("button", { name: "Add one Habitat core" }).click();
  await screen.getByRole("button", { name: "Add one Water, 50 kg" }).click();
  await expect(payloadMass).toHaveText("Payload Mass: 960 of 2000 kg");
  await expect(cost).toHaveText(
    "Cost: $352M of $400M Funding, including the $150M Launch fee",
  );

  await screen.getByRole("button", { name: "Add one Habitat core" }).click();
  await expect(screen.getByRole("alert")).toHaveText(
    "That would bring the manifest's cost to $552M, more than the Funding balance of $400M.",
  );
  // Its count, after its name and its mass and price.
  await expect(
    screen
      .getByRole("row", { name: /Habitat core/ })
      .getByRole("cell")
      .nth(1),
  ).toHaveText("1");

  await screen.getByRole("button", { name: "Remove one Habitat core" }).click();
  await screen.getByRole("button", { name: "Remove one Water, 50 kg" }).click();
  await expect(cost).toHaveText(
    "Cost: nothing of $400M Funding, while the manifest is empty",
  );
  await screen.getByRole("button", { name: "Close" }).click();
  await expect(screen).toBeHidden();
});

test("the Launch manifest screen refuses an item that would go over the Payload Mass limit", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await page.getByRole("button", { name: "Launch manifest" }).click();
  const screen = page.getByRole("dialog", { name: "Launch manifest" });
  const payloadMass = screen.getByRole("status", { name: "Payload Mass" });
  const addWater = screen.getByRole("button", { name: "Add one Water, 50 kg" });

  // 33 tanks of 60 kg come to 1980 kg, and cost far less than the Funding.
  for (let tanks = 1; tanks <= 33; tanks++) {
    await addWater.click();
    await expect(payloadMass).toHaveText(
      `Payload Mass: ${tanks * 60} of 2000 kg`,
    );
  }
  await addWater.click();

  await expect(screen.getByRole("alert")).toHaveText(
    "That would bring the manifest's Payload Mass to 2040 kg, over the Launch's limit of 2000 kg.",
  );
  await expect(payloadMass).toHaveText("Payload Mass: 1980 of 2000 kg");
});
