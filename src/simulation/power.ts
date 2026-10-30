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
import type { GameEvent } from "./events";
import { partsAhead, readLunation } from "./lunation";
import { livesIn } from "./mission-director";
import {
  claimBatchInputs,
  isPlant,
  plantCantRun,
  plantDrawKilowatts,
  recipesOf,
  type BatchClaims,
} from "./plants";

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
   * What its Structures draw at Night, including any Night loads, and the
   * heaters of the Machines and Rovers plugged in to it.
   */
  readonly nightConsumptionKilowatts: number;
  /**
   * What its Night loads draw at Night while they are on, which is part of
   * its Night consumption: its lights while they shine and its telescopes
   * while they observe. They switch themselves off rather than leave
   * anything else without power (see `supplyPower`).
   */
  readonly nightLoadKilowatts: number;
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
    const radius = drivenSpec(driven).footprintRadiusMetres;
    // The earlier Structure wins a tie, so the choice is always the same.
    let nearest: StructureState | undefined;
    let nearestGap = Number.POSITIVE_INFINITY;
    for (const structure of sockets) {
      const gap =
        distance(body.position, structure.position) -
        footprintRadius(structure.structureTypeId) -
        radius;
      if (nearest === undefined || gap < nearestGap) {
        nearest = structure;
        nearestGap = gap;
      }
    }
    if (
      nearest !== undefined &&
      nearestGap <= catalogue.cold.plugInReachMetres
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

/**
 * Groups the commissioned Structures into networks joined by complete
 * cables, without the Machines and Rovers plugged in to them (see
 * `powerNetworks`).
 */
export function structureNetworks(
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
    const network = members.get(key);
    if (network === undefined) members.set(key, [structure]);
    else network.push(structure);
  }
  return [...members.values()].map((structures) => {
    // Worked out once for each Structure, as networks are grouped many
    // times a game-minute.
    const powers = structures.map(workingPower);
    const total = (pick: (power: Power) => number) =>
      powers.reduce((sum, power) => sum + pick(power), 0);
    return {
      structures,
      daylightGenerationKilowatts: total((power) => power.generationKilowatts),
      daylightConsumptionKilowatts: total((power) => power.drawKilowatts),
      nightConsumptionKilowatts: total(
        (power) => power.drawKilowatts + power.nightDrawKilowatts,
      ),
      nightLoadKilowatts: total((power) => power.nightDrawKilowatts),
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
 * stores or draws some, if only while it runs, as a Plant does, or the data
 * catalogue has it cabled anyway, as a parking area is for its bay
 * sockets. One that doesn't, such as Regolith shielding, is never cabled.
 */
export function usesPower(structureTypeId: string): boolean {
  const power = powerOf(structureTypeId);
  return (
    power.cabled === true ||
    power.generationKilowatts > 0 ||
    power.storageKilowattHours > 0 ||
    power.drawKilowatts > 0 ||
    power.nightDrawKilowatts > 0 ||
    recipesOf(structureTypeId).some((recipe) => recipe.drawKilowatts > 0)
  );
}

/**
 * What a network's Plants drew during the latest game-minute: those that
 * ran. They only ever run on power nothing else needs: in Daylight what no
 * battery bank can store, and at Night what the battery banks hold beyond
 * what everything else draws through the rest of the Night and the reserve
 * after it (see `supplyPower`). So no forecast counts them: what they take
 * at Night can only shorten how long the stored energy lasts into a
 * Daylight that generates less than the network draws, and by then the
 * forecast starts from what is really stored.
 */
export function plantConsumptionKilowatts(network: PowerNetwork): number {
  return network.structures
    .filter((structure) => isPlant(structure) && structure.powered)
    .reduce((sum, structure) => sum + plantDrawKilowatts(structure), 0);
}

/**
 * What a network's Structures drew during the latest game-minute, apart
 * from its Plants, in the given part of the Lunation: at Night, only the
 * Night loads that were on count.
 */
export function consumptionKilowatts(
  network: PowerNetwork,
  daylight: boolean,
): number {
  if (daylight) return network.daylightConsumptionKilowatts;
  const loads = network.structures
    .filter((structure) => structure.lit)
    .reduce(
      (sum, structure) => sum + workingPower(structure).nightDrawKilowatts,
      0,
    );
  return network.nightConsumptionKilowatts - network.nightLoadKilowatts + loads;
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
 * none, and stores nothing. The heaters of the Machines and Rovers plugged
 * in to a network come after all its Structures, Machines first, each in
 * their order; each has power while it is plugged in and, at Night, while
 * any energy is left for its heater when its turn comes. Any other has none.
 * Night loads, the lights and the telescopes, come after the heaters, in
 * the order they were commissioned. At Night one has power while any
 * energy is left when its turn comes, and switches itself on (a light
 * shines, a telescope observes) only if what is left after it draws would
 * still carry everything else on the network through the rest of the
 * Night and the data catalogue's reserve after it (see
 * `nightReserveHours`): otherwise it stays off to save power, so that no
 * Night load ever leaves the Habitat, or anything else, without power.
 * Plants come last of all, in the order they
 * were commissioned: each that can run (see `plantCantRun`) has power only
 * if the energy to spare covers all it draws in the game-minute. In
 * Daylight that is what is left over beyond what the network's battery
 * banks can store; at Night, what they hold beyond what everything else on
 * the network, Night loads included, draws through the rest of the Night and the
 * reserve after it, counting the heater of every Machine and Rover that
 * isn't Broken or plugged in to another network, as it may be parked on
 * this one before the Night ends. So no Plant ever takes power from
 * anything else. One given power claims the inputs for any batch it
 * starts, which no Plant after it, on any network, can count on. Each that
 * has none says why.
 */
export function supplyPower(state: CampaignState, daylight: boolean): void {
  for (const driven of everyDriven(state)) bodyOf(driven).powered = false;
  // The game-minute being supplied has already been counted.
  const now = readLunation(state.elapsedMinutes, catalogue.lunation);
  const nightMinutesAfter = now.part === "night" ? now.minutesRemaining : 0;
  // The base's stocks are shared by every network's Plants.
  const claims: BatchClaims = new Map();
  const networks = powerNetworks(state);
  const unpluggedHeaters = everyDriven(state)
    .filter(
      (driven) =>
        !isDrivenBroken(driven) &&
        !networks.some((network) =>
          network.heated.some((heated) => bodyOf(heated) === bodyOf(driven)),
        ),
    )
    .reduce((sum, driven) => sum + drivenSpec(driven).heaterKilowatts, 0);
  for (const network of networks) {
    const generated = daylight ? network.daylightGenerationKilowatts : 0;
    let left = network.storedKilowattHours + generated / 60;
    const plants = network.structures.filter(isPlant);
    for (const structure of supplyOrder(
      state,
      network.structures.filter((structure) => !isPlant(structure)),
    )) {
      // Its Night load, if it has one, comes later.
      const drawn = workingPower(structure).drawKilowatts / 60;
      structure.powered =
        !isBroken(structure) &&
        (drawn === 0 ||
          (isHabitat(structure)
            ? left >= drawn - ENERGY_TOLERANCE_KWH
            : left > ENERGY_TOLERANCE_KWH));
      if (structure.powered) left = Math.max(left - drawn, 0);
      structure.lit = false;
    }
    for (const driven of network.heated) {
      const body = bodyOf(driven);
      const drawn = daylight ? 0 : drivenSpec(driven).heaterKilowatts / 60;
      body.powered = drawn === 0 || left > ENERGY_TOLERANCE_KWH;
      if (body.powered) left = Math.max(left - drawn, 0);
    }
    if (!daylight) {
      const reserve = keptFromNightLoads(network, nightMinutesAfter);
      for (const load of network.structures.filter(hasNightLoad)) {
        const drawn = workingPower(load).nightDrawKilowatts / 60;
        load.powered = load.powered && left > ENERGY_TOLERANCE_KWH;
        load.lit =
          load.powered && left - drawn >= reserve - ENERGY_TOLERANCE_KWH;
        if (load.lit) left = Math.max(left - drawn, 0);
      }
    }
    let spare = Math.max(
      daylight
        ? left - network.storageCapacityKilowattHours
        : left - keptFromPlants(network, unpluggedHeaters, nightMinutesAfter),
      0,
    );
    for (const plant of plants) {
      const drawn = plantDrawKilowatts(plant) / 60;
      const cantRun = plantCantRun(state, plant, claims);
      plant.powered =
        cantRun === undefined && spare >= drawn - ENERGY_TOLERANCE_KWH;
      if (plant.powered) {
        spare = Math.max(spare - drawn, 0);
        left = Math.max(left - drawn, 0);
        claimBatchInputs(plant, claims);
      }
      plant.plantStop = plant.powered
        ? undefined
        : (cantRun ?? { reason: daylight ? "no-power" : "night" });
    }
    const stored = Math.min(left, network.storageCapacityKilowattHours);

    for (const structure of network.structures) {
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
 * The Night loads, lights and telescopes, that switched themselves off to
 * save power during the latest game-minute (see `supplyPower`), given
 * whether it was Night.
 */
export function nightLoadsSavingPower(
  state: CampaignState,
  night: boolean,
): StructureState[] {
  return night
    ? state.structures.filter(
        (structure) =>
          hasNightLoad(structure) && structure.powered && !structure.lit,
      )
    : [];
}

/**
 * Says when the lights on a network start switching themselves off to save
 * power, once the game-minute's power has been supplied: the first time
 * any of them does, with none of them off to save power the game-minute
 * before, given the ids of those that were then.
 */
export function watchLights(
  state: CampaignState,
  night: boolean,
  savingBefore: ReadonlySet<string>,
): GameEvent[] {
  const saving = nightLoadsSavingPower(state, night).filter(isLight);
  return structureNetworks(state).flatMap((network) => {
    const off = saving.filter((light) => network.structures.includes(light));
    return off.length === 0 || off.some((light) => savingBefore.has(light.id))
      ? []
      : [
          {
            kind: "lights-switched-off" as const,
            atMinute: state.elapsedMinutes,
            structureIds: off.map((light) => light.id),
          },
        ];
  });
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
  for (const part of partsAhead(elapsedMinutes, FORECAST_LUNATION_PARTS)) {
    const generated = part.daylight ? network.daylightGenerationKilowatts : 0;
    const perMinute =
      (generated - partConsumptionKilowatts(network, part, stored)) / 60;
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
  for (const part of partsAhead(elapsedMinutes, FORECAST_LUNATION_PARTS)) {
    const generated = part.daylight ? network.daylightGenerationKilowatts : 0;
    const consumption = partConsumptionKilowatts(network, part, stored);
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
 * What a network draws on average through a part of the Lunation ahead,
 * apart from its Plants, given the energy stored as it starts. In Daylight
 * no Night load is on. At Night everything else draws all the time, and
 * the Night loads only the energy beyond what everything else needs through the
 * rest of the Night and the reserve after it (see `supplyPower`): with
 * none to spare they stay off all through it, and with some to spare they
 * take no more than that, so that the energy stored never runs out during
 * the part on their account.
 */
function partConsumptionKilowatts(
  network: PowerNetwork,
  part: { daylight: boolean; minutes: number },
  storedKilowattHours: number,
): number {
  if (part.daylight) return network.daylightConsumptionKilowatts;
  const spare = storedKilowattHours - keptFromNightLoads(network, part.minutes);
  return (
    restOfNetworkAtNight(network) +
    Math.min(
      network.nightLoadKilowatts,
      (Math.max(spare, 0) * 60) / part.minutes,
    )
  );
}

/**
 * The energy a network's Night loads leave stored at Night: what everything else
 * on it draws through the given game-minutes of Night left and the data
 * catalogue's reserve after them.
 */
function keptFromNightLoads(
  network: PowerNetwork,
  nightMinutesLeft: number,
): number {
  return (
    (restOfNetworkAtNight(network) *
      (nightMinutesLeft + catalogue.nightReserveHours * 60)) /
    60
  );
}

/**
 * The energy a network's Plants leave stored at Night: what everything else
 * on it, Night loads included, and the given heaters of Machines and Rovers not
 * yet plugged in, draw through the given game-minutes of Night left and
 * the data catalogue's reserve after them.
 */
function keptFromPlants(
  network: PowerNetwork,
  unpluggedHeaterKilowatts: number,
  nightMinutesLeft: number,
): number {
  return (
    ((network.nightConsumptionKilowatts + unpluggedHeaterKilowatts) *
      (nightMinutesLeft + catalogue.nightReserveHours * 60)) /
    60
  );
}

/** What everything on a network but its Night loads draws at Night, apart from its Plants. */
function restOfNetworkAtNight(network: PowerNetwork): number {
  return network.nightConsumptionKilowatts - network.nightLoadKilowatts;
}

/**
 * Whether a Structure has a Night load, which draws power only at Night,
 * while it is on, and switches itself off to save power: a light, or a
 * telescope, that isn't Broken.
 */
function hasNightLoad(structure: StructureState): boolean {
  return workingPower(structure).nightDrawKilowatts > 0;
}

/** Whether a Structure is a light, a Night load that lights the ground round it. */
function isLight(structure: StructureState): boolean {
  return (
    hasNightLoad(structure) &&
    (findStructureType(structure.structureTypeId)?.lightRadiusMetres ?? 0) > 0
  );
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
