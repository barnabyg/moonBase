import type { GameLoop } from "../game/loop";
import type {
  Campaign,
  DismantleResult,
  Forecasts,
  MoveInResult,
  Snapshot,
  StructureSnapshot,
} from "../simulation";
import { setText } from "./dom";
import { catalogue } from "../catalogue";
import {
  formatClock,
  formatHabitatPower,
  formatLander,
  formatLifeSupport,
  formatLunation,
  formatMissionDirector,
  formatPower,
  formatRadiationDose,
  formatStoredPower,
  structureLabel,
} from "./format";

/** How long a refusal stays on screen, in real milliseconds. */
const REFUSAL_SHOWN_MS = 8000;

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

  // Whether the Mission Director's Habitat has power, and when it will lose it.
  const habitatPower = document.createElement("p");
  habitatPower.className = "status-panel__habitat-power";
  habitatPower.setAttribute("role", "status");
  habitatPower.setAttribute("aria-label", "Habitat power");
  habitatPower.setAttribute("aria-live", "off");

  // How much oxygen and water is left, and when it will run out.
  const stocks = catalogue.lifeSupportStocks.map((type) => {
    const line = document.createElement("p");
    line.className = "status-panel__stock";
    line.setAttribute("role", "status");
    line.setAttribute("aria-label", type.label);
    line.setAttribute("aria-live", "off");
    return { type, line };
  });

  // How much radiation the Mission Director has absorbed, and how fast.
  const radiationDose = document.createElement("p");
  radiationDose.className = "status-panel__radiation";
  radiationDose.setAttribute("role", "status");
  radiationDose.setAttribute("aria-label", "Radiation Dose");
  radiationDose.setAttribute("aria-live", "off");

  // Why the player's latest choice was refused, for a few seconds, so that
  // it doesn't linger once things have changed.
  const refusal = document.createElement("p");
  refusal.className = "status-panel__refusal";
  refusal.setAttribute("role", "alert");
  refusal.hidden = true;
  let refusalTimer: ReturnType<typeof setTimeout> | undefined;
  const showResult = (result: DismantleResult | MoveInResult) => {
    clearTimeout(refusalTimer);
    refusal.hidden = result.ok;
    setText(refusal, result.ok ? "" : result.message);
    if (!result.ok) {
      refusalTimer = setTimeout(() => {
        refusal.hidden = true;
      }, REFUSAL_SHOWN_MS);
    }
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
      "Move the Mission Director from the Lander into this Habitat, which needs power. It happens at once and can't be undone.";
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
    habitatPower,
    ...stocks.map((stock) => stock.line),
    radiationDose,
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
      const habitatPowerText = formatHabitatPower(
        snapshot.missionDirector,
        snapshot.structures,
        forecasts.habitatPower,
      );
      habitatPower.hidden = habitatPowerText === undefined;
      setText(habitatPower, habitatPowerText ?? "");
      // Shown as a warning from the first warning on, and once it has failed.
      const powerWarnFrom =
        Math.max(...catalogue.habitatPowerWarningHoursLeft) * 60;
      habitatPower.classList.toggle(
        "status-panel__habitat-power--low",
        homeHabitat(snapshot)?.powered === false ||
          (forecasts.habitatPower?.minutesUntilPowerLost ?? Infinity) <=
            powerWarnFrom,
      );
      for (const { type, line } of stocks) {
        const stock = snapshot.lifeSupport.find(
          (candidate) => candidate.stockId === type.id,
        );
        const forecast = forecasts.lifeSupport.find(
          (candidate) => candidate.stockId === type.id,
        );
        line.hidden = stock === undefined;
        if (stock === undefined) continue;
        setText(
          line,
          formatLifeSupport(stock, forecast, snapshot.missionDirector),
        );
        // Shown as a warning from the first warning on, and once it has run out.
        const warnFrom = Math.max(...type.warningEarthDaysLeft) * 24 * 60;
        line.classList.toggle(
          "status-panel__stock--low",
          stock.kilograms === 0 ||
            (forecast?.minutesUntilEmpty ?? Infinity) <= warnFrom,
        );
      }
      setText(
        radiationDose,
        formatRadiationDose(
          snapshot.radiationDoseMillisieverts,
          forecasts.radiationDose,
          snapshot.missionDirector,
        ),
      );
      // Shown as a warning from the first warning on, and once it is reached.
      const doseWarnFrom =
        Math.max(...catalogue.radiation.warningEarthDaysLeft) * 24 * 60;
      radiationDose.classList.toggle(
        "status-panel__radiation--low",
        snapshot.radiationDoseMillisieverts >=
          catalogue.radiation.doseLimitMillisieverts ||
          (forecasts.radiationDose.minutesUntilLimit ?? Infinity) <=
            doseWarnFrom,
      );
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
        const shielding = isHabitat(structure.structureTypeId)
          ? `, ${structure.shielded ? "shielded" : "unshielded"}`
          : "";
        setText(
          entry.text,
          `${structureLabel(structure.structureTypeId)}: ${toBeDismantled ? "to be dismantled" : "commissioned"}${structure.powered ? "" : ", no power"}${structure.lit ? ", lit" : ""}${shielding}${home ? ", the Mission Director's home" : ""}`,
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

/** The Habitat the Mission Director lives in, if they have moved into one. */
function homeHabitat(snapshot: Snapshot): StructureSnapshot | undefined {
  const { missionDirector } = snapshot;
  return missionDirector.residence === "habitat"
    ? snapshot.structures.find(
        (structure) => structure.id === missionDirector.habitatId,
      )
    : undefined;
}

function isHabitat(structureTypeId: string): boolean {
  return (
    catalogue.structureTypes.find((type) => type.id === structureTypeId)
      ?.habitat === true
  );
}
