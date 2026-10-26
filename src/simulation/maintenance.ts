import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
} from "../catalogue";
import type { CampaignState } from "./campaign";
import { chooseWorkSpot, type StructureState } from "./construction";
import { isDueToBeDismantled } from "./dismantling";
import { isDueForCleaning } from "./dust-coating";
import type { GameEvent } from "./events";
import { addToStock, inStock } from "./stockpile";

/**
 * A Maintenance Work Order for a commissioned Structure, raised once its
 * Condition falls below the data catalogue's threshold or, for a solar
 * array, once its Dust coating passes the threshold for cleaning. To
 * restore Condition, the Robot loads spare Components at the stockpile,
 * walks to the Structure and works on it until its Condition is back to
 * 100%; to clean it, the Robot walks straight there. One visit does both
 * when both are due.
 */
export interface MaintenanceState {
  /** The Structure to be maintained. */
  structureId: string;
  /** Where the Robot stands to work on it. */
  workSpot: GroundPosition;
  /** What the Robot's visit does, settled as it starts on it; undefined until then. */
  visit: MaintenanceVisit | undefined;
  /**
   * The Robot's working time so far, through the steps of its visit:
   * loading any spare Components at the stockpile, restoring Condition,
   * then cleaning.
   */
  workedMinutes: number;
}

/** What a Maintenance visit does. */
export interface MaintenanceVisit {
  /**
   * The spare Components the Robot takes from the base's stock to restore
   * the Structure's Condition, or 0 if it doesn't restore it.
   */
  spareComponents: number;
  /** Whether it cleans the Dust coating off a solar array. */
  cleaning: boolean;
}

/** A step of a Maintenance visit, in the order the Robot takes them. */
export type MaintenanceStep =
  "loading-spare-components" | "restoring-condition" | "cleaning";

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
   * The spare Components it uses up to restore Condition: those the Robot
   * has taken from the base's stock, or else those it needs as things
   * stand; 0 if it only cleans.
   */
  readonly spareComponents: number;
  /** Whether it cleans the Dust coating off a solar array, as things stand. */
  readonly cleaning: boolean;
  /** Whether a Robot has claimed it and is carrying it out. */
  readonly underWay: boolean;
  /** The step of the visit the Robot is on, or comes to first. */
  readonly step: MaintenanceStep;
  /** How much of the current step's work is done, from 0 to 1. */
  readonly stageProgress: number;
  /** Why nobody can carry it out for now, or undefined if it can be. */
  readonly waiting: MaintenanceWait | undefined;
}

/** Below this, a Condition counts as 0%, so that rounding never leaves a sliver. */
const CONDITION_TOLERANCE = 1e-9;

/**
 * Raises a Maintenance Work Order, in the order they are raised, for every
 * commissioned Structure due for it (see `planVisit`), unless it is to be
 * dismantled, never more than one for each. A Structure that is gone, or
 * is to be dismantled, is not maintained: its Work Order goes, and any
 * spare Components taken for it go straight back into the base's stock.
 * Returns an event for each Work Order raised.
 */
export function planMaintenance(state: CampaignState): GameEvent[] {
  const wanted = (structureId: string) =>
    !isDueToBeDismantled(state, structureId) &&
    state.structures.some((structure) => structure.id === structureId);
  for (const dropped of state.maintenance.filter(
    (maintenance) => !wanted(maintenance.structureId),
  )) {
    addToStock(state, spares(dropped.visit?.spareComponents ?? 0));
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
    const due = planVisit(structure);
    if (
      (due.spareComponents > 0 || due.cleaning) &&
      wanted(structure.id) &&
      findMaintenance(state, structure.id) === undefined
    ) {
      state.maintenance.push({
        structureId: structure.id,
        workSpot: chooseWorkSpot(state, structure),
        visit: undefined,
        workedMinutes: 0,
      });
      events.push({
        kind: "maintenance-needed",
        atMinute: state.elapsedMinutes,
        structureId: structure.id,
        structureTypeId: structure.structureTypeId,
        conditionPercent: structure.conditionPercent,
        dustCoatingPercent: structure.dustCoatingPercent,
        restoresCondition: due.spareComponents > 0,
        cleans: due.cleaning,
      });
    }
  }
  return events;
}

/**
 * What a Maintenance visit to a Structure does as things stand: it restores
 * Condition once that has fallen below the data catalogue's threshold,
 * using the spare Components that takes, and it cleans a solar array once
 * its Dust coating has passed the threshold for cleaning.
 */
export function planVisit(structure: StructureState): MaintenanceVisit {
  return {
    spareComponents:
      structure.conditionPercent < catalogue.maintenance.thresholdPercent
        ? spareComponentsFor(structure)
        : 0,
    cleaning: isDueForCleaning(structure),
  };
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
 * carried out. Until the Robot has taken any spare Components it needs, it
 * needs them in the base's stock, where those raised earlier have first
 * claim, so that one that can't be supplied waits from the start.
 */
export function findMaintenanceWait(
  state: CampaignState,
  maintenance: MaintenanceState,
): MaintenanceWait | undefined {
  if (maintenance.visit !== undefined) return undefined;
  const claimedEarlier = state.maintenance
    .slice(0, state.maintenance.indexOf(maintenance))
    .filter((other) => other.visit === undefined)
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

/**
 * The steps of a Maintenance visit, in order, with the Robot's working time
 * each takes, in game-minutes: loading spare Components and restoring
 * Condition only if it uses some, and cleaning only if it cleans.
 */
export function visitSteps(
  visit: MaintenanceVisit,
): { step: MaintenanceStep; minutes: number }[] {
  const minutes = (hours: number) => Math.round(hours * 60);
  const { loadingHours, workHours } = catalogue.maintenance;
  const steps: { step: MaintenanceStep; minutes: number }[] = [];
  if (visit.spareComponents > 0) {
    steps.push(
      { step: "loading-spare-components", minutes: minutes(loadingHours) },
      { step: "restoring-condition", minutes: minutes(workHours) },
    );
  }
  if (visit.cleaning) {
    steps.push({
      step: "cleaning",
      minutes: minutes(catalogue.dustCoating.cleaningHours),
    });
  }
  return steps;
}

/**
 * The step of its visit a Maintenance Work Order is on, with the working
 * time done in it and the time it takes, or undefined once every step is
 * done.
 */
export function currentStep(
  visit: MaintenanceVisit,
  workedMinutes: number,
): { step: MaintenanceStep; doneMinutes: number; minutes: number } | undefined {
  let before = 0;
  for (const { step, minutes } of visitSteps(visit)) {
    if (workedMinutes < before + minutes) {
      return { step, doneMinutes: workedMinutes - before, minutes };
    }
    before += minutes;
  }
  return undefined;
}

/**
 * Ends Maintenance as the Robot finishes its visit: if it used spare
 * Components, the Structure's Condition is back to 100%, so that a Broken
 * one works again, and if it cleaned, the Dust coating is gone.
 */
export function finishMaintenance(
  state: CampaignState,
  maintenance: MaintenanceState,
  structure: StructureState,
): GameEvent[] {
  const { spareComponents, cleaning } =
    maintenance.visit ?? planVisit(structure);
  if (spareComponents > 0) structure.conditionPercent = 100;
  if (cleaning) structure.dustCoatingPercent = 0;
  state.maintenance = state.maintenance.filter(
    (other) => other !== maintenance,
  );
  return [
    {
      kind: "maintenance-completed",
      atMinute: state.elapsedMinutes,
      structureId: structure.id,
      structureTypeId: structure.structureTypeId,
      spareComponents,
      cleaned: cleaning,
    },
  ];
}

export function readMaintenance(state: CampaignState): MaintenanceSnapshot[] {
  return state.maintenance.flatMap((maintenance) => {
    const structure = state.structures.find(
      (candidate) => candidate.id === maintenance.structureId,
    );
    if (structure === undefined) return [];
    const visit = maintenance.visit ?? planVisit(structure);
    const [first] = visitSteps(visit);
    const current = currentStep(visit, maintenance.workedMinutes) ?? {
      step: first?.step ?? "cleaning",
      doneMinutes: 0,
      minutes: 0,
    };
    return [
      {
        structureId: structure.id,
        structureTypeId: structure.structureTypeId,
        spareComponents: visit.spareComponents,
        cleaning: visit.cleaning,
        underWay: state.robots.some(
          (robot) =>
            robot.workOrder?.kind === "maintain" &&
            robot.workOrder.structureId === structure.id,
        ),
        step: current.step,
        stageProgress:
          current.minutes === 0
            ? 0
            : Math.min(current.doneMinutes / current.minutes, 1),
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
  return structure === undefined ? 0 : planVisit(structure).spareComponents;
}
