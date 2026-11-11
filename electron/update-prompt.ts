// What happens once an update has downloaded: the player is asked whether to
// restart and install it now, or later. updates.ts does it with Electron and
// electron-updater; this decides. Only types are imported from Electron, so
// the unit tests can run this in plain Node.
import type { MessageBoxOptions } from "electron";

/** The player's answer to the update's question. */
export type UpdateChoice = "restart" | "later";

/** The steps of answering a downloaded update, which updates.ts does. */
export interface UpdateSteps {
  askPlayer(version: string): Promise<UpdateChoice>;
  /**
   * Closes the window as its close button does, so unsaved progress is
   * offered a save first (close-window.ts), and installs the update and
   * starts the game again once the window has closed.
   */
  restart(): void;
}

/**
 * Asks the player about the downloaded `version`. Restart now closes the
 * game through the question before closing, so the Campaign is never lost
 * mid-game: cancelling that question keeps the game open, and the update is
 * then installed when the player next closes the game. Later leaves it to
 * then too, which electron-updater does (autoInstallOnAppQuit).
 */
export async function answerDownloadedUpdate(
  version: string,
  steps: UpdateSteps,
): Promise<UpdateChoice> {
  const choice = await steps.askPlayer(version);
  if (choice === "restart") steps.restart();
  return choice;
}

const labels = ["Restart now", "Later"] as const;

/**
 * The message box asking whether to install `version` now. Enter restarts;
 * Escape, and the box's own close button, answer Later.
 */
export function updateQuestionOptions(version: string): MessageBoxOptions {
  return {
    type: "info",
    title: "Moon Base",
    message: `Moon Base ${version} is ready to install.`,
    detail:
      "Restart now to install it. If the Campaign has unsaved progress, you can save it first. Otherwise it is installed when you next close Moon Base.",
    buttons: [...labels],
    defaultId: labels.indexOf("Restart now"),
    cancelId: labels.indexOf("Later"),
    noLink: true,
  };
}

/** What the button at `response` in the update's message box chooses. */
export function updateChoice(response: number): UpdateChoice {
  return labels[response] === "Restart now" ? "restart" : "later";
}
