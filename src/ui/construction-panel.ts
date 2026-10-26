import type { Campaign, ConstructionSnapshot, Snapshot } from "../simulation";
import {
  describeDismantling,
  describeMaintenance,
  describeUnloading,
  describeWork,
  formatComponents,
  formatDismantlingStage,
  formatMaintenanceStep,
  formatStage,
  hasComponents,
  structureLabel,
  subjectLabel,
} from "./format";
import { setText } from "./dom";

export interface ConstructionPanel {
  update(snapshot: Snapshot): void;
  /**
   * Forgets every row, for a Campaign loaded in place of the last, which
   * may give the same ids to other Constructions.
   */
  startAfresh(): void;
}

/** The key of the row for unloading the Lander, which no Structure's id can be. */
const UNLOADING_ROW = "unloading the Lander";

/** The start of the key of a row for maintaining a Structure, which no Structure's id has. */
const MAINTENANCE_ROW = "maintaining ";

interface Row {
  readonly item: HTMLLIElement;
  readonly stage: HTMLElement;
  readonly progress: HTMLProgressElement;
  readonly work: HTMLElement;
  readonly cancel: HTMLButtonElement | undefined;
}

/**
 * The HTML Work panel: each Maintenance Work Order, each unfinished
 * Construction, each Structure being dismantled and any unloading of the
 * Lander, with its current stage, its
 * progress, and what is happening on it. The player can cancel a
 * Construction from here; the panel only sends that choice to the Campaign.
 */
export function createConstructionPanel(
  container: HTMLElement,
  campaign: Pick<Campaign, "cancelConstruction">,
): ConstructionPanel {
  const panel = document.createElement("aside");
  panel.className = "construction-panel";
  panel.setAttribute("aria-label", "Work");
  const heading = document.createElement("h2");
  heading.textContent = "Work";
  const list = document.createElement("ul");
  panel.append(heading, list);
  container.append(panel);

  const rows = new Map<string, Row>();
  /** A row, with a Cancel button if given the id of a Construction it cancels. */
  const createRow = (
    title: string,
    constructionId: string | undefined,
  ): Row => {
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
    let cancel: HTMLButtonElement | undefined;
    if (constructionId !== undefined) {
      cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "construction-panel__cancel";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => {
        campaign.cancelConstruction(constructionId);
      });
      item.append(cancel);
    }
    list.append(item);
    return { item, stage, progress, work, cancel };
  };
  const showStage = (row: Row, stage: string, stageProgress: number) => {
    const percent = Math.floor(stageProgress * 100);
    setText(row.stage, `${stage}: ${percent}%`);
    row.progress.value = stageProgress;
    row.progress.setAttribute("aria-label", `${stage} progress`);
  };

  return {
    update(snapshot) {
      panel.hidden =
        snapshot.constructions.length === 0 &&
        snapshot.dismantlings.length === 0 &&
        snapshot.unloading === undefined &&
        snapshot.maintenance.length === 0;
      const seen = new Set<string>();
      for (const maintenance of snapshot.maintenance) {
        const { target } = maintenance;
        const key = `${MAINTENANCE_ROW}${target.kind === "structure" ? target.structureId : target.machineId}`;
        seen.add(key);
        let row = rows.get(key);
        if (row === undefined) {
          row = createRow(
            `Maintaining the ${subjectLabel(target).toLowerCase()}`,
            undefined,
          );
          // Maintenance comes before every other Work Order, so it is listed
          // first, in the order it was raised.
          const firstOther = [...rows].find(
            ([other]) => !other.startsWith(MAINTENANCE_ROW),
          )?.[1];
          list.insertBefore(row.item, firstOther?.item ?? null);
          rows.set(key, row);
        }
        showStage(
          row,
          formatMaintenanceStep(maintenance.step),
          maintenance.stageProgress,
        );
        setText(row.work, describeMaintenance(maintenance, snapshot));
      }
      for (const construction of snapshot.constructions) {
        seen.add(construction.id);
        let row = rows.get(construction.id);
        if (row === undefined) {
          row = createRow(
            structureLabel(construction.structureTypeId),
            construction.id,
          );
          rows.set(construction.id, row);
        }
        showStage(
          row,
          formatStage(construction.stage),
          construction.stageProgress,
        );
        setText(row.work, describeWork(construction, snapshot));
        if (row.cancel !== undefined) {
          row.cancel.title = describeCancelling(construction);
        }
      }
      for (const dismantling of snapshot.dismantlings) {
        seen.add(dismantling.id);
        let row = rows.get(dismantling.id);
        if (row === undefined) {
          row = createRow(
            `Dismantling the ${structureLabel(dismantling.structureTypeId).toLowerCase()}`,
            undefined,
          );
          rows.set(dismantling.id, row);
        }
        showStage(
          row,
          formatDismantlingStage(dismantling.stage),
          dismantling.stageProgress,
        );
        setText(row.work, describeDismantling(dismantling, snapshot));
      }
      const { unloading } = snapshot;
      if (unloading !== undefined) {
        seen.add(UNLOADING_ROW);
        let row = rows.get(UNLOADING_ROW);
        if (row === undefined) {
          row = createRow("Unloading the Lander", undefined);
          rows.set(UNLOADING_ROW, row);
        }
        showStage(
          row,
          unloading.collected
            ? "Carrying to the stockpile"
            : "Taking off the Lander",
          unloading.stageProgress,
        );
        setText(row.work, describeUnloading(unloading, snapshot));
      }
      for (const [id, row] of rows) {
        if (!seen.has(id)) {
          row.item.remove();
          rows.delete(id);
        }
      }
    },
    startAfresh() {
      for (const row of rows.values()) row.item.remove();
      rows.clear();
    },
  };
}

/** Says what cancelling a Construction now would give back. */
function describeCancelling(construction: ConstructionSnapshot): string {
  if (!hasComponents(construction.structureTypeId)) {
    return "Cancel it. It uses no Components.";
  }
  if (!construction.componentsTaken) {
    return "Cancel it. Its Components haven't left the base's stock.";
  }
  return construction.unusedComponents.length === 0
    ? "Cancel it. Its Components are all assembled, so none go back into the base's stock."
    : `Cancel it, putting ${formatComponents(construction.unusedComponents)} back into the base's stock.`;
}
