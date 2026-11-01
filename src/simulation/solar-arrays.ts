import {
  catalogue,
  type ComponentCount,
  type LaunchItem,
  type StructureType,
} from "../catalogue";
import type { CampaignState } from "./campaign";

/**
 * The player plans a solar array, and what kind it is comes from its parts:
 * those the base has, then the ones on sale. A Design only changes what can be
 * bought from then on, so a part already made stays what it is, and so does
 * the array built from it. Until the Robot takes the parts, a planned array
 * can still become another kind, so that it never waits for a part that is
 * no longer made.
 */

export const SOLAR_ARRAY_ID = "solar-array";

/**
 * Whether the player can plan a type of Structure as it is: anything but the
 * kinds of solar array, which come from their parts.
 */
export function isPlannedAsItself(type: StructureType): boolean {
  return type.solarArray === undefined || type.id === SOLAR_ARRAY_ID;
}

/** Whether a Launch item is what the unlocked Designs make today. */
export function isOnSale(
  item: LaunchItem,
  unlockedDesignIds: readonly string[],
): boolean {
  return (
    unlockedDesignIds.includes(item.designId) &&
    (item.alsoNeedsDesignIds ?? []).every((id) =>
      unlockedDesignIds.includes(id),
    ) &&
    !(item.retiredByDesignIds ?? []).some((id) =>
      unlockedDesignIds.includes(id),
    )
  );
}

function kinds(): readonly StructureType[] {
  return catalogue.structureTypes.filter(
    (type) => type.solarArray !== undefined,
  );
}

function onSale(
  componentId: string,
  unlockedDesignIds: readonly string[],
): boolean {
  return catalogue.launch.items.some(
    (item) =>
      item.brings.kind === "component" &&
      item.brings.componentId === componentId &&
      isOnSale(item, unlockedDesignIds),
  );
}

/** How many of each Component are spoken for: the base's, or on their way. */
type Counts = Map<string, number>;

function canBeHad(
  type: StructureType,
  free: Counts,
  unlockedDesignIds: readonly string[],
): boolean {
  return type.components.every(
    (need) =>
      (free.get(need.componentId) ?? 0) >= need.count ||
      onSale(need.componentId, unlockedDesignIds),
  );
}

/** How many Components it would take buying to build a kind of solar array. */
function toBuy(type: StructureType, free: Counts): number {
  return type.components.reduce(
    (total, need) =>
      total + Math.max(need.count - (free.get(need.componentId) ?? 0), 0),
    0,
  );
}

/**
 * The kind of solar array these parts make: of those that can be had, the one
 * that needs the fewest bought, and the best of any equal.
 */
function chooseKind(
  free: Counts,
  unlockedDesignIds: readonly string[],
): StructureType | undefined {
  let best: StructureType | undefined;
  let fewest = Infinity;
  for (const type of kinds()) {
    if (!canBeHad(type, free, unlockedDesignIds)) continue;
    const buying = toBuy(type, free);
    if (buying <= fewest) {
      fewest = buying;
      best = type;
    }
  }
  return best;
}

function take(free: Counts, needs: readonly ComponentCount[]): void {
  for (const need of needs) {
    free.set(
      need.componentId,
      Math.max((free.get(need.componentId) ?? 0) - need.count, 0),
    );
  }
}

/** What goes into working out a solar array's kind, in a Campaign or a Snapshot. */
export interface SolarArrayParts {
  readonly stockpile: {
    readonly components: readonly ComponentCount[];
  };
  readonly lander: { readonly cargo: readonly ComponentCount[] };
  readonly unlockedDesignIds: readonly string[];
  readonly constructions: readonly {
    readonly structureTypeId: string;
    readonly componentsTaken: boolean;
  }[];
}

function typeOf(id: string): StructureType | undefined {
  return catalogue.structureTypes.find((type) => type.id === id);
}

/** The Components the base has, or that are aboard or on a manifest. */
function partsToHand(
  parts: SolarArrayParts,
  manifest: readonly { readonly itemId: string; readonly count: number }[],
): Counts {
  const free: Counts = new Map();
  const add = (componentId: string, count: number): void => {
    free.set(componentId, (free.get(componentId) ?? 0) + count);
  };
  for (const { componentId, count } of parts.stockpile.components) {
    add(componentId, count);
  }
  for (const { componentId, count } of parts.lander.cargo) {
    add(componentId, count);
  }
  for (const { itemId, count } of manifest) {
    const brings = catalogue.launch.items.find(
      (item) => item.id === itemId,
    )?.brings;
    if (brings?.kind === "component") add(brings.componentId, count);
  }
  return free;
}

/** The kind of solar array the next one planned would be. */
export function nextSolarArray(
  parts: SolarArrayParts,
  manifest: readonly { readonly itemId: string; readonly count: number }[],
): StructureType | undefined {
  const free = partsToHand(parts, manifest);
  for (const construction of parts.constructions) {
    if (!construction.componentsTaken) {
      take(free, typeOf(construction.structureTypeId)?.components ?? []);
    }
  }
  return chooseKind(free, parts.unlockedDesignIds);
}

/**
 * How many more solar arrays the base's stock alone can supply, leaving aside
 * the Components promised to planned Constructions.
 */
export function solarArraysInStock(parts: SolarArrayParts): number {
  const free: Counts = new Map(
    parts.stockpile.components.map(({ componentId, count }) => [
      componentId,
      count,
    ]),
  );
  for (const construction of parts.constructions) {
    if (!construction.componentsTaken) {
      take(free, typeOf(construction.structureTypeId)?.components ?? []);
    }
  }
  let sets = 0;
  for (const type of kinds()) {
    while (
      type.components.every(
        (need) => (free.get(need.componentId) ?? 0) >= need.count,
      )
    ) {
      take(free, type.components);
      sets++;
    }
  }
  return sets;
}

/**
 * Turns any solar array still waiting for parts into another kind if its parts
 * can no longer be had, or if the base has a whole set of another's, such as an
 * array works has made. Earliest planned first, as each takes its parts before
 * the next can count on them.
 */
export function rechooseSolarArrays(state: CampaignState): void {
  const waiting = state.constructions.filter(
    (construction) =>
      !construction.componentsTaken &&
      typeOf(construction.structureTypeId)?.solarArray !== undefined,
  );
  if (waiting.length === 0) return;
  const free = partsToHand(state, state.launchManifest);
  for (const construction of waiting) {
    const type = typeOf(construction.structureTypeId);
    if (type === undefined) continue;
    const choice = chooseKind(free, state.unlockedDesignIds);
    const changes =
      choice !== undefined &&
      toBuy(type, free) > 0 &&
      (toBuy(choice, free) === 0 ||
        !canBeHad(type, free, state.unlockedDesignIds));
    const kind = changes ? choice : type;
    construction.structureTypeId = kind.id;
    take(free, kind.components);
  }
}
