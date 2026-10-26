import { catalogue, type GroundPosition } from "../catalogue";
import type { CampaignState } from "./campaign";
import type { GameEvent } from "./events";
import { isRoverOnExpedition } from "./expeditions";

import {
  damageMachine,
  findMachineType,
  isMachineBroken,
  machinePerformance,
  type MachineState,
} from "./machines";
import {
  damageRover,
  isRoverBroken,
  roverPerformance,
  type RoverState,
} from "./rovers";

/**
 * Something a Robot drives: a Machine, or a Rover. Both wear down, feel
 * the cold of Night unless they are plugged in, are parked where they can
 * plug in, and are maintained with spare Components, in the same way.
 */
export type Driven =
  | { readonly kind: "machine"; readonly machine: MachineState }
  | { readonly kind: "rover"; readonly rover: RoverState };

/** Which Machine or Rover something is for. */
export type DrivenTarget =
  | { readonly kind: "machine"; readonly machineId: string }
  | { readonly kind: "rover"; readonly roverId: string };

/** Which Machine or Rover something is for, with a Machine's type, for the interface. */
export type DrivenSubject =
  | {
      readonly kind: "machine";
      readonly machineId: string;
      readonly machineTypeId: string;
    }
  | { readonly kind: "rover"; readonly roverId: string };

/** The numbers the data catalogue gives a Machine's type or the Rover, as far as they share them. */
export interface DrivenSpec {
  readonly footprintRadiusMetres: number;
  readonly drivingSpeedMetresPerHour: number;
  readonly dustWearPercentPerDrivingHour: number;
  readonly heaterKilowatts: number;
  readonly coldWearPercentPerNightHour: number;
}

const noSpec: DrivenSpec = {
  footprintRadiusMetres: 0,
  drivingSpeedMetresPerHour: 0,
  dustWearPercentPerDrivingHour: 0,
  heaterKilowatts: 0,
  coldWearPercentPerNightHour: 0,
};

/** Whether something is a Rover out on an Expedition, away from every plug. */
export function isOutOnExpedition(
  state: CampaignState,
  driven: Driven,
): boolean {
  return driven.kind === "rover" && isRoverOnExpedition(state, driven.rover.id);
}

/** Every Machine, then every Rover. */
export function everyDriven(state: CampaignState): Driven[] {
  return [
    ...state.machines.map((machine) => ({ kind: "machine" as const, machine })),
    ...state.rovers.map((rover) => ({ kind: "rover" as const, rover })),
  ];
}

export function findDriven(
  state: CampaignState,
  target: DrivenTarget,
): Driven | undefined {
  if (target.kind === "machine") {
    const machine = state.machines.find(
      (candidate) => candidate.id === target.machineId,
    );
    return machine === undefined ? undefined : { kind: "machine", machine };
  }
  const rover = state.rovers.find(
    (candidate) => candidate.id === target.roverId,
  );
  return rover === undefined ? undefined : { kind: "rover", rover };
}

/** The Machine's or Rover's own state, as far as they share it. */
export function bodyOf(driven: Driven): MachineState | RoverState {
  return driven.kind === "machine" ? driven.machine : driven.rover;
}

export function drivenTarget(driven: Driven): DrivenTarget {
  return driven.kind === "machine"
    ? { kind: "machine", machineId: driven.machine.id }
    : { kind: "rover", roverId: driven.rover.id };
}

export function drivenSubject(driven: Driven): DrivenSubject {
  return driven.kind === "machine"
    ? {
        kind: "machine",
        machineId: driven.machine.id,
        machineTypeId: driven.machine.machineTypeId,
      }
    : { kind: "rover", roverId: driven.rover.id };
}

export function isSameDriven(a: DrivenTarget, b: DrivenTarget): boolean {
  return a.kind === "machine"
    ? b.kind === "machine" && a.machineId === b.machineId
    : b.kind === "rover" && a.roverId === b.roverId;
}

export function drivenSpec(driven: Driven): DrivenSpec {
  return driven.kind === "machine"
    ? (findMachineType(driven.machine.machineTypeId) ?? noSpec)
    : catalogue.rover;
}

export function drivenPosition(driven: Driven): GroundPosition {
  return bodyOf(driven).position;
}

export function isDrivenBroken(driven: Driven): boolean {
  return driven.kind === "machine"
    ? isMachineBroken(driven.machine)
    : isRoverBroken(driven.rover);
}

/** How fast it drives, and a Machine works, as its Condition falls, from 1 down to 0 once it is Broken. */
export function drivenPerformance(driven: Driven): number {
  return driven.kind === "machine"
    ? machinePerformance(driven.machine)
    : roverPerformance(driven.rover);
}

/**
 * Takes Condition off a Machine or Rover, in percentage points (see
 * `damageMachine` and `damageRover`). Returns the event if it broke.
 */
export function damageDriven(
  state: CampaignState,
  driven: Driven,
  percent: number,
): GameEvent[] {
  return driven.kind === "machine"
    ? damageMachine(state, driven.machine, percent)
    : damageRover(state, driven.rover, percent);
}

/**
 * Wears a Machine or Rover down for a game-minute, at a rate in percentage
 * points for each game-hour. Returns the event if it broke.
 */
export function wearDriven(
  state: CampaignState,
  driven: Driven,
  percentPerHour: number,
): GameEvent[] {
  return percentPerHour === 0
    ? []
    : damageDriven(state, driven, percentPerHour / 60);
}

/**
 * Wears down by the cold every Machine and Rover that went without power at
 * Night during the latest game-minute it was supplied power for, at the
 * data catalogue's rate for it, and returns an event for each one it left
 * Broken. A Rover out on an Expedition is kept warm as it is driven. Like
 * Dust wear on Structures, it comes first in a game-minute.
 */
export function chillDriven(state: CampaignState, night: boolean): GameEvent[] {
  if (!night) return [];
  return everyDriven(state).flatMap((driven) =>
    bodyOf(driven).powered || isOutOnExpedition(state, driven)
      ? []
      : wearDriven(
          state,
          driven,
          drivenSpec(driven).coldWearPercentPerNightHour,
        ),
  );
}
