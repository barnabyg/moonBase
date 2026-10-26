import type { CampaignState } from "./campaign";
import type { StructureState } from "./construction";
import { isDueToBeDismantled } from "./dismantling";
import { findCable, hasPowerSource, powerNetworks } from "./power";

/**
 * A plan to lay cable to a commissioned Structure cut off from power, which
 * the Robot carries out as a Work Order in plan order, once there is a
 * powered Structure to lay it from.
 */
export interface ReconnectionState {
  /** The id of the Structure the cable goes to. */
  structureId: string;
  /** Where in the Mission Director's plans it comes, as of when the Structure was cut off. */
  planNumber: number;
}

/**
 * Plans a cable to every network of commissioned Structures that uses power
 * but has no power source, such as one left behind by dismantling the solar
 * array it drew its power from, and drops the plans for any network that no
 * longer needs one. One cable joins the whole network, so it goes to the
 * Structure on it that no cable reaches. A Structure due to be dismantled
 * isn't cabled; any cable left half-laid to it goes.
 */
export function planReconnections(state: CampaignState): void {
  const toReconnect = powerNetworks(state)
    .filter(
      (network) =>
        !hasPowerSource(network) &&
        (network.daylightConsumptionKilowatts > 0 ||
          network.nightConsumptionKilowatts > 0),
    )
    .flatMap((network) =>
      network.structures.filter(
        (structure) => findCable(state, structure.id)?.complete !== true,
      ),
    )
    .filter((structure) => !isDueToBeDismantled(state, structure.id))
    .map((structure) => structure.id);
  const dropped = state.reconnections
    .map((reconnection) => reconnection.structureId)
    .filter((structureId) => !toReconnect.includes(structureId));
  state.reconnections = state.reconnections.filter(
    (reconnection) => !dropped.includes(reconnection.structureId),
  );
  state.cables = state.cables.filter(
    (cable) => cable.complete || !dropped.includes(cable.toStructureId),
  );
  for (const structureId of toReconnect) {
    if (
      state.reconnections.some((other) => other.structureId === structureId)
    ) {
      continue;
    }
    state.reconnections.push({ structureId, planNumber: state.nextPlanNumber });
    state.nextPlanNumber += 1;
  }
}

/**
 * The commissioned Structure cut off from power that a cable is planned to,
 * unless it is due to be dismantled.
 */
export function findStructureToReconnect(
  state: CampaignState,
  structureId: string,
): StructureState | undefined {
  if (
    !state.reconnections.some(
      (reconnection) => reconnection.structureId === structureId,
    ) ||
    isDueToBeDismantled(state, structureId)
  ) {
    return undefined;
  }
  return state.structures.find((structure) => structure.id === structureId);
}
