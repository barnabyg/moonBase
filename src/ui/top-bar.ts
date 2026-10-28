import type { GameLoop } from "../game/loop";
import type { SaveFiles } from "../game/save-files";
import type { Snapshot } from "../simulation";
import { setText } from "./dom";
import {
  formatClock,
  formatDuration,
  formatFunding,
  formatLunation,
} from "./format";
import type { ChoiceResult } from "./refusal";
import { createSaveButtons } from "./save-buttons";

export interface TopBar {
  update(snapshot: Snapshot): void;
}

/**
 * The bar across the top of the screen: the game clock and the part of the
 * Lunation, the game speed and skipping to the next event, the Funding
 * balance beside the button that opens the Launch manifest screen, the
 * Science balance beside the buttons that open the Research Tasks and Tech
 * Tree screens, the button that opens the Guide, and saving and loading.
 * It sends the player's speed choices to the game loop.
 */
export function createTopBar(
  container: HTMLElement,
  loop: GameLoop,
  saveFiles: SaveFiles,
  showResult: (result: ChoiceResult) => void,
  openLaunchManifest: () => void,
  openResearchTasks: () => void,
  openTechTree: () => void,
  openGuide: () => void,
): TopBar {
  const bar = document.createElement("section");
  bar.className = "top-bar";
  bar.setAttribute("aria-label", "Game controls");

  const time = document.createElement("div");
  time.className = "top-bar__time";
  const clock = document.createElement("p");
  clock.className = "top-bar__clock";
  clock.setAttribute("role", "status");
  clock.setAttribute("aria-label", "Game clock");
  // The clock changes several times a second; announcing each change would
  // drown out everything else for screen-reader users.
  clock.setAttribute("aria-live", "off");
  const lunation = document.createElement("p");
  lunation.className = "top-bar__lunation";
  lunation.setAttribute("role", "status");
  lunation.setAttribute("aria-label", "Lunation");
  lunation.setAttribute("aria-live", "off");
  time.append(clock, lunation);

  const speedGroup = document.createElement("div");
  speedGroup.className = "top-bar__speeds";
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
  skip.className = "top-bar__skip";
  skip.textContent = "Skip to next event";
  skip.addEventListener("click", () => {
    loop.skipToNextEvent();
  });
  speedGroup.append(skip);

  function showSelectedSpeed(): void {
    for (const button of speedButtons) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset["speedId"] === loop.speed.id),
      );
    }
  }

  const funding = document.createElement("div");
  funding.className = "top-bar__funding";
  const fundingLabel = document.createElement("span");
  fundingLabel.className = "top-bar__label";
  fundingLabel.textContent = "Funding";
  const fundingValue = document.createElement("span");
  fundingValue.className = "top-bar__funds";
  fundingValue.setAttribute("role", "status");
  fundingValue.setAttribute("aria-label", "Funding");
  const manifest = document.createElement("button");
  manifest.type = "button";
  manifest.textContent = "Launch manifest";
  manifest.title = "Choose what the next Launch brings from Earth.";
  manifest.addEventListener("click", openLaunchManifest);
  funding.append(fundingLabel, fundingValue, manifest);

  const science = document.createElement("div");
  science.className = "top-bar__science";
  const scienceLabel = document.createElement("span");
  scienceLabel.className = "top-bar__label";
  scienceLabel.textContent = "Science";
  const scienceValue = document.createElement("span");
  scienceValue.className = "top-bar__funds";
  scienceValue.setAttribute("role", "status");
  scienceValue.setAttribute("aria-label", "Science");
  const research = document.createElement("button");
  research.type = "button";
  research.textContent = "Research Tasks";
  research.title = "Start a Research Task, which earns Science.";
  research.addEventListener("click", openResearchTasks);
  const techTree = document.createElement("button");
  techTree.type = "button";
  techTree.textContent = "Tech Tree";
  techTree.title = "Spend Science to unlock a Design.";
  techTree.addEventListener("click", openTechTree);
  science.append(scienceLabel, scienceValue, research, techTree);

  const guide = document.createElement("button");
  guide.type = "button";
  guide.className = "top-bar__guide";
  guide.textContent = "Guide";
  guide.title =
    "How the base works, and what every Structure, Machine and technology does.";
  guide.addEventListener("click", openGuide);

  bar.append(
    time,
    speedGroup,
    funding,
    science,
    guide,
    createSaveButtons(saveFiles, showResult),
  );
  container.append(bar);
  showSelectedSpeed();

  return {
    update(snapshot) {
      setText(clock, formatClock(snapshot.clock));
      setText(lunation, formatLunation(snapshot.lunation));
      const part = snapshot.lunation.part === "daylight" ? "Daylight" : "Night";
      const title = `${part}: ${formatDuration(snapshot.lunation.minutesRemaining)} left`;
      if (lunation.title !== title) lunation.title = title;
      lunation.classList.toggle(
        "top-bar__lunation--night",
        snapshot.lunation.part !== "daylight",
      );
      setText(fundingValue, formatFunding(snapshot.fundingMillionDollars));
      setText(scienceValue, String(snapshot.science));
    },
  };
}
