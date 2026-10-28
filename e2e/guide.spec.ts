import { expect, test } from "@playwright/test";
import { catalogue } from "../src/catalogue";

function structureType(id: string) {
  const type = catalogue.structureTypes.find((each) => each.id === id);
  if (type === undefined) throw new Error(`expected a ${id}`);
  return type;
}

test("the Guide says how the base works and what every Structure, Machine and technology does", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();

  await page.getByRole("button", { name: "Guide" }).click();
  const guide = page.getByRole("dialog", { name: "Guide" });

  // How the base works comes first, repairs among it.
  const basics = guide.getByRole("tabpanel", { name: "How it works" });
  await expect(
    guide.getByRole("tab", { name: "How it works" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    basics.getByRole("article", { name: "Repairs and Maintenance" }),
  ).toContainText(`below ${catalogue.maintenance.thresholdPercent}% Condition`);
  await expect(
    basics.getByRole("article", { name: "Power and Night" }),
  ).toContainText("switches itself off to save power");

  // Every Structure, with what it does in figures and what it is built from.
  await guide.getByRole("tab", { name: "Structures" }).click();
  const structures = guide.getByRole("tabpanel", { name: "Structures" });
  const bank = structureType("battery-bank");
  const bankCard = structures.getByRole("article", {
    name: bank.label,
    exact: true,
  });
  await expect(bankCard).toContainText(
    `stores ${bank.power.storageKilowattHours} kWh`,
  );
  await expect(bankCard).toContainText(
    "3 battery modules and 1 battery cabinet",
  );
  await expect(bankCard).toContainText("Unlocked");
  // One whose Design isn't unlocked yet says which it needs.
  const tall = structureType("tall-light-mast");
  await expect(
    structures.getByRole("article", { name: tall.label, exact: true }),
  ).toContainText("Needs the Tall Light Masts Design");

  // The Robot, the Machines and the Rover.
  await guide.getByRole("tab", { name: "Robots & Machines" }).click();
  const fleet = guide.getByRole("tabpanel", { name: "Robots & Machines" });
  const [excavator] = catalogue.machineTypes;
  if (excavator === undefined) throw new Error("expected a Machine");
  await expect(
    fleet.getByRole("article", { name: excavator.label }),
  ).toContainText(excavator.description);
  await expect(fleet.getByRole("article", { name: "Robot" })).toContainText(
    catalogue.robot.description,
  );

  // Every technology, with what unlocking it brings.
  await guide.getByRole("tab", { name: "Technologies" }).click();
  const technologies = guide.getByRole("tabpanel", { name: "Technologies" });
  const tallDesign = technologies.getByRole("article", {
    name: "Tall Light Masts",
  });
  await expect(tallDesign).toContainText("30 Science");
  await expect(tallDesign).toContainText(`Unlocks the ${tall.label}`);
  await expect(tallDesign).toContainText("Night surface photometry");

  await guide.getByRole("button", { name: "Close" }).click();
  await expect(guide).toBeHidden();
});
