import type { Locator, Page } from "@playwright/test";

/** The colour a bar is filled with, as the browser draws it. */
export async function fillColour(meter: Locator): Promise<string> {
  return meter
    .locator(".meter__fill")
    .evaluate((bar) => getComputedStyle(bar).backgroundColor);
}

/** The colour one of the stylesheet's colour properties, such as "--good", comes to. */
export async function tokenColour(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  }, token);
}

/** What is shown before an element's text, such as a warning sign, or "none". */
export async function shownBefore(element: Locator): Promise<string> {
  return element.evaluate(
    (shown) => getComputedStyle(shown, "::before").content,
  );
}
