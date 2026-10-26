import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
  type StructureType,
} from "../catalogue";
import {
  findMachineType,
  machineFootprintRadius,
  type MachineState,
} from "./machines";

export type ConstructionStage =
  "site-preparation" | "component-delivery" | "assembly" | "commissioning";

/** What the player asks for: a Structure of a given type, centred at a position. */
export interface ConstructionPlan {
  readonly structureTypeId: string;
  readonly position: GroundPosition;
}

export type PlacementRefusal =
  | "unknown-structure-type"
  | "off-map"
  | "overlaps-lander"
  | "overlaps-stockpile"
  | "overlaps-structure"
  | "overlaps-machine"
  /** Regolith shielding must go over a commissioned Habitat that isn't to be dismantled. */
  | "not-on-habitat"
  /** The Habitat has Regolith shielding over it already, or planned. */
  | "already-shielded"
  | "campaign-ended";

export type PlacementCheck =
  | {
      readonly ok: true;
      /**
       * Where the Structure would stand: where it was planned, except that
       * Regolith shielding stands centred on the Habitat it goes over.
       */
      readonly position: GroundPosition;
    }
  | {
      readonly ok: false;
      readonly reason: PlacementRefusal;
      /** The reason in words the player can read. */
      readonly message: string;
    };

export interface ConstructionState {
  /** The id of the Structure being built, which it keeps once commissioned. */
  id: string;
  structureTypeId: string;
  position: GroundPosition;
  /** Where in the Mission Director's plans it comes, among other Constructions and dismantling. */
  planNumber: number;
  /** Where the Robot stands to work on the site. */
  workSpot: GroundPosition;
  stage: ConstructionStage;
  /** The Robot's working time spent on the current stage so far. */
  workedMinutes: number;
  /** Whether the Components have been taken from the base's stock. */
  componentsTaken: boolean;
  failedCommissionings: number;
}

export interface StructureState {
  id: string;
  structureTypeId: string;
  position: GroundPosition;
  /** Whether its network covered what it draws during the latest game-minute. */
  powered: boolean;
  /** Whether its light was on during the latest game-minute: only at Night, with power. */
  lit: boolean;
  /** The energy stored in it, if it is a battery bank. */
  storedKilowattHours: number;
  /** How intact it is, from 100% down to 0%, when it is Broken. */
  conditionPercent: number;
  /** How thickly Dust coats it, from 0% to 100%: only ever a solar array. */
  dustCoatingPercent: number;
}

/**
 * Whether a Structure is Broken, its Condition worn down to 0%: it stays on
 * the map but does nothing, generating, storing or drawing no power, giving
 * no light and no shielding, until it is repaired.
 */
export function isBroken(
  structure: Pick<StructureState, "conditionPercent">,
): boolean {
  return structure.conditionPercent <= 0;
}

/** The parts of the Campaign state that placement depends on. */
export interface Site {
  /** Where the Lander stands, or stood, and whether it is away. */
  readonly lander: {
    readonly position: GroundPosition;
    readonly trip: object | undefined;
  };
  readonly stockpile: { readonly position: GroundPosition };
  readonly constructions: readonly ConstructionState[];
  readonly structures: readonly StructureState[];
  /** Structures being dismantled, whose ground stays taken until they are gone. */
  readonly dismantlings: readonly Footing[];
  readonly machines: readonly MachineState[];
}

/** Something standing on the base map with a Structure's footprint. */
export interface Footing {
  readonly id: string;
  readonly structureTypeId: string;
  readonly position: GroundPosition;
}

/** Everything with a Structure's footprint: Structures, Constructions and Structures being dismantled. */
function footings(
  site: Pick<Site, "structures" | "constructions" | "dismantlings">,
): Footing[] {
  return [...site.structures, ...site.constructions, ...site.dismantlings];
}

export function findStructureType(id: string): StructureType | undefined {
  return catalogue.structureTypes.find((type) => type.id === id);
}

/**
 * Checks whether a Structure may be placed: its footprint must lie wholly on
 * the map and overlap nothing else. Regolith shielding is the exception: it
 * goes over a commissioned Habitat that isn't shielded yet, standing centred
 * on it, and may overlap that Habitat but nothing else.
 */
export function checkPlacement(
  site: Site,
  plan: ConstructionPlan,
): PlacementCheck {
  const type = findStructureType(plan.structureTypeId);
  if (type === undefined) {
    return refuse(
      "unknown-structure-type",
      `There is no Structure called "${plan.structureTypeId}".`,
    );
  }
  if (!type.shieldsHabitat) return checkFooting(site, type, plan.position);
  const habitat = site.structures.find(
    (structure) =>
      findStructureType(structure.structureTypeId)?.habitat === true &&
      distance(plan.position, structure.position) <
        footprintRadius(structure.structureTypeId),
  );
  if (habitat === undefined) {
    return refuse(
      "not-on-habitat",
      `${type.label} can only be printed over a commissioned Habitat.`,
    );
  }
  if (site.dismantlings.some((planned) => planned.id === habitat.id)) {
    return refuse(
      "not-on-habitat",
      "The Habitat is to be dismantled, so it can't be shielded.",
    );
  }
  const shielding = shieldingOver(site, habitat);
  if (shielding !== undefined) {
    const isOne = (other: Footing) => other.id === shielding.id;
    return refuse(
      "already-shielded",
      site.constructions.some(isOne)
        ? `The Habitat's ${type.label} is already planned.`
        : site.dismantlings.some(isOne)
          ? `The Habitat's ${type.label} is still being dismantled.`
          : "The Habitat is already shielded.",
    );
  }
  return checkFooting(site, type, habitat.position, habitat.id);
}

/**
 * The Regolith shielding over a Habitat, whether commissioned, under
 * Construction or being dismantled, if there is any.
 */
export function shieldingOver(
  site: Pick<Site, "structures" | "constructions" | "dismantlings">,
  habitat: Footing,
): Footing | undefined {
  return footings(site).find((footing) => isShieldingOver(footing, habitat));
}

/**
 * Whether a Structure is a Habitat with commissioned Regolith shielding over
 * it, neither of them Broken.
 */
export function isShielded(
  site: Pick<Site, "structures">,
  structure: StructureState,
): boolean {
  return (
    findStructureType(structure.structureTypeId)?.habitat === true &&
    !isBroken(structure) &&
    site.structures.some(
      (footing) => isShieldingOver(footing, structure) && !isBroken(footing),
    )
  );
}

/**
 * Whether something is Regolith shielding over a Habitat. Only shielding
 * may overlap a Habitat, and it stands centred on it.
 */
function isShieldingOver(footing: Footing, habitat: Footing): boolean {
  return (
    findStructureType(footing.structureTypeId)?.shieldsHabitat === true &&
    footing.position.x === habitat.position.x &&
    footing.position.y === habitat.position.y
  );
}

/**
 * Checks that a Structure's footprint, at a position, lies wholly on the map
 * and overlaps nothing but the Structure it may stand over, if any.
 */
function checkFooting(
  site: Site,
  type: StructureType,
  position: GroundPosition,
  standsOverId?: string,
): PlacementCheck {
  const name = `The ${type.label.toLowerCase()}`;
  const radius = type.footprintRadiusMetres;
  const halfWidth = catalogue.map.widthMetres / 2;
  const halfDepth = catalogue.map.depthMetres / 2;
  // Written so that a position that isn't a number is refused too.
  if (
    !(Math.abs(position.x) + radius <= halfWidth) ||
    !(Math.abs(position.y) + radius <= halfDepth)
  ) {
    return refuse("off-map", `${name} must stand wholly on the base map.`);
  }
  const overlapsLander = (lander: GroundPosition) =>
    distance(position, lander) <
    radius + catalogue.lander.footprintRadiusMetres;
  if (site.lander.trip === undefined && overlapsLander(site.lander.position)) {
    return refuse("overlaps-lander", `${name} would overlap the Lander.`);
  }
  // The landing site stays clear for the Lander wherever it is, as it lands
  // there again if there is no landing pad for it.
  if (overlapsLander(catalogue.landingSite.landerPosition)) {
    return refuse(
      "overlaps-lander",
      `${name} would overlap the landing site, which is kept clear for the Lander.`,
    );
  }
  const stockpile = stockpileGround(site);
  if (distance(position, stockpile.position) < radius + stockpile.radius) {
    return refuse(
      "overlaps-stockpile",
      `${name} would overlap the base's stockpile.`,
    );
  }
  const others = footings(site).filter((other) => other.id !== standsOverId);
  if (
    others.some(
      (other) =>
        distance(position, other.position) <
        radius + footprintRadius(other.structureTypeId),
    )
  ) {
    return refuse(
      "overlaps-structure",
      `${name} would overlap another Structure.`,
    );
  }
  const machine = site.machines.find((candidate) =>
    machineGround(candidate).some(
      (ground) => distance(position, ground.position) < radius + ground.radius,
    ),
  );
  if (machine !== undefined) {
    const label =
      findMachineType(machine.machineTypeId)?.label ?? machine.machineTypeId;
    return refuse(
      "overlaps-machine",
      `${name} would overlap the ${label.toLowerCase()}.`,
    );
  }
  return { ok: true, position: { x: position.x, y: position.y } };
}

/** A round patch of ground something stands on. */
interface Ground {
  readonly position: GroundPosition;
  readonly radius: number;
}

/** The ground the base's stockpile stands on. */
function stockpileGround(site: Pick<Site, "stockpile">): Ground {
  return {
    position: site.stockpile.position,
    radius: catalogue.stockpile.footprintRadiusMetres,
  };
}

/** The ground a Machine stands on, and the ground it is being driven to. */
function machineGround(machine: MachineState): Ground[] {
  const radius = machineFootprintRadius(machine.machineTypeId);
  return [
    { position: machine.position, radius },
    ...(machine.assignment === undefined
      ? []
      : [{ position: machine.assignment.destination, radius }]),
  ];
}

export function footprintRadius(structureTypeId: string): number {
  return findStructureType(structureTypeId)?.footprintRadiusMetres ?? 0;
}

export function distance(a: GroundPosition, b: GroundPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function componentsFor(structureTypeId: string): ComponentCount[] {
  return (findStructureType(structureTypeId)?.components ?? []).map(
    (needed) => ({ ...needed }),
  );
}

/** The Robot's working time the Construction's current stage needs, in game-minutes. */
export function stageMinutes(construction: ConstructionState): number {
  const hours = findStructureType(construction.structureTypeId)?.stageHours;
  if (hours === undefined) return 0;
  const byStage = {
    "site-preparation": hours.sitePreparation,
    "component-delivery": hours.componentDelivery,
    assembly: hours.assembly,
    commissioning: hours.commissioning,
  } satisfies Record<ConstructionStage, number>;
  return Math.round(byStage[construction.stage] * 60);
}

/** The stages of Construction that a Machine can carry out by itself. */
export type MachineStage = "site-preparation" | "assembly";

/**
 * The stage a Construction moves on to once a Machine stage is done. A
 * Structure with no Components has none to deliver, so it goes straight
 * from Site Preparation to Assembly.
 */
export function stageAfter(
  construction: ConstructionState,
  stage: MachineStage,
): ConstructionStage {
  if (stage === "assembly") return "commissioning";
  return componentsFor(construction.structureTypeId).length === 0
    ? "assembly"
    : "component-delivery";
}

/** A stage of Construction and the type of Machine that carries it out. */
export interface StageMachine {
  readonly stage: MachineStage;
  readonly machineTypeId: string;
}

/**
 * The Machine stage a Construction is at and the type of Machine the data
 * catalogue has carry it out, or undefined if the current stage is the
 * Robot's own work.
 */
export function stageMachine(
  construction: ConstructionState,
): StageMachine | undefined {
  const machines = findStructureType(
    construction.structureTypeId,
  )?.stageMachines;
  const carriedOutBy = (
    stage: MachineStage,
    machineTypeId: string | undefined,
  ): StageMachine | undefined =>
    machineTypeId === undefined ? undefined : { stage, machineTypeId };
  switch (construction.stage) {
    case "site-preparation":
      return carriedOutBy("site-preparation", machines?.sitePreparation);
    case "assembly":
      return carriedOutBy("assembly", machines?.assembly);
    case "component-delivery":
    case "commissioning":
      return undefined;
  }
}

function refuse(reason: PlacementRefusal, message: string): PlacementCheck {
  return { ok: false, reason, message };
}

/**
 * Chooses where the Robot stands to work on a site: just outside its
 * footprint, on the side facing the Lander if that is clear, otherwise turning
 * round the site until it finds ground clear of the Lander, the stockpile,
 * every other Structure, every Machine and the map's edge.
 */
export function chooseWorkSpot(
  site: Site,
  plan: ConstructionPlan,
): GroundPosition {
  const gap = catalogue.robot.workingGapMetres;
  const lander = site.lander.position;
  return chooseSpotAround({
    centre: plan.position,
    reach: footprintRadius(plan.structureTypeId) + gap,
    towards: lander,
    clearance: 0,
    lander: {
      position: lander,
      radius: catalogue.lander.footprintRadiusMetres + gap,
    },
    others: [
      stockpileGround(site),
      ...footings(site).map((other) => ({
        position: other.position,
        radius: footprintRadius(other.structureTypeId),
      })),
      ...site.machines.flatMap(machineGround),
    ],
  });
}

/**
 * Chooses where a Machine stands to work on a Construction's site: just
 * outside its footprint, on the side away from the Lander (where the Robot
 * works) if that is clear, otherwise turning round the site until it finds
 * ground clear of the Lander, the stockpile, every other Structure and
 * Machine, the Robot's working spot and the map's edge.
 */
export function chooseMachineSpot(
  site: Site,
  construction: ConstructionState,
  machine: MachineState,
): GroundPosition {
  const radius = machineFootprintRadius(machine.machineTypeId);
  const gap = catalogue.robot.workingGapMetres;
  // The Machine's arm reaches over the footprint, so it stands closer than a
  // Robot would, and leaves the Robot that much room at its working spot.
  const machineGap = gap / 2;
  const centre = construction.position;
  const lander = site.lander.position;
  return chooseSpotAround({
    centre,
    reach: footprintRadius(construction.structureTypeId) + radius + machineGap,
    towards: {
      x: centre.x * 2 - lander.x,
      y: centre.y * 2 - lander.y,
    },
    clearance: radius,
    lander: {
      position: lander,
      radius: catalogue.lander.footprintRadiusMetres + gap,
    },
    others: [
      stockpileGround(site),
      ...footings(site)
        .filter((other) => other.id !== construction.id)
        .map((other) => ({
          position: other.position,
          radius: footprintRadius(other.structureTypeId),
        })),
      ...site.machines
        .filter((other) => other.id !== machine.id)
        .flatMap(machineGround),
      { position: construction.workSpot, radius: machineGap },
    ],
  });
}

/**
 * Looks round a site, starting on the side facing a given point, for ground
 * where something of the given clearance can stand clear of the Lander, the
 * other obstacles and the map's edge. A site hemmed in on every side still
 * gets a spot clear of the Lander, or failing that the first one tried.
 */
function chooseSpotAround(options: {
  readonly centre: GroundPosition;
  readonly reach: number;
  readonly towards: GroundPosition;
  readonly clearance: number;
  readonly lander: Ground;
  readonly others: readonly Ground[];
}): GroundPosition {
  const { centre, reach, clearance } = options;
  const first = Math.atan2(
    options.towards.y - centre.y,
    options.towards.x - centre.x,
  );
  const candidates = [0, 1, -1, 2, -2, 3, -3, 4].map((step) => {
    const angle = first + (step * Math.PI) / 4;
    return {
      x: centre.x + Math.cos(angle) * reach,
      y: centre.y + Math.sin(angle) * reach,
    };
  });
  const clearOf = (spot: GroundPosition, ground: Ground) =>
    distance(spot, ground.position) >= ground.radius + clearance;
  const onMap = (spot: GroundPosition) =>
    Math.abs(spot.x) + clearance <= catalogue.map.widthMetres / 2 &&
    Math.abs(spot.y) + clearance <= catalogue.map.depthMetres / 2;
  const usable = (spot: GroundPosition) =>
    clearOf(spot, options.lander) && onMap(spot);
  return (
    candidates.find(
      (spot) =>
        usable(spot) && options.others.every((other) => clearOf(spot, other)),
    ) ??
    candidates.find(usable) ??
    candidates[0] ??
    centre
  );
}
