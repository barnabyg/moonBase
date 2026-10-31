import {
  catalogue,
  type GroundPosition,
  type StructureType,
} from "../src/catalogue";

const halfWidth = catalogue.map.widthMetres / 2;
const halfDepth = catalogue.map.depthMetres / 2;

/**
 * The Designs that must be unlocked by the time a Design is: the starting
 * ones, the Design itself and every Design it needs first, however far back.
 */
export function designsUnlockedWith(designId: string): Set<string> {
  const unlocked = new Set(
    catalogue.designs
      .filter((design) => design.starting)
      .map((design) => design.id),
  );
  const visited = new Set<string>();
  const waiting = [designId];
  for (let id = waiting.pop(); id !== undefined; id = waiting.pop()) {
    if (visited.has(id)) continue;
    visited.add(id);
    unlocked.add(id);
    const design = catalogue.designs.find((candidate) => candidate.id === id);
    waiting.push(...(design?.prerequisiteDesignIds ?? []));
  }
  return unlocked;
}

/** The mass and price of a full set of a Structure's Components by Launch. */
export function shipped(type: StructureType): {
  kilograms: number;
  millionDollars: number;
} {
  return type.components.reduce(
    (total, need) => {
      const item = catalogue.launch.items.find(
        (candidate) =>
          candidate.brings.kind === "component" &&
          candidate.brings.componentId === need.componentId,
      );
      return {
        kilograms:
          total.kilograms + (item?.massKilograms ?? Infinity) * need.count,
        millionDollars:
          total.millionDollars +
          (item?.priceMillionDollars ?? Infinity) * need.count,
      };
    },
    { kilograms: 0, millionDollars: 0 },
  );
}

export function isOnMap(position: GroundPosition, margin = 0): boolean {
  return (
    Math.abs(position.x) + margin <= halfWidth &&
    Math.abs(position.y) + margin <= halfDepth
  );
}
