import type { GroundPosition, KeepClear, KeepClearOf } from "../catalogue";
import {
  findStructureType,
  isBroken,
  type StructureState,
} from "./construction";

// What a Structure can't work near (see `KeepClear` in the data catalogue): an
// infrared telescope can't observe while a lit Structure is within its dark
// radius. It is the same rule for any kind and radius, and the placement preview
// asks it of the Structures commissioned, as the simulation does, so that the
// player sees while placing what will stop it.

/** What the rule reads of a commissioned Structure, from the state or a snapshot. */
export type StandingStructure = Pick<
  StructureState,
  "id" | "structureTypeId" | "position" | "conditionPercent" | "switchedOff"
>;

/** What a type of Structure can't work near, if anything. */
export function keepClearOf(structureTypeId: string): KeepClear | undefined {
  return findStructureType(structureTypeId)?.keepClear;
}

/** Whether a type of Structure is of a kind that others are kept clear of. */
export function isOfKind(of: KeepClearOf, structureTypeId: string): boolean {
  const type = findStructureType(structureTypeId);
  if (type === undefined) return false;
  switch (of) {
    case "lit":
      return type.lightRadiusMetres > 0;
    case "plants":
      return (type.recipes ?? []).length > 0;
  }
}

/**
 * The commissioned Structures that stop one of the given type working at the
 * given position: those of the kind it is kept clear of, neither Broken nor
 * switched off, with any part of their footprint within its radius. None if it
 * is kept clear of nothing. The one with the given id, itself, never counts.
 */
export function structuresInTheWay<Other extends StandingStructure>(
  structureTypeId: string,
  position: GroundPosition,
  structures: readonly Other[],
  ownId?: string,
): Other[] {
  const rule = keepClearOf(structureTypeId);
  if (rule === undefined) return [];
  return structures.filter(
    (other) =>
      other.id !== ownId &&
      !isBroken(other) &&
      !other.switchedOff &&
      isOfKind(rule.of, other.structureTypeId) &&
      Math.hypot(other.position.x - position.x, other.position.y - position.y) <
        rule.radiusMetres +
          (findStructureType(other.structureTypeId)?.footprintRadiusMetres ??
            0),
  );
}
