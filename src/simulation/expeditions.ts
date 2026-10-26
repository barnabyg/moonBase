import { catalogue, type GroundPosition } from "../catalogue";
import type { CampaignState } from "./campaign";
import { MINUTES_PER_EARTH_DAY } from "./clock";
import { isRoverBroken, type RoverState } from "./rovers";

/**
 * Where an Expedition has got to: "boarding", the Robot finishing the Work
 * Order it holds, then walking to the Rover; "driving-out", driving it to
 * the nearest map edge and off the map; "away", beyond the base;
 * "driving-back", driving back onto the map to the stockpile; and
 * "unloading", unloading what it brought back there.
 */
export type ExpeditionStage =
  "boarding" | "driving-out" | "away" | "driving-back" | "unloading";

/** An Expedition, from the player starting it until what it brought back is in the base's stock. */
export interface ExpeditionState {
  robotId: string;
  roverId: string;
  stage: ExpeditionStage;
  /**
   * Where the Rover drives off the map and back onto it: just beyond the
   * map edge nearest to where it stood, chosen as the Robot sets off in it.
   */
  exitPoint: GroundPosition | undefined;
  /** The game-minute it comes back onto the map, once it has left it. */
  returnsAtMinute: number | undefined;
  /** The Robot's working time unloading at the stockpile so far. */
  workedMinutes: number;
}

export interface ExpeditionSnapshot {
  readonly robotId: string;
  readonly roverId: string;
  readonly stage: ExpeditionStage;
  /** The game-minute it comes back onto the map, once it has left it. */
  readonly returnsAtMinute: number | undefined;
  /** The bulk resource it brings back, and how much. */
  readonly resourceId: string;
  readonly kilograms: number;
}

export type StartExpeditionRefusal =
  "under-way" | "rover-broken" | "no-rover" | "campaign-ended";

export type StartExpeditionResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: StartExpeditionRefusal;
      /** The reason in words the player can read. */
      readonly message: string;
    };

/** How far beyond the map edge the Rover drives before it is away. */
const BEYOND_EDGE_METRES = 10;

/**
 * Starts an Expedition with the first Robot and the first Rover, unless one
 * is already under way or the Rover is Broken. The Robot finishes the Work
 * Order it holds before it leaves.
 */
export function startExpedition(state: CampaignState): StartExpeditionResult {
  if (state.expedition !== undefined) {
    return refuse("under-way", "An Expedition is already under way.");
  }
  const [robot] = state.robots;
  const [rover] = state.rovers;
  if (robot === undefined || rover === undefined) {
    return refuse("no-rover", "The base has no Rover to go on an Expedition.");
  }
  if (isRoverBroken(rover)) {
    return refuse(
      "rover-broken",
      "The Rover is Broken, and can't be driven until it has been maintained.",
    );
  }
  state.expedition = {
    robotId: robot.id,
    roverId: rover.id,
    stage: "boarding",
    exitPoint: undefined,
    returnsAtMinute: undefined,
    workedMinutes: 0,
  };
  return { ok: true };
}

/** The Expedition a Robot is on, from the player starting it until it is over. */
export function expeditionOf(
  state: CampaignState,
  robotId: string,
): ExpeditionState | undefined {
  return state.expedition?.robotId === robotId ? state.expedition : undefined;
}

/**
 * Whether a Rover is out on an Expedition, from the Robot setting off in it
 * until it is back beside the stockpile: the cold of Night and parking pass
 * it by, as its own heater keeps it warm while it is driven.
 */
export function isRoverOnExpedition(
  state: CampaignState,
  roverId: string,
): boolean {
  const { expedition } = state;
  return (
    expedition?.roverId === roverId &&
    (expedition.stage === "driving-out" ||
      expedition.stage === "away" ||
      expedition.stage === "driving-back")
  );
}

/** Whether a Robot or Rover is away beyond the base, off the map. */
export function isAway(
  state: CampaignState,
  id: { readonly robotId: string } | { readonly roverId: string },
): boolean {
  const { expedition } = state;
  if (expedition?.stage !== "away") return false;
  return "robotId" in id
    ? expedition.robotId === id.robotId
    : expedition.roverId === id.roverId;
}

/**
 * Whether the Rover for an Expedition, or anything that will be done with
 * it, is spoken for: from the player starting it until it is over.
 */
export function isRoverSpokenFor(
  state: CampaignState,
  roverId: string,
): boolean {
  return state.expedition?.roverId === roverId;
}

/** The game-minutes an Expedition is away. */
export function awayMinutes(): number {
  return Math.round(
    catalogue.expeditions.awayEarthDays * MINUTES_PER_EARTH_DAY,
  );
}

/** The Robot's working time to unload what an Expedition brought back, in game-minutes. */
export function unloadingMinutes(): number {
  return Math.round(catalogue.expeditions.unloadingHours * 60);
}

/**
 * Where a Rover leaves the map: just beyond the edge nearest to where it
 * stands, straight out from it. Ties go east, north, west, then south.
 */
export function exitPointFrom(position: GroundPosition): GroundPosition {
  const halfWidth = catalogue.map.widthMetres / 2;
  const halfDepth = catalogue.map.depthMetres / 2;
  const beyond = catalogue.rover.footprintRadiusMetres + BEYOND_EDGE_METRES;
  const edges = [
    {
      gap: halfWidth - position.x,
      point: { x: halfWidth + beyond, y: position.y },
    },
    {
      gap: halfDepth - position.y,
      point: { x: position.x, y: halfDepth + beyond },
    },
    {
      gap: position.x + halfWidth,
      point: { x: -halfWidth - beyond, y: position.y },
    },
    {
      gap: position.y + halfDepth,
      point: { x: position.x, y: -halfDepth - beyond },
    },
  ];
  return edges.reduce((best, edge) => (edge.gap < best.gap ? edge : best))
    .point;
}

/**
 * Where the Rover stops on its way back, for the Robot to unload: beside
 * the stockpile, on the side it comes from.
 */
export function returnSpot(
  state: CampaignState,
  from: GroundPosition,
): GroundPosition {
  const stockpile = state.stockpile.position;
  const angle = Math.atan2(from.y - stockpile.y, from.x - stockpile.x);
  const reach =
    catalogue.stockpile.footprintRadiusMetres +
    catalogue.rover.footprintRadiusMetres +
    catalogue.robot.workingGapMetres;
  return {
    x: stockpile.x + Math.cos(angle) * reach,
    y: stockpile.y + Math.sin(angle) * reach,
  };
}

/**
 * Wears the Rover down by Dust for a game-minute of an Expedition, on
 * which it is driven all the way, out to the map edge, while it is away
 * and back; never below 1%, so that it always comes back.
 */
export function wearRoverOnExpedition(rover: RoverState): void {
  rover.conditionPercent = Math.max(
    rover.conditionPercent - catalogue.rover.dustWearPercentPerDrivingHour / 60,
    Math.min(rover.conditionPercent, 1),
  );
}

export function readExpedition(
  state: CampaignState,
): ExpeditionSnapshot | undefined {
  const { expedition } = state;
  if (expedition === undefined) return undefined;
  return {
    robotId: expedition.robotId,
    roverId: expedition.roverId,
    stage: expedition.stage,
    returnsAtMinute: expedition.returnsAtMinute,
    resourceId: catalogue.expeditions.resourceId,
    kilograms: catalogue.expeditions.kilograms,
  };
}

function refuse(
  reason: StartExpeditionRefusal,
  message: string,
): StartExpeditionResult {
  return { ok: false, reason, message };
}
