import type { GameLoop } from "../game/loop";
import type { Snapshot } from "../simulation";
import { formatClock } from "./format";

export interface StatusPanel {
  update(snapshot: Snapshot): void;
}

/**
 * The HTML status panel. It reads simulation snapshots and sends the player's
 * speed choices to the game loop; it never changes the simulation itself.
 */
export function createStatusPanel(
  container: HTMLElement,
  loop: GameLoop,
): StatusPanel {
  const panel = document.createElement("aside");
  panel.className = "status-panel";
  panel.setAttribute("aria-label", "Status panel");

  const clock = document.createElement("p");
  clock.className = "status-panel__clock";
  clock.setAttribute("role", "status");
  clock.setAttribute("aria-label", "Game clock");
  // The clock changes several times a second; announcing each change would
  // drown out everything else for screen-reader users.
  clock.setAttribute("aria-live", "off");

  const speedGroup = document.createElement("div");
  speedGroup.className = "status-panel__speeds";
  speedGroup.setAttribute("role", "group");
  speedGroup.setAttribute("aria-label", "Game speed");

  const speedButtons = loop.speeds.map((speed) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = speed.label;
    button.dataset["speedId"] = speed.id;
    button.addEventListener("click", () => {
      loop.setSpeed(speed.id);
      showSelectedSpeed();
    });
    speedGroup.append(button);
    return button;
  });

  function showSelectedSpeed(): void {
    for (const button of speedButtons) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset["speedId"] === loop.speed.id),
      );
    }
  }

  panel.append(clock, speedGroup);
  container.append(panel);
  showSelectedSpeed();

  return {
    update(snapshot) {
      const text = formatClock(snapshot.clock);
      if (clock.textContent !== text) clock.textContent = text;
    },
  };
}
