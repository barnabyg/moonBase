import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";

// The smallest screen the panels are laid out for.
test.use({ viewport: { width: 1920, height: 1080 } });

/** Game-hours to run before watching, so that the base is well under way. */
const WARM_UP_HOURS = 4;
/**
 * Game-hours over which no row may go back to a place it has left. A row
 * may move once, when what it shows really changes for good, such as the
 * spare Components it lists being used, but not back and forth.
 */
const WATCHED_HOURS = 8;

/**
 * Where the top of every row shown in the status, Work and Base panels is
 * on the page, by row: each named line, by its name, and each entry of a
 * list, by the text it starts with, such as a Structure's name, numbered
 * where several start the same.
 */
async function rowTops(page: Page): Promise<Map<string, number>> {
  const rows = await page.evaluate(() =>
    ["Status panel", "Work", "Base"].flatMap((name) => {
      const panel = document.querySelector(`aside[aria-label="${name}"]`);
      if (panel === null) return [];
      const seen = new Map<string, number>();
      return [...panel.querySelectorAll<HTMLElement>('[role="status"], li')]
        .filter((row) => row.checkVisibility())
        .map((row): [string, number] => {
          let first: Element = row;
          while (first.firstElementChild !== null) {
            first = first.firstElementChild;
          }
          const key = row.getAttribute("aria-label") ?? first.textContent;
          const count = (seen.get(key) ?? 0) + 1;
          seen.set(key, count);
          return [
            `${name} › ${key} #${count}`,
            Math.round(row.getBoundingClientRect().top),
          ];
        });
    }),
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

/**
 * Loads a sample save and runs it at the fastest game speed with the player
 * doing nothing, checking once a frame that no row of the panels goes back
 * to a place it has left, or comes back after going, over some game-hours.
 * It is all counted in game time, so that a slow machine plays the same
 * game. Returns every text the row to watch showed meanwhile.
 */
async function watchRows(
  page: Page,
  save: string,
  watched: (page: Page) => Locator,
): Promise<Set<string>> {
  await page.goto("/?seed=1");
  await page.getByRole("button", { name: "Pause" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles(fileURLToPath(new URL(`../test/saves/${save}`, import.meta.url)));
  await expect(watched(page)).toBeVisible();
  await expect(page.getByRole("status", { name: "Game clock" })).toHaveText(
    /^Earth Day \d+, \d+:00$/,
  );

  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: /^\d+x$/ })
    .last()
    .click();
  const start = await gameHours(page);
  await expect
    .poll(() => gameHours(page))
    .toBeGreaterThanOrEqual(start + WARM_UP_HOURS);

  // Each row's places in turn, "gone" while it isn't shown.
  const places = new Map<string, (number | "gone")[]>();
  const texts = new Set<string>();
  for (let first = true; ; first = false) {
    const hours = await gameHours(page);
    if (hours >= start + WARM_UP_HOURS + WATCHED_HOURS) break;
    texts.add((await watched(page).textContent()) ?? "");
    const tops = await rowTops(page);
    for (const key of new Set([...places.keys(), ...tops.keys()])) {
      const place = tops.get(key) ?? "gone";
      const before = places.get(key) ?? (first ? [] : ["gone"]);
      if (before.at(-1) === place) continue;
      expect(
        before,
        `${key} goes back to ${place} at game-hour ${hours}, after ${before.join(", ")}`,
      ).not.toContain(place);
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
