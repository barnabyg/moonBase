import type { CampaignState } from "./campaign";
import type { StructureState } from "./construction";
import { hasPowerSource, powerNetworks } from "./power";

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
  const cutOff = powerNetworks(state)
    .filter(
      (network) =>
        !hasPowerSource(network) &&
        (network.daylightConsumptionKilowatts > 0 ||
          network.nightConsumptionKilowatts > 0),
    )
    .flatMap((network) =>
      network.structures.filter(
        (structure) =>
          !state.cables.some(
            (cable) => cable.complete && cable.toStructureId === structure.id,
          ),
      ),
    )
    .filter(
      (structure) =>
        !state.dismantlings.some((planned) => planned.id === structure.id),
    )
    .map((structure) => structure.id);
  const dropped = state.reconnections
    .map((reconnection) => reconnection.structureId)
    .filter((structureId) => !cutOff.includes(structureId));
  state.reconnections = state.reconnections.filter(
    (reconnection) => !dropped.includes(reconnection.structureId),
  );
  state.cables = state.cables.filter(
    (cable) => cable.complete || !dropped.includes(cable.toStructureId),
  );
  for (const structureId of cutOff) {
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
export function reconnecting(
  state: CampaignState,
  structureId: string,
): StructureState | undefined {
  if (
    !state.reconnections.some(
      (reconnection) => reconnection.structureId === structureId,
    ) ||
    state.dismantlings.some((planned) => planned.id === structureId)
  ) {
    return undefined;
  }
  return state.structures.find((structure) => structure.id === structureId);
}
