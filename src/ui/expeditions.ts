import { catalogue } from "../catalogue";
import type { Campaign, Snapshot } from "../simulation";
import { setText } from "./dom";
import { formatDuration, formatExpedition, resourceLabel } from "./format";

export interface ExpeditionsScreen {
  open(): void;
  update(snapshot: Snapshot): void;
}

/**
 * The Expeditions screen, where the player sends the Robot off the map in
 * the Rover, and sees how the Expedition under way is going and when it
 * will be back. It only sends the choice to start one to the Campaign,
 * which decides whether it is allowed and says why not. The game runs on
 * while it is open.
 */
export function createExpeditionsScreen(
  container: HTMLElement,
  campaign: Pick<Campaign, "startExpedition">,
): ExpeditionsScreen {
  const dialog = document.createElement("dialog");
  dialog.className = "expeditions";
  dialog.setAttribute("aria-labelledby", "expeditions-title");

  const title = document.createElement("h2");
  title.id = "expeditions-title";
  title.textContent = "Expeditions";
  const { expeditions } = catalogue;
  const intro = document.createElement("p");
  intro.textContent = `The Robot finishes the Work Order it holds, then drives the Rover off the map. It is away for ${formatDuration(expeditions.awayEarthDays * 24 * 60)}, and comes back with ${expeditions.kilograms} kg of ${resourceLabel(expeditions.resourceId).toLowerCase()}. While it is away, every Work Order waits.`;

  const status = document.createElement("p");
  status.className = "expeditions__status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-label", "Expedition under way");

  const start = document.createElement("button");
  start.type = "button";
  start.textContent = "Start an Expedition";

  // Why the latest start was refused, until the screen is closed.
  const refusal = document.createElement("p");
  refusal.className = "expeditions__refusal";
  refusal.setAttribute("role", "alert");
  refusal.hidden = true;
  start.addEventListener("click", () => {
    const result = campaign.startExpedition();
    refusal.hidden = result.ok;
    setText(refusal, result.ok ? "" : result.message);
  });

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.addEventListener("click", () => {
    dialog.close();
  });

  dialog.append(title, intro, status, start, refusal, close);
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
        formatExpedition(snapshot.expedition, snapshot.clock.elapsedMinutes),
      );
    },
  };
}
