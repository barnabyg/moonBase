import { catalogue, type Design } from "../catalogue";
import { isPlannedAsItself } from "../simulation";
import { componentLabel, stockLabel } from "./labels";

// The shape of the Tech Tree, for drawing it: how far along each Design is,
// what leads to what, and what each lets the base have.

/** The Design with an id, which the catalogue must have. */
export function designById(id: string): Design {
  const design = catalogue.designs.find((d) => d.id === id);
  if (design === undefined) throw new Error(`No Design called "${id}"`);
  return design;
}

/**
 * How far along the tree each Design is, its step: 0 for a starting one, and
 * for any other one more than the furthest along of the Designs it needs
 * first, so that each Design is drawn below everything it needs.
 */
export function designSteps(): Map<string, number> {
  const steps = new Map<string, number>();
  function stepOf(design: Design): number {
    const known = steps.get(design.id);
    if (known !== undefined) return known;
    const step = design.starting
      ? 0
      : 1 +
        Math.max(
          0,
          ...design.prerequisiteDesignIds.map((id) => stepOf(designById(id))),
        );
    steps.set(design.id, step);
    return step;
  }
  for (const design of catalogue.designs) stepOf(design);
  return steps;
}

/** The ids of the Designs that need this one directly, in catalogue order. */
export function designsLeadingFrom(designId: string): string[] {
  return catalogue.designs
    .filter((design) => design.prerequisiteDesignIds.includes(designId))
    .map((design) => design.id);
}

/**
 * Every Design this one needs first, directly or through another, so all
 * that has to be unlocked before it, whether it is unlocked yet or not.
 */
export function designsNeededBefore(designId: string): Set<string> {
  const needed = new Set<string>();
  const visit = (id: string) => {
    for (const prerequisite of designById(id).prerequisiteDesignIds) {
      if (needed.has(prerequisite)) continue;
      needed.add(prerequisite);
      visit(prerequisite);
    }
  };
  visit(designId);
  return needed;
}

/**
 * The Designs still to unlock to reach this one, in an order they can be
 * unlocked: each after every Design it needs, a whole branch at a time, in
 * the order the Designs list what they need first, ending with this one.
 * Empty once it is unlocked.
 */
export function pathToDesign(
  designId: string,
  unlockedDesignIds: readonly string[],
): Design[] {
  const path: Design[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id) || unlockedDesignIds.includes(id)) return;
    seen.add(id);
    const design = designById(id);
    for (const prerequisite of design.prerequisiteDesignIds)
      visit(prerequisite);
    path.push(design);
  };
  visit(designId);
  return path;
}

/**
 * What a Design lets the base have, in a word or two each: its Structures
 * and its types of Expedition, or, with neither, what it puts on the Launch
 * manifest. For a glance; the Design's description says the rest.
 */
export function designBrings(design: Design): string[] {
  const things = [
    ...catalogue.structureTypes
      .filter((type) => type.designId === design.id && isPlannedAsItself(type))
      .map((type) => type.label),
    ...catalogue.expeditions.types
      .filter((type) => type.designId === design.id)
      .map((type) => type.label),
  ];
  if (things.length > 0) return things;
  return [
    ...new Set(
      catalogue.launch.items
        .filter(
          (item) =>
            item.designId === design.id &&
            (item.alsoNeedsDesignIds ?? []).length === 0,
        )
        .map(({ brings }) => {
          switch (brings.kind) {
            case "component":
              return componentLabel(brings.componentId);
            case "life-support":
              return stockLabel(brings.stockId);
            case "robot":
              return "Robots";
          }
        }),
    ),
  ];
}
