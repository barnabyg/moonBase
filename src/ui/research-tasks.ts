import { catalogue } from "../catalogue";
import type { Campaign, Snapshot } from "../simulation";
import { setText } from "./dom";
import {
  describeResearch,
  formatDuration,
  formatScience,
  researchTaskMinutes,
} from "./format";

export interface ResearchTasksScreen {
  open(): void;
  update(snapshot: Snapshot): void;
}

/**
 * The Research Tasks screen, where the player starts a Research Task to earn
 * Science: each with its length and the Science it pays, which one is
 * running and how long it has left, and which have been completed. It only
 * sends the choice to start one to the Campaign, which decides whether it is
 * allowed and says why not. The game runs on while it is open.
 */
export function createResearchTasksScreen(
  container: HTMLElement,
  campaign: Pick<Campaign, "startResearchTask">,
): ResearchTasksScreen {
  const dialog = document.createElement("dialog");
  dialog.className = "research-tasks";
  dialog.setAttribute("aria-labelledby", "research-tasks-title");

  const title = document.createElement("h2");
  title.id = "research-tasks-title";
  title.textContent = "Research Tasks";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-label", "Research Task running");

  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headings = document.createElement("tr");
  for (const text of ["Research Task", "Length", "Pays", ""]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = text;
    headings.append(cell);
  }
  head.append(headings);
  const body = document.createElement("tbody");
  table.append(head, body);

  // Why the latest start was refused, until the next one.
  const refusal = document.createElement("p");
  refusal.className = "research-tasks__refusal";
  refusal.setAttribute("role", "alert");
  refusal.hidden = true;

  const rows = catalogue.researchTasks.map((task) => {
    const row = document.createElement("tr");
    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = task.label;
    const length = document.createElement("td");
    length.textContent = formatDuration(researchTaskMinutes(task));
    const pays = document.createElement("td");
    pays.textContent = formatScience(task.science);
    const action = document.createElement("td");
    action.className = "research-tasks__action";
    // Whether it is running or completed, in place of the button.
    const state = document.createElement("span");
    const start = document.createElement("button");
    start.type = "button";
    start.textContent = "Start";
    start.setAttribute("aria-label", `Start ${task.label}`);
    start.addEventListener("click", () => {
      const result = campaign.startResearchTask(task.id);
      refusal.hidden = result.ok;
      setText(refusal, result.ok ? "" : result.message);
    });
    action.append(state, start);
    row.append(name, length, pays, action);
    body.append(row);
    return { task, state, start };
  });

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.addEventListener("click", () => {
    dialog.close();
  });

  dialog.append(title, status, table, refusal, close);
  dialog.addEventListener("close", () => {
    refusal.hidden = true;
  });
  container.append(dialog);

  return {
    open() {
      if (!dialog.open) dialog.showModal();
    },
    update(snapshot) {
      const running = snapshot.researchTask;
      setText(status, describeResearch(running));
      for (const { task, state, start } of rows) {
        const shown =
          running?.researchTaskId === task.id
            ? "Running"
            : snapshot.completedResearchTaskIds.includes(task.id)
              ? "Completed"
              : "";
        setText(state, shown);
        // Another's button stays, so that starting it says why it can't.
        start.hidden = shown !== "";
      }
    },
  };
}
