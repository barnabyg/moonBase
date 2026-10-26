import { catalogue, type GroundPosition } from "../catalogue";
import type { CampaignState } from "./campaign";
import {
  distance,
  findStructureType,
  type StructureState,
} from "./construction";
import { lunationMinutes, readLunation } from "./lunation";

/**
 * A power cable from a powered Structure to a Construction, which joins the
 * two on one power network once the Construction is commissioned.
 */
export interface CableState {
  fromStructureId: string;
  /** The id of the Construction, which its Structure keeps once commissioned. */
  toStructureId: string;
  /** Where the cable leaves the powered Structure's footprint. */
  start: GroundPosition;
  /** Where the cable reaches the Construction's footprint. */
  end: GroundPosition;
  /** The cable laid so far, as a line of points from the start. */
  route: GroundPosition[];
  complete: boolean;
}

/** Stored energy below this counts as none, so that rounding never leaves a trickle. */
const ENERGY_TOLERANCE_KWH = 1e-9;

/** Structures joined by cable, which share their power. */
export interface PowerNetwork {
  /** In the order they were commissioned. */
  readonly structures: readonly StructureState[];
  /** The power generated in Daylight. */
  readonly daylightGenerationKilowatts: number;
  readonly consumptionKilowatts: number;
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
      consumptionKilowatts: total((power) => power.drawKilowatts),
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
 * cable can carry power from.
 */
export function nearestPoweredStructure(
  state: CampaignState,
  position: GroundPosition,
): StructureState | undefined {
  const powered = powerNetworks(state)
    .filter(
      (network) =>
        network.daylightGenerationKilowatts > 0 ||
        network.storageCapacityKilowattHours > 0,
    )
    .flatMap((network) => network.structures);
  // Structures are kept in the order they were commissioned, so the earlier
  // one wins a tie and the choice is always the same.
  return state.structures
    .filter((structure) => powered.includes(structure))
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

/**
 * Supplies one game-minute of power on every network. Solar arrays generate
 * only in Daylight; any surplus charges the network's battery banks, and they
 * discharge to cover any shortfall. A network whose generation and storage
 * can't cover what its Structures draw leaves them all without power.
 */
export function supplyPower(state: CampaignState, daylight: boolean): void {
  for (const network of powerNetworks(state)) {
    const generated = daylight ? network.daylightGenerationKilowatts : 0;
    const available = network.storedKilowattHours + generated / 60;
    const powered =
      network.consumptionKilowatts === 0 || available > ENERGY_TOLERANCE_KWH;
    const remaining = powered
      ? available - network.consumptionKilowatts / 60
      : available;
    const stored = Math.min(
      Math.max(remaining, 0),
      network.storageCapacityKilowattHours,
    );
    for (const structure of network.structures) {
      structure.powered = powered;
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
  const schedule = catalogue.lunation;
  const { daylight, lunation } = lunationMinutes(schedule);
  const now = readLunation(elapsedMinutes, schedule);
  let part = now.part;
  let length = now.minutesRemaining;
  let stored = network.storedKilowattHours;
  let start = 0;
  // Every Lunation after the first fills or drains the same way, so a few
  // are enough to see whether storage ever runs out.
  for (let parts = 0; parts < 6; parts++) {
    const generated =
      part === "daylight" ? network.daylightGenerationKilowatts : 0;
    const perMinute = (generated - network.consumptionKilowatts) / 60;
    if (perMinute < 0) {
      const minutes = Math.max(
        Math.ceil((stored - ENERGY_TOLERANCE_KWH) / -perMinute),
        0,
      );
      if (minutes <= length) return start + minutes;
    }
    stored = Math.min(Math.max(stored + perMinute * length, 0), capacity);
    start += length;
    part = part === "daylight" ? "night" : "daylight";
    length = part === "daylight" ? daylight : lunation - daylight;
  }
  return undefined;
}

interface Power {
  readonly generationKilowatts: number;
  readonly storageKilowattHours: number;
  readonly drawKilowatts: number;
}

function powerOf(structureTypeId: string): Power {
  return (
    findStructureType(structureTypeId)?.power ?? {
      generationKilowatts: 0,
      storageKilowattHours: 0,
      drawKilowatts: 0,
    }
  );
}
