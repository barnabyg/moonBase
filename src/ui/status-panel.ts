import { catalogue } from "../catalogue";
import type {
  Campaign,
  Forecasts,
  Snapshot,
  StructureSnapshot,
} from "../simulation";
import { setText } from "./dom";
import {
  describeExpedition,
  formatBulkResources,
  formatHabitatPower,
  formatLander,
  formatLifeSupport,
  formatMissionDirector,
  formatPower,
  formatRadiationDose,
  formatResearchTask,
  formatSelfSufficiency,
  formatSolarParticleEvent,
  formatSpareComponents,
  formatStock,
  formatStoredPower,
  stockLabel,
} from "./format";
import { createPanelSection } from "./panel-section";
import type { ChoiceResult } from "./refusal";
import { createStatLine } from "./stat";

export interface StatusPanel {
  update(snapshot: Snapshot, forecasts: Forecasts): void;
}

/**
 * The HTML status panel, in sections the player can fold away: how the
 * Mission Director is keeping, the base's power, its stock, the Lander and
 * Expeditions, and the Research Task running. It reads simulation snapshots
 * and forecasts, and sends a choice to send the Lander to the Campaign,
 * which decides whether it is allowed and says why not.
 */
export function createStatusPanel(
  container: HTMLElement,
  campaign: Pick<Campaign, "sendLander">,
  showResult: (result: ChoiceResult) => void,
  openExpeditions: () => void,
): StatusPanel {
  const panel = document.createElement("aside");
  panel.className = "status-panel";
  panel.setAttribute("aria-label", "Status panel");

  // How the Mission Director is keeping.
  const missionDirectorSection = createPanelSection(
    "mission-director",
    "Mission Director",
  );
  const residence = createStatLine("Living", "Mission Director");
  const habitatPower = createStatLine("Habitat power");
  // How much oxygen and water is left, and when it will run out.
  const stocks = catalogue.lifeSupportStocks.map((type) => ({
    type,
    line: createStatLine(type.label),
  }));
  // Whether the base is self-sufficient in oxygen and water, side by side.
  const selfSufficiencyLine = document.createElement("p");
  selfSufficiencyLine.className = "stat";
  const selfSufficiencyLabel = document.createElement("span");
  selfSufficiencyLabel.className = "stat__label";
  selfSufficiencyLabel.textContent = "Self-sufficient";
  const selfSufficiencyBody = document.createElement("span");
  selfSufficiencyBody.className = "stat__body stat__chips";
  selfSufficiencyLine.append(selfSufficiencyLabel, " ", selfSufficiencyBody);
  const selfSufficiency = catalogue.lifeSupportStocks.map((type) => {
    const chip = document.createElement("span");
    chip.className = "stat-chip";
    chip.setAttribute("role", "status");
    // Not starting with the stock's name, which labels its own line.
    chip.setAttribute(
      "aria-label",
      `Self-sufficiency in ${type.label.toLowerCase()}`,
    );
    chip.setAttribute("aria-live", "off");
    selfSufficiencyBody.append(chip, " ");
    return { type, chip };
  });
  // How much radiation the Mission Director has absorbed, and how fast.
  const radiationDose = createStatLine("Radiation", "Radiation Dose");
  // A Solar Particle Event that is coming or under way.
  const solarParticleEvent = createStatLine("Solar Particle Event");
  // An event coming or under way is always a warning, and its name too long
  // to sit beside it.
  solarParticleEvent.warn(true);
  solarParticleEvent.element.classList.add("stat--wide");
  missionDirectorSection.body.append(
    solarParticleEvent.element,
    residence.element,
    habitatPower.element,
    ...stocks.map(({ line }) => line.element),
    selfSufficiencyLine,
    radiationDose.element,
  );

  const powerSection = createPanelSection("power", "Power");
  const power = createStatLine("Power");
  const storedPower = createStatLine("Stored", "Stored power");
  powerSection.body.append(power.element, storedPower.element);

  // The base's stock: Components at the stockpile, bulk resources such as
  // Regolith, and spare Components and how long they will last.
  const stockSection = createPanelSection("stock", "Stock");
  const components = createStatLine("Components", "Base's stock");
  const bulkResources = document.createElement("div");
  bulkResources.className = "resources";
  bulkResources.setAttribute("role", "status");
  bulkResources.setAttribute("aria-label", "Bulk resources");
  bulkResources.setAttribute("aria-live", "off");
  const resourceCells = new Map<
    string,
    { cell: HTMLElement; amount: HTMLElement }
  >();
  const spareComponents = createStatLine("Spares", "Spare Components");
  stockSection.body.append(
    components.element,
    bulkResources,
    spareComponents.element,
  );

  // The Lander and any Expedition under way, each beside the button that
  // acts on it.
  const travelSection = createPanelSection("travel", "Lander & Expeditions");
  const lander = createStatLine("Lander");
  const sendLander = document.createElement("button");
  sendLander.type = "button";
  sendLander.className = "panel-button";
  sendLander.textContent = "Send the Lander";
  sendLander.title =
    "Send the Lander to Earth and back, which it can only do once the Mission Director has moved into a Habitat.";
  sendLander.addEventListener("click", () => {
    showResult(campaign.sendLander());
  });
  const expedition = createStatLine("Expedition");
  const expeditions = document.createElement("button");
  expeditions.type = "button";
  expeditions.className = "panel-button";
  expeditions.textContent = "Expeditions";
  expeditions.title =
    "Send the Robot off the map in the Rover, to come back with water ice.";
  expeditions.addEventListener("click", openExpeditions);
  const actions = document.createElement("div");
  actions.className = "panel-actions";
  actions.append(sendLander, expeditions);
  travelSection.body.append(lander.element, expedition.element, actions);

  // The Research Task running, how long it has left and how far it has got.
  const researchSection = createPanelSection("research", "Research");
  const researchTask = createStatLine("Task", "Research Task");
  researchSection.body.append(researchTask.element);

  const sections = [
    missionDirectorSection,
    powerSection,
    stockSection,
    travelSection,
    researchSection,
  ];
  panel.append(...sections.map((section) => section.element));
  container.append(panel);

  return {
    update(snapshot, forecasts) {
      const { missionDirector } = snapshot;
      residence.show({
        value: formatMissionDirector(missionDirector, snapshot.structures),
      });

      const habitatPowerStat = formatHabitatPower(
        missionDirector,
        snapshot.structures,
        forecasts.habitatPower,
      );
      habitatPower.element.hidden = habitatPowerStat === undefined;
      if (habitatPowerStat !== undefined) habitatPower.show(habitatPowerStat);
      // Shown as a warning from the first warning on, and once it has failed.
      const powerWarnFrom =
        Math.max(...catalogue.habitatPowerWarningHoursLeft) * 60;
      habitatPower.warn(
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
        line.element.hidden = stock === undefined;
        if (stock === undefined) continue;
        line.show(formatLifeSupport(stock, forecast, missionDirector));
        // Shown as a warning from the first warning on, and once it has run out.
        const warnFrom = Math.max(...type.warningEarthDaysLeft) * 24 * 60;
        line.warn(
          stock.kilograms === 0 ||
            (forecast?.minutesUntilEmpty ?? Infinity) <= warnFrom,
        );
      }

      for (const { type, chip } of selfSufficiency) {
        const judged = snapshot.selfSufficiency.find(
          (candidate) => candidate.stockId === type.id,
        );
        chip.hidden = judged === undefined;
        if (judged === undefined) continue;
        const { value, share, explanation } = formatSelfSufficiency(
          judged,
          missionDirector,
        );
        setText(
          chip,
          `${stockLabel(type.id)} ${value}${share === undefined ? "" : ` ${share}`}`,
        );
        if (chip.title !== explanation) chip.title = explanation;
        chip.classList.toggle("stat-chip--good", value === "yes");
      }
      selfSufficiencyLine.hidden = selfSufficiency.every(
        ({ chip }) => chip.hidden,
      );

      radiationDose.show(
        formatRadiationDose(
          snapshot.radiationDoseMillisieverts,
          forecasts.radiationDose,
          missionDirector,
        ),
      );
      const limit = catalogue.radiation.doseLimitMillisieverts;
      radiationDose.fill(snapshot.radiationDoseMillisieverts / limit);
      // Shown as a warning from the first warning on, and once it is reached.
      const doseWarnFrom =
        Math.max(...catalogue.radiation.warningEarthDaysLeft) * 24 * 60;
      radiationDose.warn(
        snapshot.radiationDoseMillisieverts >= limit ||
          (forecasts.radiationDose.minutesUntilLimit ?? Infinity) <=
            doseWarnFrom,
      );

      solarParticleEvent.element.hidden =
        snapshot.solarParticleEvent === undefined;
      if (snapshot.solarParticleEvent !== undefined) {
        solarParticleEvent.show(
          formatSolarParticleEvent(
            snapshot.solarParticleEvent,
            snapshot.clock.elapsedMinutes,
          ),
        );
      }

      // Nothing generates or stores power until the first Structure stands.
      powerSection.element.hidden = snapshot.structures.length === 0;
      power.show(formatPower(snapshot.power));
      const stored = formatStoredPower(snapshot.power, forecasts.power);
      storedPower.show(stored);
      storedPower.fill(stored.fraction);

      components.show({ value: formatStock(snapshot.stockpile) });
      for (const resource of formatBulkResources(
        snapshot.bulkResources,
        forecasts.bulkResources,
      )) {
        let entry = resourceCells.get(resource.label);
        if (entry === undefined) {
          const cell = document.createElement("span");
          cell.className = "resources__cell";
          const name = document.createElement("span");
          name.className = "resources__name";
          name.textContent = resource.label;
          const amount = document.createElement("span");
          amount.className = "resources__amount";
          cell.append(name, " ", amount, " ");
          bulkResources.append(cell);
          entry = { cell, amount };
          resourceCells.set(resource.label, entry);
        }
        setText(
          entry.amount,
          resource.note === undefined
            ? resource.value
            : `${resource.value} ${resource.note}`,
        );
        entry.cell.classList.toggle("resources__cell--empty", resource.empty);
      }
      spareComponents.show(formatSpareComponents(forecasts.spareComponents));
      // Shown as a warning from the first warning on.
      const sparesWarnFrom =
        Math.max(...catalogue.spareComponentWarningEarthDaysLeft) * 24 * 60;
      spareComponents.warn(
        (forecasts.spareComponents.minutesUntilEmpty ?? Infinity) <=
          sparesWarnFrom,
      );

      lander.show(
        formatLander(
          snapshot.lander,
          snapshot.clock.elapsedMinutes,
          snapshot.exports.aboard,
          snapshot.exportLoading,
        ),
      );
      sendLander.hidden = snapshot.lander.legEndsAtMinute !== undefined;
      expedition.show({
        value: describeExpedition(
          snapshot.expedition,
          snapshot.clock.elapsedMinutes,
        ),
      });

      researchTask.show(formatResearchTask(snapshot.researchTask));
      researchTask.fill(snapshot.researchTask?.progress);

      for (const section of sections) section.refreshWarning();
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
