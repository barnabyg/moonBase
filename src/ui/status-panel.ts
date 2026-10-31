import { catalogue } from "../catalogue";
import {
  milestoneHint,
  milestoneLabel,
  type Campaign,
  type Forecasts,
  type Snapshot,
  type StructureSnapshot,
} from "../simulation";
import { setText } from "./dom";
import { stockLabel } from "./labels";
import {
  describeExpedition,
  explainObservingProgramme,
  formatAct,
  formatBulkResources,
  formatHabitatPower,
  formatLander,
  formatLifeSupport,
  formatMissionDirector,
  formatNextMilestone,
  formatObservingProgramme,
  formatPower,
  formatRadiationDose,
  formatResearchTask,
  formatSelfSufficiency,
  formatSolarParticleEvent,
  formatSpareComponents,
  formatStock,
  formatStoredPower,
  summariseMilestones,
  summariseMissionDirector,
  summarisePower,
  summariseResearch,
  summariseBulkResources,
  summariseStock,
  summariseTravel,
  withSwitchedOffPlants,
  withSwitchedOffSpareMakers,
} from "./status-panel-text";
import { holdHeight } from "./hold";
import { createPanelSection } from "./panel-section";
import type { ChoiceResult } from "./refusal";
import { createStatLine } from "./stat";

/**
 * A line of words in the Milestones section, a status like any other line of
 * the panel, that keeps its height when its words get shorter.
 */
function createMilestoneText(className: string, name: string): HTMLElement {
  const line = document.createElement("p");
  line.className = className;
  line.setAttribute("role", "status");
  line.setAttribute("aria-label", name);
  line.setAttribute("aria-live", "off");
  line.dataset["row"] = name;
  holdHeight(line);
  return line;
}

export interface StatusPanel {
  update(snapshot: Snapshot, forecasts: Forecasts): void;
  /** Forgets which bulk resources have shown, for a Campaign loaded in place of the last. */
  startAfresh(): void;
}

/**
 * The HTML status panel, in sections the player can fold away: the current
 * Act, the Milestone to aim for now and the one after it, how the Mission
 * Director is keeping, the base's power, its stock, its bulk resources, the Lander
 * and Expeditions, and the Research Task running, with the observing
 * programme once the base has a telescope. A folded section keeps its
 * headline figures in sight beside its title. It reads simulation snapshots
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

  // The Act the Campaign is in and what it asks, the Milestone to aim for now,
  // what to do to reach it, and the one after.
  const milestonesSection = createPanelSection("milestones", "Milestones");
  const actLine = createMilestoneText("milestone-act", "Current Act");
  const actAsksLine = createMilestoneText("milestone-act-asks", "Act asks");
  const currentMilestone = createStatLine("Now", "Current Milestone");
  const milestoneHintLine = createMilestoneText(
    "milestone-hint",
    "Milestone hint",
  );
  const nextMilestone = createStatLine("Next", "Next Milestone");
  milestonesSection.body.append(
    actLine,
    actAsksLine,
    currentMilestone.element,
    milestoneHintLine,
    nextMilestone.element,
  );

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
  selfSufficiencyLine.dataset["row"] = "Self-sufficient";
  holdHeight(selfSufficiencyLine);
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
  // A Solar Particle Event that is coming or under way, as a warning, or
  // that none is, so that the lines below stay where they are as one comes
  // and goes. Its name is too long to sit beside it.
  const solarParticleEvent = createStatLine("Solar Particle Event");
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

  // The base's stock: Components at the stockpile, and spare Components and
  // how long they will last.
  const stockSection = createPanelSection("stock", "Stock");
  const components = createStatLine("Components", "Base's stock");
  const spareComponents = createStatLine("Spares", "Spare Components");

  // The bulk resources the base has had, such as Regolith, a line each. One
  // never in play has no line, and one that has stays, so that none comes and
  // goes as its stock does.
  const bulkSection = createPanelSection("bulk-resources", "Bulk resources");
  const bulkResources = document.createElement("div");
  bulkResources.className = "resources";
  bulkResources.setAttribute("role", "status");
  bulkResources.setAttribute("aria-label", "Bulk resources");
  bulkResources.setAttribute("aria-live", "off");
  const noneInStock = document.createElement("span");
  noneInStock.className = "resources__name";
  noneInStock.textContent = "none in stock";
  bulkResources.append(noneInStock);
  const resourceCells = new Map<
    string,
    { cell: HTMLElement; amount: HTMLElement; note: HTMLElement }
  >();
  stockSection.body.append(components.element, spareComponents.element);
  bulkSection.body.append(bulkResources);

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

  // The Research Task running, how long it has left and how far it has got,
  // and, once the base has a telescope, the observing programme, the
  // standing Research Task its telescopes work on at Night, so that the
  // player can see where that Science comes from.
  const researchSection = createPanelSection("research", "Research");
  const researchTask = createStatLine("Task", "Research Task");
  const observing = createStatLine("Observing", "Observing programme");
  researchSection.body.append(researchTask.element, observing.element);

  const sections = [
    milestonesSection,
    missionDirectorSection,
    powerSection,
    stockSection,
    bulkSection,
    travelSection,
    researchSection,
  ];
  panel.append(...sections.map((section) => section.element));
  container.append(panel);

  return {
    update(snapshot, forecasts) {
      const { currentId } = snapshot.milestones;
      const act = formatAct(snapshot.milestones);
      setText(actLine, act.label);
      setText(actAsksLine, act.asks);
      currentMilestone.show({
        value:
          currentId === undefined
            ? "Every Milestone reached"
            : milestoneLabel(currentId),
      });
      setText(
        milestoneHintLine,
        currentId === undefined
          ? "The Campaign carries on: keep the base running and growing."
          : milestoneHint(currentId),
      );
      nextMilestone.show({ value: formatNextMilestone(snapshot.milestones) });

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
        line.show(
          withSwitchedOffPlants(
            formatLifeSupport(stock, forecast, missionDirector),
            type.id,
            snapshot.structures,
          ),
        );
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

      solarParticleEvent.show(
        snapshot.solarParticleEvent === undefined
          ? { value: "none announced" }
          : formatSolarParticleEvent(
              snapshot.solarParticleEvent,
              snapshot.clock.elapsedMinutes,
            ),
      );
      solarParticleEvent.warn(snapshot.solarParticleEvent !== undefined);

      // Nothing generates or stores power until the first Structure stands.
      powerSection.element.hidden = snapshot.structures.length === 0;
      power.show(formatPower(snapshot.power));
      const stored = formatStoredPower(snapshot.power, forecasts.power);
      storedPower.show(stored);
      storedPower.fill(stored.fraction);

      components.show({ value: formatStock(snapshot.stockpile) });
      // The line before each, so that a new one goes in its place in the list.
      let above: HTMLElement | undefined;
      for (const resource of formatBulkResources(
        snapshot.bulkResources,
        forecasts.bulkResources,
      )) {
        let entry = resourceCells.get(resource.label);
        if (entry === undefined) {
          if (!resource.inPlay) continue;
          const cell = document.createElement("span");
          cell.className = "resources__cell";
          const name = document.createElement("span");
          name.className = "resources__name";
          name.textContent = resource.label;
          const amount = document.createElement("span");
          amount.className = "resources__amount";
          // How fast it is changing, and how long it lasts if falling.
          const note = document.createElement("span");
          note.className = "resources__note";
          cell.append(name, " ", amount, " ", note);
          cell.dataset["row"] = resource.label;
          holdHeight(cell);
          noneInStock.remove();
          if (above === undefined) bulkResources.prepend(cell);
          else above.after(cell);
          entry = { cell, amount, note };
          resourceCells.set(resource.label, entry);
        }
        above = entry.cell;
        setText(entry.amount, resource.value);
        setText(entry.note, resource.note ?? "");
        entry.note.hidden = resource.note === undefined;
        entry.cell.classList.toggle("resources__cell--empty", resource.empty);
        entry.cell.classList.toggle("stat--warning", resource.warning);
      }
      spareComponents.show(
        withSwitchedOffSpareMakers(
          formatSpareComponents(forecasts.spareComponents),
          snapshot.structures,
        ),
      );
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
      const programme = formatObservingProgramme(snapshot.observingProgramme);
      observing.element.hidden = programme === undefined;
      if (programme !== undefined) {
        observing.show(programme);
        observing.fill(snapshot.observingProgramme.progress);
        const explanation = explainObservingProgramme(
          snapshot.observingProgramme,
        );
        if (observing.element.title !== explanation) {
          observing.element.title = explanation;
        }
      }

      // What each section shows beside its title while it is folded.
      milestonesSection.summarise(summariseMilestones(snapshot.milestones));
      missionDirectorSection.summarise(
        summariseMissionDirector(
          missionDirector,
          snapshot.lifeSupport,
          forecasts.lifeSupport,
        ),
      );
      powerSection.summarise(summarisePower(snapshot.power));
      stockSection.summarise(summariseStock(forecasts.spareComponents));
      bulkSection.summarise(
        summariseBulkResources(snapshot.bulkResources, forecasts.bulkResources),
      );
      travelSection.summarise(
        summariseTravel(
          snapshot.lander,
          snapshot.expedition,
          snapshot.clock.elapsedMinutes,
        ),
      );
      researchSection.summarise(
        summariseResearch(snapshot.researchTask, snapshot.observingProgramme),
      );

      for (const section of sections) section.refreshWarning();
    },
    startAfresh() {
      bulkResources.replaceChildren(noneInStock);
      resourceCells.clear();
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
