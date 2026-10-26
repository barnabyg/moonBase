import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
  type StructureType,
} from "../catalogue";
import { findMachineType, type MachineState } from "./machines";

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
  | "overlaps-structure"
  | "overlaps-machine";

export type PlacementCheck =
  | { readonly ok: true }
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
  /** Where the Robot stands to work on the site. */
  workSpot: GroundPosition;
  stage: ConstructionStage;
  /** The Robot's working time spent on the current stage so far. */
  workedMinutes: number;
  /** Whether the Components have been taken from the cargo stock. */
  componentsTaken: boolean;
  failedCommissionings: number;
}

export interface StructureState {
  id: string;
  structureTypeId: string;
  position: GroundPosition;
}

/** The parts of the Campaign state that placement depends on. */
export interface Site {
  readonly lander: { readonly position: GroundPosition };
  readonly constructions: readonly ConstructionState[];
  readonly structures: readonly StructureState[];
  readonly machines: readonly MachineState[];
}

export function findStructureType(id: string): StructureType | undefined {
  return catalogue.structureTypes.find((type) => type.id === id);
}

/**
 * Checks whether a Structure may be placed: the only rule is that its
 * footprint lies wholly on the map and overlaps nothing else.
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
  const name = `The ${type.label.toLowerCase()}`;
  const radius = type.footprintRadiusMetres;
  const { position } = plan;
  const halfWidth = catalogue.map.widthMetres / 2;
  const halfDepth = catalogue.map.depthMetres / 2;
  // Written so that a position that isn't a number is refused too.
  if (
    !(Math.abs(position.x) + radius <= halfWidth) ||
    !(Math.abs(position.y) + radius <= halfDepth)
  ) {
    return refuse("off-map", `${name} must stand wholly on the base map.`);
  }
  if (
    distance(position, site.lander.position) <
    radius + catalogue.lander.footprintRadiusMetres
  ) {
    return refuse("overlaps-lander", `${name} would overlap the Lander.`);
  }
  const others = [...site.structures, ...site.constructions];
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
  return { ok: true };
}

/** A round patch of ground something stands on. */
interface Ground {
  readonly position: GroundPosition;
  readonly radius: number;
}

/** The ground a Machine stands on, and the ground it is being driven to. */
function machineGround(machine: MachineState): Ground[] {
  const radius =
    findMachineType(machine.machineTypeId)?.footprintRadiusMetres ?? 0;
  return [
    { position: machine.position, radius },
    ...(machine.task === undefined
      ? []
      : [{ position: machine.task.destination, radius }]),
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

function refuse(reason: PlacementRefusal, message: string): PlacementCheck {
  return { ok: false, reason, message };
}

/**
 * Chooses where the Robot stands to work on a site: just outside its
 * footprint, on the side facing the Lander if that is clear, otherwise turning
 * round the site until it finds ground clear of the Lander, every other
 * Structure, every Machine and the map's edge.
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
      ...[...site.structures, ...site.constructions].map((other) => ({
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
 * ground clear of the Lander, every other Structure and Machine, the Robot's
 * working spot and the map's edge.
 */
export function chooseMachineSpot(
  site: Site,
  construction: ConstructionState,
  machine: MachineState,
): GroundPosition {
  const radius =
    findMachineType(machine.machineTypeId)?.footprintRadiusMetres ?? 0;
  const gap = catalogue.robot.workingGapMetres;
  const centre = construction.position;
  const lander = site.lander.position;
  return chooseSpotAround({
    centre,
    reach: footprintRadius(construction.structureTypeId) + radius + gap / 2,
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
      ...[...site.structures, ...site.constructions]
        .filter((other) => other.id !== construction.id)
        .map((other) => ({
          position: other.position,
          radius: footprintRadius(other.structureTypeId),
        })),
      ...site.machines
        .filter((other) => other.id !== machine.id)
        .flatMap(machineGround),
      { position: construction.workSpot, radius: gap / 2 },
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
