import type { GameLoop } from "../game/loop";
import type { Forecasts, Snapshot } from "../simulation";
import { setText } from "./dom";
import {
  formatClock,
  formatLunation,
  formatPower,
  formatStoredPower,
  structureLabel,
} from "./format";

export interface StatusPanel {
  update(snapshot: Snapshot, forecasts: Forecasts): void;
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

  const power = document.createElement("p");
  power.className = "status-panel__power";
  power.setAttribute("role", "status");
  power.setAttribute("aria-label", "Power");
  power.setAttribute("aria-live", "off");

  const storedPower = document.createElement("p");
  storedPower.className = "status-panel__power";
  storedPower.setAttribute("role", "status");
  storedPower.setAttribute("aria-label", "Stored power");
  storedPower.setAttribute("aria-live", "off");

  const structures = document.createElement("ul");
  structures.className = "status-panel__structures";
  structures.setAttribute("aria-label", "Structures");
  const structureItems = new Map<string, HTMLLIElement>();

  panel.append(
    clock,
    lunation,
    speedGroup,
    skip,
    power,
    storedPower,
    structures,
  );
  container.append(panel);
  showSelectedSpeed();

  return {
    update(snapshot, forecasts) {
      setText(clock, formatClock(snapshot.clock));
      setText(lunation, formatLunation(snapshot.lunation));
      const hasStructures = snapshot.structures.length > 0;
      power.hidden = !hasStructures;
      storedPower.hidden = !hasStructures;
      setText(power, formatPower(snapshot.power));
      setText(storedPower, formatStoredPower(snapshot.power, forecasts.power));
      for (const structure of snapshot.structures) {
        let item = structureItems.get(structure.id);
        if (item === undefined) {
          item = document.createElement("li");
          structures.append(item);
          structureItems.set(structure.id, item);
        }
        setText(
          item,
          `${structureLabel(structure.structureTypeId)}: commissioned${structure.powered ? "" : ", no power"}`,
        );
      }
      structures.hidden = structureItems.size === 0;
    },
  };
}
