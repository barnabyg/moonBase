import { setText } from "./dom";
import type { Stat } from "./format";
import { holdHeight } from "./hold";

export interface StatLine {
  readonly element: HTMLElement;
  /** Shows a figure, and its note if it has one. */
  show(stat: Stat): void;
  /** Shows how full something is, from 0 to 1, on a bar under the figure, or hides the bar. */
  fill(fraction: number | undefined): void;
  /** Shows the line as a warning, or not. */
  warn(warning: boolean): void;
}

/**
 * One line of the status panel: a short label, then a figure and an
 * optional note after it, such as "Oxygen 24.9 kg · lasts 41d 12h", with an
 * optional bar showing how full something is. It is a status, named for
 * screen readers, that isn't announced each time it changes. It keeps its
 * height a while when its text gets shorter, so that the lines below don't
 * jump as it changes at high game speed.
 */
export function createStatLine(label: string, name = label): StatLine {
  const element = document.createElement("p");
  element.className = "stat";
  element.setAttribute("role", "status");
  element.setAttribute("aria-label", name);
  element.setAttribute("aria-live", "off");
  const labelText = document.createElement("span");
  labelText.className = "stat__label";
  labelText.textContent = label;
  const body = document.createElement("span");
  body.className = "stat__body";
  const value = document.createElement("span");
  value.className = "stat__value";
  const separator = document.createElement("span");
  separator.className = "stat__separator";
  separator.setAttribute("aria-hidden", "true");
  const note = document.createElement("span");
  note.className = "stat__note";
  body.append(value, separator, note);
  const meter = createMeter();
  meter.element.classList.add("stat__meter");
  element.append(labelText, " ", body, meter.element);
  holdHeight(element);
  return {
    element,
    show(stat) {
      setText(value, stat.value);
      // Left empty without a note, so that the line reads as a whole.
      setText(separator, stat.note === undefined ? "" : " · ");
      setText(note, stat.note ?? "");
    },
    fill(fraction) {
      meter.fill(fraction);
    },
    warn(warning) {
      element.classList.toggle("stat--warning", warning);
    },
  };
}

/**
 * A thin bar showing how full something is, from 0 to 1, or nothing when
 * there is nothing to fill. The figure beside it says the same in words,
 * so screen readers skip it.
 */
export function createMeter(): {
  readonly element: HTMLElement;
  fill(fraction: number | undefined): void;
} {
  const element = document.createElement("span");
  element.className = "meter";
  element.setAttribute("aria-hidden", "true");
  element.hidden = true;
  const bar = document.createElement("span");
  bar.className = "meter__fill";
  element.append(bar);
  let shown: string | undefined;
  return {
    element,
    fill(fraction) {
      element.hidden = fraction === undefined;
      if (fraction === undefined) return;
      const width = `${(Math.min(Math.max(fraction, 0), 1) * 100).toFixed(1)}%`;
      if (width !== shown) {
        bar.style.width = width;
        shown = width;
      }
    },
  };
}
