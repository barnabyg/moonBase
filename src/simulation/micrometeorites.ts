import { catalogue } from "../catalogue";
import type { CampaignState } from "./campaign";
import { MINUTES_PER_EARTH_DAY } from "./clock";
import { isBroken } from "./construction";
import type { GameEvent } from "./events";
import { damageMachine } from "./machines";
import { drawMinutes, nextFraction, type RandomState } from "./random";
import { damageRover } from "./rovers";
import { wearRobotDown } from "./self-repair";

/** The next Micrometeorite strike, as scheduled. Strikes come without warning. */
export interface MicrometeoriteState {
  /** The game-minute it strikes, counted from the start of the Campaign. */
  strikesAtMinute: number;
}

/** What a Micrometeorite struck. */
export type StrikeTarget =
  | {
      readonly kind: "structure";
      readonly structureId: string;
      readonly structureTypeId: string;
    }
  | {
      readonly kind: "machine";
      readonly machineId: string;
      readonly machineTypeId: string;
    }
  | { readonly kind: "rover"; readonly roverId: string }
  | { readonly kind: "robot"; readonly robotId: string };

/**
 * Schedules the Micrometeorite strike after the given game-minute, drawing
 * the time until it strikes from the seeded generator.
 */
export function scheduleMicrometeorite(
  random: RandomState,
  afterMinute: number,
): MicrometeoriteState {
  const { earthDaysBetween } = catalogue.micrometeorites;
  return {
    strikesAtMinute:
      afterMinute +
      drawMinutes(
        random,
        earthDaysBetween.min * MINUTES_PER_EARTH_DAY,
        earthDaysBetween.max * MINUTES_PER_EARTH_DAY,
      ),
  };
}

/**
 * Strikes as the game-minute that has just passed reaches the scheduled
 * strike, then schedules the next. The seeded generator picks one target
 * evenly among the commissioned Structures, the Machines, the Rovers and
 * the Robots, and draws the Condition it loses evenly from the data
 * catalogue's range. A Structure, Machine or Rover may be left Broken; a
 * Robot's Condition stops at its floor. Returns the strike, and the event
 * for anything it broke.
 */
export function watchMicrometeorites(state: CampaignState): GameEvent[] {
  const atMinute = state.elapsedMinutes;
  if (atMinute < state.micrometeorite.strikesAtMinute) return [];
  const targets = [
    ...state.structures.map((structure) => ({
      kind: "structure" as const,
      structure,
    })),
    ...state.machines.map((machine) => ({ kind: "machine" as const, machine })),
    ...state.rovers.map((rover) => ({ kind: "rover" as const, rover })),
    ...state.robots.map((robot) => ({ kind: "robot" as const, robot })),
  ];
  const target =
    targets[Math.floor(nextFraction(state.random) * targets.length)];
  const { min, max } = catalogue.micrometeorites.conditionLossPercent;
  const loss = min + nextFraction(state.random) * (max - min);
  state.micrometeorite = scheduleMicrometeorite(state.random, atMinute);
  if (target === undefined) return [];
  switch (target.kind) {
    case "structure": {
      const { structure } = target;
      const wasBroken = isBroken(structure);
      structure.conditionPercent = Math.max(
        structure.conditionPercent - loss,
        0,
      );
      return [
        {
          kind: "micrometeorite-strike",
          atMinute,
          target: {
            kind: "structure",
            structureId: structure.id,
            structureTypeId: structure.structureTypeId,
          },
          conditionPercent: structure.conditionPercent,
        },
        ...(!wasBroken && isBroken(structure)
          ? [
              {
                kind: "structure-broken" as const,
                atMinute,
                structureId: structure.id,
                structureTypeId: structure.structureTypeId,
              },
            ]
          : []),
      ];
    }
    case "machine": {
      const { machine } = target;
      const broken = damageMachine(state, machine, loss);
      return [
        {
          kind: "micrometeorite-strike",
          atMinute,
          target: {
            kind: "machine",
            machineId: machine.id,
            machineTypeId: machine.machineTypeId,
          },
          conditionPercent: machine.conditionPercent,
        },
        ...broken,
      ];
    }
    case "rover": {
      const { rover } = target;
      const broken = damageRover(state, rover, loss);
      return [
        {
          kind: "micrometeorite-strike",
          atMinute,
          target: { kind: "rover", roverId: rover.id },
          conditionPercent: rover.conditionPercent,
        },
        ...broken,
      ];
    }
    case "robot": {
      const { robot } = target;

      wearRobotDown(robot, loss);
      return [
        {
          kind: "micrometeorite-strike",
          atMinute,
          target: { kind: "robot", robotId: robot.id },
          conditionPercent: robot.conditionPercent,
        },
      ];
    }
  }
}
