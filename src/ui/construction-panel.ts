import type {
  Campaign,
  ConstructionSnapshot,
  GameEvent,
  MaintenanceSubject,
  Snapshot,
} from "../simulation";
import {
  describeDismantling,
  describeExportLoading,
  describeMaintenance,
  describeParking,
  describeUnloading,
  describeWork,
  drivenLabel,
  inSentence,
  isEveryRobotOnExpedition,
  formatComponents,
  formatDismantlingStage,
  formatMaintenanceStep,
  formatParkingPlace,
  formatStage,
  formatStageProgress,
  hasComponents,
  structureLabel,
  subjectLabel,
} from "./format";
import { setText } from "./dom";
import { createLingering, holdHeight } from "./hold";

export interface ConstructionPanel {
  /** Shows the snapshot, with the real time the frame counted, to time the rows that stay once their work is done. */
  update(snapshot: Snapshot, frameMs: number): void;
  /**
   * Hears the events of the game-minutes the game loop advances, to tell
   * work that is done from work that stopped for another reason before
   * the next update.
   */
  hear(events: readonly GameEvent[]): void;
  /**
   * Forgets every row, for a Campaign loaded in place of the last, which
   * may give the same ids to other Constructions.
   */
  startAfresh(): void;
}

/** The key of the row for unloading the Lander, which no Structure's id can be. */
const UNLOADING_ROW = "unloading the Lander";

/** The key of the row for loading Exports onto the Lander, which no Structure's id can be. */
const LOADING_ROW = "loading the Lander";

/** The start of the key of a row for maintaining a Structure, which no Structure's id has. */
const MAINTENANCE_ROW = "maintaining ";

/** The start of the key of a row for parking a Machine, which no Structure's id has. */
const PARKING_ROW = "parking ";

/**
 * The start of the key of a row for dismantling a Structure, which no
 * Structure's id has, so that it never takes the row its Construction left.
 */
const DISMANTLING_ROW = "dismantling ";

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
 * Lander or loading of Exports onto it, with its current stage, its
 * progress, and what is happening on it, or that there is no work under
 * way. Work that is done stays a few seconds, saying so, before its row
 * goes, and the panel stays in place and keeps its height, so that work
 * coming and going at high game speed doesn't move the rows below it, or
 * the Base panel. The player can cancel a
 * Construction from here, which removes it at once; the panel only sends
 * that choice to the Campaign.
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
  // In place of the rows while there are none, so that the panel stays.
  const idle = document.createElement("p");
  idle.className = "construction-panel__idle";
  idle.textContent = "No work under way";
  panel.append(heading, list, idle);
  container.append(panel);
  holdHeight(panel);

  const rows = new Map<string, Row>();
  // A row whose work is done stays a while, so that a Work Order raised
  // again soon after takes the same row and the rows below don't jump.
  // One whose work stopped for another reason, such as a Construction
  // cancelled or a Work Order no longer needed, goes at once.
  const done = createLingering<string>();
  /** The rows whose work the events since the last update say is done. */
  const finished = new Set<string>();
  /**
   * What each parking row parks, and whether a Robot was parking it when
   * last seen, to tell whether it ended parked: one that is plugged in
   * anyway, such as a Machine to move into a parking area's bay, may have
   * its Work Order dropped before a Robot takes it there.
   */
  const parked = new Map<
    string,
    { readonly subject: MaintenanceSubject; readonly underWay: boolean }
  >();
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
    holdHeight(item);
    return { item, stage, progress, work, cancel };
  };
  /** Lists a new row by its key, which it carries as a stable name for the row. */
  const keepRow = (key: string, row: Row) => {
    row.item.dataset["row"] = key;
    rows.set(key, row);
  };
  /** Finds a row by its key, taking it back if its work was done. */
  const rowFor = (key: string): Row | undefined => {
    const row = rows.get(key);
    if (row !== undefined && done.has(key)) {
      done.revive(key);
      if (row.cancel !== undefined) row.cancel.hidden = false;
    }
    return row;
  };
  const showStage = (row: Row, stage: string, stageProgress: number) => {
    setText(row.stage, formatStageProgress(stage, stageProgress));
    showProgress(row.progress, stageProgress, `${stage} progress`);
  };

  return {
    update(snapshot, frameMs) {
      // Every Work Order waits while the Robot is on an Expedition; with
      // more than one, the others carry on with them.
      const away = isEveryRobotOnExpedition(
        snapshot.robots,
        snapshot.expedition,
      );
      const showWork = (row: Row, work: () => string) => {
        setText(
          row.work,
          away ? "Waiting: the Robot is on an Expedition" : work(),
        );
      };
      const seen = new Set<string>();
      for (const maintenance of snapshot.maintenance) {
        const { target } = maintenance;
        const key = `${MAINTENANCE_ROW}${subjectId(target)}`;
        seen.add(key);
        let row = rowFor(key);
        if (row === undefined) {
          row = createRow(
            `Maintaining the ${inSentence(subjectLabel(target))}`,
            undefined,
          );
          // Maintenance comes before every other Work Order, so it is listed
          // first, in the order it was raised.
          const firstOther = [...rows].find(
            ([other]) => !other.startsWith(MAINTENANCE_ROW),
          )?.[1];
          list.insertBefore(row.item, firstOther?.item ?? null);
          keepRow(key, row);
        }
        showStage(
          row,
          formatMaintenanceStep(maintenance.step),
          maintenance.stageProgress,
        );
        showWork(row, () => describeMaintenance(maintenance, snapshot));
      }
      for (const parking of snapshot.parking) {
        const key = `${PARKING_ROW}${subjectId(parking.subject)}`;
        seen.add(key);
        parked.set(key, {
          subject: parking.subject,
          underWay: parking.underWay,
        });
        let row = rowFor(key);
        if (row === undefined) {
          row = createRow(
            `Parking the ${inSentence(drivenLabel(parking.subject))}`,
            undefined,
          );
          // Parking comes after Maintenance and before every other Work
          // Order, so it is listed in between.
          const firstOther = [...rows].find(
            ([other]) =>
              !other.startsWith(MAINTENANCE_ROW) &&
              !other.startsWith(PARKING_ROW),
          )?.[1];
          list.insertBefore(row.item, firstOther?.item ?? null);
          keepRow(key, row);
        }
        // How far it has to go isn't known, so it shows no progress.
        showProgress(row.progress, undefined, "Parking progress");
        setText(row.stage, `Parking ${formatParkingPlace(parking)}`);
        showWork(row, () => describeParking(parking, snapshot));
      }
      for (const construction of snapshot.constructions) {
        seen.add(construction.id);
        let row = rowFor(construction.id);
        if (row === undefined) {
          row = createRow(
            structureLabel(construction.structureTypeId),
            construction.id,
          );
          keepRow(construction.id, row);
        }
        showStage(
          row,
          formatStage(construction.stage),
          construction.stageProgress,
        );
        showWork(row, () => describeWork(construction, snapshot));
        if (row.cancel !== undefined) {
          row.cancel.title = describeCancelling(construction);
        }
      }
      for (const dismantling of snapshot.dismantlings) {
        const key = `${DISMANTLING_ROW}${dismantling.id}`;
        seen.add(key);
        let row = rowFor(key);
        if (row === undefined) {
          row = createRow(
            `Dismantling the ${structureLabel(dismantling.structureTypeId).toLowerCase()}`,
            undefined,
          );
          keepRow(key, row);
        }
        showStage(
          row,
          formatDismantlingStage(dismantling.stage),
          dismantling.stageProgress,
        );
        showWork(row, () => describeDismantling(dismantling, snapshot));
      }
      const { unloading } = snapshot;
      if (unloading !== undefined) {
        seen.add(UNLOADING_ROW);
        let row = rowFor(UNLOADING_ROW);
        if (row === undefined) {
          row = createRow("Unloading the Lander", undefined);
          keepRow(UNLOADING_ROW, row);
        }
        showStage(
          row,
          unloading.collected
            ? "Carrying to the stockpile"
            : "Taking off the Lander",
          unloading.stageProgress,
        );
        showWork(row, () => describeUnloading(unloading, snapshot));
      }
      const { exportLoading } = snapshot;
      if (exportLoading !== undefined) {
        seen.add(LOADING_ROW);
        let row = rowFor(LOADING_ROW);
        if (row === undefined) {
          row = createRow("Loading the Lander", undefined);
          keepRow(LOADING_ROW, row);
        }
        showStage(
          row,
          exportLoading.collected
            ? "Carrying to the Lander"
            : "Loading at the stockpile",
          exportLoading.stageProgress,
        );
        showWork(row, () => describeExportLoading(exportLoading, snapshot));
      }
      const remove = (id: string) => {
        rows.get(id)?.item.remove();
        rows.delete(id);
        parked.delete(id);
      };
      for (const id of done.tick(frameMs)) remove(id);
      for (const [id, row] of rows) {
        if (seen.has(id) || done.has(id)) continue;
        const parking = parked.get(id);
        const isDone =
          finished.has(id) ||
          (parking?.underWay === true &&
            isPluggedIn(snapshot, parking.subject));
        if (!isDone) {
          remove(id);
          continue;
        }
        // Done: it stays a while, saying so, in case more comes.
        done.finish(id);
        setText(row.stage, "Done");
        showProgress(row.progress, 1, "Done");
        setText(row.work, "");
        if (row.cancel !== undefined) row.cancel.hidden = true;
      }
      finished.clear();
      idle.hidden = rows.size > 0;
    },
    startAfresh() {
      for (const row of rows.values()) row.item.remove();
      rows.clear();
      finished.clear();
      parked.clear();
      done.startAfresh();
    },
    hear(events) {
      for (const event of events) {
        const key = finishedRow(event);
        if (key !== undefined) finished.add(key);
      }
    },
  };
}

/**
 * Shows how far a row's work has got, from 0 to 1, or that it isn't known,
 * named for screen readers, changing the page only where that changes.
 * Every row's update sets both, so that a row taken back after its work
 * was done shows its own again.
 */
function showProgress(
  progress: HTMLProgressElement,
  value: number | undefined,
  label: string,
): void {
  if (value === undefined) {
    if (progress.hasAttribute("value")) progress.removeAttribute("value");
  } else if (!progress.hasAttribute("value") || progress.value !== value) {
    progress.value = value;
  }
  if (progress.getAttribute("aria-label") !== label) {
    progress.setAttribute("aria-label", label);
  }
}

/** The key of the row whose work an event says is done, if any. */
function finishedRow(event: GameEvent): string | undefined {
  switch (event.kind) {
    case "construction-completed":
      return event.structureId;
    case "structure-dismantled":
      return `${DISMANTLING_ROW}${event.structureId}`;
    case "maintenance-completed":
      return `${MAINTENANCE_ROW}${subjectId(event.target)}`;
    case "lander-unloaded":
      return UNLOADING_ROW;
    case "lander-loaded":
      return LOADING_ROW;
    default:
      return undefined;
  }
}

/**
 * Whether a Machine or Rover is plugged in, as one the Robot has finished
 * parking is; one whose parking stopped for another reason isn't.
 */
function isPluggedIn(snapshot: Snapshot, subject: MaintenanceSubject): boolean {
  switch (subject.kind) {
    case "structure":
      return false;
    case "machine":
      return snapshot.machines.some(
        (machine) => machine.id === subject.machineId && machine.pluggedIn,
      );
    case "rover":
      return snapshot.rovers.some(
        (rover) => rover.id === subject.roverId && rover.pluggedIn,
      );
  }
}

/** The id of what a Maintenance or parking row is for. */
function subjectId(subject: MaintenanceSubject): string {
  switch (subject.kind) {
    case "structure":
      return subject.structureId;
    case "machine":
      return subject.machineId;
    case "rover":
      return subject.roverId;
  }
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
