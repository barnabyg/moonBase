import type { GameLoop } from "../game/loop";
import type { GameEvent } from "../simulation";
import { setText } from "./dom";
import { findCelebration } from "./celebration-text";

export interface CelebrationScreen {
  /** Hears the events of a game-minute, and celebrates a Milestone reached then that has a celebration. */
  hear(events: readonly GameEvent[]): void;
}

/**
 * The celebration, shown over everything as the last Milestone is reached: it
 * pauses the game while it is open, and Carry on closes it and sets the game
 * going again at the speed it had. A Campaign loaded with the Milestone already
 * reached isn't celebrated again, as nothing reaches it then.
 */
export function createCelebrationScreen(
  container: HTMLElement,
  loop: Pick<GameLoop, "speed" | "setSpeed">,
): CelebrationScreen {
  const dialog = document.createElement("dialog");
  dialog.className = "celebration";
  dialog.setAttribute("aria-labelledby", "celebration-title");

  const title = document.createElement("h2");
  title.id = "celebration-title";
  const text = document.createElement("p");

  const carryOn = document.createElement("button");
  carryOn.type = "button";
  carryOn.textContent = "Carry on";
  carryOn.addEventListener("click", () => {
    dialog.close();
  });

  dialog.append(title, text, carryOn);
  container.append(dialog);

  // The speed to go back to, once it is closed by Carry on or by Escape.
  let speedBefore: string | undefined;
  dialog.addEventListener("close", () => {
    if (speedBefore !== undefined) loop.setSpeed(speedBefore);
    speedBefore = undefined;
  });

  return {
    hear(events) {
      const celebration = findCelebration(events);
      if (celebration === undefined || dialog.open) return;
      setText(title, celebration.title);
      setText(text, celebration.text);
      speedBefore = loop.speed.id;
      loop.setSpeed("paused");
      dialog.showModal();
    },
  };
}
