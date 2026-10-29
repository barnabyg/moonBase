import { setText } from "./dom";

/** Where the browser keeps which sections the player has folded away. */
const FOLDED_KEY = "moonBase.foldedSections";

function readFolded(): Set<string> {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(FOLDED_KEY) ?? "[]",
    );
    return new Set(
      Array.isArray(stored)
        ? stored.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function writeFolded(folded: ReadonlySet<string>): void {
  try {
    localStorage.setItem(FOLDED_KEY, JSON.stringify([...folded]));
  } catch {
    // Without storage, sections simply open again on the next visit.
  }
}

export interface PanelSection {
  readonly element: HTMLDetailsElement;
  /** Where the section's lines go. */
  readonly body: HTMLElement;
  /** Shows how many things the section lists beside its title, or nothing. */
  count(count: number | undefined): void;
  /**
   * Sums up the section's headline figures beside its title, shown only
   * while it is folded, or nothing.
   */
  summarise(summary: string | undefined): void;
  /** Marks the title while anything in the section is a warning, so it shows even when folded. */
  refreshWarning(): void;
}

/**
 * A titled section of a panel that the player can fold away to save room,
 * and that stays folded on their next visit. Sections start open.
 */
export function createPanelSection(id: string, title: string): PanelSection {
  const element = document.createElement("details");
  element.className = "panel-section";
  element.open = !readFolded().has(id);
  const summary = document.createElement("summary");
  summary.className = "panel-section__title";
  const name = document.createElement("span");
  name.textContent = title;
  const badge = document.createElement("span");
  badge.className = "panel-section__count";
  badge.hidden = true;
  // Shown only while folded, in place of the lines it sums up.
  const summaryLine = document.createElement("span");
  summaryLine.className = "panel-section__summary";
  summaryLine.setAttribute("role", "status");
  summaryLine.setAttribute("aria-label", `${title} summary`);
  summaryLine.setAttribute("aria-live", "off");
  summaryLine.hidden = true;
  const warning = document.createElement("span");
  warning.className = "panel-section__warning";
  warning.title = "Something here needs attention";
  warning.hidden = true;
  summary.append(name, badge, summaryLine, warning);
  const body = document.createElement("div");
  body.className = "panel-section__body";
  element.append(summary, body);
  element.addEventListener("toggle", () => {
    const folded = readFolded();
    if (element.open) folded.delete(id);
    else folded.add(id);
    writeFolded(folded);
  });
  return {
    element,
    body,
    count(count) {
      badge.hidden = count === undefined;
      setText(badge, count === undefined ? "" : String(count));
    },
    summarise(text) {
      summaryLine.hidden = text === undefined;
      setText(summaryLine, text ?? "");
      // In full on hover, for when it is cut short beside a long title.
      if (summaryLine.title !== (text ?? "")) summaryLine.title = text ?? "";
    },
    refreshWarning() {
      warning.hidden =
        body.querySelector(
          ".stat--warning:not([hidden]), .stat-chip--warning:not([hidden])",
        ) === null;
    },
  };
}
