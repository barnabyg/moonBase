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
import type { MachineState } from "./machines";
import { addToStock, inStock } from "./stockpile";

/** What a Maintenance Work Order is for: a commissioned Structure or a Machine. */
export type MaintenanceTarget =
  | { readonly kind: "structure"; readonly structureId: string }
  | { readonly kind: "machine"; readonly machineId: string };

/** What a Maintenance Work Order is for, with its type, for the interface. */
export type MaintenanceSubject =
  | {
      readonly kind: "structure";
      readonly structureId: string;
      readonly structureTypeId: string;
    }
  | {
      readonly kind: "machine";
      readonly machineId: string;
      readonly machineTypeId: string;
    };

/**
 * A Maintenance Work Order, raised once the Condition of a commissioned
 * Structure or a Machine falls below the data catalogue's threshold or,
 * for a solar array, once its Dust coating passes the threshold for
 * cleaning. To restore Condition, the Robot loads spare Components at the
 * stockpile, walks to what it maintains and works on it until its Condition
 * is back to 100%; to clean a solar array, it walks straight there. One
 * visit does both when both are due.
 */
export interface MaintenanceState {
  target: MaintenanceTarget;
  /**
   * Where the Robot stands to work: beside a Structure, chosen as the Work
   * Order is raised, or beside a Machine, chosen as the Robot starts on it.
   */
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
   * Condition, or 0 if it doesn't restore it.
   */
  spareComponents: number;
  /** Whether it cleans the Dust coating off a solar array. */
  cleaning: boolean;
}

/** A step of a Maintenance visit, in the order the Robot takes them. */
export type MaintenanceStep =
  "loading-spare-components" | "restoring-condition" | "cleaning";

/** Why nobody can carry out a Maintenance Work Order for now. */
export type MaintenanceWait =
  | {
      readonly reason: "missing-spare-components";
      /** How many spare Components the base's stock is short of. */
      readonly missing: number;
    }
  | {
      /** The Machine is carrying out a stage of Construction, and is maintained once it is idle. */
      readonly reason: "machine-at-work";
    };

/** A Maintenance Work Order, awaiting the Robot or under way. */
export interface MaintenanceSnapshot {
  readonly target: MaintenanceSubject;
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

/** Something with a Condition that Maintenance restores. */
type Worn =
  | { readonly kind: "structure"; readonly structure: StructureState }
  | { readonly kind: "machine"; readonly machine: MachineState };

/** Below this, a Condition counts as 0%, so that rounding never leaves a sliver. */
const CONDITION_TOLERANCE = 1e-9;

/**
 * Raises a Maintenance Work Order, in the order they are raised, for every
 * commissioned Structure and Machine due for it (see `planVisit`), unless
 * it is a Structure to be dismantled, never more than one for each. A
 * Structure that is gone, or is to be dismantled, is not maintained: its
 * Work Order goes, and any spare Components taken for it go straight back
 * into the base's stock. Returns an event for each Work Order raised.
 */
export function planMaintenance(state: CampaignState): GameEvent[] {
  const wanted = (target: MaintenanceTarget) =>
    target.kind === "machine" ||
    (!isDueToBeDismantled(state, target.structureId) &&
      state.structures.some(
        (structure) => structure.id === target.structureId,
      ));
  for (const dropped of state.maintenance.filter(
    (maintenance) => !wanted(maintenance.target),
  )) {
    addToStock(state, spares(dropped.visit?.spareComponents ?? 0));
    for (const robot of state.robots) {
      if (isClaimedBy(robot, dropped.target)) {
        robot.workOrder = undefined;
        robot.carrying = [];
        robot.activity = { kind: "idle" };
      }
    }
  }
  state.maintenance = state.maintenance.filter((maintenance) =>
    wanted(maintenance.target),
  );
  const events: GameEvent[] = [];
  const candidates: Worn[] = [
    ...state.structures.map((structure) => ({
      kind: "structure" as const,
      structure,
    })),
    ...state.machines.map((machine) => ({ kind: "machine" as const, machine })),
  ];
  for (const worn of candidates) {
    const target = targetOf(worn);
    const due = visitFor(worn);
    if (
      (due.spareComponents > 0 || due.cleaning) &&
      wanted(target) &&
      findMaintenance(state, target) === undefined
    ) {
      state.maintenance.push({
        target,
        workSpot:
          worn.kind === "structure"
            ? chooseWorkSpot(state, worn.structure)
            : { ...worn.machine.position },
        visit: undefined,
        workedMinutes: 0,
      });
      events.push({
        kind: "maintenance-needed",
        atMinute: state.elapsedMinutes,
        target: subjectOf(worn),
        conditionPercent: conditionOf(worn),
        dustCoatingPercent:
          worn.kind === "structure" ? worn.structure.dustCoatingPercent : 0,
        restoresCondition: due.spareComponents > 0,
        cleans: due.cleaning,
      });
    }
  }
  return events;
}

/** The Maintenance Work Order for a Structure or Machine, if one has been raised. */
export function findMaintenance(
  state: CampaignState,
  target: MaintenanceTarget,
): MaintenanceState | undefined {
  return state.maintenance.find((maintenance) =>
    isSameTarget(maintenance.target, target),
  );
}

export function isSameTarget(
  a: MaintenanceTarget,
  b: MaintenanceTarget,
): boolean {
  return a.kind === "structure"
    ? b.kind === "structure" && a.structureId === b.structureId
    : b.kind === "machine" && a.machineId === b.machineId;
}

/**
 * Whether a Machine is undergoing Maintenance, so that it can't be assigned
 * a stage of Construction: a Robot has claimed its Work Order, or started
 * on it.
 */
export function isUnderMaintenance(
  state: CampaignState,
  machineId: string,
): boolean {
  const target: MaintenanceTarget = { kind: "machine", machineId };
  return (
    findMaintenance(state, target)?.visit !== undefined ||
    state.robots.some((robot) => isClaimedBy(robot, target))
  );
}

/** Whether a Robot holds the Maintenance Work Order for a Structure or Machine. */
export function isClaimedBy(
  robot: Pick<CampaignState["robots"][number], "workOrder">,
  target: MaintenanceTarget,
): boolean {
  const { workOrder } = robot;
  if (workOrder === undefined) return false;
  return target.kind === "structure"
    ? workOrder.kind === "maintain" &&
        workOrder.structureId === target.structureId
    : workOrder.kind === "maintain-machine" &&
        workOrder.machineId === target.machineId;
}

/**
 * The commissioned Structure or the Machine a Maintenance Work Order is
 * for, or undefined if it is gone.
 */
export function findWorn(
  state: CampaignState,
  target: MaintenanceTarget,
): Worn | undefined {
  if (target.kind === "structure") {
    const structure = state.structures.find(
      (candidate) => candidate.id === target.structureId,
    );
    return structure === undefined
      ? undefined
      : { kind: "structure", structure };
  }
  const machine = state.machines.find(
    (candidate) => candidate.id === target.machineId,
  );
  return machine === undefined ? undefined : { kind: "machine", machine };
}

/**
 * What a Maintenance visit does as things stand: it restores Condition once
 * that has fallen below the data catalogue's threshold, using the spare
 * Components that takes, and it cleans a solar array once its Dust coating
 * has passed the threshold for cleaning.
 */
export function visitFor(worn: Worn): MaintenanceVisit {
  const conditionPercent = conditionOf(worn);
  return {
    spareComponents:
      conditionPercent < catalogue.maintenance.thresholdPercent
        ? spareComponentsFor({ conditionPercent })
        : 0,
    cleaning: worn.kind === "structure" && isDueForCleaning(worn.structure),
  };
}

/**
 * How many spare Components it takes to bring a Condition back to 100%: one
 * for each share of Condition the data catalogue sets, or part of one,
 * that has been lost.
 */
export function spareComponentsFor(worn: {
  readonly conditionPercent: number;
}): number {
  const lost = 100 - worn.conditionPercent;
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
 * carried out. A Machine carrying out a stage of Construction is maintained
 * once it is idle, unless it is Broken. Until the Robot has taken any spare
 * Components it needs, it needs them in the base's stock, where those
 * raised earlier have first claim, so that one that can't be supplied waits
 * from the start; but a solar array due for cleaning is cleaned meanwhile,
 * which uses none (see `plannedVisit`).
 */
export function findMaintenanceWait(
  state: CampaignState,
  maintenance: MaintenanceState,
): MaintenanceWait | undefined {
  if (maintenance.visit !== undefined) return undefined;
  const worn = findWorn(state, maintenance.target);
  if (
    worn?.kind === "machine" &&
    worn.machine.assignment !== undefined &&
    worn.machine.conditionPercent > 0
  ) {
    return { reason: "machine-at-work" };
  }
  const missing = missingSpareComponents(state, maintenance);
  return missing > 0 && worn !== undefined && !visitFor(worn).cleaning
    ? { reason: "missing-spare-components", missing }
    : undefined;
}

/**
 * What a Maintenance visit would do if the Robot started on it now: as
 * `visitFor` says, except that a solar array due for cleaning, but short of
 * the spare Components to restore its Condition, is only cleaned. Its
 * Condition is raised for again once the cleaning is done, and waits for
 * the spares.
 */
export function plannedVisit(
  state: CampaignState,
  maintenance: MaintenanceState,
  worn: Worn,
): MaintenanceVisit {
  const visit = visitFor(worn);
  return visit.cleaning && missingSpareComponents(state, maintenance) > 0
    ? { spareComponents: 0, cleaning: true }
    : visit;
}

/**
 * How many more spare Components a Maintenance Work Order needs than the
 * base's stock can give it, once those raised earlier, and not yet
 * started, have had theirs.
 */
function missingSpareComponents(
  state: CampaignState,
  maintenance: MaintenanceState,
): number {
  const claimedEarlier = state.maintenance
    .slice(0, state.maintenance.indexOf(maintenance))
    .filter((other) => other.visit === undefined)
    .reduce((total, other) => total + spareComponentsNeeded(state, other), 0);
  const left = Math.max(
    inStock(state, catalogue.maintenance.spareComponentId) - claimedEarlier,
    0,
  );
  return Math.max(spareComponentsNeeded(state, maintenance) - left, 0);
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
 * Components, the Condition is back to 100%, so that something Broken works
 * again, and if it cleaned a solar array, the Dust coating is gone.
 */
export function finishMaintenance(
  state: CampaignState,
  maintenance: MaintenanceState,
  worn: Worn,
): GameEvent[] {
  const { spareComponents, cleaning } = maintenance.visit ?? visitFor(worn);
  if (spareComponents > 0) {
    if (worn.kind === "structure") worn.structure.conditionPercent = 100;
    else worn.machine.conditionPercent = 100;
  }
  if (cleaning && worn.kind === "structure") {
    worn.structure.dustCoatingPercent = 0;
  }
  state.maintenance = state.maintenance.filter(
    (other) => other !== maintenance,
  );
  return [
    {
      kind: "maintenance-completed",
      atMinute: state.elapsedMinutes,
      target: subjectOf(worn),
      spareComponents,
      cleaned: cleaning,
    },
  ];
}

export function readMaintenance(state: CampaignState): MaintenanceSnapshot[] {
  return state.maintenance.flatMap((maintenance) => {
    const worn = findWorn(state, maintenance.target);
    if (worn === undefined) return [];
    const visit = maintenance.visit ?? plannedVisit(state, maintenance, worn);
    const [first] = visitSteps(visit);
    const current = currentStep(visit, maintenance.workedMinutes) ?? {
      step: first?.step ?? "cleaning",
      doneMinutes: 0,
      minutes: 0,
    };
    return [
      {
        target: subjectOf(worn),
        spareComponents: visit.spareComponents,
        cleaning: visit.cleaning,
        underWay: state.robots.some((robot) =>
          isClaimedBy(robot, maintenance.target),
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

function targetOf(worn: Worn): MaintenanceTarget {
  return worn.kind === "structure"
    ? { kind: "structure", structureId: worn.structure.id }
    : { kind: "machine", machineId: worn.machine.id };
}

function subjectOf(worn: Worn): MaintenanceSubject {
  return worn.kind === "structure"
    ? {
        kind: "structure",
        structureId: worn.structure.id,
        structureTypeId: worn.structure.structureTypeId,
      }
    : {
        kind: "machine",
        machineId: worn.machine.id,
        machineTypeId: worn.machine.machineTypeId,
      };
}

function conditionOf(worn: Worn): number {
  return worn.kind === "structure"
    ? worn.structure.conditionPercent
    : worn.machine.conditionPercent;
}

/** The spare Components a Maintenance Work Order needs as things stand. */
function spareComponentsNeeded(
  state: CampaignState,
  maintenance: MaintenanceState,
): number {
  const worn = findWorn(state, maintenance.target);
  return worn === undefined ? 0 : visitFor(worn).spareComponents;
}
