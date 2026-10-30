import type { SaveFiles } from "../game/save-files";
import type { Snapshot } from "../simulation";
import { setText } from "./dom";
import { formatDeath } from "./game-over-text";
import { createSaveButtons } from "./save-buttons";

export interface GameOverScreen {
  update(snapshot: Snapshot): void;
}

/**
 * The game-over screen, shown over everything once the Mission Director has
 * died: it explains how, and lets the player start a new Campaign, save the
 * ended one, or load one from a file, which closes it unless that one has
 * ended too.
 */
export function createGameOverScreen(
  container: HTMLElement,
  startNewCampaign: () => void,
  saveFiles: SaveFiles,
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

  // Why a file the player chose to load was refused.
  const refusal = document.createElement("p");
  refusal.className = "game-over__refusal";
  refusal.setAttribute("role", "alert");
  refusal.hidden = true;
  const saveButtons = createSaveButtons(saveFiles, (result) => {
    refusal.hidden = result.ok;
    setText(refusal, result.ok ? "" : result.message);
  });

  const actions = document.createElement("div");
  actions.className = "game-over__actions";
  actions.append(restart, saveButtons);

  dialog.append(title, death, ended, actions, refusal);
  // Escape would close a modal dialog, but nothing can go on after a death.
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
  });
  container.append(dialog);

  return {
    update(snapshot) {
      if (snapshot.ended === undefined) {
        // A Campaign loaded from a file goes on.
        if (dialog.open) dialog.close();
        return;
      }
      setText(death, formatDeath(snapshot.ended));
      // Firefox closes it anyway on a second Escape with no click between.
      if (!dialog.open) dialog.showModal();
    },
  };
}
