import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { crowdedSave, useCrowdedCatalogue, type SaveFile } from "./crowded";
import { placeOnClearGround } from "./placement";

// The smallest screen the panels are laid out for.
test.use({ viewport: { width: 1920, height: 1080 } });

/** Game-hours to run before watching, so that the base is well under way. */
const WARM_UP_HOURS = 4;
/**
 * Game-hours over which no row may go back to a place it has left. A row
 * may move once, when what it shows really changes for good, such as the
 * spare Components it lists being used, but not back and forth. It is
 * longer than anything the panels hold in place for, 5 real seconds or 10
 * game-hours at 20x, so that a hold let go and taken up again would show.
 */
const WATCHED_HOURS = 16;
/** How far, in pixels, a row may be from a place to count as there. */
const TOLERANCE_PX = 1;

/** The parts of the page whose rows are watched: the panels, and any screen open over them. */
const REGIONS = {
  "Status panel": 'aside[aria-label="Status panel"]',
  Work: 'aside[aria-label="Work"]',
  Base: 'aside[aria-label="Base"]',
  Screen: "dialog[open]",
  "Pop-up": 'section[role="dialog"]:not([hidden])',
};

/**
 * Where the top of every row shown in the watched parts of the page is, by
 * the stable name each row carries in its data-row attribute.
 */
async function rowTops(page: Page): Promise<Map<string, number>> {
  const rows = await page.evaluate(
    (regions) =>
      Object.entries(regions).flatMap(([name, selector]) => {
        const region = document.querySelector(selector);
        if (region === null) return [];
        return [...region.querySelectorAll<HTMLElement>("[data-row]")]
          .filter((row) => row.checkVisibility())
          .map((row): [string, number] => [
            `${name} › ${row.dataset["row"] ?? ""}`,
            row.getBoundingClientRect().top,
          ]);
      }),
    REGIONS,
  );
  return new Map(rows);
}

/** The game-hours since the Campaign began, read from the game clock. */
async function gameHours(page: Page): Promise<number> {
  const clock = await page
    .getByRole("status", { name: "Game clock" })
    .textContent();
  const match = /Earth Day (\d+), (\d+):00/.exec(clock ?? "");
  if (match === null) throw new Error(`Can't read the clock "${clock}".`);
  return Number(match[1]) * 24 + Number(match[2]);
}

/**
 * Waits until the game has drawn a frame. The game updates its interface in
 * each animation frame, and a callback added now runs after the game's.
 */
async function nextFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      }),
  );
}

/** A row's place on the page, or "gone" while it isn't shown. */
type Place = number | "gone";

const samePlace = (a: Place | undefined, b: Place): boolean =>
  a === b ||
  (typeof a === "number" &&
    typeof b === "number" &&
    Math.abs(a - b) <= TOLERANCE_PX);

/**
 * Loads a sample save, or starts a new Campaign, and runs it at the fastest
 * game speed with the player doing nothing, checking once a frame that no
 * row goes back to a place it has left, or comes back after going, over
 * some game-hours. It is all counted in game time, so that a slow machine
 * plays the same game. Returns every text the row to watch showed
 * meanwhile.
 */
async function watchRows(
  page: Page,
  save: string | SaveFile | undefined,
  watched: (page: Page) => Locator,
  /**
   * What the player does once the game runs, before leaving the base to
   * itself, such as opening a screen, which takes the pointer from the
   * rest of the page.
   */
  prepare?: (page: Page) => Promise<void>,
): Promise<Set<string>> {
  await page.goto("/?seed=1");
  await page.getByRole("button", { name: "Pause" }).click();
  if (save !== undefined) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Load", exact: true }).click();
    await (
      await chooser
    ).setFiles(
      typeof save === "string"
        ? fileURLToPath(new URL(`../test/saves/${save}`, import.meta.url))
        : save,
    );
  }
  await expect(page.getByRole("status", { name: "Game clock" })).toHaveText(
    /^Earth Day \d+, \d+:00$/,
  );

  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: /^\d+x$/ })
    .last()
    .click();
  await prepare?.(page);
  await expect(watched(page)).toBeVisible();
  const start = await gameHours(page);
  await expect
    .poll(() => gameHours(page))
    .toBeGreaterThanOrEqual(start + WARM_UP_HOURS);

  // Each row's places in turn.
  const places = new Map<string, Place[]>();
  const texts = new Set<string>();
  for (let first = true; ; first = false) {
    const hours = await gameHours(page);
    if (hours >= start + WARM_UP_HOURS + WATCHED_HOURS) break;
    texts.add((await watched(page).textContent()) ?? "");
    const tops = await rowTops(page);
    for (const key of new Set([...places.keys(), ...tops.keys()])) {
      const place = tops.get(key) ?? "gone";
      const before = places.get(key) ?? (first ? [] : ["gone"]);
      if (samePlace(before.at(-1), place)) continue;
      expect(
        before.some((left) => samePlace(left, place)),
        `${key} goes back to ${place} at game-hour ${hours}, after ${before.join(", ")}`,
      ).toBe(false);
      places.set(key, [...before, place]);
    }
    await nextFrame(page);
  }
  expect(places.size).toBeGreaterThan(15);
  return texts;
}

test("at the fastest game speed, the panels' rows keep their order and place while a Plant works through its Batches", async ({
  page,
}) => {
  // A vacuum fabrication plant waiting for silicon, which the extraction
  // plant makes a little of in each of its Batches, while the excavator
  // digs Regolith by itself.
  const texts = await watchRows(page, "version-35.moonbase", (on) =>
    on
      .getByRole("list", { name: "Structures" })
      .getByRole("listitem")
      .filter({ hasText: "Vacuum fabrication plant" }),
  );

  // What it said changed meanwhile, under the rows it used to push about.
  expect(texts.size).toBeGreaterThan(2);
});

test("at the fastest game speed, the panels' rows keep their order and place while Work Orders are raised, claimed and finished", async ({
  page,
}) => {
  // The Robot maintaining one Machine after another, and parking the Rover.
  const texts = await watchRows(page, "version-13.moonbase", (on) =>
    on.getByRole("complementary", { name: "Work" }),
  );

  // A Work Order was finished while the rows were watched.
  expect([...texts].some((text) => text.includes("Done"))).toBe(true);
});

test("at the fastest game speed, the Research Tasks screen's lines keep their place while a Research Task counts down", async ({
  page,
}) => {
  const screen = (on: Page) =>
    on.getByRole("dialog", { name: "Research Tasks" });
  const running = (on: Page) =>
    screen(on).getByRole("status", { name: "Research Task running" });
  const texts = await watchRows(
    page,
    "version-35.moonbase",
    running,
    async (on) => {
      // Once the save has loaded, which has a vacuum fabrication plant.
      await expect(
        on
          .getByRole("list", { name: "Structures" })
          .getByText("Vacuum fabrication plant"),
      ).toBeVisible();
      await on.getByRole("button", { name: "Research Tasks" }).click();
      // Two Earth Days long, so that it runs all the time it is watched,
      // the time it has left changing length as it goes.
      await screen(on)
        .getByRole("button", { name: "Start Dust levitation study" })
        .click();
      await expect(running(on)).toContainText("Dust levitation study");
    },
  );

  // The time it has left changed while it was watched.
  expect(texts.size).toBeGreaterThan(2);
});

test("at the fastest game speed, the panels' rows keep their place while the Robot parks Machines in a parking area's bays", async ({
  page,
}) => {
  // The excavator being parked in a bay, and the regolith printer and the
  // Rover to follow.
  const texts = await watchRows(page, "version-38.moonbase", (on) =>
    on.getByRole("complementary", { name: "Work" }),
  );

  expect(
    [...texts].some((text) => text.includes("in a bay of the parking area")),
  ).toBe(true);
});

test("at the fastest game speed, the panels' rows keep their place while a telescope observes through the Night", async ({
  page,
}) => {
  const texts = await watchRows(page, "version-39.moonbase", (on) =>
    on
      .getByRole("complementary", { name: "Status panel" })
      .getByRole("status", { name: "Observing programme" }),
  );

  // How long its round has left changed while it was watched.
  expect(texts.size).toBeGreaterThan(2);
});

test("at the fastest game speed, on a catalogue of 80 Launch items, the Launch manifest's rows keep their place while the player changes what it carries", async ({
  page,
}) => {
  await useCrowdedCatalogue(page);
  const screen = (on: Page) =>
    on.getByRole("dialog", { name: "Launch manifest" });
  const cost = (on: Page) =>
    screen(on).getByRole("status", { name: "Launch cost" });
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: /^\d+x$/ })
    .last()
    .click();
  await page.getByRole("button", { name: "Launch manifest" }).click();
  const find = screen(page).getByRole("searchbox", { name: "Find an item" });
  await find.fill("made-up part 1");
  await expect(cost(page)).toBeVisible();
  const tops = await rowTops(page);
  const rows = [...tops.keys()].filter((key) =>
    key.startsWith("Screen › made-up-part-"),
  );
  expect(rows.length).toBeGreaterThan(5);

  // Adding many of an item, then taking them off again, which turns its row
  // chosen and back, changes its count from one digit to two and the cost's
  // words as it goes from nothing to something and back.
  const add = screen(page).getByRole("button", {
    name: "Add one Made-up part 1",
    exact: true,
  });
  const remove = screen(page).getByRole("button", {
    name: "Remove one Made-up part 1",
    exact: true,
  });
  const start = await gameHours(page);
  const clicks: Locator[] = [
    ...Array<Locator>(12).fill(add),
    ...Array<Locator>(12).fill(remove),
  ];
  for (const button of clicks) {
    await button.click();
    await nextFrame(page);
    const now = await rowTops(page);
    for (const row of rows) {
      expect(
        samePlace(now.get(row), tops.get(row) ?? "gone"),
        `${row} moved from ${tops.get(row)} to ${now.get(row)}`,
      ).toBe(true);
    }
    await expect(find).toHaveValue("made-up part 1");
  }
  // The game ran on all the while.
  expect(await gameHours(page)).toBeGreaterThan(start);
  await expect(cost(page)).toContainText("nothing");
});

test("at the fastest game speed, the status panel's rows keep their place with 15 bulk resources while silicon runs out and wafers are made", async ({
  page,
}) => {
  await useCrowdedCatalogue(page);
  const texts = await watchRows(page, crowdedSave(), (on) =>
    on
      .getByRole("complementary", { name: "Status panel" })
      .getByRole("status", { name: "Bulk resources", exact: true }),
  );

  // Their figures changed while they were watched.
  expect(texts.size).toBeGreaterThan(2);
});

test("at the fastest game speed, a Structure's pop-up keeps its lines in place while it is built", async ({
  page,
}) => {
  const popUp = (on: Page) => on.getByRole("dialog", { name: "Solar array" });
  const texts = await watchRows(page, undefined, popUp, async (on) => {
    await on
      .getByRole("complementary", { name: "Build menu" })
      .getByRole("button", { name: /Solar array/ })
      .click();
    const site = await placeOnClearGround(on);
    await on.mouse.click(site.x, site.y);
  });

  // Its Construction went on while the pop-up was watched.
  expect(texts.size).toBeGreaterThan(2);
});
