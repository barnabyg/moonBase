import { expect, test } from "@playwright/test";
import { tryScenarios } from "../test/try-scenarios";

// The smallest screen the status panel is laid out for.
test.use({ viewport: { width: 1920, height: 1080 } });

test("a folded status section shows its headline figures beside its title, and Research stays in sight with the others folded", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  const panel = page.getByRole("complementary", { name: "Status panel" });
  // A section folds and opens again from its title.
  const title = (name: string) => panel.getByText(name, { exact: true });
  const toggle = async (name: string): Promise<void> => {
    await title(name).click();
  };
  const summary = (name: string) =>
    panel.getByRole("status", { name: `${name} summary` });

  // Open, a section shows its lines and no summary.
  await expect(summary("Research")).toBeHidden();
  await toggle("Research");
  await expect(summary("Research")).toHaveText("none running");
  await expect(
    panel.getByRole("status", { name: "Research Task" }),
  ).toBeHidden();

  await toggle("Milestones");
  await expect(summary("Milestones")).toHaveText(
    "Power storage before the first Night",
  );
  await toggle("Mission Director");
  await expect(summary("Mission Director")).toHaveText("aboard the Lander");
  await toggle("Stock");
  await expect(summary("Stock")).toContainText("6 spares");
  await toggle("Bulk resources");
  await expect(summary("Bulk resources")).toHaveText("none in stock");
  await toggle("Lander & Expeditions");
  await expect(summary("Lander & Expeditions")).toHaveText("landed");

  // Opening one again shows its lines in place of its summary.
  await toggle("Mission Director");
  await expect(summary("Mission Director")).toBeHidden();
  await expect(
    panel.getByRole("status", { name: "Radiation Dose" }),
  ).toBeVisible();

  // Every title, Research's last, is in sight without scrolling the panel.
  await expect(title("Research")).toBeInViewport({ ratio: 1 });
  expect(
    await panel.evaluate(
      (element) => element.scrollHeight - element.clientHeight,
    ),
  ).toBe(0);
});

test("with the Habitat on a network of its own, the Power section says what the Habitat's battery banks hold, apart from the base's", async ({
  page,
}) => {
  const scenario = tryScenarios.find(({ id }) => id === "split-network");
  if (scenario === undefined) throw new Error("expected the scenario");
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  const panel = page.getByRole("complementary", { name: "Status panel" });
  const habitatNetwork = panel.getByRole("status", {
    name: "Habitat's network power",
  });
  // Shown only once some of the base's power is apart from the Habitat's.
  await expect(habitatNetwork).toBeHidden();

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "split-network.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(scenario.save()),
  });

  await expect(panel.getByRole("status", { name: "Stored power" })).toHaveText(
    /^Stored \d+\.\d \/ 600\.0 kWh · lasts \d+d \d+h$/,
  );
  await expect(habitatNetwork).toHaveText(
    /^Habitat \d+\.\d \/ 200\.0 kWh · own network, lasts (\d+d \d+h)$/,
  );
  const lasts = /lasts (\d+d \d+h)$/.exec(
    (await habitatNetwork.textContent()) ?? "",
  )?.[1];
  // The Living line says when the Habitat's power fails.
  await expect(
    panel.getByRole("status", { name: "Mission Director" }),
  ).toHaveText(
    `Living in the Inflatable Habitat · power fails in ${lasts ?? ""}`,
  );

  await panel
    .locator(".panel-section__title")
    .getByText("Power", { exact: true })
    .click();
  await expect(panel.getByRole("status", { name: "Power summary" })).toHaveText(
    /^[+−]\d+\.\d kW · \d+% · Habitat \d+%$/,
  );
});
