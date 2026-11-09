import { catalogue, type StructureListGroup } from "../catalogue";
import {
  habitatUnder,
  type Snapshot,
  type StructureSnapshot,
} from "../simulation";
import { setText } from "./dom";
import {
  formatMachine,
  formatRobot,
  formatRover,
  describeRepair,
} from "./base-panel-text";
import { formatCondition } from "./format";
import { machineLabel, robotLabel, structureLabel } from "./labels";
import type { Stat } from "./stat";
import { holdHeight } from "./hold";
import { createPanelSection, type PanelSection } from "./panel-section";
import type { ChoiceResult } from "./refusal";
import { createMeter } from "./stat";
import {
  createStructureControls,
  type StructureChoices,
  type StructureControls,
} from "./structure-controls";
import { describeStructureEntry, isToBeDismantled } from "./structure-state";

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
  // What it is doing can take more lines or fewer as it changes, such as a
  // Plant between Batches, so the entries below it hold still meanwhile.
  holdHeight(item);
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
 * choose a Plant's recipe, to switch a Plant off or on, or to move the
 * Mission Director into a Habitat to the Campaign, which decides whether
 * it is allowed and says why not.
 */
export function createBasePanel(
  container: HTMLElement,
  campaign: StructureChoices,
  showResult: (result: ChoiceResult) => void,
): BasePanel {
  const panel = document.createElement("aside");
  panel.className = "base-panel";
  panel.setAttribute("aria-label", "Base");

  // The Structures, listed by what they are for, each group one the player
  // can fold away on its own. The groups always come in the catalogue's
  // order, and a group shows only while it holds something.
  const structuresSection = createPanelSection("structures", "Structures");
  const structures = document.createElement("div");
  structures.className = "structure-groups";
  structures.setAttribute("role", "group");
  structures.setAttribute("aria-label", "Structures");
  structuresSection.body.append(
    createRepairHint(describeRepair("maintained")),
    structures,
  );
  const groups = new Map<StructureListGroup, StructureGroup>();
  const groupFor = (id: StructureListGroup): StructureGroup => {
    let group = groups.get(id);
    if (group === undefined) {
      group = createStructureGroup(id);
      const place = groupPlace(id);
      const next = [...groups.values()]
        .filter((other) => groupPlace(other.id) > place)
        .sort((a, b) => groupPlace(a.id) - groupPlace(b.id))[0];
      structures.insertBefore(
        group.section.element,
        next?.section.element ?? null,
      );
      groups.set(id, group);
    }
    return group;
  };
  const structureEntries = new Map<
    string,
    Entry & { readonly controls: StructureControls }
  >();
  const createStructureEntry = (structure: StructureSnapshot) => {
    const entry = createEntry(
      structureLabel(structure.structureTypeId),
      describeRepair("maintained"),
    );
    const controls = createStructureControls(structure, campaign, showResult);
    entry.actions.append(...controls.elements);
    return { ...entry, controls };
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
      entry.item.dataset["row"] = id;
      entries.set(id, entry);
    }
    return entry;
  };

  panel.append(structuresSection.element, fleetSection.element);
  container.append(panel);

  return {
    update(snapshot) {
      const seen = new Set<string>();
      const listed = new Map<StructureListGroup, ListedStructure[]>();
      for (const [built, structure] of snapshot.structures.entries()) {
        seen.add(structure.id);
        let entry = structureEntries.get(structure.id);
        if (entry === undefined) {
          entry = createStructureEntry(structure);
          entry.item.dataset["row"] = structure.id;
          structureEntries.set(structure.id, entry);
        }
        entry.show(
          describeStructureEntry(
            snapshot,
            structure,
            isToBeDismantled(snapshot, structure.id),
          ),
          structure.conditionPercent,
        );
        entry.controls.update(snapshot, structure);
        // A Habitat's shielding, water wall or vault cistern goes under it.
        const habitat = habitatUnder(snapshot, structure);
        const anchor = habitat ?? structure;
        const groupId = listGroupOf(anchor.structureTypeId);
        let inGroup = listed.get(groupId);
        if (inGroup === undefined) {
          inGroup = [];
          listed.set(groupId, inGroup);
        }
        entry.item.classList.toggle("entry--cover", habitat !== undefined);
        inGroup.push({
          item: entry.item,
          key: [
            typePlace(anchor.structureTypeId),
            habitat === undefined
              ? built
              : snapshot.structures.findIndex(({ id }) => id === habitat.id),
            habitat === undefined ? 0 : 1,
            typePlace(structure.structureTypeId),
            built,
          ],
        });
      }
      for (const [id, entry] of structureEntries) {
        if (!seen.has(id)) {
          entry.item.remove();
          structureEntries.delete(id);
        }
      }
      for (const [groupId, inGroup] of listed) {
        inGroup.sort((a, b) => compareKeys(a.key, b.key));
        placeInOrder(
          groupFor(groupId).list,
          inGroup.map(({ item }) => item),
        );
      }
      for (const [groupId, group] of groups) {
        const count = group.list.childElementCount;
        if (count === 0) {
          group.section.element.remove();
          groups.delete(groupId);
        } else {
          group.section.count(count);
          group.section.warn(needsAttention(group.list));
        }
      }
      structuresSection.element.hidden = structureEntries.size === 0;
      structuresSection.count(structureEntries.size);
      // Its groups mark their own titles, which are out of sight while it
      // is folded.
      structuresSection.warn(needsAttention(structures));

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
      // A Robot is only repaired once it is nearly worn out, so one low on
      // Condition is as it should be, and nothing the player can act on.
      fleetSection.warn(
        robots.querySelector(BROKEN) !== null ||
          needsAttention(machines) ||
          needsAttention(rovers),
      );
    },
    startAfresh() {
      for (const group of groups.values()) group.section.element.remove();
      groups.clear();
      structureEntries.clear();
      for (const entries of [robotEntries, machineEntries, roverEntries]) {
        for (const entry of entries.values()) entry.item.remove();
        entries.clear();
      }
    },
  };
}

/** An entry that is Broken. */
const BROKEN = ".entry--broken";

/**
 * Whether anything listed is Broken or low on Condition. Maintenance starts
 * well above that, so one that low has been left waiting, for a Robot or for
 * spare Components.
 */
function needsAttention(list: HTMLElement): boolean {
  return list.querySelector(`${BROKEN}, .entry__condition--low`) !== null;
}

/** Where a group comes in the Base panel: the catalogue's order. */
function groupPlace(id: StructureListGroup): number {
  return catalogue.structureListGroups.findIndex((group) => group.id === id);
}

/** Where a Structure type comes within its group: the catalogue's order. */
function typePlace(structureTypeId: string): number {
  return catalogue.structureTypes.findIndex(({ id }) => id === structureTypeId);
}

function listGroupOf(structureTypeId: string): StructureListGroup {
  return (
    catalogue.structureTypes.find(({ id }) => id === structureTypeId)
      ?.listGroup ?? "industry"
  );
}

/**
 * A Structure's entry and where it sorts in its group: by its type, or its
 * Habitat's, in catalogue order, then in the order they were built, with a
 * Habitat's covers straight after it.
 */
interface ListedStructure {
  readonly item: HTMLLIElement;
  readonly key: readonly number[];
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (const [place, value] of a.entries()) {
    const difference = value - (b[place] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Puts a list's entries in order, moving only those out of place, so that
 * an entry the player is using keeps its focus while the order holds.
 */
function placeInOrder(list: HTMLElement, items: readonly HTMLElement[]): void {
  for (const [place, item] of items.entries()) {
    const there = list.children[place];
    if (there !== item) list.insertBefore(item, there ?? null);
  }
}

/** A group of Structures in the Base panel, under a heading that folds them away. */
interface StructureGroup {
  readonly id: StructureListGroup;
  readonly section: PanelSection;
  /** Where the group's entries go. */
  readonly list: HTMLUListElement;
}

/**
 * A group of Structures, by what they are for, headed by its label and how
 * many there are, and marked while any of them is Broken or low on
 * Condition, so that it shows even when folded. It stays folded on the next
 * visit, as sections do, and starts open for a group the player hasn't
 * folded.
 */
function createStructureGroup(id: StructureListGroup): StructureGroup {
  const label =
    catalogue.structureListGroups.find((group) => group.id === id)?.label ?? id;
  const section = createPanelSection(`structures:${id}`, label);
  section.element.classList.add("structure-group");
  section.element.dataset["row"] = `group:${id}`;
  const list = document.createElement("ul");
  list.className = "entries";
  list.setAttribute("aria-label", label);
  section.body.append(list);
  return { id, section, list };
}

/** A line at the top of a section saying how what it lists is repaired. */
function createRepairHint(text: string): HTMLElement {
  const hint = document.createElement("p");
  hint.className = "entries-hint";
  hint.textContent = text;
  return hint;
}
