import { catalogue } from "../catalogue";
import {
  milestoneHint,
  milestoneLabel,
  type Campaign,
  type Forecasts,
  type Snapshot,
} from "../simulation";
import { createAttentionList } from "./attention-list";
import {
  ATTENTION_ORDER,
  listAttention,
  type StatusLine,
} from "./attention-text";
import { setText } from "./dom";
import { stockLabel } from "./labels";
import {
  describeExpedition,
  explainObservingProgramme,
  formatAct,
  formatBulkResources,
  formatHabitatNetworkPower,
  formatLander,
  formatLifeSupport,
  formatMilestoneMeasure,
  formatMilestonePlace,
  formatNextMilestone,
  formatInfraredSurvey,
  formatRadioSurvey,
  formatObservingProgramme,
  formatBasePower,
  formatRadiationDose,
  formatResidence,
  formatResearchQueue,
  formatResearchTask,
  formatScienceRate,
  formatSelfSufficiency,
  formatSolarParticleEvent,
  formatSpareComponents,
  formatStoredPower,
  summariseMilestones,
  summariseMissionDirector,
  habitatNetworkApart,
  listStock,
  summarisePower,
  summariseResearch,
  summariseBulkResources,
  summariseStock,
  summariseTravel,
  withPlantsTaking,
  withSwitchedOffPlants,
  withSwitchedOffSpareMakers,
  makesSpareComponents,
} from "./status-panel-text";
import { holdHeight } from "./hold";
import type { MapFinder } from "./map-finder";
import { createMilestoneHint } from "./milestone-hint";
import { createPanelSection, type PanelSection } from "./panel-section";
import type { ChoiceResult } from "./refusal";
import { createStatLine, type Stat, type StatLine } from "./stat";
import {
  warnsOfHabitatPower,
  warnsOfLifeSupport,
  warnsOfRadiationDose,
  warnsOfSpareComponents,
} from "./status-warnings";
import { designsToUnlock } from "./tech-tree-text";

/**
 * A block of the panel that isn't a labelled figure, such as a line of words
 * in the Milestones section: a status like any other line, named for screen
 * readers and not announced as it changes, that keeps its height when what
 * it shows gets shorter.
 */
function createStatusBlock(
  tag: "p" | "div",
  className: string,
  name: string,
): HTMLElement {
  const block = document.createElement(tag);
  block.className = className;
  block.setAttribute("role", "status");
  block.setAttribute("aria-label", name);
  block.setAttribute("aria-live", "off");
  block.dataset["row"] = name;
  holdHeight(block);
  return block;
}

export interface StatusPanel {
  /**
   * Shows the latest snapshot and forecasts, given the real time the frame
   * counted, in milliseconds, which times how long a line of the
   * needs-attention list stays once what it reported is over.
   */
  update(snapshot: Snapshot, forecasts: Forecasts, frameMs: number): void;
  /**
   * Forgets which bulk resources have shown, what needed attention, and that
   * an Expedition, a queue or Science being earned has shown, for a Campaign
   * loaded in place of the last.
   */
  startAfresh(): void;
}

/**
 * The HTML status panel: at its top, while anything needs the player, a list
 * of what does, most urgent first, each line leading to where it is dealt
 * with, on the base map or further down the panel; then sections the player
 * can fold away: the current
 * Act, the Milestone to aim for now, with its hint folded to its first lines
 * until the player asks for the rest, and the one after it, how the Mission
 * Director is keeping, the base's power, its stock, its bulk resources, the Lander
 * and Expeditions, and the Research Task running, with how fast the base
 * earns Science and the observing programme once it has a telescope. A folded section keeps its
 * headline figures in sight beside its title. It reads simulation snapshots
 * and forecasts, and sends a choice to send the Lander to the Campaign,
 * which decides whether it is allowed and says why not.
 */
export function createStatusPanel(
  container: HTMLElement,
  campaign: Pick<Campaign, "sendLander">,
  showResult: (result: ChoiceResult) => void,
  openExpeditions: () => void,
  map: MapFinder,
): StatusPanel {
  const panel = document.createElement("aside");
  panel.className = "status-panel";
  panel.setAttribute("aria-label", "Status panel");

  // The lines of the panel that show as warnings, and the section each is
  // in, for the needs-attention list to lead to.
  const warningLines = new Map<
    StatusLine,
    { readonly section: PanelSection; readonly line: HTMLElement }
  >();
  // What needs the player now, above everything else.
  const attention = createAttentionList(
    ATTENTION_ORDER,
    (target) => {
      if (target.kind === "map") {
        showResult(map.find(target.subject));
        return;
      }
      const warning = warningLines.get(target.line);
      if (warning === undefined) return;
      warning.section.element.open = true;
      warning.line.scrollIntoView({ block: "nearest" });
      pointOut(warning.line);
    },
    // Marked on the map, without moving the camera, as the Base panel's
    // rows are.
    (target) => {
      map.pointOut(target?.kind === "map" ? target.subject : undefined);
    },
  );

  // The Act the Campaign is in and what it asks, the Milestone to aim for now,
  // what to do to reach it, and the one after.
  const milestonesSection = createPanelSection("milestones", "Milestones");
  const actLine = createStatusBlock("p", "milestone-act", "Current Act");
  // Which of the Act's Milestones the current one is, beside the Act's name.
  const placeLine = createStatusBlock(
    "p",
    "milestone-place",
    "Place in the Act",
  );
  const heading = document.createElement("div");
  heading.className = "milestone-heading";
  heading.append(actLine, placeLine);
  const actAsksLine = createStatusBlock("p", "milestone-act-asks", "Act asks");
  const currentMilestone = createStatLine("Now", "Current Milestone");
  const milestoneHintLine = createMilestoneHint();
  // How far along the current Milestone is, a line for each of its measures,
  // between its name and its hint. Most have none.
  const milestoneMeasures = createMeasureLines();
  const nextMilestone = createStatLine("Next", "Next Milestone");
  milestonesSection.body.append(
    heading,
    actAsksLine,
    currentMilestone.element,
    milestoneMeasures.element,
    milestoneHintLine.element,
    nextMilestone.element,
  );

  // How the Mission Director is keeping.
  const missionDirectorSection = createPanelSection(
    "mission-director",
    "Mission Director",
  );
  // Where they live and, in a Habitat, whether it has power.
  const residence = createStatLine("Living", "Mission Director");
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
    // Not starting with the stock's name, which labels its own line.
    const chip = createSufficiencyChip(
      stockLabel(type.id),
      `Self-sufficiency in ${type.label.toLowerCase()}`,
    );
    selfSufficiencyBody.append(chip.element, " ");
    return { type, chip };
  });
  const spareSufficiencyChip = createSufficiencyChip(
    "Spares",
    "Self-sufficiency in spare Components",
  );
  // Until the base has a Plant that makes them, there is nothing to judge.
  spareSufficiencyChip.element.hidden = true;
  selfSufficiencyBody.append(spareSufficiencyChip.element, " ");
  // How much radiation the Mission Director has absorbed, and how fast.
  const radiationDose = createStatLine("Radiation", "Radiation Dose");
  // A Solar Particle Event that is coming or under way, as a warning, or
  // that none is, so that the lines below stay where they are as one comes
  // and goes. Its name is too long for the label column, so what it says
  // follows it on the same line while that is short.
  const solarParticleEvent = createStatLine("Solar Particle Event");
  solarParticleEvent.element.classList.add("stat--wide");
  missionDirectorSection.body.append(
    solarParticleEvent.element,
    residence.element,
    ...stocks.map(({ line }) => line.element),
    selfSufficiencyLine,
    radiationDose.element,
  );
  const inMissionDirector = (line: HTMLElement) => ({
    section: missionDirectorSection,
    line,
  });
  warningLines.set(
    "solar-particle-event",
    inMissionDirector(solarParticleEvent.element),
  );
  warningLines.set("habitat-power", inMissionDirector(residence.element));
  for (const { type, line } of stocks) {
    warningLines.set(
      `life-support:${type.id}`,
      inMissionDirector(line.element),
    );
  }
  warningLines.set("radiation-dose", inMissionDirector(radiationDose.element));

  const powerSection = createPanelSection("power", "Power");
  const power = createStatLine("Power");
  const storedPower = createStatLine("Stored", "Stored power");
  // What the Habitat's own network holds, shown only when some of the
  // base's power is on another network, where the Habitat can't draw on it.
  const habitatNetworkPower = createStatLine(
    "Habitat",
    "Habitat's network power",
  );
  habitatNetworkPower.element.hidden = true;
  powerSection.body.append(
    power.element,
    storedPower.element,
    habitatNetworkPower.element,
  );

  // The base's stock: Components at the stockpile, and spare Components and
  // how long they will last.
  const stockSection = createPanelSection("stock", "Stock");
  // Two to a row, each with how many there are, which reads faster than
  // a sentence of them.
  const components = createStatusBlock("div", "components", "Base's stock");
  /** What the list shows, to change it only when the stock does. */
  let componentsShown: string | undefined;
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
  stockSection.body.append(components, spareComponents.element);
  warningLines.set("spare-components", {
    section: stockSection,
    line: spareComponents.element,
  });
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
  // No line until the first Expedition is under way; from then on it
  // stays, so that the lines below move only that once.
  const expedition = createStatLine("Expedition");
  expedition.element.hidden = true;
  const expeditions = document.createElement("button");
  expeditions.type = "button";
  expeditions.className = "panel-button";
  expeditions.textContent = "Expeditions";
  expeditions.title =
    "Send the Robot off the map in the Rover, for water ice or whatever else its Designs offer.";
  expeditions.addEventListener("click", openExpeditions);
  const actions = document.createElement("div");
  actions.className = "panel-actions";
  actions.append(sendLander, expeditions);
  travelSection.body.append(lander.element, expedition.element, actions);

  // The Research Task running, how long it has left and how far it has got,
  // those queued behind it in order, and, once the base has a telescope, the
  // observing programme, the standing Research Task its telescopes work on at
  // Night, so that the player can see where that Science comes from.
  const researchSection = createPanelSection("research", "Research");
  const researchTask = createStatLine("Task", "Research Task");
  // How fast the base earns Science. No line until it first earns some;
  // from then on it stays, as the Expedition's does.
  const scienceRate = createStatLine("Science", "Earned an Earth Day");
  scienceRate.element.hidden = true;
  // No line until something is first queued, or the base's Science would
  // first unlock a Design with nothing queued; from then on it stays too.
  const researchQueue = createStatLine("Queued", "Research queue");
  researchQueue.element.hidden = true;
  const observing = createStatLine("Observing", "Observing programme");
  const infrared = createStatLine("Infrared", "Infrared survey");
  const radio = createStatLine("Radio", "Radio survey");
  researchSection.body.append(
    researchTask.element,
    researchQueue.element,
    scienceRate.element,
    observing.element,
    infrared.element,
    radio.element,
  );

  const sections = [
    milestonesSection,
    missionDirectorSection,
    powerSection,
    stockSection,
    bulkSection,
    travelSection,
    researchSection,
  ];
  panel.append(
    attention.element,
    ...sections.map((section) => section.element),
  );
  container.append(panel);

  return {
    update(snapshot, forecasts, frameMs) {
      attention.show(listAttention(snapshot, forecasts), frameMs);

      const { currentId } = snapshot.milestones;
      const act = formatAct(snapshot.milestones);
      setText(actLine, act.label);
      setText(actAsksLine, act.asks);
      const place = formatMilestonePlace(snapshot.milestones);
      placeLine.hidden = place === undefined;
      setText(placeLine, place ?? "");
      currentMilestone.show({
        value:
          currentId === undefined
            ? "Every Milestone reached"
            : milestoneLabel(currentId),
      });
      milestoneMeasures.show(
        snapshot.milestones.measures.map(formatMilestoneMeasure),
      );
      milestoneHintLine.show(
        currentId === undefined
          ? "The Campaign carries on: keep the base running and growing."
          : milestoneHint(currentId),
      );
      // With none left, the line would say nothing.
      const next = formatNextMilestone(snapshot.milestones);
      nextMilestone.element.hidden = next === undefined;
      if (next !== undefined) nextMilestone.show({ value: next });

      const { missionDirector } = snapshot;
      residence.show(
        formatResidence(
          missionDirector,
          snapshot.structures,
          forecasts.habitatPower,
        ),
      );
      // Shown as a warning from the first warning on, and once it has failed.
      residence.warn(warnsOfHabitatPower(snapshot, forecasts.habitatPower));

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
          withPlantsTaking(
            withSwitchedOffPlants(
              formatLifeSupport(stock, forecast, missionDirector),
              type.id,
              snapshot.structures,
            ),
            type.id,
            snapshot.structures,
            forecast?.minutesUntilReserve,
          ),
        );
        // How full the base's store of it is, on a bar that warns with the line.
        line.fill(
          stock.limitKilograms > 0
            ? stock.kilograms / stock.limitKilograms
            : undefined,
        );
        // Shown as a warning from the first warning on, and once it has run out.
        line.warn(warnsOfLifeSupport(type, stock, forecast));
      }

      for (const { type, chip } of selfSufficiency) {
        const judged = snapshot.selfSufficiency.find(
          (candidate) => candidate.stockId === type.id,
        );
        chip.element.hidden = judged === undefined;
        if (judged === undefined) continue;
        chip.show(formatSelfSufficiency(judged, missionDirector));
      }
      // Once it has shown, it stays, so that nothing beside it moves.
      if (
        !spareSufficiencyChip.element.hidden ||
        snapshot.structures.some(makesSpareComponents)
      ) {
        spareSufficiencyChip.element.hidden = false;
        spareSufficiencyChip.show(
          formatSelfSufficiency(
            snapshot.spareComponentSufficiency,
            missionDirector,
          ),
        );
      }
      selfSufficiencyLine.hidden = selfSufficiency.every(
        ({ chip }) => chip.element.hidden,
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
      radiationDose.warn(
        warnsOfRadiationDose(
          snapshot.radiationDoseMillisieverts,
          forecasts.radiationDose,
        ),
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
      power.show(formatBasePower(snapshot.power));
      const stored = formatStoredPower(snapshot.power, forecasts.power);
      storedPower.show(stored);
      storedPower.fill(stored.fraction);
      const habitatNetwork = habitatNetworkApart(
        snapshot.power,
        missionDirector,
        snapshot.structures,
      );
      habitatNetworkPower.element.hidden = habitatNetwork === undefined;
      if (habitatNetwork !== undefined) {
        const habitatStored = formatHabitatNetworkPower(
          habitatNetwork,
          forecasts.power,
        );
        habitatNetworkPower.show(habitatStored);
        habitatNetworkPower.fill(habitatStored.fraction);
      }

      const held = listStock(snapshot.stockpile);
      const holding = held.map(({ count, name }) => `${count} ${name}`).join();
      if (holding !== componentsShown) {
        componentsShown = holding;
        components.replaceChildren(
          ...(held.length === 0
            ? ["no Components"]
            : held.flatMap(({ count, name }, index) => {
                const item = document.createElement("span");
                item.className = "components__item";
                const number = document.createElement("span");
                number.className = "components__count";
                number.textContent = String(count);
                item.append(number, " ", name);
                // A space between them, for what reads the list as text.
                return index === 0 ? [item] : [" ", item];
              })),
        );
      }
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
      spareComponents.warn(warnsOfSpareComponents(forecasts.spareComponents));

      lander.show(
        formatLander(
          snapshot.lander,
          snapshot.clock.elapsedMinutes,
          snapshot.exports.aboard,
          snapshot.exportLoading,
        ),
      );
      sendLander.hidden = snapshot.lander.legEndsAtMinute !== undefined;
      if (snapshot.expedition !== undefined) expedition.element.hidden = false;
      expedition.show({
        value: describeExpedition(
          snapshot.expedition,
          snapshot.clock.elapsedMinutes,
        ),
      });

      researchTask.show(formatResearchTask(snapshot.researchTask));
      researchTask.fill(snapshot.researchTask?.progress);
      const queued = formatResearchQueue(
        snapshot.researchQueue,
        designsToUnlock(snapshot),
      );
      // Science left unspent with nothing queued is picked out.
      const unspent = queued.note !== undefined;
      if (snapshot.researchQueue.length > 0 || unspent) {
        researchQueue.element.hidden = false;
      }
      researchQueue.show(queued);
      researchQueue.element.classList.toggle("stat--nudge", unspent);
      if (forecasts.science.perEarthDay > 0) scienceRate.element.hidden = false;
      scienceRate.show(formatScienceRate(forecasts.science));
      const programme = formatObservingProgramme(snapshot.observingProgramme);
      observing.element.hidden = programme === undefined;
      if (programme !== undefined) {
        observing.show({
          ...programme,
          explanation: explainObservingProgramme(snapshot.observingProgramme),
        });
        observing.fill(snapshot.observingProgramme.progress);
      }
      const survey = formatInfraredSurvey(snapshot.infraredTelescopes);
      infrared.element.hidden = survey === undefined;
      if (survey !== undefined) {
        infrared.show(survey);
        infrared.fill(
          Math.max(
            ...snapshot.infraredTelescopes.map(({ progress }) => progress),
          ),
        );
      }

      const radioSurvey = formatRadioSurvey(snapshot.radioArrays);
      radio.element.hidden = radioSurvey === undefined;
      if (radioSurvey !== undefined) {
        radio.show(radioSurvey);
        radio.fill(
          Math.max(...snapshot.radioArrays.map(({ progress }) => progress)),
        );
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
      powerSection.summarise(summarisePower(snapshot.power, habitatNetwork));
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
      attention.startAfresh();
      bulkResources.replaceChildren(noneInStock);
      resourceCells.clear();
      expedition.element.hidden = true;
      researchQueue.element.hidden = true;
      scienceRate.element.hidden = true;
    },
  };
}

/**
 * One of the Self-sufficient line's chips: what it judges, the verdict and
 * the share made at the base, for example "Oxygen no 62%", with the whole
 * story on hovering over it. A "yes" is left for a screen reader alone, as
 * the chip's colour and its share already say it.
 */
function createSufficiencyChip(
  name: string,
  ariaLabel: string,
): {
  readonly element: HTMLElement;
  show(judged: ReturnType<typeof formatSelfSufficiency>): void;
} {
  const element = document.createElement("span");
  element.className = "stat-chip";
  element.setAttribute("role", "status");
  element.setAttribute("aria-label", ariaLabel);
  element.setAttribute("aria-live", "off");
  const verdict = document.createElement("span");
  const share = document.createElement("span");
  element.append(name, " ", verdict, " ", share);
  return {
    element,
    show(judged) {
      const good = judged.value === "yes";
      setText(verdict, judged.value);
      verdict.classList.toggle("visually-hidden", good);
      setText(share, judged.share ?? "");
      if (element.title !== judged.explanation) {
        element.title = judged.explanation;
      }
      element.classList.toggle("stat-chip--good", good);
    },
  };
}

/**
 * The lines that say how far along the current Milestone is, one for each of
 * its measures, in the order the Milestone gives them, each named by its
 * label and made the first time a Milestone has one. Most Milestones have
 * none, and their lines go with a Milestone that had some, but the room they
 * took stays, as any line's does, so that the lines below don't move up and
 * back down as the Milestones go by.
 */
function createMeasureLines(): {
  readonly element: HTMLElement;
  show(
    measures: readonly (Stat & {
      readonly label: string;
      readonly fraction: number;
    })[],
  ): void;
} {
  const element = document.createElement("div");
  holdHeight(element);
  const lines = new Map<string, StatLine>();
  /** The labels of the lines in place, to change them only with the Milestone. */
  let inPlace = "";
  const lineOf = (label: string): StatLine => {
    let line = lines.get(label);
    if (line === undefined) {
      line = createStatLine(label, `Milestone progress, ${label}`);
      lines.set(label, line);
    }
    return line;
  };
  return {
    element,
    show(measures) {
      const labels = measures.map(({ label }) => label).join(" | ");
      if (labels !== inPlace) {
        inPlace = labels;
        element.replaceChildren(
          ...measures.map(({ label }) => lineOf(label).element),
        );
      }
      for (const { label, fraction, ...stat } of measures) {
        const line = lineOf(label);
        line.show(stat);
        line.fill(fraction);
      }
    },
  };
}

/**
 * Picks a line of the panel out for a moment, for the needs-attention list,
 * which has just brought it into view.
 */
function pointOut(line: HTMLElement): void {
  line.classList.remove("stat--pointed-out");
  // Read between the two, so that picking out a line again starts afresh.
  line.getBoundingClientRect();
  line.classList.add("stat--pointed-out");
  line.addEventListener(
    "animationend",
    () => {
      line.classList.remove("stat--pointed-out");
    },
    { once: true },
  );
}
