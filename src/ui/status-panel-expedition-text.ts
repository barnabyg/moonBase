import type { ExpeditionReward, ExpeditionSnapshot } from "../simulation";
import { formatDuration, formatKilograms } from "./format";
import { inSentence, resourceLabel } from "./labels";
import { minutesUntil } from "./status-panel-text";

// The words that describe Expeditions.

/** Says what a type of Expedition brings back, for example "200 kg of water ice" or "25 Science". */
export function describeExpeditionReward(reward: ExpeditionReward): string {
  return reward.kind === "science"
    ? `${reward.science} Science`
    : `${formatKilograms(reward.kilograms)} of ${inSentence(resourceLabel(reward.resourceId))}`;
}

/**
 * Says how the Expedition under way is going, and when it will be back,
 * for example "away, back in 2 Earth Days 5 hours", or that there is none.
 */
export function describeExpedition(
  expedition: ExpeditionSnapshot | undefined,
  elapsedMinutes: number,
): string {
  if (expedition === undefined) return "none under way";
  const cargo = describeExpeditionReward(expedition.reward);
  switch (expedition.stage) {
    case "boarding":
      return "leaving once the Robot has finished its Work Order and boarded the Rover";
    case "driving-out":
      return "the Robot is driving the Rover to the map edge";
    case "away":
      return `away, back in ${formatDuration(minutesUntil(expedition.returnsAtMinute, elapsedMinutes))}`;
    case "driving-back":
      return `back on the map for ${cargo}, driving to the stockpile`;
    case "unloading":
      return `handing over what it brought at the stockpile, for ${cargo}`;
  }
}
