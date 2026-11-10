import { catalogue } from "../catalogue";
import type { Snapshot, StructureSnapshot } from "../simulation";
import { maintenanceState } from "./base-panel-text";
import { formatCondition } from "./format";
import { structureLabel } from "./labels";
import {
  isToBeDismantled,
  maintenanceOf,
  structureStatus,
} from "./structure-state";

// How the Base panel sums up its Structures, in words: the one row that
// stands for several of a type, and what a group's heading says of them.

/**
 * Whether the Base panel lists the Structures of a type in one row, which
 * opens to show each: those that only stand and work, such as battery
 * banks, solar arrays, lights and tanks. A Plant keeps a row to itself, as
 * it has its own switch and its own batch to report, and so do a radio
 * telescope array, which works through its own round, and a Habitat, with
 * its shielding and water wall under it.
 */
export function stacksInList(structureTypeId: string): boolean {
  const type = catalogue.structureTypes.find(
    ({ id }) => id === structureTypeId,
  );
  return (
    type !== undefined &&
    !type.habitat &&
    !type.shieldsHabitat &&
    type.waterWall === undefined &&
    type.recipes === undefined &&
    type.radioArray === undefined
  );
}

/** What the one row for several Structures of a type says. */
export interface StructureStack {
  /** The type and how many there are, for example "Battery bank ×3". */
  readonly name: string;
  /** The Condition of the most worn of them. */
  readonly lowestConditionPercent: number;
  /**
   * How many of them are in each state out of the ordinary, for example
   * "1 Broken, 2 awaiting Maintenance", or undefined if none is.
   */
  readonly line?: string;
}

/**
 * Sums up several Structures of one type for the row that stands for them
 * all: how many there are, the lowest Condition among them, and how many
 * are Broken, without power, to be dismantled or due Maintenance.
 */
export function describeStructureStack(
  snapshot: Pick<Snapshot, "dismantlings" | "maintenance" | "radioArrays">,
  members: readonly StructureSnapshot[],
): StructureStack {
  const states = new Map<string, number>();
  const count = (state: string | undefined): void => {
    if (state !== undefined) states.set(state, (states.get(state) ?? 0) + 1);
  };
  for (const member of members) {
    const status = structureStatus(
      member,
      isToBeDismantled(snapshot, member.id),
      snapshot.radioArrays,
    );
    count(status === "commissioned" ? undefined : status);
    count(maintenanceState(maintenanceOf(snapshot, member.id)));
  }
  const line = [...states]
    .map(([state, number]) => `${number} ${state}`)
    .join(", ");
  return {
    name: `${structureLabel(members[0]?.structureTypeId ?? "")} ×${members.length}`,
    lowestConditionPercent: Math.min(
      ...members.map(({ conditionPercent }) => conditionPercent),
    ),
    ...(line === "" ? {} : { line }),
  };
}

/**
 * What a group's heading says of its Structures after how many there are,
 * so that it reports even while folded, or while its rows stand for
 * several each: how many are Broken, how many Plants are switched off, and
 * the lowest Condition among the rest, for example "1 Broken · 4 off ·
 * lowest 72%". Undefined while every one works and is as good as new.
 */
export function summariseStructureGroup(
  members: readonly Pick<
    StructureSnapshot,
    "conditionPercent" | "switchedOff"
  >[],
): string | undefined {
  const broken = members.filter(
    ({ conditionPercent }) => conditionPercent <= 0,
  ).length;
  const off = members.filter(({ switchedOff }) => switchedOff).length;
  const lowest = formatCondition(
    Math.min(
      ...members
        .map(({ conditionPercent }) => conditionPercent)
        .filter((percent) => percent > 0),
    ),
  );
  const parts = [
    ...(broken > 0 ? [`${broken} Broken`] : []),
    ...(off > 0 ? [`${off} off`] : []),
    // With none left that isn't Broken, or all of them at 100%, it adds nothing.
    ...(lowest === formatCondition(100) || members.length === broken
      ? []
      : [`lowest ${lowest}`]),
  ];
  return parts.length === 0 ? undefined : parts.join(" · ");
}
