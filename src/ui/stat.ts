import { setText } from "./dom";
import { holdHeight } from "./hold";

/**
 * A figure in the status panel: its value, and an optional note on where
 * it is heading, shown after it, for example "24.2 kg" and "lasts 28d 19h".
 */
export interface Stat {
  readonly value: string;
  readonly note?: string;
  /**
   * The reason behind the figures, where they need one, kept off the line
   * and shown on hovering over it.
   */
  readonly explanation?: string;
}

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
 * jump as it changes at high game speed. Its bar is coloured by what its
 * figure means, neutral progress unless it says otherwise. Shown as a
 * warning, it is marked as one, in its colour and with a sign before the
 * figure.
 */
export function createStatLine(
  label: string,
  name = label,
  meterKind: MeterKind = "progress",
): StatLine {
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
  const meter = createMeter(meterKind);
  meter.element.classList.add("stat__meter");
  element.append(labelText, " ", body, meter.element);
  element.dataset["row"] = name;
  holdHeight(element);
  /** The explanation the line last showed as its title. */
  let explained = "";
  return {
    element,
    show(stat) {
      setText(value, stat.value);
      // Left empty without a note, so that the line reads as a whole.
      setText(separator, stat.note === undefined ? "" : " · ");
      setText(note, stat.note ?? "");
      // Only as it changes, so that a title a line's owner sets for itself,
      // as a Structure's pop-up does, is left alone.
      const explanation = stat.explanation ?? "";
      if (explanation !== explained) {
        element.title = explanation;
        explained = explanation;
      }
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
 * What a bar's figure means, which sets its colour, so that no colour means
 * both good and bad:
 * - a "level" is a store or a Condition, where more is better, and is green;
 * - "progress" is work done towards an end, neither good nor bad, and is a
 *   neutral blue-grey;
 * - a "limit" is a figure that must stay under a limit, such as a Radiation
 *   Dose or a Payload Mass: neutral while well clear of it, amber as it
 *   nears it, and the warning colour at it.
 * A line shown as a warning has its bar in the warning colour, whatever its
 * kind.
 */
export type MeterKind = "level" | "progress" | "limit";

/** From this share of its limit on, a figure is near it. */
const NEAR_LIMIT_FRACTION = 0.8;
/** From this share of its limit on, a figure is at it, or all but. */
const FULL_FRACTION = 0.95;

/** How near a figure is to its limit, given as a share of it. */
export function limitState(fraction: number): "clear" | "near" | "full" {
  if (fraction >= FULL_FRACTION) return "full";
  return fraction >= NEAR_LIMIT_FRACTION ? "near" : "clear";
}

export interface Meter {
  readonly element: HTMLElement;
  /** Shows how full it is, from 0 to 1, or hides it. */
  fill(fraction: number | undefined): void;
}

/**
 * A thin bar showing how full something is, from 0 to 1, or nothing when
 * there is nothing to fill, coloured by what its figure means. The figure
 * beside it says the same in words, so screen readers skip it.
 */
export function createMeter(kind: MeterKind): Meter {
  const element = document.createElement("span");
  element.className = `meter meter--${kind}`;
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
      if (kind === "limit") {
        const state = limitState(fraction);
        element.classList.toggle("meter--near", state === "near");
        element.classList.toggle("meter--full", state === "full");
      }
      const width = `${(Math.min(Math.max(fraction, 0), 1) * 100).toFixed(1)}%`;
      if (width !== shown) {
        bar.style.width = width;
        shown = width;
      }
    },
  };
}
