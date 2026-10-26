import {
  catalogue,
  type GroundPosition,
  type StructureType,
} from "../catalogue";
import type { CampaignState } from "./campaign";
import {
  distance,
  findStructureType,
  footprintRadius,
  type ConstructionState,
  type StructureState,
} from "./construction";
import { isDueToBeDismantled } from "./dismantling";
import { lunationMinutes, readLunation } from "./lunation";
import { livesIn } from "./mission-director";

/**
 * A power cable from a powered Structure to a Construction, which joins the
 * two on one power network once the Construction is commissioned, or to a
 * commissioned Structure cut off from power.
 */
export interface CableState {
  fromStructureId: string;
  /**
   * The id of the Construction, which its Structure keeps once commissioned,
   * or of the Structure cut off from power.
   */
  toStructureId: string;
  /** Where the cable leaves the powered Structure's footprint. */
  start: GroundPosition;
  /** Where the cable reaches the footprint of the Structure it goes to. */
  end: GroundPosition;
  /** The cable laid so far, as a line of points from the start. */
  route: GroundPosition[];
  complete: boolean;
}

/**
 * Something a cable can be laid to: a Construction, or a commissioned
 * Structure cut off from power.
 */
export type CableTarget = Pick<
  ConstructionState | StructureState,
  "id" | "structureTypeId" | "position"
>;

/** The cable laid, or being laid, to a Construction or Structure, if any. */
export function findCable(
  state: CampaignState,
  structureId: string,
): CableState | undefined {
  return state.cables.find((cable) => cable.toStructureId === structureId);
}

/**
 * The cable being laid to a Construction or Structure, starting one from the
 * nearest powered Structure if there isn't one yet.
 */
export function cableTo(
  state: CampaignState,
  target: CableTarget,
): CableState | undefined {
  const existing = findCable(state, target.id);
  if (existing !== undefined) return existing;
  const source = nearestPoweredStructure(state, target.position);
  if (source === undefined) return undefined;
  // From the edge of one footprint to the edge of the other.
  const edge = (
    from: GroundPosition,
    towards: GroundPosition,
    radius: number,
  ) => {
    const gap = distance(from, towards);
    return gap === 0
      ? { ...from }
      : {
          x: from.x + ((towards.x - from.x) / gap) * radius,
          y: from.y + ((towards.y - from.y) / gap) * radius,
        };
  };
  const cable: CableState = {
    fromStructureId: source.id,
    toStructureId: target.id,
    start: edge(
      source.position,
      target.position,
      footprintRadius(source.structureTypeId),
    ),
    end: edge(
      target.position,
      source.position,
      footprintRadius(target.structureTypeId),
    ),
    route: [],
    complete: false,
  };
  state.cables.push(cable);
  return cable;
}

/**
 * Adds a point to a cable's route, replacing the last point instead when the
 * cable carries straight on, so that a straight run is kept as one segment.
 */
export function extendRoute(
  route: GroundPosition[],
  point: GroundPosition,
): void {
  const last = route.at(-1);
  const beforeLast = route.at(-2);
  if (last !== undefined && last.x === point.x && last.y === point.y) return;
  if (last !== undefined && beforeLast !== undefined) {
    const ax = last.x - beforeLast.x;
    const ay = last.y - beforeLast.y;
    const bx = point.x - last.x;
    const by = point.y - last.y;
    const straightOn =
      Math.abs(ax * by - ay * bx) <=
        1e-9 * Math.hypot(ax, ay) * Math.hypot(bx, by) && ax * bx + ay * by > 0;
    if (straightOn) {
      route[route.length - 1] = { ...point };
      return;
    }
  }
  route.push({ ...point });
}

/**
 * How many parts of a Lunation the power forecast looks ahead. Every Lunation
 * after the first fills or drains storage the same way, so three are enough
 * to see whether it ever runs out.
 */
const FORECAST_LUNATION_PARTS = 6;

/** Stored energy below this counts as none, so that rounding never leaves a trickle. */
const ENERGY_TOLERANCE_KWH = 1e-9;

/** Structures joined by cable, which share their power. */
export interface PowerNetwork {
  /** In the order they were commissioned. */
  readonly structures: readonly StructureState[];
  /** The power generated in Daylight. */
  readonly daylightGenerationKilowatts: number;
  readonly daylightConsumptionKilowatts: number;
  /** What its Structures draw at Night, including any lights. */
  readonly nightConsumptionKilowatts: number;
  readonly storedKilowattHours: number;
  readonly storageCapacityKilowattHours: number;
}

/** Groups the commissioned Structures into networks joined by complete cables. */
export function powerNetworks(state: CampaignState): PowerNetwork[] {
  const group = new Map(
    state.structures.map((structure) => [structure.id, structure.id]),
  );
  const root = (id: string): string => {
    const parent = group.get(id) ?? id;
    return parent === id ? id : root(parent);
  };
  for (const cable of state.cables) {
    if (
      !cable.complete ||
      !group.has(cable.fromStructureId) ||
      !group.has(cable.toStructureId)
    ) {
      continue;
    }
    group.set(root(cable.toStructureId), root(cable.fromStructureId));
  }
  const members = new Map<string, StructureState[]>();
  for (const structure of state.structures) {
    const key = root(structure.id);
    members.set(key, [...(members.get(key) ?? []), structure]);
  }
  return [...members.values()].map((structures) => {
    const total = (pick: (power: Power) => number) =>
      structures.reduce(
        (sum, structure) => sum + pick(powerOf(structure.structureTypeId)),
        0,
      );
    return {
      structures,
      daylightGenerationKilowatts: total((power) => power.generationKilowatts),
      daylightConsumptionKilowatts: total((power) => power.drawKilowatts),
      nightConsumptionKilowatts: total(
        (power) => power.drawKilowatts + power.nightDrawKilowatts,
      ),
      storedKilowattHours: structures.reduce(
        (sum, structure) => sum + structure.storedKilowattHours,
        0,
      ),
      storageCapacityKilowattHours: total(
        (power) => power.storageKilowattHours,
      ),
    };
  });
}

/**
 * The commissioned Structure nearest a position that is powered: one on a
 * network with a power source, a solar array or a battery bank, which a
 * cable can carry power from. One due to be dismantled isn't used.
 */
export function nearestPoweredStructure(
  state: CampaignState,
  position: GroundPosition,
): StructureState | undefined {
  const powered = powerNetworks(state)
    .filter(hasPowerSource)
    .flatMap((network) => network.structures);
  // Structures are kept in the order they were commissioned, so the earlier
  // one wins a tie and the choice is always the same.
  return state.structures
    .filter(
      (structure) =>
        powered.includes(structure) &&
        !isDueToBeDismantled(state, structure.id),
    )
    .reduce<StructureState | undefined>(
      (best, structure) =>
        best === undefined ||
        distance(structure.position, position) <
          distance(best.position, position)
          ? structure
          : best,
      undefined,
    );
}

/** Whether a network has a power source: a solar array or a battery bank. */
export function hasPowerSource(network: PowerNetwork): boolean {
  return (
    network.daylightGenerationKilowatts > 0 ||
    network.storageCapacityKilowattHours > 0
  );
}

/** What a network's Structures draw in the given part of the Lunation. */
export function consumptionKilowatts(
  network: PowerNetwork,
  daylight: boolean,
): number {
  return daylight
    ? network.daylightConsumptionKilowatts
    : network.nightConsumptionKilowatts;
}

/**
 * Supplies one game-minute of power on every network. Solar arrays generate
 * only in Daylight; any surplus charges the network's battery banks, and they
 * discharge to cover any shortfall. Power goes to the network's Structures by
 * priority (see `supplyOrder`): each has power while any energy is left when
 * its turn comes, so the last of it may cover only part of a game-minute, and
 * those after it go without. A Structure that draws nothing always has power.
 * Lights switch on by themselves at Night, while they have power.
 */
export function supplyPower(state: CampaignState, daylight: boolean): void {
  for (const network of powerNetworks(state)) {
    const generated = daylight ? network.daylightGenerationKilowatts : 0;
    let left = network.storedKilowattHours + generated / 60;
    for (const structure of supplyOrder(state, network.structures)) {
      const drawn = drawKilowatts(structure, daylight) / 60;
      structure.powered = drawn === 0 || left > ENERGY_TOLERANCE_KWH;
      if (structure.powered) left = Math.max(left - drawn, 0);
    }
    const stored = Math.min(left, network.storageCapacityKilowattHours);
    for (const structure of network.structures) {
      structure.lit =
        !daylight &&
        structure.powered &&
        (findStructureType(structure.structureTypeId)?.lightRadiusMetres ?? 0) >
          0;
      // Each battery bank holds its share, in proportion to its capacity.
      const capacity = powerOf(structure.structureTypeId).storageKilowattHours;
      structure.storedKilowattHours =
        stored <= ENERGY_TOLERANCE_KWH ||
        network.storageCapacityKilowattHours === 0
          ? 0
          : (stored * capacity) / network.storageCapacityKilowattHours;
    }
  }
}

/**
 * The order a network supplies its Structures in: the Habitat the Mission
 * Director lives in first, then any other Habitats, then everything else,
 * each in the order they were commissioned.
 */
function supplyOrder(
  state: CampaignState,
  structures: readonly StructureState[],
): StructureState[] {
  const rank = (structure: StructureState) => {
    if (livesIn(state, structure.id)) return 0;
    return findStructureType(structure.structureTypeId)?.habitat === true
      ? 1
      : 2;
  };
  // Sorting is stable, so each group keeps the order of commissioning.
  return [...structures].sort((a, b) => rank(a) - rank(b));
}

/**
 * How many game-minutes a network's stored energy lasts, following the
 * Daylight and Night ahead of it; or undefined if it has no storage or its
 * stored energy doesn't run out within the next few Lunations.
 */
export function minutesUntilEmpty(
  network: PowerNetwork,
  elapsedMinutes: number,
): number | undefined {
  const capacity = network.storageCapacityKilowattHours;
  if (capacity === 0) return undefined;
  let stored = network.storedKilowattHours;
  for (const part of partsAhead(elapsedMinutes)) {
    const generated = part.daylight ? network.daylightGenerationKilowatts : 0;
    const perMinute =
      (generated - consumptionKilowatts(network, part.daylight)) / 60;
    if (perMinute < 0) {
      const minutes = Math.max(
        Math.ceil((stored - ENERGY_TOLERANCE_KWH) / -perMinute),
        0,
      );
      if (minutes <= part.minutes) return part.start + minutes;
    }
    stored = Math.min(Math.max(stored + perMinute * part.minutes, 0), capacity);
  }
  return undefined;
}

/**
 * How many game-minutes until a Structure supplied first on its network goes
 * without power, following the Daylight and Night ahead: it has power while
 * the network has any energy at all, so only once its stored energy has run
 * out with nothing generating. Undefined if that doesn't happen within the
 * next few Lunations, or if the Structure draws nothing.
 */
export function minutesUntilPowerLost(
  network: PowerNetwork,
  structure: StructureState,
  elapsedMinutes: number,
): number | undefined {
  let stored = network.storedKilowattHours;
  for (const part of partsAhead(elapsedMinutes)) {
    const generated = part.daylight ? network.daylightGenerationKilowatts : 0;
    const consumption = consumptionKilowatts(network, part.daylight);
    if (generated === 0 && drawKilowatts(structure, part.daylight) > 0) {
      const minutesWithEnergy = Math.max(
        Math.ceil((stored - ENERGY_TOLERANCE_KWH) / (consumption / 60)),
        0,
      );
      if (minutesWithEnergy < part.minutes) {
        return part.start + minutesWithEnergy + 1;
      }
    }
    stored = Math.min(
      Math.max(stored + ((generated - consumption) / 60) * part.minutes, 0),
      network.storageCapacityKilowattHours,
    );
  }
  return undefined;
}

/**
 * The parts of the Lunation ahead, starting with what is left of the current
 * one: whether each is Daylight, how many game-minutes from now it starts,
 * and how many game-minutes it lasts.
 */
function* partsAhead(
  elapsedMinutes: number,
): Generator<{ daylight: boolean; start: number; minutes: number }> {
  const schedule = catalogue.lunation;
  const { daylight, lunation } = lunationMinutes(schedule);
  const now = readLunation(elapsedMinutes, schedule);
  let isDaylight = now.part === "daylight";
  let minutes = now.minutesRemaining;
  let start = 0;
  for (let parts = 0; parts < FORECAST_LUNATION_PARTS; parts++) {
    yield { daylight: isDaylight, start, minutes };
    start += minutes;
    isDaylight = !isDaylight;
    minutes = isDaylight ? daylight : lunation - daylight;
  }
}

/** What a Structure draws in the given part of the Lunation. */
function drawKilowatts(structure: StructureState, daylight: boolean): number {
  const power = powerOf(structure.structureTypeId);
  return power.drawKilowatts + (daylight ? 0 : power.nightDrawKilowatts);
}

type Power = StructureType["power"];

function powerOf(structureTypeId: string): Power {
  return (
    findStructureType(structureTypeId)?.power ?? {
      generationKilowatts: 0,
      storageKilowattHours: 0,
      drawKilowatts: 0,
      nightDrawKilowatts: 0,
    }
  );
}
