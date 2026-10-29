import type { Renderer } from "../render/renderer";
import type { Snapshot } from "../simulation";
import { onClick } from "./click";
import { setText } from "./dom";
import type { ChoiceResult } from "./refusal";
import { createStatLine, type StatLine } from "./stat";
import {
  createStructureControls,
  type StructureChoices,
  type StructureControls,
} from "./structure-controls";
import { structureDetails, type DetailLine } from "./structure-details";

/** How far the pop-up stands to the side of the Structure, in pixels. */
const OFFSET_PX = 28;
/** How close the pop-up comes to the edge of the screen, in pixels. */
const EDGE_PX = 12;
/** How close it comes to the top, below the top bar, in pixels. */
const TOP_PX = 76;

export interface StructurePopUp {
  /** Shows the latest snapshot, beside where the Structure was last drawn. Call after drawing the frame. */
  update(snapshot: Snapshot): void;
  /** Closes it, for a Campaign loaded in place of the last, which may give the same ids to other Structures. */
  startAfresh(): void;
}

/** What the pop-up shows for the Structure it is open for. */
interface Shown {
  readonly structureId: string;
  readonly structureTypeId: string;
  readonly lines: Map<string, StatLine>;
  controls: StructureControls | undefined;
}

/**
 * The pop-up beside a Structure the player clicks on the map, commissioned,
 * under Construction or being dismantled: what it is and does, the state
 * it is in, and the same controls as its entry in the Base panel. It
 * updates live while open. Clicking another Structure switches to it;
 * clicking empty ground, pressing Esc or its close button closes it, and
 * so does the Structure going, once dismantled. Dragging to move the
 * camera isn't a click, and while a Structure is being placed, a click
 * places it rather than opening the pop-up.
 */
export function createStructurePopUp(
  container: HTMLElement,
  campaign: StructureChoices,
  showResult: (result: ChoiceResult) => void,
  view: Pick<Renderer, "canvas" | "pickStructure" | "structureOnScreen">,
  isPlacing: () => boolean,
): StructurePopUp {
  const popUp = document.createElement("section");
  popUp.className = "structure-pop-up";
  popUp.setAttribute("role", "dialog");
  popUp.hidden = true;
  const head = document.createElement("header");
  head.className = "structure-pop-up__head";
  const title = document.createElement("h2");
  title.className = "structure-pop-up__title";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "screen__close structure-pop-up__close";
  close.setAttribute("aria-label", "Close");
  close.title = "Close (Esc)";
  close.textContent = "×";
  head.append(title, close);
  const description = document.createElement("p");
  description.className = "structure-pop-up__description";
  const lines = document.createElement("div");
  lines.className = "structure-pop-up__lines";
  const actions = document.createElement("div");
  actions.className = "structure-pop-up__actions";
  popUp.append(head, description, lines, actions);
  container.append(popUp);

  let openFor: string | undefined;
  let shown: Shown | undefined;
  let latest: Snapshot | undefined;

  function hide(): void {
    openFor = undefined;
    shown = undefined;
    popUp.hidden = true;
    lines.replaceChildren();
    actions.replaceChildren();
  }

  /** Builds the pop-up afresh for a Structure, with a line for each of its type's. */
  function build(
    structureId: string,
    structureTypeId: string,
    detailLines: readonly DetailLine[],
  ): Shown {
    lines.replaceChildren();
    actions.replaceChildren();
    const built = new Map<string, StatLine>();
    for (const { label } of detailLines) {
      const line = createStatLine(label);
      built.set(label, line);
      lines.append(line.element);
    }
    return { structureId, structureTypeId, lines: built, controls: undefined };
  }

  function show(snapshot: Snapshot): void {
    if (openFor === undefined) return;
    const details = structureDetails(snapshot, openFor);
    if (details === undefined) {
      hide();
      return;
    }
    if (
      shown?.structureId !== details.structureId ||
      shown.structureTypeId !== details.structureTypeId ||
      details.lines.some(({ label }) => !shown?.lines.has(label))
    ) {
      shown = build(
        details.structureId,
        details.structureTypeId,
        details.lines,
      );
      setText(title, details.title);
      popUp.setAttribute("aria-label", details.title);
      setText(description, details.description);
    }
    for (const line of details.lines) {
      const statLine = shown.lines.get(line.label);
      if (statLine === undefined) continue;
      statLine.show(line.stat);
      statLine.fill(line.fraction);
      statLine.warn(line.warning === true);
      // In full on hover, for when it is too long for the pop-up.
      const text =
        line.stat.note === undefined
          ? line.stat.value
          : `${line.stat.value} · ${line.stat.note}`;
      if (statLine.element.title !== text) statLine.element.title = text;
    }
    const { commissioned } = details;
    if (commissioned !== undefined && shown.controls === undefined) {
      shown.controls = createStructureControls(
        commissioned,
        campaign,
        showResult,
      );
      actions.append(...shown.controls.elements);
    }
    if (commissioned !== undefined) {
      shown.controls?.update(snapshot, commissioned);
    }
    actions.hidden = commissioned === undefined;
    popUp.hidden = false;
  }

  /** Places the pop-up beside where the Structure is drawn, on the screen. */
  function place(structureId: string): void {
    const at = view.structureOnScreen(structureId);
    if (at === undefined) return;
    const bounds = container.getBoundingClientRect();
    const width = popUp.offsetWidth;
    const height = popUp.offsetHeight;
    const x = at.x - bounds.left;
    const y = at.y - bounds.top;
    // To the right of it, or to the left where there is no room.
    let left = x + OFFSET_PX;
    if (left + width > bounds.width - EDGE_PX) left = x - OFFSET_PX - width;
    left = clamp(left, EDGE_PX, bounds.width - EDGE_PX - width);
    const top = clamp(y - height / 2, TOP_PX, bounds.height - EDGE_PX - height);
    const transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    if (popUp.style.transform !== transform) popUp.style.transform = transform;
  }

  close.addEventListener("click", hide);
  // Esc closes it only when nothing else wants it: placing a Structure
  // cancels instead, and a screen open over the map closes first.
  window.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      openFor !== undefined &&
      !event.defaultPrevented &&
      !isPlacing() &&
      document.querySelector("dialog[open]") === null
    ) {
      hide();
    }
  });
  onClick(
    view.canvas,
    (event) => {
      if (event.button !== 0) return;
      const structureId = view.pickStructure(event.clientX, event.clientY);
      if (structureId === undefined) {
        hide();
        return;
      }
      openFor = structureId;
      if (latest !== undefined) {
        show(latest);
        place(structureId);
      }
    },
    // A click while placing a Structure places it.
    () => !isPlacing(),
  );

  return {
    update(snapshot) {
      latest = snapshot;
      show(snapshot);
      if (openFor !== undefined) place(openFor);
    },
    startAfresh() {
      hide();
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
