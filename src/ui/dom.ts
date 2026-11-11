/** Changes an element's text only when it differs, to spare the browser needless layout work. */
export function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

/**
 * Puts a list's entries in order, moving only those out of place, so that
 * an entry the player is using keeps its focus while the order holds.
 */
export function placeInOrder(
  list: HTMLElement,
  items: readonly HTMLElement[],
): void {
  for (const [place, item] of items.entries()) {
    const there = list.children[place];
    if (there !== item) list.insertBefore(item, there ?? null);
  }
}
