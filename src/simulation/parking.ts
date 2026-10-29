import { catalogue, type GroundPosition } from "../catalogue";
import type { CampaignState } from "./campaign";
import {
  chooseParkingSpot,
  distance,
  findStructureType,
  type StructureState,
} from "./construction";
import {
  bodyOf,
  drivenSpec,
  drivenSubject,
  drivenTarget,
  everyDriven,
  findDriven,
  isDrivenBroken,
  isSameDriven,
  type Driven,
  type DrivenSubject,
  type DrivenTarget,
} from "./driven";
import { isRoverSpokenFor } from "./expeditions";
import { readLunation } from "./lunation";
import { isUnderMaintenance } from "./maintenance";
import {
  nearestPoweredStructure,
  pluggedIn,
  powerSockets,
  structureNetworks,
} from "./power";

/**
 * A "park" Work Order: the Robot drives an idle Machine or Rover that isn't
 * plugged in to a free bay of a powered parking area, or failing that to a
 * free spot beside the nearest powered Structure, where it plugs in and its
 * heater keeps the cold of Night off it.
 */
export interface ParkingState {
  /** The Machine or Rover to park. */
  target: DrivenTarget;
  /**
   * The Structure it is parked beside, or in a bay of, on a network with a
   * power source.
   */
  structureId: string;
  /**
   * Which bay of the parking area it is parked in, by its place among the
   * data catalogue's bays, or undefined if it is parked beside the
   * Structure. No two Work Orders take what they park to the same bay.
   */
  bayIndex: number | undefined;
  /**
   * Where it is to stand, within plug-in reach of the Structure: the centre
   * of its bay, if it is parked in one, as it was when the Work Order was
   * raised.
   */
  destination: GroundPosition;
}

/** A Machine or Rover being parked, or waiting for the Robot to park it. */
export interface ParkingSnapshot {
  readonly subject: DrivenSubject;
  /** The Structure it is to be parked beside, or in a bay of. */
  readonly structureId: string;
  readonly structureTypeId: string;
  /** Whether it is to be parked in a bay of a parking area. */
  readonly inBay: boolean;
  /** Whether a Robot has claimed it and is carrying it out. */
  readonly underWay: boolean;
}

/**
 * Raises a "park" Work Order, once in the data catalogue's lead time before
 * Night falls and all through Night, for every idle Machine and Rover that
 * isn't plugged in, isn't Broken, isn't being maintained and isn't to go
 * on an Expedition or out on one, as long as there is a powered Structure
 * to park it beside. It goes to the nearest free bay of a parking area that
 * can take a plug, if there is one, however much nearer another powered
 * Structure is; otherwise beside the nearest powered Structure, as it would
 * without a parking area. A Work Order that nobody has claimed goes once
 * what it parks no longer needs parking, or is given other work; one a
 * Robot has claimed goes only if what it parks breaks or its Structure can
 * no longer take a plug.
 */
export function planParking(state: CampaignState): void {
  const networks = structureNetworks(state);
  const plugs = pluggedIn(state, networks);
  const parkingTime = isParkingTime(state);
  const needsParking = (driven: Driven) =>
    parkingTime &&
    (driven.kind === "rover"
      ? !isRoverSpokenFor(state, driven.rover.id)
      : driven.machine.assignment === undefined) &&
    !isDrivenBroken(driven) &&
    !plugs.has(bodyOf(driven).id) &&
    !isUnderMaintenance(state, drivenTarget(driven));
  const sockets = powerSockets(state, networks);
  const stillPowered = (parking: ParkingState) =>
    sockets.some((structure) => structure.id === parking.structureId);
  state.parking = state.parking.filter((parking) => {
    const driven = findDriven(state, parking.target);
    if (driven === undefined || isDrivenBroken(driven)) return false;
    if (!stillPowered(parking)) return false;
    return isBeingParked(state, parking.target) ? true : needsParking(driven);
  });
  for (const driven of everyDriven(state)) {
    const target = drivenTarget(driven);
    if (
      !needsParking(driven) ||
      state.parking.some((parking) => isSameDriven(parking.target, target))
    ) {
      continue;
    }
    const body = bodyOf(driven);
    const bay = nearestFreeBay(state, sockets, body.position);
    if (bay !== undefined) {
      state.parking.push({
        target,
        structureId: bay.structure.id,
        bayIndex: bay.index,
        destination: bay.position,
      });
      continue;
    }
    const structure = nearestPoweredStructure(state, body.position);
    if (structure === undefined) continue;
    state.parking.push({
      target,
      structureId: structure.id,
      bayIndex: undefined,
      destination: chooseParkingSpot(
        state,
        structure,
        {
          id: body.id,
          position: body.position,
          radius: drivenSpec(driven).footprintRadiusMetres,
        },
        state.parking.map((other) => {
          const parked = findDriven(state, other.target);
          return {
            position: other.destination,
            radius:
              parked === undefined
                ? 0
                : drivenSpec(parked).footprintRadiusMetres,
          };
        }),
      ),
    });
  }
}

/** A bay of a parking area. */
interface Bay {
  readonly structure: StructureState;
  /** Where it comes among the parking area's bays in the data catalogue. */
  readonly index: number;
  /** Where its centre is on the ground. */
  readonly position: GroundPosition;
  /** How far from its centre it holds what is parked in it. */
  readonly radius: number;
}

/** The bays of a Structure, in the data catalogue's order, or none if it isn't a parking area. */
function baysOf(structure: StructureState): Bay[] {
  const bays = findStructureType(structure.structureTypeId)?.parking;
  if (bays === undefined) return [];
  return bays.bayOffsets.map((offset, index) => ({
    structure,
    index,
    position: {
      x: structure.position.x + offset.x,
      y: structure.position.y + offset.y,
    },
    radius: bays.bayRadiusMetres,
  }));
}

/**
 * The free bay nearest a position, on a parking area that can take a plug
 * (see `powerSockets`): one no park Work Order is taking anything to and
 * nothing stands in. The earlier parking area, and the earlier bay on it,
 * wins a tie, so the choice is always the same.
 */
function nearestFreeBay(
  state: CampaignState,
  sockets: readonly StructureState[],
  from: GroundPosition,
): Bay | undefined {
  const standing = everyDriven(state).map((driven) => bodyOf(driven).position);
  let nearest: Bay | undefined;
  for (const bay of sockets.flatMap(baysOf)) {
    const free =
      !state.parking.some(
        (parking) =>
          parking.structureId === bay.structure.id &&
          parking.bayIndex === bay.index,
      ) &&
      standing.every((other) => distance(other, bay.position) >= bay.radius);
    if (
      free &&
      (nearest === undefined ||
        distance(bay.position, from) < distance(nearest.position, from))
    ) {
      nearest = bay;
    }
  }
  return nearest;
}

/**
 * Whether Machines and Rovers are parked now: from the data catalogue's
 * lead time before Night falls until Night ends.
 */
export function isParkingTime(state: CampaignState): boolean {
  const lunation = readLunation(state.elapsedMinutes, catalogue.lunation);
  return (
    lunation.part === "night" ||
    lunation.minutesRemaining <=
      Math.round(catalogue.cold.parkingLeadHours * 60)
  );
}

/** Whether a Robot has claimed the Work Order to park a Machine or Rover, and is parking it. */
export function isBeingParked(
  state: CampaignState,
  target: DrivenTarget,
): boolean {
  return state.robots.some(({ workOrder }) =>
    target.kind === "machine"
      ? workOrder?.kind === "park-machine" &&
        workOrder.machineId === target.machineId
      : workOrder?.kind === "park-rover" &&
        workOrder.roverId === target.roverId,
  );
}

export function readParking(state: CampaignState): ParkingSnapshot[] {
  return state.parking.flatMap((parking) => {
    const driven = findDriven(state, parking.target);
    const structure = state.structures.find(
      (candidate) => candidate.id === parking.structureId,
    );
    if (driven === undefined || structure === undefined) return [];
    return [
      {
        subject: drivenSubject(driven),
        structureId: structure.id,
        structureTypeId: structure.structureTypeId,
        inBay: parking.bayIndex !== undefined,
        underWay: isBeingParked(state, parking.target),
      },
    ];
  });
}
