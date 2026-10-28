import { catalogue } from "../catalogue";
import type { Campaign, Snapshot, StructureSnapshot } from "../simulation";
import { setText } from "./dom";
import {
  formatCondition,
  formatDustCoating,
  formatMachine,
  formatPerformance,
  formatPlant,
  formatRobot,
  formatRover,
  describeRepair,
  machineLabel,
  maintenanceState,
  robotLabel,
  structureLabel,
  type Stat,
} from "./format";
import { createPanelSection } from "./panel-section";
import type { ChoiceResult } from "./refusal";
import { createMeter } from "./stat";

export interface BasePanel {
  update(snapshot: Snapshot): void;
  /**
   * Forgets the Structures, Robots, Machines and Rovers listed, for a
   * Campaign loaded in place of the last, which may have others, or give
   * the same ids to Structures of other types.
   */
  startAfresh(): void;
}

/** One entry in a list of the base's Structures, Robots, Machines or Rovers. */
interface Entry {
  readonly item: HTMLLIElement;
  /** Shows what it is doing, or what state it is in, and its Condition. */
  show(stat: Stat, conditionPercent: number): void;
}

/**
 * An entry with a name, a bar and figure for its Condition, with a tooltip
 * saying how it is repaired, and a line below saying what it is doing,
 * with room for buttons after it.
 */
function createEntry(
  name: string,
  repair: string,
): Entry & { readonly actions: HTMLElement } {
  const item = document.createElement("li");
  item.className = "entry";
  const head = document.createElement("span");
  head.className = "entry__head";
  const title = document.createElement("span");
  title.className = "entry__name";
  title.textContent = name;
  const condition = document.createElement("span");
  condition.className = "entry__condition";
  condition.title = `Condition. ${repair}`;
  const meter = createMeter();
  // The bar shows it is a Condition; screen readers need the word.
  const conditionWord = document.createElement("span");
  conditionWord.className = "visually-hidden";
  conditionWord.textContent = "Condition ";
  const percent = document.createElement("span");
  condition.append(meter.element, conditionWord, percent);
  head.append(title, " ", condition);
  const state = document.createElement("span");
  state.className = "entry__state";
  const actions = document.createElement("span");
  actions.className = "entry__actions";
  item.append(head, " ", state, actions);
  return {
    item,
    actions,
    show(stat, conditionPercent) {
      setText(
        state,
        stat.note === undefined ? stat.value : `${stat.value} · ${stat.note}`,
      );
      setText(percent, formatCondition(conditionPercent));
      meter.fill(conditionPercent / 100);
      item.classList.toggle("entry--broken", conditionPercent <= 0);
      condition.classList.toggle(
        "entry__condition--low",
        conditionPercent > 0 && conditionPercent < 40,
      );
    },
  };
}

/**
 * The Base panel, beside the Work panel: the base's Structures, with what
 * state each is in and its Condition, and its Robots, Machines and Rovers,
 * with what each is doing. It sends a choice to dismantle a Structure, to
 * choose a Plant's recipe or to move the Mission Director into a Habitat
 * to the Campaign, which decides whether it is allowed and says why not.
 */
export function createBasePanel(
  container: HTMLElement,
  campaign: Pick<
    Campaign,
    "dismantleStructure" | "moveMissionDirectorIn" | "setPlantRecipe"
  >,
  showResult: (result: ChoiceResult) => void,
): BasePanel {
  const panel = document.createElement("aside");
  panel.className = "base-panel";
  panel.setAttribute("aria-label", "Base");

  const structuresSection = createPanelSection("structures", "Structures");
  const structures = document.createElement("ul");
  structures.className = "entries";
  structures.setAttribute("aria-label", "Structures");
  structuresSection.body.append(
    createRepairHint(describeRepair("maintained")),
    structures,
  );
  const structureEntries = new Map<
    string,
    Entry & {
      readonly dismantle: HTMLButtonElement;
      readonly moveIn: HTMLButtonElement;
      readonly recipe: HTMLSelectElement | undefined;
    }
  >();
  const createStructureEntry = (structure: StructureSnapshot) => {
    const structureId = structure.id;
    const entry = createEntry(
      structureLabel(structure.structureTypeId),
      describeRepair("maintained"),
    );
    // The recipes of a Plant that has more than one, to choose from.
    const recipes =
      catalogue.structureTypes.find(
        (type) => type.id === structure.structureTypeId,
      )?.recipes ?? [];
    let recipe: HTMLSelectElement | undefined;
    if (recipes.length > 1) {
      const select = document.createElement("select");
      select.className = "panel-button";
      select.setAttribute(
        "aria-label",
        `${structureLabel(structure.structureTypeId)} recipe`,
      );
      select.title =
        "Choose what it makes. It switches in the next game-minute, with no work for the Robot.";
      for (const { id, label } of recipes) {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = label;
        select.append(option);
      }
      select.addEventListener("change", () => {
        showResult(campaign.setPlantRecipe(structureId, select.value));
      });
      recipe = select;
    }
    const moveIn = document.createElement("button");
    moveIn.type = "button";
    moveIn.className = "panel-button panel-button--primary";
    moveIn.textContent = "Move in";
    moveIn.title =
      "Move the Mission Director from the Lander into this Habitat, which needs power. It happens at once and can't be undone.";
    moveIn.hidden = true;
    moveIn.addEventListener("click", () => {
      showResult(campaign.moveMissionDirectorIn(structureId));
    });
    const dismantle = document.createElement("button");
    dismantle.type = "button";
    dismantle.className = "panel-button";
    dismantle.textContent = "Dismantle";
    dismantle.title =
      "Have the Robot take it apart and carry most of its Components back into the base's stock.";
    dismantle.addEventListener("click", () => {
      showResult(campaign.dismantleStructure(structureId));
    });
    entry.actions.append(
      ...(recipe === undefined ? [] : [recipe]),
      moveIn,
      dismantle,
    );
    structures.append(entry.item);
    return { ...entry, dismantle, moveIn, recipe };
  };

  // What each Robot, Machine and Rover is doing, and its Condition.
  const fleetSection = createPanelSection("fleet", "Robots & Machines");
  const robots = document.createElement("ul");
  robots.className = "entries";
  robots.setAttribute("aria-label", "Robots");
  const machines = document.createElement("ul");
  machines.className = "entries";
  machines.setAttribute("aria-label", "Machines");
  const rovers = document.createElement("ul");
  rovers.className = "entries";
  rovers.setAttribute("aria-label", "Rovers");
  fleetSection.body.append(
    createRepairHint(
      `${describeRepair("maintained")} ${describeRepair("robot")}`,
    ),
    robots,
    machines,
    rovers,
  );
  const robotEntries = new Map<string, Entry>();
  const machineEntries = new Map<string, Entry>();
  const roverEntries = new Map<string, Entry>();
  const entryFor = (
    entries: Map<string, Entry>,
    list: HTMLElement,
    id: string,
    name: string,
    repair: string,
  ): Entry => {
    let entry = entries.get(id);
    if (entry === undefined) {
      entry = createEntry(name, repair);
      list.append(entry.item);
      entries.set(id, entry);
    }
    return entry;
  };

  panel.append(structuresSection.element, fleetSection.element);
  container.append(panel);

  return {
    update(snapshot) {
      const seen = new Set<string>();
      for (const structure of snapshot.structures) {
        seen.add(structure.id);
        let entry = structureEntries.get(structure.id);
        if (entry === undefined) {
          entry = createStructureEntry(structure);
          structureEntries.set(structure.id, entry);
        }
        const toBeDismantled = snapshot.dismantlings.some(
          (dismantling) => dismantling.id === structure.id,
        );
        entry.show(
          describeStructure(snapshot, structure, toBeDismantled),
          structure.conditionPercent,
        );
        // The recipe it runs, which a refused choice leaves as it was.
        if (
          entry.recipe !== undefined &&
          structure.recipeId !== undefined &&
          entry.recipe.value !== structure.recipeId
        ) {
          entry.recipe.value = structure.recipeId;
        }
        entry.dismantle.hidden = toBeDismantled;
        entry.moveIn.hidden =
          toBeDismantled ||
          snapshot.missionDirector.residence !== "lander" ||
          !isHabitat(structure.structureTypeId);
      }
      for (const [id, entry] of structureEntries) {
        if (!seen.has(id)) {
          entry.item.remove();
          structureEntries.delete(id);
        }
      }
      structuresSection.element.hidden = structureEntries.size === 0;
      structuresSection.count(structureEntries.size);

      for (const robot of snapshot.robots) {
        entryFor(
          robotEntries,
          robots,
          robot.id,
          robotLabel(robot.id, snapshot.robots),
          describeRepair("robot"),
        ).show(formatRobot(robot, snapshot.expedition), robot.conditionPercent);
      }
      for (const machine of snapshot.machines) {
        entryFor(
          machineEntries,
          machines,
          machine.id,
          machineLabel(machine.machineTypeId),
          describeRepair("maintained"),
        ).show(
          formatMachine(machine, snapshot.maintenance),
          machine.conditionPercent,
        );
      }
      for (const rover of snapshot.rovers) {
        entryFor(
          roverEntries,
          rovers,
          rover.id,
          catalogue.rover.label,
          describeRepair("maintained"),
        ).show(
          formatRover(rover, snapshot.maintenance),
          rover.conditionPercent,
        );
      }
      fleetSection.count(
        snapshot.robots.length +
          snapshot.machines.length +
          snapshot.rovers.length,
      );
    },
    startAfresh() {
      for (const entry of structureEntries.values()) entry.item.remove();
      structureEntries.clear();
      for (const entries of [robotEntries, machineEntries, roverEntries]) {
        for (const entry of entries.values()) entry.item.remove();
        entries.clear();
      }
    },
  };
}

/** A line at the top of a section saying how what it lists is repaired. */
function createRepairHint(text: string): HTMLElement {
  const hint = document.createElement("p");
  hint.className = "entries-hint";
  hint.textContent = text;
  return hint;
}

/**
 * What state a Structure is in, for its entry: anything out of the
 * ordinary, such as being Broken, a Plant's running, the Mission Director
 * living in it or its Dust coating, or that it is commissioned if nothing
 * else.
 */
function describeStructure(
  snapshot: Snapshot,
  structure: StructureSnapshot,
  toBeDismantled: boolean,
): Stat {
  const broken = structure.conditionPercent <= 0;
  const home =
    snapshot.missionDirector.residence === "habitat" &&
    snapshot.missionDirector.habitatId === structure.id;
  const maintenance = snapshot.maintenance.find(
    ({ target }) =>
      target.kind === "structure" && target.structureId === structure.id,
  );
  const state = toBeDismantled
    ? "to be dismantled"
    : broken
      ? "Broken"
      : structure.plant === undefined
        ? structure.powered
          ? "commissioned"
          : "no power"
        : (formatPlant(structure.plant) ?? "commissioned");
  const notes = [
    structure.lit
      ? "lit"
      : structure.savingPower
        ? "light off to save power"
        : undefined,
    isHabitat(structure.structureTypeId)
      ? structure.shielded
        ? "shielded"
        : "unshielded"
      : undefined,
    structure.waterWalled ? "water-walled" : undefined,
    home ? "the Mission Director's home" : undefined,
    formatPerformance(structure.performance),
    formatDustCoating(structure),
    maintenanceState(maintenance),
  ].filter((note) => note !== undefined);
  return notes.length === 0
    ? { value: state }
    : { value: state, note: notes.join(", ") };
}

function isHabitat(structureTypeId: string): boolean {
  return (
    catalogue.structureTypes.find((type) => type.id === structureTypeId)
      ?.habitat === true
  );
}
