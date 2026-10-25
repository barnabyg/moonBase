/** Changes an element's text only when it differs, to spare the browser needless layout work. */
export function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}
