import { catalogue, type GroundPosition, type MachineType } from "../catalogue";
import type { CampaignState } from "./campaign";
import { distance, stageMinutes } from "./construction";

/** What a Machine did during the latest game-minute, and for which Construction. */
export type MachineActivity =
  | { readonly kind: "idle" }
  | {
      /** A Robot is driving it into position or activating it. */
      readonly kind: "being-positioned" | "working";
      readonly constructionId: string;
    };

/** A Machine's assignment to one Construction, from being driven there until its work there is done. */
export interface MachineAssignment {
  constructionId: string;
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
}

export function findMachineType(id: string): MachineType | undefined {
  return catalogue.machineTypes.find((type) => type.id === id);
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

/** The nearest Machine of a type that has no assignment. */
export function nearestFreeMachine(
  state: CampaignState,
  machineTypeId: string,
  near: GroundPosition,
): MachineState | undefined {
  const free = state.machines.filter(
    (machine) =>
      machine.assignment === undefined &&
      machine.machineTypeId === machineTypeId,
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
 * Lets every activated Machine do one game-minute of its work by itself:
 * grading its Construction's ground. When Site Preparation is done it stays
 * where it is, idle, until it is needed again.
 */
export function workMachines(state: CampaignState): void {
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
    if (construction?.stage !== "site-preparation") {
      machine.assignment = undefined;
      machine.activity = { kind: "idle" };
      continue;
    }
    machine.activity = { kind: "working", constructionId: construction.id };
    construction.workedMinutes += 1;
    if (construction.workedMinutes >= stageMinutes(construction)) {
      construction.stage = "component-delivery";
      construction.workedMinutes = 0;
      machine.assignment = undefined;
    }
  }
}
