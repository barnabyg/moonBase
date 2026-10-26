import { catalogue, type GroundPosition, type MachineType } from "../catalogue";
import type { CampaignState } from "./campaign";
import { performanceAt } from "./condition";
import {
  distance,
  stageAfter,
  stageMinutes,
  type MachineStage,
} from "./construction";
import type { GameEvent } from "./events";
import { isUnderMaintenance } from "./maintenance";
import { isBeingParked } from "./parking";

/** What a Machine did during the latest game-minute, and for which Construction. */
export type MachineActivity =
  | { readonly kind: "idle" }
  | {
      /**
       * "being-positioned": a Robot is driving it into position or activating
       * it. "working": it is carrying out its work by itself.
       */
      readonly kind: "being-positioned" | "working";
      readonly constructionId: string;
    }
  | {
      /** A Robot is driving it to park beside a powered Structure, to plug in. */
      readonly kind: "being-parked";
      readonly structureId: string;
    };

/** A Machine's assignment to one stage of a Construction, from being driven there until its work there is done. */
export interface MachineAssignment {
  constructionId: string;
  /** The stage of the Construction it carries out. */
  stage: MachineStage;
  /** Where the Machine stands to work on the site. */
  destination: GroundPosition;
  /** The Robot's working time spent activating it so far. */
  activationMinutes: number;
  /** Whether it has been activated and is carrying out its process. */
  working: boolean;
}

export interface MachineState {
  id: string;
  machineTypeId: string;
  position: GroundPosition;
  activity: MachineActivity;
  assignment: MachineAssignment | undefined;
  /** How intact it is, from 100% down to 0%, when it is Broken and stops working. */
  conditionPercent: number;
  /**
   * Whether it had power during the latest game-minute: it was plugged in
   * and, at Night, its network supplied its heater.
   */
  powered: boolean;
}

/** Whether a Machine is Broken, its Condition worn down to 0%: it does nothing until it is repaired. */
export function isMachineBroken(
  machine: Pick<MachineState, "conditionPercent">,
): boolean {
  return machine.conditionPercent <= 0;
}

/**
 * How fast a Machine works and drives as its Condition falls, from 1 down
 * to 0 once it is Broken, along the data catalogue's curve.
 */
export function machinePerformance(
  machine: Pick<MachineState, "conditionPercent">,
): number {
  return performanceAt(catalogue.machinePerformance, machine.conditionPercent);
}

/**
 * Wears a Machine down by Dust for a game-minute of work or driving, at a
 * rate in percentage points for each game-hour. At 0% it is Broken: it
 * stops where it stands and gives up the stage of Construction it was
 * assigned, whose work so far stays done. Returns the event if it broke.
 */
export function wearMachine(
  state: CampaignState,
  machine: MachineState,
  percentPerHour: number,
): GameEvent[] {
  if (isMachineBroken(machine) || percentPerHour === 0) return [];
  machine.conditionPercent = Math.max(
    machine.conditionPercent - percentPerHour / 60,
    0,
  );
  if (!isMachineBroken(machine)) return [];
  machine.assignment = undefined;
  machine.activity = { kind: "idle" };
  return [
    {
      kind: "machine-broken",
      atMinute: state.elapsedMinutes,
      machineId: machine.id,
      machineTypeId: machine.machineTypeId,
    },
  ];
}

export function findMachineType(id: string): MachineType | undefined {
  return catalogue.machineTypes.find((type) => type.id === id);
}

export function machineFootprintRadius(machineTypeId: string): number {
  return findMachineType(machineTypeId)?.footprintRadiusMetres ?? 0;
}

/** The Machine whose assignment is on the given Construction, if any. */
export function machineOn(
  state: CampaignState,
  constructionId: string,
): MachineState | undefined {
  return state.machines.find(
    (machine) => machine.assignment?.constructionId === constructionId,
  );
}

/**
 * The nearest Machine of a type that is free to be assigned a stage of
 * Construction: it has no assignment, isn't Broken and isn't undergoing
 * Maintenance.
 */
export function nearestFreeMachine(
  state: CampaignState,
  machineTypeId: string,
  near: GroundPosition,
): MachineState | undefined {
  const free = state.machines.filter(
    (machine) =>
      machine.assignment === undefined &&
      machine.machineTypeId === machineTypeId &&
      !isMachineBroken(machine) &&
      !isUnderMaintenance(state, machine.id) &&
      !isBeingParked(state, machine.id),
  );
  // The earlier Machine wins a tie, so the choice is always the same.
  return free.reduce<MachineState | undefined>(
    (best, machine) =>
      best === undefined ||
      distance(machine.position, near) < distance(best.position, near)
        ? machine
        : best,
    undefined,
  );
}

/**
 * Wears down by the cold every Machine that went without power at Night
 * during the latest game-minute it was supplied power for, at its type's
 * rate in the data catalogue, and returns an event for each one it left
 * Broken. Like Dust wear on Structures, it comes first in a game-minute.
 */
export function chillMachines(
  state: CampaignState,
  night: boolean,
): GameEvent[] {
  if (!night) return [];
  return state.machines.flatMap((machine) =>
    machine.powered
      ? []
      : wearMachine(
          state,
          machine,
          findMachineType(machine.machineTypeId)?.coldWearPercentPerNightHour ??
            0,
        ),
  );
}

/**
 * Lets every activated Machine do one game-minute of its work by itself on
 * the stage of Construction it was assigned, such as grading the ground for
 * Site Preparation, as fast as its Condition allows, and wears it down by
 * Dust as it works. When the stage is done it stays where it is, idle,
 * until it is needed again. Returns an event for each Machine that broke.
 */
export function workMachines(state: CampaignState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const machine of state.machines) {
    const { assignment } = machine;
    if (assignment === undefined) {
      machine.activity = { kind: "idle" };
      continue;
    }
    if (!assignment.working) {
      machine.activity = {
        kind: "being-positioned",
        constructionId: assignment.constructionId,
      };
      continue;
    }
    const construction = state.constructions.find(
      (candidate) => candidate.id === assignment.constructionId,
    );
    if (construction?.stage !== assignment.stage) {
      machine.assignment = undefined;
      machine.activity = { kind: "idle" };
      continue;
    }
    machine.activity = { kind: "working", constructionId: construction.id };
    construction.workedMinutes += machinePerformance(machine);
    if (construction.workedMinutes >= stageMinutes(construction)) {
      construction.stage = stageAfter(construction, assignment.stage);
      construction.workedMinutes = 0;
      machine.assignment = undefined;
    }
    events.push(
      ...wearMachine(
        state,
        machine,
        findMachineType(machine.machineTypeId)?.dustWearPercentPerWorkingHour ??
          0,
      ),
    );
  }
  return events;
}
