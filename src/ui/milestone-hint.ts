import { setText } from "./dom";
import { holdHeight } from "./hold";

export interface MilestoneHint {
  readonly element: HTMLElement;
  /** Shows a Milestone's hint, folded or whole as the player last left it. */
  show(hint: string): void;
}

/** How many lines of the hint show while it is folded. */
const FOLDED_LINES = 2;

/** What the button says while the hint is folded, and while it is whole. */
const SHOW_WHOLE = "Show all";
const SHOW_FOLDED = "Show less";

/**
 * The current Milestone's hint in the status panel. A long one would fill
 * the panel, so it is folded to its first lines, with a button under it that
 * shows the rest, by mouse or by keyboard, and folds it again. The button is
 * there only while there is more to show. The player's choice stays as the
 * Milestones go by, so that the line changes height only when they ask,
 * until a hint short enough to show whole in those lines folds it again. The
 * whole hint is always there for a screen reader, folded or not. It is a
 * status like any other line of the panel, and keeps its height when its
 * words get shorter.
 */
export function createMilestoneHint(): MilestoneHint {
  const element = document.createElement("div");
  element.className = "milestone-hint";
  element.dataset["row"] = "Milestone hint";
  element.style.setProperty("--folded-lines", String(FOLDED_LINES));

  const text = document.createElement("p");
  text.className = "milestone-hint__text";
  text.id = "milestone-hint-text";
  text.setAttribute("role", "status");
  text.setAttribute("aria-label", "Milestone hint");
  text.setAttribute("aria-live", "off");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "milestone-hint__toggle";
  toggle.setAttribute("aria-controls", text.id);
  toggle.hidden = true;
  element.append(text, toggle);

  let whole = false;
  const refresh = (): void => {
    const foldedPx =
      FOLDED_LINES * Number.parseFloat(getComputedStyle(text).lineHeight);
    // A hint that fits in the lines it folds to has no more to show, so it
    // counts as folded: otherwise the room a longer one took whole would
    // stay, with no button to give it back. Its height can't be told while
    // its section is folded away and it has no size.
    if (whole) {
      text.classList.remove("milestone-hint__text--folded");
      const { clientHeight } = text;
      if (clientHeight > 0 && clientHeight <= foldedPx + 1) whole = false;
    }
    text.classList.toggle("milestone-hint__text--folded", !whole);
    toggle.setAttribute("aria-expanded", String(whole));
    setText(toggle, whole ? SHOW_FOLDED : SHOW_WHOLE);
    // Folded, it needs the button only if some of it is cut off.
    toggle.hidden = !whole && text.scrollHeight <= text.clientHeight + 1;
    // Folding it gives back the room the whole of it took.
    holdHeight(element, whole ? "whole" : "folded");
  };
  toggle.addEventListener("click", () => {
    whole = !whole;
    refresh();
  });
  // Its lines change with the panel's width, and it has none until its
  // section is opened.
  new ResizeObserver(refresh).observe(text);
  refresh();

  return {
    element,
    show(hint) {
      if (text.textContent === hint) return;
      text.textContent = hint;
      refresh();
    },
  };
}
