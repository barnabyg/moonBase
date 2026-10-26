import type { GameLoop } from "../game/loop";
import type {
  Campaign,
  DismantleResult,
  Forecasts,
  MoveInResult,
  Snapshot,
} from "../simulation";
import { setText } from "./dom";
import { catalogue } from "../catalogue";
import {
  formatClock,
  formatLander,
  formatLunation,
  formatMissionDirector,
  formatPower,
  formatStoredPower,
  structureLabel,
} from "./format";

export interface StatusPanel {
  update(snapshot: Snapshot, forecasts: Forecasts): void;
}

/**
 * The HTML status panel. It reads simulation snapshots, sends the player's
 * speed choices to the game loop, and sends a choice to dismantle a Structure
 * or to move the Mission Director into a Habitat to the Campaign, which
 * decides whether it is allowed and says why not.
 */
export function createStatusPanel(
  container: HTMLElement,
  loop: GameLoop,
  campaign: Pick<Campaign, "dismantleStructure" | "moveMissionDirectorIn">,
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

  const missionDirector = document.createElement("p");
  missionDirector.className = "status-panel__residence";
  missionDirector.setAttribute("role", "status");
  missionDirector.setAttribute("aria-label", "Mission Director");

  const lander = document.createElement("p");
  lander.className = "status-panel__residence";
  lander.setAttribute("role", "status");
  lander.setAttribute("aria-label", "Lander");

  // Why the player's latest choice was refused, until one is allowed.
  const refusal = document.createElement("p");
  refusal.className = "status-panel__refusal";
  refusal.setAttribute("role", "alert");
  refusal.hidden = true;
  const showResult = (result: DismantleResult | MoveInResult) => {
    refusal.hidden = result.ok;
    setText(refusal, result.ok ? "" : result.message);
  };

  const structures = document.createElement("ul");
  structures.className = "status-panel__structures";
  structures.setAttribute("aria-label", "Structures");
  const structureItems = new Map<
    string,
    {
      readonly item: HTMLLIElement;
      readonly text: HTMLElement;
      readonly dismantle: HTMLButtonElement;
      readonly moveIn: HTMLButtonElement;
    }
  >();
  const createStructureItem = (structureId: string) => {
    const item = document.createElement("li");
    const text = document.createElement("span");
    const dismantle = document.createElement("button");
    dismantle.type = "button";
    dismantle.className = "status-panel__dismantle";
    dismantle.textContent = "Dismantle";
    dismantle.title =
      "Have the Robot take it apart and carry most of its Components back into the cargo stock.";
    dismantle.addEventListener("click", () => {
      showResult(campaign.dismantleStructure(structureId));
    });
    const moveIn = document.createElement("button");
    moveIn.type = "button";
    moveIn.className = "status-panel__move-in";
    moveIn.textContent = "Move in";
    moveIn.title =
      "Move the Mission Director from the Lander into this Habitat. It happens at once and can't be undone.";
    moveIn.hidden = true;
    moveIn.addEventListener("click", () => {
      showResult(campaign.moveMissionDirectorIn(structureId));
    });
    item.append(text, moveIn, dismantle);
    structures.append(item);
    return { item, text, dismantle, moveIn };
  };

  panel.append(
    clock,
    lunation,
    speedGroup,
    skip,
    power,
    storedPower,
    missionDirector,
    lander,
    structures,
    refusal,
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
      setText(
        missionDirector,
        formatMissionDirector(snapshot.missionDirector, snapshot.structures),
      );
      setText(lander, formatLander(snapshot.lander));
      const seen = new Set<string>();
      for (const structure of snapshot.structures) {
        seen.add(structure.id);
        let entry = structureItems.get(structure.id);
        if (entry === undefined) {
          entry = createStructureItem(structure.id);
          structureItems.set(structure.id, entry);
        }
        const toBeDismantled = snapshot.dismantlings.some(
          (dismantling) => dismantling.id === structure.id,
        );
        const home =
          snapshot.missionDirector.residence === "habitat" &&
          snapshot.missionDirector.habitatId === structure.id;
        setText(
          entry.text,
          `${structureLabel(structure.structureTypeId)}: ${toBeDismantled ? "to be dismantled" : "commissioned"}${structure.powered ? "" : ", no power"}${structure.lit ? ", lit" : ""}${home ? ", the Mission Director's home" : ""}`,
        );
        entry.dismantle.hidden = toBeDismantled;
        entry.moveIn.hidden =
          toBeDismantled ||
          snapshot.missionDirector.residence !== "lander" ||
          !isHabitat(structure.structureTypeId);
      }
      for (const [id, entry] of structureItems) {
        if (!seen.has(id)) {
          entry.item.remove();
          structureItems.delete(id);
        }
      }
      structures.hidden = structureItems.size === 0;
    },
  };
}

function isHabitat(structureTypeId: string): boolean {
  return (
    catalogue.structureTypes.find((type) => type.id === structureTypeId)
      ?.habitat === true
  );
}
