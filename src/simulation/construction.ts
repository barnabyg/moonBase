import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
  type StructureType,
} from "../catalogue";

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
  | "overlaps-structure";

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
  return { ok: true };
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
 * Structure and the map's edge.
 */
export function chooseWorkSpot(
  site: Site,
  plan: ConstructionPlan,
): GroundPosition {
  const gap = catalogue.robot.workingGapMetres;
  const reach = footprintRadius(plan.structureTypeId) + gap;
  const lander = site.lander.position;
  const towardsLander = Math.atan2(
    lander.y - plan.position.y,
    lander.x - plan.position.x,
  );
  const candidates = [0, 1, -1, 2, -2, 3, -3, 4].map((step) => {
    const angle = towardsLander + (step * Math.PI) / 4;
    return {
      x: plan.position.x + Math.cos(angle) * reach,
      y: plan.position.y + Math.sin(angle) * reach,
    };
  });
  const clearOfLander = (spot: GroundPosition) =>
    distance(spot, lander) >= catalogue.lander.footprintRadiusMetres + gap;
  const onMap = (spot: GroundPosition) =>
    Math.abs(spot.x) <= catalogue.map.widthMetres / 2 &&
    Math.abs(spot.y) <= catalogue.map.depthMetres / 2;
  const clearOfStructures = (spot: GroundPosition) =>
    [...site.structures, ...site.constructions].every(
      (other) =>
        distance(spot, other.position) >=
        footprintRadius(other.structureTypeId),
    );
  // A site hemmed in on every side still gets a spot the Robot can reach.
  return (
    candidates.find(
      (spot) => clearOfLander(spot) && onMap(spot) && clearOfStructures(spot),
    ) ??
    candidates.find((spot) => clearOfLander(spot) && onMap(spot)) ??
    candidates[0] ??
    plan.position
  );
}
