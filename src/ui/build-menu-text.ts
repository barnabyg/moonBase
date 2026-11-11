import {
  catalogue,
  type StructureListGroup,
  type StructureType,
} from "../catalogue";

// How the build menu sorts the Structures it offers, and what a group's
// heading says of them.

/** A group of the build menu: the Structures it offers that are for one thing. */
export interface BuildGroup {
  readonly id: StructureListGroup;
  readonly label: string;
  /** In the catalogue's order. */
  readonly types: readonly StructureType[];
}

/**
 * Sorts the Structures the build menu offers into the groups the Base panel
 * lists Structures in, by what they are for, so that a Structure is found
 * where its kind is. The groups come in the Base panel's order, each
 * Structure in the catalogue's, and a group with none of them is left out.
 */
export function groupBuildOptions(
  offered: readonly StructureType[],
): BuildGroup[] {
  return catalogue.structureListGroups.flatMap(({ id, label }) => {
    const types = offered.filter(({ listGroup }) => listGroup === id);
    return types.length === 0 ? [] : [{ id, label, types }];
  });
}

/** How many of a Structure the base's stock can supply, as the build menu shows it. */
export interface BuildOptionStock {
  readonly sets: number;
  /** Whether it is made from Regolith alone, so the stock never runs short of it. */
  readonly unlimited: boolean;
}

/**
 * What a folded group of the build menu says after how many it offers: how
 * many of them could be built now, from what is in the base's stock, for
 * example "2 can be built now".
 */
export function summariseBuildGroup(
  options: readonly BuildOptionStock[],
): string {
  const ready = options.filter(
    ({ sets, unlimited }) => unlimited || sets > 0,
  ).length;
  if (ready === 0) return "none can be built now";
  if (ready === options.length && ready > 1) return "all can be built now";
  return `${ready} can be built now`;
}
