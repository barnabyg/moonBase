import type { Snapshot } from "../simulation";
import { setText } from "./dom";
import { formatDeath } from "./format";

export interface GameOverScreen {
  update(snapshot: Snapshot): void;
}

/**
 * The game-over screen, shown over everything once the Mission Director has
 * died: it explains how, and lets the player start a new Campaign.
 */
export function createGameOverScreen(
  container: HTMLElement,
  startNewCampaign: () => void,
): GameOverScreen {
  const dialog = document.createElement("dialog");
  dialog.className = "game-over";
  dialog.setAttribute("aria-labelledby", "game-over-title");

  const title = document.createElement("h2");
  title.id = "game-over-title";
  title.textContent = "Game over";

  const death = document.createElement("p");
  const ended = document.createElement("p");
  ended.textContent = "The Campaign is over.";

  const restart = document.createElement("button");
  restart.type = "button";
  restart.textContent = "Start a new Campaign";
  restart.addEventListener("click", startNewCampaign);

  dialog.append(title, death, ended, restart);
  // Escape would close a modal dialog, but nothing can go on after a death.
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
  });
  container.append(dialog);

  return {
    update(snapshot) {
      if (snapshot.ended === undefined) return;
      setText(death, formatDeath(snapshot.ended));
      // Firefox closes it anyway on a second Escape with no click between.
      if (!dialog.open) dialog.showModal();
    },
  };
}
