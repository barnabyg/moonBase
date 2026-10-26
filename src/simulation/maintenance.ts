import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
} from "../catalogue";
import type { CampaignState } from "./campaign";
import { chooseWorkSpot, type StructureState } from "./construction";
import { isDueToBeDismantled } from "./dismantling";
import type { GameEvent } from "./events";
import { addToStock, inStock } from "./stockpile";

/**
 * A Maintenance Work Order for a commissioned Structure, raised once its
 * Condition falls below the data catalogue's threshold. The Robot loads
 * spare Components at the stockpile, walks to the Structure and works on it
 * until its Condition is back to 100%.
 */
export interface MaintenanceState {
  /** The Structure to be maintained. */
  structureId: string;
  /** Where the Robot stands to work on it. */
  workSpot: GroundPosition;
  /**
   * How many spare Components the Robot has taken from the base's stock for
   * it, or undefined until it takes them.
   */
  spareComponents: number | undefined;
  /**
   * The Robot's working time so far: loading the spare Components at the
   * stockpile, then working on the Structure.
   */
  workedMinutes: number;
}

/** Why nobody can carry out a Maintenance Work Order for now. */
export interface MaintenanceWait {
  readonly reason: "missing-spare-components";
  /** How many spare Components the base's stock is short of. */
  readonly missing: number;
}

/** A Maintenance Work Order, awaiting the Robot or under way. */
export interface MaintenanceSnapshot {
  /** The Structure to be maintained. */
  readonly structureId: string;
  readonly structureTypeId: string;
  /**
   * The spare Components it uses up: those the Robot has taken from the
   * base's stock, or else those it needs as things stand.
   */
  readonly spareComponents: number;
  /** Whether a Robot has claimed it and is carrying it out. */
  readonly underWay: boolean;
  /** Whether the Robot has loaded the spare Components, and goes on to work on the Structure. */
  readonly loaded: boolean;
  /**
   * How much of the current step's work is done, from 0 to 1: loading at
   * the stockpile, then working on the Structure.
   */
  readonly stageProgress: number;
  /** Why nobody can carry it out for now, or undefined if it can be. */
  readonly waiting: MaintenanceWait | undefined;
}

/** Below this, a Condition counts as 0%, so that rounding never leaves a sliver. */
const CONDITION_TOLERANCE = 1e-9;

/**
 * Raises a Maintenance Work Order, in the order they are raised, for every
 * commissioned Structure whose Condition has fallen below the data
 * catalogue's threshold, unless it is to be dismantled, never more than one
 * for each. A Structure that is gone, or is to be dismantled, is not
 * maintained: its Work Order goes, and any spare Components taken for it go
 * straight back into the base's stock. Returns an event for each Work Order
 * raised.
 */
export function planMaintenance(state: CampaignState): GameEvent[] {
  const wanted = (structureId: string) =>
    !isDueToBeDismantled(state, structureId) &&
    state.structures.some((structure) => structure.id === structureId);
  for (const dropped of state.maintenance.filter(
    (maintenance) => !wanted(maintenance.structureId),
  )) {
    addToStock(state, spares(dropped.spareComponents ?? 0));
    for (const robot of state.robots) {
      if (
        robot.workOrder?.kind === "maintain" &&
        robot.workOrder.structureId === dropped.structureId
      ) {
        robot.workOrder = undefined;
        robot.carrying = [];
        robot.activity = { kind: "idle" };
      }
    }
  }
  state.maintenance = state.maintenance.filter((maintenance) =>
    wanted(maintenance.structureId),
  );
  const events: GameEvent[] = [];
  for (const structure of state.structures) {
    if (
      structure.conditionPercent < catalogue.maintenance.thresholdPercent &&
      wanted(structure.id) &&
      findMaintenance(state, structure.id) === undefined
    ) {
      state.maintenance.push({
        structureId: structure.id,
        workSpot: chooseWorkSpot(state, structure),
        spareComponents: undefined,
        workedMinutes: 0,
      });
      events.push({
        kind: "maintenance-needed",
        atMinute: state.elapsedMinutes,
        structureId: structure.id,
        structureTypeId: structure.structureTypeId,
        conditionPercent: structure.conditionPercent,
      });
    }
  }
  return events;
}

/** The Maintenance Work Order for a Structure, if one has been raised. */
export function findMaintenance(
  state: CampaignState,
  structureId: string,
): MaintenanceState | undefined {
  return state.maintenance.find(
    (maintenance) => maintenance.structureId === structureId,
  );
}

/**
 * How many spare Components it takes to bring a Structure's Condition back
 * to 100%: one for each share of Condition the data catalogue sets, or part
 * of one, that it has lost.
 */
export function spareComponentsFor(
  structure: Pick<StructureState, "conditionPercent">,
): number {
  const lost = 100 - structure.conditionPercent;
  return Math.max(
    Math.ceil(
      lost / catalogue.maintenance.conditionPercentPerSpareComponent -
        CONDITION_TOLERANCE,
    ),
    0,
  );
}

/** A number of spare Components as a list of counts, empty for none. */
export function spares(count: number): ComponentCount[] {
  return count === 0
    ? []
    : [{ componentId: catalogue.maintenance.spareComponentId, count }];
}

/**
 * Says why a Maintenance Work Order is waiting, or undefined if it can be
 * carried out. Until the Robot has taken the spare Components for it, it
 * needs them in the base's stock, where those raised earlier have first
 * claim, so that one that can't be supplied waits from the start.
 */
export function findMaintenanceWait(
  state: CampaignState,
  maintenance: MaintenanceState,
): MaintenanceWait | undefined {
  if (maintenance.spareComponents !== undefined) return undefined;
  const claimedEarlier = state.maintenance
    .slice(0, state.maintenance.indexOf(maintenance))
    .filter((other) => other.spareComponents === undefined)
    .reduce((total, other) => total + spareComponentsNeeded(state, other), 0);
  const left = Math.max(
    inStock(state, catalogue.maintenance.spareComponentId) - claimedEarlier,
    0,
  );
  const needed = spareComponentsNeeded(state, maintenance);
  return needed > left
    ? { reason: "missing-spare-components", missing: needed - left }
    : undefined;
}

/** The Robot's working time to load the spare Components, and in all, in game-minutes. */
export function maintenanceMinutes(): { loading: number; total: number } {
  const { loadingHours, workHours } = catalogue.maintenance;
  const loading = Math.round(loadingHours * 60);
  return { loading, total: loading + Math.round(workHours * 60) };
}

/**
 * Ends Maintenance as the Robot finishes working on a Structure: its
 * Condition is back to 100%, so a Broken Structure works again.
 */
export function finishMaintenance(
  state: CampaignState,
  maintenance: MaintenanceState,
  structure: StructureState,
): GameEvent[] {
  structure.conditionPercent = 100;
  state.maintenance = state.maintenance.filter(
    (other) => other !== maintenance,
  );
  return [
    {
      kind: "maintenance-completed",
      atMinute: state.elapsedMinutes,
      structureId: structure.id,
      structureTypeId: structure.structureTypeId,
      spareComponents: maintenance.spareComponents ?? 0,
    },
  ];
}

export function readMaintenance(state: CampaignState): MaintenanceSnapshot[] {
  const { loading, total } = maintenanceMinutes();
  return state.maintenance.flatMap((maintenance) => {
    const structure = state.structures.find(
      (candidate) => candidate.id === maintenance.structureId,
    );
    if (structure === undefined) return [];
    const loaded =
      maintenance.spareComponents !== undefined &&
      maintenance.workedMinutes >= loading;
    const [done, required] = loaded
      ? [maintenance.workedMinutes - loading, total - loading]
      : [maintenance.workedMinutes, loading];
    return [
      {
        structureId: structure.id,
        structureTypeId: structure.structureTypeId,
        spareComponents:
          maintenance.spareComponents ?? spareComponentsFor(structure),
        underWay: state.robots.some(
          (robot) =>
            robot.workOrder?.kind === "maintain" &&
            robot.workOrder.structureId === structure.id,
        ),
        loaded,
        stageProgress: required === 0 ? 0 : Math.min(done / required, 1),
        waiting: findMaintenanceWait(state, maintenance),
      },
    ];
  });
}

/** The spare Components a Maintenance Work Order needs as things stand. */
function spareComponentsNeeded(
  state: CampaignState,
  maintenance: MaintenanceState,
): number {
  const structure = state.structures.find(
    (candidate) => candidate.id === maintenance.structureId,
  );
  return structure === undefined ? 0 : spareComponentsFor(structure);
}
