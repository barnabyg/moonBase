import type { Page } from "@playwright/test";

/**
 * Moves the pointer over the 3D view until the build menu says the
 * Structure may be placed there, then clicks to place it, and checks that it
 * was planned. The game is paused meanwhile, at whatever speed it was, as a
 * Machine driving onto the spot between the pointer reaching it and the
 * click would have the click refused. Returns where on the screen it clicked,
 * in page pixels.
 */
export async function placeOnClearGround(
  page: Page,
): Promise<{ readonly x: number; readonly y: number }> {
  const box = await page.locator("canvas").boundingBox();
  if (box === null) throw new Error("The 3D view has no size.");
  const speeds = page.getByRole("group", { name: "Game speed" });
  const speed = await speeds
    .locator('button[aria-pressed="true"]')
    .textContent();
  if (speed === null) throw new Error("No game speed is chosen.");
  await speeds.getByRole("button", { name: "Pause" }).click();
  const placement = page.getByRole("status", { name: "Placement" });
  const refusals: string[] = [];
  for (const [across, down] of [
    [0.3, 0.75],
    [0.7, 0.75],
    [0.25, 0.6],
    [0.75, 0.6],
    [0.5, 0.85],
  ] as const) {
    const x = box.x + box.width * across;
    const y = box.y + box.height * down;
    await page.mouse.move(x, y);
    const text = (await placement.textContent()) ?? "";
    if (text.startsWith("Click to place")) {
      await page.mouse.click(x, y);
      // The build menu says so at once, as the click is handled.
      const result = (await placement.textContent()) ?? "";
      if (/ planned\. /.test(result)) {
        await speeds.getByRole("button", { name: speed, exact: true }).click();
        return { x, y };
      }
      refusals.push(result);
    } else {
      refusals.push(text);
    }
  }
  throw new Error(
    `Found no clear ground to place the Structure on: ${refusals.join(" / ")}`,
  );
}
