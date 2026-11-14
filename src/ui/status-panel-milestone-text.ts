import {
  actAsks,
  actLabel,
  milestoneActId,
  milestoneLabel,
  type MilestoneMeasure,
  type Snapshot,
} from "../simulation";
import { formatKilograms } from "./format";
import { stockLabel } from "./labels";
import type { Stat } from "./stat";
import { selfSufficiencyWindow } from "./status-panel-text";

// The status panel's words for the Act and Milestones, and the summary
// beside the folded Milestones section's title.

/**
 * Names the current Act and says what it asks of the player, or that it has
 * all been done once every Milestone is reached.
 */
export function formatAct(milestones: Snapshot["milestones"]): {
  readonly label: string;
  readonly asks: string;
} {
  return {
    label: actLabel(milestones.currentActId),
    asks:
      milestones.currentId === undefined
        ? "Everything this Act asks of you is done."
        : actAsks(milestones.currentActId),
  };
}

/**
 * Names the Milestone after the current one, with its Act if that is a later
 * one, for example "Lander departs" or "Workshop running, in Act 2:
 * Independence"; undefined when none is left, and the line has nothing to say.
 */
export function formatNextMilestone(
  milestones: Snapshot["milestones"],
): string | undefined {
  const { nextId, currentActId } = milestones;
  if (nextId === undefined) return undefined;
  const actId = milestoneActId(nextId);
  return actId === currentActId
    ? milestoneLabel(nextId)
    : `${milestoneLabel(nextId)}, in ${actLabel(actId)}`;
}

/**
 * Says where the current Milestone comes among its Act's, for example
 * "Milestone 3 of 5"; undefined once every one is reached.
 */
export function formatMilestonePlace(
  milestones: Pick<Snapshot["milestones"], "place">,
): string | undefined {
  const { place } = milestones;
  return place === undefined
    ? undefined
    : `Milestone ${place.number} of ${place.of}`;
}

/**
 * Says how far along the current Milestone is by one of its measures, as a
 * line of its own with a bar, from 0 to 1: for example "Return Mass", "212
 * of 300 kg", or "Oxygen", "45 of 612 kg" and "room for only 400 kg" where
 * the base can't yet hold what a Structure is stocked with. An amount short
 * of what it has to reach is rounded down, and that is rounded up, so that
 * the line never says it is there before it is.
 */
export function formatMilestoneMeasure(
  measure: MilestoneMeasure,
): Stat & { readonly label: string; readonly fraction: number } {
  const amounts = (kilograms: number, targetKilograms: number) => {
    const target = Math.ceil(targetKilograms);
    const amount =
      kilograms >= targetKilograms
        ? Math.max(Math.floor(kilograms), target)
        : Math.floor(kilograms);
    return {
      value: `${amount} of ${target} kg`,
      fraction: Math.min(Math.max(kilograms / targetKilograms, 0), 1),
    };
  };
  switch (measure.kind) {
    case "life-support-made":
    case "spare-components-made":
      return {
        label: "Made here",
        value:
          measure.share === undefined
            ? "none used yet"
            : `${Math.round(measure.share * 100)}% of use`,
        note: measure.windowComplete
          ? `needs 100% over ${selfSufficiencyWindow()}`
          : "judged once a whole Lunation is recorded",
        fraction: Math.min(measure.share ?? 0, 1),
      };
    case "return-mass":
      return {
        label: "Return Mass",
        ...amounts(measure.kilograms, measure.targetKilograms),
      };
    case "exports-loaded":
      return {
        label: "Exports",
        ...amounts(measure.kilograms, measure.targetKilograms),
        note: "aboard or to load",
      };
    case "stocked-with": {
      const { limitKilograms, targetKilograms } = measure;
      const shown = {
        label: stockLabel(measure.stockId),
        ...amounts(measure.kilograms, targetKilograms),
      };
      // Nothing to say of the room once there is enough of it in stock.
      return limitKilograms === undefined ||
        limitKilograms >= targetKilograms ||
        measure.kilograms >= targetKilograms
        ? shown
        : {
            ...shown,
            note: `room for only ${formatKilograms(limitKilograms)}`,
          };
    }
  }
}

/** Sums up the Milestones for their folded section: the one to aim for now. */
export function summariseMilestones(
  milestones: Pick<Snapshot["milestones"], "currentId">,
): string {
  return milestones.currentId === undefined
    ? "every Milestone reached"
    : milestoneLabel(milestones.currentId);
}
