import { catalogue } from "../catalogue";
import type { Campaign, Snapshot } from "../simulation";
import { setText } from "./dom";
import { formatDuration } from "./format";
import { resourceLabel } from "./labels";
import { describeExpedition } from "./status-panel-text";
import { createScreen } from "./screen";

export interface ExpeditionsScreen {
  open(): void;
  update(snapshot: Snapshot): void;
}

/**
 * The Expeditions screen, where the player sends a Robot off the map in the
 * Rover, and sees how the Expedition under way is going and when it will
 * be back. It only sends the choice to start one to the Campaign, which
 * decides whether it is allowed and says why not. The game runs on while
 * it is open.
 */
export function createExpeditionsScreen(
  container: HTMLElement,
  campaign: Pick<Campaign, "startExpedition">,
): ExpeditionsScreen {
  const screen = createScreen(container, {
    className: "expeditions",
    title: "Expeditions",
  });
  const { expeditions } = catalogue;
  screen.lead.textContent = `A Robot finishes the Work Order it holds, then drives the Rover off the map. It is away for ${formatDuration(expeditions.awayEarthDays * 24 * 60)}, and comes back with ${expeditions.kilograms} kg of ${resourceLabel(expeditions.resourceId).toLowerCase()}.`;

  // The one under way, or that none is.
  const card = document.createElement("section");
  card.className = "screen__card";
  const heading = document.createElement("p");
  heading.className = "screen__eyebrow";
  const status = document.createElement("p");
  status.className = "expeditions__status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-label", "Expedition under way");
  card.append(heading, status);

  const start = document.createElement("button");
  start.type = "button";
  start.className = "screen__button";
  start.textContent = "Start an Expedition";
  start.addEventListener("click", () => {
    const result = campaign.startExpedition();
    screen.refuse(result.ok ? undefined : result.message);
  });
  const note = document.createElement("p");
  note.className = "expeditions__note";
  note.textContent =
    "With only one Robot, every Work Order waits while it is away.";
  const actions = document.createElement("div");
  actions.className = "expeditions__actions";
  actions.append(start, note);

  screen.body.append(card, actions);

  return {
    open() {
      screen.open();
    },
    update(snapshot) {
      const underWay = snapshot.expedition !== undefined;
      setText(heading, underWay ? "Under way" : "None under way");
      const described =
        snapshot.expedition === undefined
          ? "A Robot and the Rover are ready to go."
          : describeExpedition(
              snapshot.expedition,
              snapshot.clock.elapsedMinutes,
            );
      setText(status, described.charAt(0).toUpperCase() + described.slice(1));
      card.classList.toggle("screen__card--idle", !underWay);
      // Its button stays, so that starting another says why it can't.
      start.classList.toggle("screen__button--primary", !underWay);
      note.hidden = snapshot.robots.length > 1;
    },
  };
}
