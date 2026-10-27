import { catalogue } from "../catalogue";
import {
  designLabel,
  type Campaign,
  type DesignUnlockedEvent,
  type Snapshot,
} from "../simulation";
import { setText } from "./dom";
import { describeDesignState, formatScience } from "./format";

export interface TechTreeScreen {
  open(): void;
  update(snapshot: Snapshot): void;
}

/**
 * The Tech Tree screen, where the player spends Science to unlock a Design:
 * every Design by category, with its cost, the Designs it needs first and
 * whether it is unlocked, can be unlocked now or is out of reach, and why.
 * It only sends the choice to unlock one to the Campaign, which decides
 * whether it is allowed and says why not, and passes on the notification of
 * one unlocked. The game runs on while it is open.
 */
export function createTechTreeScreen(
  container: HTMLElement,
  campaign: Pick<Campaign, "unlockDesign">,
  onUnlocked: (event: DesignUnlockedEvent) => void,
): TechTreeScreen {
  const dialog = document.createElement("dialog");
  dialog.className = "tech-tree";
  dialog.setAttribute("aria-labelledby", "tech-tree-title");

  const title = document.createElement("h2");
  title.id = "tech-tree-title";
  title.textContent = "Tech Tree";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-label", "Science to spend");

  // Why the latest unlocking was refused, until the next one.
  const refusal = document.createElement("p");
  refusal.className = "tech-tree__refusal";
  refusal.setAttribute("role", "alert");
  refusal.hidden = true;

  const categories = catalogue.designCategories.map((category) => {
    const section = document.createElement("section");
    section.setAttribute("aria-label", category.label);
    const heading = document.createElement("h3");
    heading.textContent = category.label;
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headings = document.createElement("tr");
    for (const text of ["Design", "Cost", "Needs first", ""]) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = text;
      headings.append(cell);
    }
    head.append(headings);
    const body = document.createElement("tbody");
    table.append(head, body);
    section.append(heading, table);
    return { id: category.id, section, body };
  });

  const rows = catalogue.designs.map((design) => {
    const row = document.createElement("tr");
    const name = document.createElement("th");
    name.scope = "row";
    const label = document.createElement("span");
    label.className = "tech-tree__label";
    label.textContent = design.label;
    const description = document.createElement("span");
    description.className = "tech-tree__description";
    description.textContent = design.description;
    name.append(label, description);
    const cost = document.createElement("td");
    cost.textContent = design.starting
      ? "Starting"
      : formatScience(design.scienceCost);
    const needs = document.createElement("td");
    needs.textContent =
      design.prerequisiteDesignIds.length === 0
        ? "Nothing"
        : design.prerequisiteDesignIds.map(designLabel).join(", ");
    const action = document.createElement("td");
    action.className = "tech-tree__action";
    // Whether it is unlocked, can be now, or why not.
    const state = document.createElement("span");
    const unlock = document.createElement("button");
    unlock.type = "button";
    unlock.textContent = "Unlock";
    unlock.setAttribute("aria-label", `Unlock ${design.label}`);
    unlock.addEventListener("click", () => {
      const result = campaign.unlockDesign(design.id);
      refusal.hidden = result.ok;
      setText(refusal, result.ok ? "" : result.message);
      if (result.ok) onUnlocked(result.event);
    });
    action.append(state, unlock);
    row.append(name, cost, needs, action);
    categories
      .find((category) => category.id === design.category)
      ?.body.append(row);
    return { design, state, unlock };
  });

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.addEventListener("click", () => {
    dialog.close();
  });

  dialog.append(
    title,
    status,
    ...categories
      .filter((category) => category.body.childElementCount > 0)
      .map((category) => category.section),
    refusal,
    close,
  );
  dialog.addEventListener("close", () => {
    refusal.hidden = true;
  });
  container.append(dialog);

  return {
    open() {
      if (!dialog.open) dialog.showModal();
    },
    update(snapshot) {
      setText(
        status,
        `${formatScience(snapshot.science)} to spend. Unlocking a Design permits what it covers, but adds nothing to the base.`,
      );
      for (const { design, state, unlock } of rows) {
        const described = describeDesignState(design, snapshot);
        setText(state, described.text);
        const className = `tech-tree__state tech-tree__state--${described.state}`;
        if (state.className !== className) state.className = className;
        // One out of reach keeps its button, so that unlocking it says why it can't.
        unlock.hidden = described.state === "unlocked";
      }
    },
  };
}
