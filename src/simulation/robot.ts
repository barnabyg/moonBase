import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
} from "../catalogue";
import type { CampaignState } from "./campaign";
import {
  componentsFor,
  findStructureType,
  stageMinutes,
  type ConstructionStage,
  type ConstructionState,
} from "./construction";
import type { GameEvent } from "./events";
import { nextFraction } from "./random";
import { stepTowards } from "./walking";

/** What a Robot did during the latest game-minute, and for which Construction. */
export type RobotActivity =
  | { readonly kind: "idle" }
  | {
      readonly kind: "walking";
      readonly constructionId: string;
      readonly destination: "site" | "lander";
    }
  | {
      readonly kind:
        | "preparing-site"
        | "loading-components"
        | "unloading-components"
        | "assembling"
        | "commissioning"
        | "waiting-for-components";
      readonly constructionId: string;
    };

export interface RobotState {
  id: string;
  position: GroundPosition;
  activity: RobotActivity;
  carrying: ComponentCount[];
}

/** How close to the Lander's centre a Robot may walk. */
const LANDER_CLEARANCE_METRES = catalogue.lander.footprintRadiusMetres + 0.5;

/**
 * Lets the Robot do one game-minute of work on the first Construction in plan
 * order, and returns any events.
 */
export function workRobot(
  state: CampaignState,
  robot: RobotState,
): GameEvent[] {
  const construction = state.constructions[0];
  if (construction === undefined) {
    robot.activity = { kind: "idle" };
    return [];
  }
  const { id } = construction;
  const walkTo = (
    spot: GroundPosition,
    destination: "site" | "lander",
  ): boolean => {
    if (robot.position.x === spot.x && robot.position.y === spot.y) return true;
    robot.position = stepTowards(
      robot.position,
      spot,
      {
        centre: state.lander.position,
        radius: LANDER_CLEARANCE_METRES,
      },
      catalogue.robot.walkingSpeedMetresPerHour / 60,
    );
    robot.activity = { kind: "walking", constructionId: id, destination };
    return false;
  };
  const workFor = (
    kind:
      | "preparing-site"
      | "loading-components"
      | "unloading-components"
      | "assembling"
      | "commissioning",
    untilMinutes: number,
  ): boolean => {
    robot.activity = { kind, constructionId: id };
    construction.workedMinutes += 1;
    return construction.workedMinutes >= untilMinutes;
  };
  const required = stageMinutes(construction);

  switch (construction.stage) {
    case "site-preparation":
      if (
        walkTo(construction.workSpot, "site") &&
        workFor("preparing-site", required)
      ) {
        moveOn(construction, "component-delivery");
      }
      return [];

    case "component-delivery": {
      // Half the handling time is loading at the Lander, half unloading at the site.
      const loadingMinutes = Math.floor(required / 2);
      if (!construction.componentsTaken) {
        if (!walkTo(landerSpot(state, construction), "lander")) return [];
        const needed = componentsFor(construction.structureTypeId);
        if (!takeFromStock(state, needed)) {
          robot.activity = {
            kind: "waiting-for-components",
            constructionId: id,
          };
          return [];
        }
        robot.carrying = needed;
        construction.componentsTaken = true;
      }
      if (construction.workedMinutes < loadingMinutes) {
        workFor("loading-components", loadingMinutes);
        return [];
      }
      if (
        walkTo(construction.workSpot, "site") &&
        workFor("unloading-components", required)
      ) {
        robot.carrying = [];
        moveOn(construction, "assembly");
      }
      return [];
    }

    case "assembly":
      if (
        walkTo(construction.workSpot, "site") &&
        workFor("assembling", required)
      ) {
        moveOn(construction, "commissioning");
      }
      return [];

    case "commissioning":
      if (
        !walkTo(construction.workSpot, "site") ||
        !workFor("commissioning", required)
      ) {
        return [];
      }
      return finishCommissioning(state, construction);
  }
}

/** Ends a Commissioning attempt, which may fail and then starts again. */
function finishCommissioning(
  state: CampaignState,
  construction: ConstructionState,
): GameEvent[] {
  const failureChance =
    findStructureType(construction.structureTypeId)
      ?.commissioningFailureChance ?? 0;
  if (nextFraction(state.random) < failureChance) {
    construction.failedCommissionings += 1;
    construction.workedMinutes = 0;
    return [];
  }
  state.constructions = state.constructions.filter(
    (other) => other !== construction,
  );
  state.structures.push({
    id: construction.id,
    structureTypeId: construction.structureTypeId,
    position: { ...construction.position },
  });
  return [
    {
      kind: "construction-completed",
      atMinute: state.elapsedMinutes,
      structureId: construction.id,
      structureTypeId: construction.structureTypeId,
    },
  ];
}

function moveOn(
  construction: ConstructionState,
  stage: ConstructionStage,
): void {
  construction.stage = stage;
  construction.workedMinutes = 0;
}

/** Where the Robot stands to load Components: beside the Lander, on the side facing the site. */
function landerSpot(
  state: CampaignState,
  construction: ConstructionState,
): GroundPosition {
  const lander = state.lander.position;
  const { workSpot } = construction;
  const angle = Math.atan2(workSpot.y - lander.y, workSpot.x - lander.x);
  const reach =
    catalogue.lander.footprintRadiusMetres + catalogue.robot.workingGapMetres;
  return {
    x: lander.x + Math.cos(angle) * reach,
    y: lander.y + Math.sin(angle) * reach,
  };
}

/** Takes the Components from the cargo stock if they are all there; otherwise takes nothing. */
function takeFromStock(
  state: CampaignState,
  needed: readonly ComponentCount[],
): boolean {
  const stockOf = (componentId: string) =>
    state.cargo.find((stock) => stock.componentId === componentId);
  if (
    needed.some((need) => (stockOf(need.componentId)?.count ?? 0) < need.count)
  ) {
    return false;
  }
  for (const need of needed) {
    const stock = stockOf(need.componentId);
    if (stock !== undefined) stock.count -= need.count;
  }
  return true;
}
