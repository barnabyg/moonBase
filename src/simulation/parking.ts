import { catalogue, type GroundPosition } from "../catalogue";
import type { CampaignState } from "./campaign";
import {
  chooseParkingSpot,
  distance,
  findStructureType,
  type Footing,
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
import { lunationMinutes, readLunation } from "./lunation";
import { isUnderMaintenance } from "./maintenance";
import {
  minutesUntilEmpty,
  nearestPoweredStructure,
  pluggedIn,
  powerNetworks,
  powerSockets,
  structureNetworks,
  type PowerNetwork,
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
 * can take a plug and whose network can keep heaters on through the Night
 * (see `heatsThroughNight`), if there is one no further off than the
 * nearest powered Structure and the data catalogue's detour beyond it;
 * otherwise beside the nearest powered Structure, as it would without a
 * parking area. In the lead time, while it is still Daylight, one that is
 * plugged in but stands in no bay is parked in such a bay too, if there is
 * one, so that idle Machines and Rovers stand together; never at Night,
 * when the drive would leave it in the cold, and never one already in a
 * bay. A Work Order that nobody has claimed goes once what it parks no
 * longer needs parking, is given other work or, if it is for a bay, once
 * that network can't keep heaters on; one a Robot has claimed goes only if
 * what it parks breaks or its Structure can no longer take a plug.
 */
export function planParking(state: CampaignState): void {
  const parkingTime = isParkingTime(state);
  // Nothing is raised outside parking time, so with no Work Orders to keep
  // or drop there is nothing to do.
  if (!parkingTime && state.parking.length === 0) return;
  const networks = structureNetworks(state);
  const plugs = pluggedIn(state, networks);
  const daylight =
    readLunation(state.elapsedMinutes, catalogue.lunation).part === "daylight";
  const idle = (driven: Driven) =>
    parkingTime &&
    (driven.kind === "rover"
      ? !isRoverSpokenFor(state, driven.rover.id)
      : driven.machine.assignment === undefined) &&
    !isDrivenBroken(driven) &&
    !isUnderMaintenance(state, drivenTarget(driven));
  const needsParking = (driven: Driven) =>
    idle(driven) && !plugs.has(bodyOf(driven).id);
  const everyBay = parkingTime ? state.structures.flatMap(baysOf) : [];
  const wantsBay = (driven: Driven) => {
    const { id, position } = bodyOf(driven);
    return (
      daylight &&
      idle(driven) &&
      plugs.has(id) &&
      !everyBay.some((bay) => standsIn(bay, position))
    );
  };
  const sockets = powerSockets(state, networks);
  const stillPowered = (parking: ParkingState) =>
    sockets.some((structure) => structure.id === parking.structureId);
  // The parking areas whose bays are used, worked out only when parking.
  const keepsWarm = heatsThroughNight(state);
  const bayAreas = parkingTime
    ? sockets.filter(
        (structure) => baysOf(structure).length > 0 && keepsWarm(structure),
      )
    : [];
  state.parking = state.parking.filter((parking) => {
    const driven = findDriven(state, parking.target);
    if (driven === undefined || isDrivenBroken(driven)) return false;
    if (!stillPowered(parking)) return false;
    if (isBeingParked(state, parking.target)) return true;
    if (parking.bayIndex === undefined) return needsParking(driven);
    // One for a bay goes once its parking area can't keep heaters on, so
    // that it is raised again beside the nearest powered Structure if it
    // needs to be.
    return (
      (needsParking(driven) || wantsBay(driven)) &&
      bayAreas.some((area) => area.id === parking.structureId)
    );
  });
  for (const driven of everyDriven(state)) {
    const target = drivenTarget(driven);
    const needed = needsParking(driven);
    if (
      !(needed || wantsBay(driven)) ||
      state.parking.some((parking) => isSameDriven(parking.target, target))
    ) {
      continue;
    }
    const body = bodyOf(driven);
    const structure = nearestPoweredStructure(state, body.position);
    if (structure === undefined) continue;
    const bay = nearestFreeBay(
      state,
      bayAreas,
      body.position,
      distance(structure.position, body.position) +
        catalogue.cold.bayDetourMetres,
    );
    if (bay !== undefined) {
      state.parking.push({
        target,
        structureId: bay.structure.id,
        bayIndex: bay.index,
        destination: bay.position,
      });
      continue;
    }
    // One plugged in already stays where it is if there is no bay for it.
    if (!needed) continue;
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
  return bayPlaces(structure).map((place, index) => ({
    structure,
    index,
    ...place,
  }));
}

/** Where each of a parking area's bays is, in the data catalogue's order; none for anything else. */
function bayPlaces(
  area: Pick<Footing, "structureTypeId" | "position">,
): Pick<Bay, "position" | "radius">[] {
  const bays = findStructureType(area.structureTypeId)?.parking;
  if (bays === undefined) return [];
  return bays.bayOffsets.map((offset) => ({
    position: {
      x: area.position.x + offset.x,
      y: area.position.y + offset.y,
    },
    radius: bays.bayRadiusMetres,
  }));
}

/** Whether something standing at a point is in a bay: within its radius of its centre. */
function standsIn(
  bay: Pick<Bay, "position" | "radius">,
  position: GroundPosition,
): boolean {
  return distance(position, bay.position) < bay.radius;
}

/**
 * How many bays a parking area has, and how many of them have a Machine
 * or Rover standing in them, given where every one stands. None for
 * anything else.
 */
export function baysTaken(
  area: Pick<Footing, "structureTypeId" | "position">,
  standing: readonly GroundPosition[],
): { readonly taken: number; readonly bays: number } {
  const places = bayPlaces(area);
  return {
    taken: places.filter((bay) =>
      standing.some((position) => standsIn(bay, position)),
    ).length,
    bays: places.length,
  };
}

/**
 * Says whether a powered Structure's network can keep heaters on through
 * the Night ahead: whether its battery banks, with what they hold and what
 * its solar arrays still make before Night falls, would carry everything
 * on it, and the heater of every Machine and Rover that isn't Broken, as
 * they may all be parked on it, through to the end of the Night (see
 * `minutesUntilEmpty`). A network with no battery bank never can. Each
 * network is worked out once, when it is first asked about.
 */
function heatsThroughNight(
  state: CampaignState,
): (structure: StructureState) => boolean {
  const lunation = readLunation(state.elapsedMinutes, catalogue.lunation);
  const { daylight, lunation: whole } = lunationMinutes(catalogue.lunation);
  const untilNightEnds =
    lunation.minutesRemaining +
    (lunation.part === "daylight" ? whole - daylight : 0);
  let networks: PowerNetwork[] | undefined;
  const answers = new Map<PowerNetwork, boolean>();
  return (structure) => {
    networks ??= powerNetworks(state);
    const network = networks.find((candidate) =>
      candidate.structures.includes(structure),
    );
    if (network === undefined) return false;
    const known = answers.get(network);
    if (known !== undefined) return known;
    const heaters = everyDriven(state)
      .filter(
        (driven) =>
          !isDrivenBroken(driven) &&
          !network.heated.some((heated) => bodyOf(heated) === bodyOf(driven)),
      )
      .reduce((sum, driven) => sum + drivenSpec(driven).heaterKilowatts, 0);
    const empty = minutesUntilEmpty(
      {
        ...network,
        nightConsumptionKilowatts: network.nightConsumptionKilowatts + heaters,
      },
      state.elapsedMinutes,
    );
    const answer =
      network.storageCapacityKilowattHours > 0 &&
      (empty === undefined || empty >= untilNightEnds);
    answers.set(network, answer);
    return answer;
  };
}

/**
 * The free bay nearest a position, on the given parking areas and no
 * further from it than the given distance: one no park Work Order is
 * taking anything to and nothing stands in. The earlier parking area, and
 * the earlier bay on it, wins a tie, so the choice is always the same.
 */
function nearestFreeBay(
  state: CampaignState,
  areas: readonly StructureState[],
  from: GroundPosition,
  within: number,
): Bay | undefined {
  const standing = everyDriven(state).map((driven) => bodyOf(driven).position);
  let nearest: Bay | undefined;
  for (const bay of areas.flatMap(baysOf)) {
    const free =
      distance(bay.position, from) <= within &&
      !state.parking.some(
        (parking) =>
          parking.structureId === bay.structure.id &&
          parking.bayIndex === bay.index,
      ) &&
      !standing.some((other) => standsIn(bay, other));
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
