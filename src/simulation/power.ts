import {
  catalogue,
  type GroundPosition,
  type StructureType,
} from "../catalogue";
import type { CampaignState } from "./campaign";
import { structurePerformance } from "./condition";
import { outputUnderCoating } from "./dust-coating";
import {
  distance,
  findStructureType,
  footprintRadius,
  isBroken,
  type ConstructionState,
  type StructureState,
} from "./construction";
import { isDueToBeDismantled } from "./dismantling";
import {
  bodyOf,
  drivenSpec,
  everyDriven,
  isDrivenBroken,
  isOutOnExpedition,
  type Driven,
} from "./driven";
import { lunationMinutes, readLunation } from "./lunation";
import { livesIn } from "./mission-director";
import { isPlant, plantDrawKilowatts, recipeOf, wantsToRun } from "./plants";

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
  /** The Machines and Rovers plugged in to it, whose heaters it supplies at Night. */
  readonly heated: readonly Driven[];
  /** The power generated in Daylight. */
  readonly daylightGenerationKilowatts: number;
  readonly daylightConsumptionKilowatts: number;
  /**
   * What its Structures draw at Night, including any lights, and the
   * heaters of the Machines and Rovers plugged in to it.
   */
  readonly nightConsumptionKilowatts: number;
  readonly storedKilowattHours: number;
  readonly storageCapacityKilowattHours: number;
}

/**
 * Groups the commissioned Structures into networks joined by complete
 * cables, with the Machines and Rovers plugged in to each (see
 * `pluggedIn`).
 */
export function powerNetworks(state: CampaignState): PowerNetwork[] {
  const networks = structureNetworks(state);
  const plugs = pluggedIn(state, networks);
  return networks.map((network) => {
    const heated = everyDriven(state).filter((driven) => {
      const plug = plugs.get(bodyOf(driven).id);
      return plug !== undefined && network.structures.includes(plug);
    });
    const heaters = heated.reduce(
      (sum, driven) => sum + drivenSpec(driven).heaterKilowatts,
      0,
    );
    return {
      ...network,
      heated,
      nightConsumptionKilowatts: network.nightConsumptionKilowatts + heaters,
    };
  });
}

/**
 * The commissioned Structure each Machine and Rover is plugged in to, by
 * its id: the nearest within the data catalogue's reach of its footprint
 * that is on a network with a power source, and isn't Broken or to be
 * dismantled. A Broken Machine or Rover, or a Rover out on an Expedition,
 * is plugged in to nothing.
 */
export function pluggedIn(
  state: CampaignState,
  networks: readonly Omit<PowerNetwork, "heated">[] = structureNetworks(state),
): Map<string, StructureState> {
  const sockets = powerSockets(state, networks);
  const plugs = new Map<string, StructureState>();
  for (const driven of everyDriven(state)) {
    if (isDrivenBroken(driven) || isOutOnExpedition(state, driven)) continue;
    const body = bodyOf(driven);
    const gap = (structure: StructureState) =>
      distance(body.position, structure.position) -
      footprintRadius(structure.structureTypeId) -
      drivenSpec(driven).footprintRadiusMetres;
    // The earlier Structure wins a tie, so the choice is always the same.
    const nearest = sockets.reduce<StructureState | undefined>(
      (best, structure) =>
        best === undefined || gap(structure) < gap(best) ? structure : best,
      undefined,
    );
    if (
      nearest !== undefined &&
      gap(nearest) <= catalogue.cold.plugInReachMetres
    ) {
      plugs.set(body.id, nearest);
    }
  }
  return plugs;
}

/**
 * The commissioned Structures that are powered, in the order they were
 * commissioned: those on a network with a power source, a solar array or a
 * battery bank, that aren't Broken or to be dismantled. A cable can carry
 * power from one, and a Machine can plug in to one.
 */
export function powerSockets(
  state: CampaignState,
  networks: readonly Omit<PowerNetwork, "heated">[] = structureNetworks(state),
): StructureState[] {
  const powered = networks
    .filter(hasPowerSource)
    .flatMap((network) => network.structures);
  return state.structures.filter(
    (structure) =>
      powered.includes(structure) &&
      !isBroken(structure) &&
      !isDueToBeDismantled(state, structure.id),
  );
}

/** Groups the commissioned Structures into networks joined by complete cables. */
function structureNetworks(
  state: CampaignState,
): Omit<PowerNetwork, "heated">[] {
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
        (sum, structure) => sum + pick(workingPower(structure)),
        0,
      );
    return {
      structures,
      daylightGenerationKilowatts: total((power) => power.generationKilowatts),
      daylightConsumptionKilowatts: total((power) => power.drawKilowatts),
      nightConsumptionKilowatts: total(
        (power) => power.drawKilowatts + power.nightDrawKilowatts,
      ),
      // A Broken battery bank's energy is lost with it.
      storedKilowattHours: structures.reduce(
        (sum, structure) =>
          sum + (isBroken(structure) ? 0 : structure.storedKilowattHours),
        0,
      ),
      storageCapacityKilowattHours: total(
        (power) => power.storageKilowattHours,
      ),
    };
  });
}

/** The powered Structure nearest a position (see `powerSockets`). */
export function nearestPoweredStructure(
  state: CampaignState,
  position: GroundPosition,
): StructureState | undefined {
  // Structures are kept in the order they were commissioned, so the earlier
  // one wins a tie and the choice is always the same.
  return powerSockets(state).reduce<StructureState | undefined>(
    (best, structure) =>
      best === undefined ||
      distance(structure.position, position) < distance(best.position, position)
        ? structure
        : best,
    undefined,
  );
}

/** Whether a network has a power source: a solar array or a battery bank. */
export function hasPowerSource(
  network: Pick<
    PowerNetwork,
    "daylightGenerationKilowatts" | "storageCapacityKilowattHours"
  >,
): boolean {
  return (
    network.daylightGenerationKilowatts > 0 ||
    network.storageCapacityKilowattHours > 0
  );
}

/**
 * Whether a type of Structure has anything to do with power: it generates,
 * stores or draws some, if only while it runs, as a Plant does. One that
 * doesn't, such as Regolith shielding, is never cabled.
 */
export function usesPower(structureTypeId: string): boolean {
  return (
    Object.values(powerOf(structureTypeId)).some((value) => value > 0) ||
    (recipeOf(structureTypeId)?.drawKilowatts ?? 0) > 0
  );
}

/**
 * What a network's Plants drew during the latest game-minute: those that
 * ran. They only ever run on power nothing else uses and no battery bank
 * can store, so no forecast counts them.
 */
export function plantConsumptionKilowatts(network: PowerNetwork): number {
  return network.structures
    .filter((structure) => isPlant(structure) && structure.powered)
    .reduce((sum, structure) => sum + plantDrawKilowatts(structure), 0);
}

/**
 * What a network's Structures draw in the given part of the Lunation, apart
 * from its Plants.
 */
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
 * priority (see `supplyOrder`). A Habitat has power only if the energy left
 * when its turn comes covers all it draws in the game-minute; part of it is
 * no use to a Habitat, so it then takes none. Any other Structure has power
 * while any energy is left when its turn comes, so the last of it may cover
 * only part of a game-minute, and those after it go without. A Structure
 * that draws nothing always has power, unless it is Broken: then it has
 * none, and stores nothing. Lights switch on by themselves at Night, while
 * they have power. The heaters of the Machines and Rovers plugged in to a
 * network come after all its Structures, Machines first, each in their
 * order; each has power while it is plugged in and, at Night, while any
 * energy is left for its heater when its turn comes. Any other has none.
 * Plants come last of all, in the order they were commissioned: each that
 * wants to run has power only if what is left over, beyond what the
 * network's battery banks can store, covers all it draws in the
 * game-minute, so that no Plant ever takes power from anything else.
 */
export function supplyPower(state: CampaignState, daylight: boolean): void {
  for (const driven of everyDriven(state)) bodyOf(driven).powered = false;
  for (const network of powerNetworks(state)) {
    const generated = daylight ? network.daylightGenerationKilowatts : 0;
    let left = network.storedKilowattHours + generated / 60;
    const plants = network.structures.filter(isPlant);
    for (const structure of supplyOrder(
      state,
      network.structures.filter((structure) => !isPlant(structure)),
    )) {
      const drawn = drawKilowatts(structure, daylight) / 60;
      structure.powered =
        !isBroken(structure) &&
        (drawn === 0 ||
          (isHabitat(structure)
            ? left >= drawn - ENERGY_TOLERANCE_KWH
            : left > ENERGY_TOLERANCE_KWH));
      if (structure.powered) left = Math.max(left - drawn, 0);
    }
    for (const driven of network.heated) {
      const body = bodyOf(driven);
      const drawn = daylight ? 0 : drivenSpec(driven).heaterKilowatts / 60;
      body.powered = drawn === 0 || left > ENERGY_TOLERANCE_KWH;
      if (body.powered) left = Math.max(left - drawn, 0);
    }
    const stored = Math.min(left, network.storageCapacityKilowattHours);
    let spare = left - stored;
    for (const plant of plants) {
      const drawn = plantDrawKilowatts(plant) / 60;
      plant.powered =
        wantsToRun(state, plant) && spare >= drawn - ENERGY_TOLERANCE_KWH;
      if (plant.powered) spare = Math.max(spare - drawn, 0);
    }

    for (const structure of network.structures) {
      structure.lit =
        !daylight &&
        structure.powered &&
        (findStructureType(structure.structureTypeId)?.lightRadiusMetres ?? 0) >
          0;
      // Each battery bank holds its share, in proportion to its capacity.
      const capacity = workingPower(structure).storageKilowattHours;
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
    return isHabitat(structure) ? 1 : 2;
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
 * How many game-minutes until a Habitat supplied first on its network goes
 * without power, following the Daylight and Night ahead: once what is
 * generated and stored can no longer cover all it draws in a game-minute.
 * Undefined if that doesn't happen within the next few Lunations.
 */
export function minutesUntilPowerLost(
  network: PowerNetwork,
  habitat: StructureState,
  elapsedMinutes: number,
): number | undefined {
  let stored = network.storedKilowattHours;
  for (const part of partsAhead(elapsedMinutes)) {
    const generated = part.daylight ? network.daylightGenerationKilowatts : 0;
    const consumption = consumptionKilowatts(network, part.daylight);
    // What has to be left in storage at the start of a game-minute for the
    // Habitat to have power in it, on top of what is generated.
    const needed = (drawKilowatts(habitat, part.daylight) - generated) / 60;
    if (needed > ENERGY_TOLERANCE_KWH) {
      // Storage falls by the network's shortfall each game-minute (the
      // network draws at least what the Habitat does, so there is one) until
      // it can't cover the Habitat; any last part-minute goes to the rest.
      const shortfall = (consumption - generated) / 60;
      const minutesPowered =
        stored < needed - ENERGY_TOLERANCE_KWH
          ? 0
          : Math.floor((stored - needed + ENERGY_TOLERANCE_KWH) / shortfall) +
            1;
      if (minutesPowered < part.minutes) {
        return part.start + minutesPowered + 1;
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

function isHabitat(structure: StructureState): boolean {
  return findStructureType(structure.structureTypeId)?.habitat === true;
}

/** What a Structure draws in the given part of the Lunation. */
function drawKilowatts(structure: StructureState, daylight: boolean): number {
  const power = workingPower(structure);
  return power.drawKilowatts + (daylight ? 0 : power.nightDrawKilowatts);
}

type Power = StructureType["power"];

const noPower: Power = {
  generationKilowatts: 0,
  storageKilowattHours: 0,
  drawKilowatts: 0,
  nightDrawKilowatts: 0,
};

function powerOf(structureTypeId: string): Power {
  return findStructureType(structureTypeId)?.power ?? noPower;
}

/**
 * What a Structure does on the power network: it generates and stores less
 * as its performance falls with its Condition, a solar array generates less
 * under a Dust coating, and it does nothing once it is Broken. What it
 * draws doesn't change until then.
 */
function workingPower(structure: StructureState): Power {
  if (isBroken(structure)) return noPower;
  const power = powerOf(structure.structureTypeId);
  const performance = structurePerformance(structure);
  return {
    ...power,
    generationKilowatts:
      power.generationKilowatts * performance * outputUnderCoating(structure),
    storageKilowattHours: power.storageKilowattHours * performance,
  };
}
