import { catalogue, type Design } from "../catalogue";
import { designLabel, type Snapshot } from "../simulation";

// Whether a Design can be unlocked, in words, for the Tech Tree screen and
// the Guide.

/**
 * Whether a Design is unlocked, can be unlocked now or is out of reach, in
 * words for the Tech Tree screen, for example "Can be unlocked now", "Needs
 * Large battery banks first" or "Needs 12 more Science".
 */
export function describeDesignState(
  design: Design,
  snapshot: Pick<Snapshot, "science" | "unlockedDesignIds">,
): {
  readonly state: "unlocked" | "unlockable" | "out-of-reach";
  readonly text: string;
} {
  if (snapshot.unlockedDesignIds.includes(design.id)) {
    return { state: "unlocked", text: "Unlocked" };
  }
  const missing = design.prerequisiteDesignIds.filter(
    (id) => !snapshot.unlockedDesignIds.includes(id),
  );
  if (missing.length > 0) {
    return {
      state: "out-of-reach",
      text: `Needs ${missing.map(designLabel).join(" and ")} first`,
    };
  }
  if (snapshot.science < design.scienceCost) {
    return {
      state: "out-of-reach",
      text: `Needs ${design.scienceCost - snapshot.science} more Science`,
    };
  }
  return { state: "unlockable", text: "Can be unlocked now" };
}

/**
 * The Designs the base's Science would unlock now: those not yet unlocked
 * whose cost it covers and whose prerequisites are unlocked, in catalogue
 * order.
 */
export function designsToUnlock(
  snapshot: Pick<Snapshot, "science" | "unlockedDesignIds">,
): Design[] {
  return catalogue.designs.filter(
    (design) => describeDesignState(design, snapshot).state === "unlockable",
  );
}
