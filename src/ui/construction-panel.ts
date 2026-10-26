import type { Snapshot } from "../simulation";
import { describeWork, formatStage, structureLabel } from "./format";
import { setText } from "./dom";

export interface ConstructionPanel {
  update(snapshot: Snapshot): void;
}

interface Row {
  readonly item: HTMLLIElement;
  readonly stage: HTMLElement;
  readonly progress: HTMLProgressElement;
  readonly work: HTMLElement;
}

/**
 * The HTML Construction panel: each unfinished Construction's current stage,
 * its progress, and what is happening on it. It only reads snapshots.
 */
export function createConstructionPanel(
  container: HTMLElement,
): ConstructionPanel {
  const panel = document.createElement("aside");
  panel.className = "construction-panel";
  panel.setAttribute("aria-label", "Constructions");
  const heading = document.createElement("h2");
  heading.textContent = "Constructions";
  const list = document.createElement("ul");
  panel.append(heading, list);
  container.append(panel);

  const rows = new Map<string, Row>();
  const createRow = (title: string): Row => {
    const item = document.createElement("li");
    const name = document.createElement("p");
    name.className = "construction-panel__name";
    name.textContent = title;
    const stage = document.createElement("p");
    stage.className = "construction-panel__stage";
    const progress = document.createElement("progress");
    progress.max = 1;
    const work = document.createElement("p");
    work.className = "construction-panel__work";
    item.append(name, stage, progress, work);
    list.append(item);
    return { item, stage, progress, work };
  };

  return {
    update(snapshot) {
      panel.hidden = snapshot.constructions.length === 0;
      const seen = new Set<string>();
      for (const construction of snapshot.constructions) {
        seen.add(construction.id);
        let row = rows.get(construction.id);
        if (row === undefined) {
          row = createRow(structureLabel(construction.structureTypeId));
          rows.set(construction.id, row);
        }
        const stage = formatStage(construction.stage);
        const percent = Math.floor(construction.stageProgress * 100);
        setText(row.stage, `${stage}: ${percent}%`);
        row.progress.value = construction.stageProgress;
        row.progress.setAttribute("aria-label", `${stage} progress`);
        setText(row.work, describeWork(construction, snapshot));
      }
      for (const [id, row] of rows) {
        if (!seen.has(id)) {
          row.item.remove();
          rows.delete(id);
        }
      }
    },
  };
}
