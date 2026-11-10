import { catalogue, type StructureListGroup } from "../catalogue";
import type { MapSubject } from "../render/renderer";
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
import { formatCondition, LOW_CONDITION_PERCENT } from "./format";
import { machineLabel, robotLabel, structureLabel } from "./labels";
import type { MapFinder } from "./map-finder";
import { holdHeight } from "./hold";
import { createPanelSection, type PanelSection } from "./panel-section";
import type { ChoiceResult } from "./refusal";
import { createMeter } from "./stat";
import {
  createStructureControls,
  type StructureChoices,
  type StructureControls,
} from "./structure-controls";
import {
  describeStructureStack,
  stacksInList,
  summariseStructureGroup,
  type StructureStack,
} from "./structure-list-text";
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
  /**
   * Shows what it is doing, or what state it is in, if there is anything
   * to say, and its Condition.
   */
  show(doing: EntryText, conditionPercent: number): void;
}

/**
 * What an entry says under its name: a state and a note, either of which
 * it may lack, and more for its tooltip.
 */
interface EntryText {
  readonly value: string | undefined;
  readonly note?: string;
  readonly more?: string;
}

/** What the name of an entry does when chosen, for its tooltip. */
const FINDS = {
  structure: "Click to show it on the map, with what it is doing.",
  robot: "Click to show it on the map.",
  machine: "Click to show it on the map.",
  rover: "Click to show it on the map.",
};

/**
 * An entry with a name, a bar and figure for its Condition, with a tooltip
 * saying how it is repaired, and, where there is anything to say or
 * choose, a line below saying what it is doing, with room for buttons
 * after it. Its name is a button that finds it on
 * the base map, where rows of the same name can be told apart, and
 * pointing at the entry, or moving the focus into it, marks it there.
 */
function createEntry(
  name: string,
  repair: string,
  subject: MapSubject,
  map: MapFinder,
  showResult: (result: ChoiceResult) => void,
): Entry & { readonly actions: HTMLElement } {
  const item = document.createElement("li");
  item.className = "entry";
  const head = document.createElement("span");
  head.className = "entry__head";
  const title = document.createElement("button");
  title.type = "button";
  title.className = "entry__name";
  title.textContent = name;
  title.title = FINDS[subject.kind];
  title.addEventListener("click", () => {
    showResult(map.find(subject));
  });
  for (const pointing of ["pointerenter", "focusin"]) {
    item.addEventListener(pointing, () => {
      map.pointOut(subject);
    });
  }
  for (const leaving of ["pointerleave", "focusout"]) {
    item.addEventListener(leaving, () => {
      map.pointOut(undefined);
    });
  }
  const condition = createCondition(repair);
  head.append(title, " ", condition.element);
  const state = document.createElement("span");
  state.className = "entry__state";
  const actions = document.createElement("span");
  actions.className = "entry__actions";
  // Until it is given something to choose.
  actions.hidden = true;
  item.append(head, " ", state, actions);
  // What it is doing can take more lines or fewer as it changes, such as a
  // Plant between Batches, so the entries below it hold still meanwhile.
  holdHeight(item);
  /** What the tooltips last said more of. */
  let more: string | undefined;
  return {
    item,
    actions,
    show(doing, conditionPercent) {
      const text = [doing.value, doing.note]
        .filter((part) => part !== undefined)
        .join(" · ");
      setText(state, text);
      // With nothing to say, it takes no room.
      state.hidden = text === "";
      if (doing.more !== more) {
        more = doing.more;
        state.title = more ?? "";
        title.title =
          more === undefined
            ? FINDS[subject.kind]
            : `${more.charAt(0).toUpperCase()}${more.slice(1)}. ${FINDS[subject.kind]}`;
      }
      condition.show(conditionPercent);
      item.classList.toggle("entry--broken", conditionPercent <= 0);
    },
  };
}

/**
 * A bar and figure for a Condition, with a tooltip saying how it is
 * repaired, picked out while it is low. Given a word to go before the
 * figure, it says which Condition it is, such as the lowest of several.
 */
function createCondition(
  repair: string,
  which = "",
): { readonly element: HTMLElement; show(conditionPercent: number): void } {
  const element = document.createElement("span");
  element.className = "entry__condition";
  element.title = `Condition. ${repair}`;
  const meter = createMeter();
  // The bar shows it is a Condition; screen readers need the word.
  const conditionWord = document.createElement("span");
  conditionWord.className = "visually-hidden";
  conditionWord.textContent = "Condition ";
  const percent = document.createElement("span");
  element.append(meter.element, conditionWord, which, percent);
  return {
    element,
    show(conditionPercent) {
      setText(percent, formatCondition(conditionPercent));
      meter.fill(conditionPercent / 100);
      element.classList.toggle(
        "entry__condition--low",
        conditionPercent > 0 && conditionPercent < LOW_CONDITION_PERCENT,
      );
    },
  };
}

/**
 * The one row that stands for several Structures of a type, which opens to
 * show a row for each.
 */
interface Stack {
  readonly item: HTMLLIElement;
  /** Where the rows of its Structures go. */
  readonly list: HTMLUListElement;
  show(stack: StructureStack): void;
}

/**
 * A row for several Structures of a type: its name with how many there
 * are, the lowest Condition among them, and a line below only while some of
 * them are in a state out of the ordinary. It starts closed, which is what
 * saves the room, and opens from its name, by mouse or keyboard, to show
 * each of them.
 */
function createStack(structureTypeId: string): Stack {
  const label = structureLabel(structureTypeId);
  const item = document.createElement("li");
  item.className = "entry entry--stack";
  item.dataset["row"] = `stack:${structureTypeId}`;
  const fold = document.createElement("details");
  fold.className = "stack";
  const head = document.createElement("summary");
  head.className = "stack__head";
  head.title = "Click to show each of them";
  const top = document.createElement("span");
  top.className = "entry__head";
  const name = document.createElement("span");
  name.className = "entry__name stack__name";
  const condition = createCondition(describeRepair("maintained"), "lowest ");
  top.append(name, " ", condition.element);
  const state = document.createElement("span");
  state.className = "entry__state";
  head.append(top, " ", state);
  const list = document.createElement("ul");
  list.className = "entries stack__members";
  list.setAttribute("aria-label", `${label}, each`);
  fold.append(head, list);
  item.append(fold);
  // Held as its line comes and goes, and let go as it is opened or closed.
  holdHeight(item, "closed");
  fold.addEventListener("toggle", () => {
    holdHeight(item, fold.open ? "open" : "closed");
  });
  return {
    item,
    list,
    show(stack) {
      setText(name, stack.name);
      setText(state, stack.line ?? "");
      state.hidden = stack.line === undefined;
      condition.show(stack.lowestConditionPercent);
      // Picked out on its own heading, so that the rows inside it aren't.
      head.classList.toggle(
        "stack__head--broken",
        stack.lowestConditionPercent <= 0,
      );
    },
  };
}

/**
 * The Base panel, beside the Work panel: the base's Robots, Machines and
 * Rovers, with what each is doing and its Condition, and below them its
 * Structures, with what state each is in. Choosing one by its name finds it
 * on the base map. It sends a choice to dismantle a Structure, to
 * choose a Plant's recipe, to switch a Plant off or on, or to move the
 * Mission Director into a Habitat to the Campaign, which decides whether
 * it is allowed and says why not.
 */
export function createBasePanel(
  container: HTMLElement,
  campaign: StructureChoices,
  showResult: (result: ChoiceResult) => void,
  onMap: MapFinder,
): BasePanel {
  const panel = document.createElement("aside");
  panel.className = "base-panel";
  panel.setAttribute("aria-label", "Base");
  // Whether a row is being pointed out on the map. A row taken from under
  // the pointer, as its Structure goes or it joins a closed row that
  // several share, can't say the pointer has left, so each update checks.
  let pointingOut = false;
  const map: MapFinder = {
    find: (subject) => onMap.find(subject),
    pointOut(subject) {
      pointingOut = subject !== undefined;
      onMap.pointOut(subject);
    },
  };

  // The Structures, listed by what they are for, each group one the player
  // can fold away on its own. The groups always come in the catalogue's
  // order, and a group shows only while it holds something.
  const structuresSection = createPanelSection("structures", "Structures");
  const structures = document.createElement("div");
  structures.className = "structure-groups";
  structures.setAttribute("role", "group");
  structures.setAttribute("aria-label", "Structures");
  structuresSection.body.append(structures);
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
    Entry & {
      readonly actions: HTMLElement;
      readonly controls: StructureControls;
    }
  >();
  // The rows that stand for several Structures of a type, by the type.
  const stacks = new Map<string, Stack>();
  const stackFor = (structureTypeId: string): Stack => {
    let stack = stacks.get(structureTypeId);
    if (stack === undefined) {
      stack = createStack(structureTypeId);
      stacks.set(structureTypeId, stack);
    }
    return stack;
  };
  const createStructureEntry = (structure: StructureSnapshot) => {
    const entry = createEntry(
      structureLabel(structure.structureTypeId),
      describeRepair("maintained"),
      { kind: "structure", id: structure.id },
      map,
      showResult,
    );
    // Dismantle is in its pop-up, which its name opens.
    const controls = createStructureControls(structure, campaign, showResult, {
      withDismantle: false,
    });
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
  fleetSection.body.append(robots, machines, rovers);
  const robotEntries = new Map<string, Entry>();
  const machineEntries = new Map<string, Entry>();
  const roverEntries = new Map<string, Entry>();
  const entryFor = (
    entries: Map<string, Entry>,
    list: HTMLElement,
    kind: MapSubject["kind"],
    id: string,
    name: string,
    repair: string,
  ): Entry => {
    let entry = entries.get(id);
    if (entry === undefined) {
      entry = createEntry(name, repair, { kind, id }, map, showResult);
      list.append(entry.item);
      entry.item.dataset["row"] = id;
      entries.set(id, entry);
    }
    return entry;
  };

  // The short list first: it changes little, while the Structures grow all
  // through a Campaign and scroll.
  panel.append(fleetSection.element, structuresSection.element);
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
        entry.actions.hidden = entry.controls.elements.every(
          (control) => control.hidden,
        );
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
          structure,
          stacks:
            habitat === undefined && stacksInList(structure.structureTypeId),
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
      const stacked = new Set<string>();
      for (const [groupId, inGroup] of listed) {
        inGroup.sort((a, b) => compareKeys(a.key, b.key));
        // Those of a type that share a row, once there are two of them.
        const together = new Map<string, ListedStructure[]>();
        for (const each of inGroup) {
          if (!each.stacks) continue;
          const typeId = each.structure.structureTypeId;
          together.set(typeId, [...(together.get(typeId) ?? []), each]);
        }
        const rows: HTMLElement[] = [];
        for (const each of inGroup) {
          const typeId = each.structure.structureTypeId;
          const sharing = each.stacks ? (together.get(typeId) ?? []) : [];
          if (sharing.length < 2) {
            rows.push(each.item);
          } else if (sharing[0] === each) {
            // Their row goes where the first of them would.
            const stack = stackFor(typeId);
            placeInOrder(
              stack.list,
              sharing.map(({ item }) => item),
            );
            stack.show(
              describeStructureStack(
                snapshot,
                sharing.map(({ structure }) => structure),
              ),
            );
            rows.push(stack.item);
            stacked.add(typeId);
          }
        }
        const group = groupFor(groupId);
        placeInOrder(group.list, rows);
        group.section.count(inGroup.length);
        group.section.summarise(
          summariseStructureGroup(inGroup.map(({ structure }) => structure)),
        );
        group.section.warn(needsAttention(group.list));
      }
      // A type down to one Structure, whose row has gone back to its group.
      for (const [typeId, stack] of stacks) {
        if (!stacked.has(typeId)) {
          stack.item.remove();
          stacks.delete(typeId);
        }
      }
      for (const [groupId, group] of groups) {
        if (!listed.has(groupId)) {
          group.section.element.remove();
          groups.delete(groupId);
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
          "robot",
          robot.id,
          robotLabel(robot.id, snapshot.robots),
          describeRepair("robot"),
        ).show(formatRobot(robot, snapshot.expedition), robot.conditionPercent);
      }
      for (const machine of snapshot.machines) {
        entryFor(
          machineEntries,
          machines,
          "machine",
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
          "rover",
          rover.id,
          catalogue.rover.label,
          describeRepair("maintained"),
        ).show(
          formatRover(rover, snapshot.maintenance),
          rover.conditionPercent,
        );
      }
      if (pointingOut && panel.querySelector(POINTED_AT) === null) {
        map.pointOut(undefined);
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
      map.pointOut(undefined);
      for (const group of groups.values()) group.section.element.remove();
      groups.clear();
      stacks.clear();
      structureEntries.clear();
      for (const entries of [robotEntries, machineEntries, roverEntries]) {
        for (const entry of entries.values()) entry.item.remove();
        entries.clear();
      }
    },
  };
}

/** A row for one thing, and not one that several share, with the pointer or the focus on it. */
const POINTED_AT =
  ".entry:not(.entry--stack):hover, .entry:not(.entry--stack):focus-within";

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
  readonly structure: StructureSnapshot;
  /** Whether it shares one row with the others of its type. */
  readonly stacks: boolean;
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
 * A group of Structures, by what they are for, headed by its label, how
 * many there are and what matters about them, such as how many are Broken
 * or switched off, and marked while any of them is Broken or low on
 * Condition, so that it reports even when folded. It stays folded on the next
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
