import {
  nextInOrder,
  type AttentionLine,
  type AttentionTarget,
} from "./attention-text";
import { setText } from "./dom";
import { createLingering, holdHeight } from "./hold";

export interface AttentionList {
  readonly element: HTMLElement;
  /**
   * Shows what needs the player now, most urgent first, given the real time
   * the frame counted, in milliseconds, which times how long a line stays
   * once what it reported is over.
   */
  show(lines: readonly AttentionLine[], frameMs: number): void;
  /** Forgets every line, for a Campaign loaded in place of the last. */
  startAfresh(): void;
}

/** A line of the list on the page: its row and the button that follows it. */
interface Row {
  readonly item: HTMLLIElement;
  readonly button: HTMLButtonElement;
  /** Where the line leads, as it last stood. */
  leadsTo: AttentionTarget;
}

/**
 * The needs-attention list at the top of the status panel: a line for each
 * thing that needs the player now, most urgent first, each a button that
 * leads to where it is dealt with, and that points it out meanwhile, as
 * a row of the Base panel does. Nothing shows while there is nothing to
 * report. A line whose cause is over stays a few seconds, dimmed, so that one
 * that comes and goes at high game speed, such as a Plant waiting for an
 * input between Batches, doesn't move the panel's lines up and down; and
 * while any line shows, the list keeps the room it has taken.
 *
 * @param order Every kind of line there is, most urgent first.
 * @param follow Leads to where a line's cause is dealt with.
 * @param pointOut Points out what a line leads to while the pointer or the
 *   focus is on it, or stops when undefined.
 */
export function createAttentionList(
  order: readonly string[],
  follow: (target: AttentionTarget) => void,
  pointOut: (target: AttentionTarget | undefined) => void,
): AttentionList {
  const element = document.createElement("section");
  element.className = "attention";
  element.setAttribute("aria-label", "Needs attention");
  element.hidden = true;
  const heading = document.createElement("h2");
  heading.className = "attention__title";
  heading.textContent = "Needs attention";
  const list = document.createElement("ul");
  list.className = "attention__list";
  element.append(heading, list);
  holdHeight(element);

  const rows = new Map<string, Row>();
  const remove = (row: Row): void => {
    // Gone from under the pointer, it can't say the pointer has left.
    if (row.item.matches(":hover, :focus-within")) pointOut(undefined);
    row.item.remove();
  };
  // A line whose cause is over stays a while, so that one raised again soon
  // after takes the same row.
  const over = createLingering<string>();
  const createRow = (line: AttentionLine): Row => {
    const item = document.createElement("li");
    item.className = "attention__item";
    item.dataset["row"] = `Needs attention: ${line.id}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "attention__line";
    item.append(button);
    const row: Row = { item, button, leadsTo: line.leadsTo };
    button.addEventListener("click", () => {
      follow(row.leadsTo);
    });
    for (const pointing of ["pointerenter", "focusin"]) {
      item.addEventListener(pointing, () => {
        pointOut(row.leadsTo);
      });
    }
    for (const leaving of ["pointerleave", "focusout"]) {
      item.addEventListener(leaving, () => {
        pointOut(undefined);
      });
    }
    // In its place by urgency, among the lines already there.
    const next = nextInOrder(order, rows.keys(), line.id);
    list.insertBefore(
      item,
      (next === undefined ? undefined : rows.get(next))?.item ?? null,
    );
    holdHeight(item);
    rows.set(line.id, row);
    return row;
  };

  return {
    element,
    show(lines, frameMs) {
      for (const id of over.tick(frameMs)) {
        const row = rows.get(id);
        if (row !== undefined) remove(row);
        rows.delete(id);
      }
      const standing = new Set<string>();
      for (const line of lines) {
        standing.add(line.id);
        const row = rows.get(line.id) ?? createRow(line);
        over.revive(line.id);
        row.leadsTo = line.leadsTo;
        setText(row.button, line.text);
        row.item.classList.remove("attention__item--over");
        if (row.button.title !== TITLES[line.leadsTo.kind]) {
          row.button.title = TITLES[line.leadsTo.kind];
        }
      }
      for (const [id, row] of rows) {
        if (standing.has(id) || over.has(id)) continue;
        over.finish(id);
        row.item.classList.add("attention__item--over");
      }
      element.hidden = rows.size === 0;
    },
    startAfresh() {
      for (const row of rows.values()) remove(row);
      rows.clear();
      over.startAfresh();
      element.hidden = true;
    },
  };
}

/** What a line's button says it does, on hovering over it, by where it leads. */
const TITLES: Record<AttentionTarget["kind"], string> = {
  status: "Show its line in the status panel",
  map: "Show it on the map",
};
