import type { Forecasts, Snapshot } from "../simulation";
import { setText } from "./dom";
import { writeMissionDirectorReport } from "./mission-director-report-text";
import { createScreen } from "./screen";

export interface MissionDirectorReportScreen {
  open(): void;
  update(snapshot: Snapshot, forecasts: Forecasts): void;
}

/**
 * The Mission Director's Report: what the Mission Director is pleased about
 * at the base, and what concerns them, in their own words, as things stand.
 * It keeps up as the game runs on while it is open, and works nothing out
 * while it is closed.
 */
export function createMissionDirectorReportScreen(
  container: HTMLElement,
): MissionDirectorReportScreen {
  const screen = createScreen(container, {
    className: "director-report",
    title: "Mission Director's Report",
  });
  screen.lead.textContent =
    "What the Mission Director is pleased about at the base, and what concerns them.";

  const pleased = createSide(
    screen.body,
    "pleased",
    "Pleased about",
    "Nothing in particular yet.",
  );
  const concerned = createSide(
    screen.body,
    "concerned",
    "Concerned about",
    "Nothing at the moment.",
  );

  return {
    open() {
      screen.open();
    },
    update(snapshot, forecasts) {
      if (!screen.dialog.open) return;
      const report = writeMissionDirectorReport(snapshot, forecasts);
      pleased.show(report.pleased);
      concerned.show(report.concerned);
    },
  };
}

/** A side of the report: a heading over a list of what the Mission Director says. */
function createSide(
  body: HTMLElement,
  id: string,
  title: string,
  none: string,
): { show(lines: readonly string[]): void } {
  const section = document.createElement("section");
  section.className = `director-report__side director-report__side--${id}`;
  section.setAttribute("aria-labelledby", `director-report-${id}`);
  const heading = document.createElement("h3");
  heading.id = `director-report-${id}`;
  heading.className = "screen__section-title";
  heading.textContent = title;
  const list = document.createElement("ul");
  list.className = "director-report__list";
  const empty = document.createElement("p");
  empty.className = "director-report__none";
  empty.textContent = none;
  section.append(heading, list, empty);
  body.append(section);

  let shown: readonly string[] = [];
  return {
    show(lines) {
      empty.hidden = lines.length > 0;
      if (
        lines.length === shown.length &&
        lines.every((line, index) => line === shown[index])
      ) {
        return;
      }
      shown = lines;
      while (list.children.length > lines.length) list.lastChild?.remove();
      for (const [index, line] of lines.entries()) {
        let item = list.children[index] as HTMLElement | undefined;
        if (item === undefined) {
          item = document.createElement("li");
          list.append(item);
        }
        setText(item, line);
      }
    },
  };
}
