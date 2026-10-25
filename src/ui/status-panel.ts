import type { GameLoop } from "../game/loop";
import type { Snapshot } from "../simulation";
import { formatClock, formatLunation } from "./format";

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

  const lunation = document.createElement("p");
  lunation.className = "status-panel__lunation";
  lunation.setAttribute("role", "status");
  lunation.setAttribute("aria-label", "Lunation");
  lunation.setAttribute("aria-live", "off");

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

  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "status-panel__skip";
  skip.textContent = "Skip to next event";
  skip.addEventListener("click", () => {
    loop.skipToNextEvent();
  });

  function showSelectedSpeed(): void {
    for (const button of speedButtons) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset["speedId"] === loop.speed.id),
      );
    }
  }

  panel.append(clock, lunation, speedGroup, skip);
  container.append(panel);
  showSelectedSpeed();

  return {
    update(snapshot) {
      setText(clock, formatClock(snapshot.clock));
      setText(lunation, formatLunation(snapshot.lunation));
    },
  };
}

/** Changes an element's text only when it differs, to spare the browser needless layout work. */
function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}
