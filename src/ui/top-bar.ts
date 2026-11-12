import type { GameLoop } from "../game/loop";
import type { Snapshot } from "../simulation";
import { setText } from "./dom";
import {
  formatClock,
  formatDuration,
  formatFunding,
  formatLunation,
} from "./format";
import type { FullScreen } from "./full-screen";
import type { ChoiceResult } from "./refusal";

export interface TopBar {
  update(snapshot: Snapshot): void;
}

/**
 * The bar across the top of the screen: the game clock and the part of the
 * Lunation, the game speed and skipping to the next event, the Funding
 * balance beside the button that opens the Launch manifest screen, the
 * Science balance beside the buttons that open the Research Tasks and Tech
 * Tree screens, the button that opens the Guide, saving and loading, and,
 * in the desktop app (`fullScreen` and `exit`), the Full screen and Exit
 * buttons. It sends the
 * player's speed choices to the game loop.
 */
export function createTopBar(
  container: HTMLElement,
  loop: GameLoop,
  saveButtons: (showResult: (result: ChoiceResult) => void) => HTMLElement,
  showResult: (result: ChoiceResult) => void,
  openLaunchManifest: () => void,
  openResearchTasks: () => void,
  openTechTree: () => void,
  openGuide: () => void,
  fullScreen: FullScreen | undefined,
  exit: (() => void) | undefined,
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

  // The speed shown, so that a speed set from elsewhere, as the celebration
  // pauses the game, shows too, without touching the buttons every frame.
  let shownSpeedId: string | undefined;
  function showSelectedSpeed(): void {
    if (shownSpeedId === loop.speed.id) return;
    shownSpeedId = loop.speed.id;
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
    saveButtons(showResult),
  );
  if (fullScreen !== undefined) bar.append(fullScreenButton(fullScreen));
  if (exit !== undefined) bar.append(exitButton(exit));
  container.append(bar);
  showSelectedSpeed();

  return {
    update(snapshot) {
      showSelectedSpeed();
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

/**
 * Fills the screen with the window, or goes back to a window, as F11 does. It
 * shows pressed while the window fills the screen, however it got there. It
 * stays in the top bar in fullscreen, as the obvious way out: Escape doesn't
 * leave fullscreen, as it closes the game's screens (see electron/full-screen.ts).
 */
function fullScreenButton(fullScreen: FullScreen): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "top-bar__full-screen";
  button.textContent = "Full screen";
  button.setAttribute("aria-pressed", "false");
  button.title = "Fill the screen (F11).";
  button.addEventListener("click", () => {
    fullScreen.toggle();
  });
  fullScreen.watch((filled) => {
    button.setAttribute("aria-pressed", String(filled));
    button.title = filled
      ? "Go back to a window (F11)."
      : "Fill the screen (F11).";
  });
  return button;
}

/**
 * Closes the game, as the window's X does, asking first whether to save any
 * unsaved progress. In fullscreen the window has no X, so this is the way out.
 */
function exitButton(exit: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "top-bar__exit";
  button.textContent = "Exit";
  button.title = "Close the game, offering to save first.";
  button.addEventListener("click", exit);
  return button;
}
