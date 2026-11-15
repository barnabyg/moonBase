import { catalogue, type StructureType } from "../catalogue";
import { isPlannedAsItself } from "./solar-arrays";

/**
 * The player plans a battery bank or a large one, and chooses whether its
 * cabinet is Whipple-shielded. Both cabinets stay on sale, as the shield is a
 * trade: more protection for more mass and money.
 */

/** Whether every Design a type of Structure needs is unlocked. */
export function hasDesignsFor(
  type: StructureType,
  unlockedDesignIds: readonly string[],
): boolean {
  return [type.designId, ...(type.alsoNeedsDesignIds ?? [])].every((id) =>
    unlockedDesignIds.includes(id),
  );
}

/**
 * What planning a type of Structure makes: for a battery bank, the one of its
 * size in a Whipple-shielded cabinet if that is asked for and its Designs are
 * unlocked, and otherwise the type itself.
 */
export function batteryBankKind(
  type: StructureType,
  shielded: boolean,
  unlockedDesignIds: readonly string[],
): StructureType {
  const size = type.batteryBank?.large;
  if (!shielded || size === undefined) return type;
  return (
    catalogue.structureTypes.find(
      (other) =>
        other.batteryBank?.large === size &&
        other.batteryBank.shielded &&
        hasDesignsFor(other, unlockedDesignIds),
    ) ?? type
  );
}

/** Whether a Whipple-shielded cabinet can be chosen for any battery bank. */
export function canShieldBatteryBanks(
  unlockedDesignIds: readonly string[],
): boolean {
  return catalogue.structureTypes.some(
    (type) =>
      type.batteryBank?.shielded === true &&
      hasDesignsFor(type, unlockedDesignIds),
  );
}

/**
 * Whether the build menu has an entry for a type of Structure: anything
 * planned as itself but a Whipple-shielded battery bank, which the entry for
 * its size plans once the shielded cabinet is ticked.
 */
export function isInBuildMenu(type: StructureType): boolean {
  return isPlannedAsItself(type) && type.batteryBank?.shielded !== true;
}
