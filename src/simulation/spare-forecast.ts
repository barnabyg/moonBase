import { catalogue } from "../catalogue";
import type { CampaignState } from "./campaign";
import { MINUTES_PER_EARTH_DAY } from "./clock";
import { isOperating } from "./condition";
import { isAway } from "./expeditions";

import { findStructureType } from "./construction";
import type { GameEvent } from "./events";
import { readLunation } from "./lunation";
import { findMachineType, isMachineBroken } from "./machines";
import { isRoverBroken } from "./rovers";
import { findWorn, spareComponentsFor, visitFor } from "./maintenance";
import { inStock } from "./stockpile";

/** How long the base's stock of spare Components will last, as things stand. */
export interface SpareComponentsForecast {
  /** How many spare Components the base's stock holds. */
  readonly inStock: number;
  /**
   * How many of them Maintenance already raised, and the Robot's repair of
   * itself, will take, until they are taken.
   */
  readonly forPendingRepairs: number;
  /**
   * How many spare Components an Earth Day of wear at the current rate
   * calls for, at the Maintenance rate: Dust on what is operating now, the
   * cold on Machines and Rovers unpowered at Night, the Robot's wear, and
   * the average damage Micrometeorites do.
   */
  readonly perEarthDay: number;
  /**
   * Game-minutes until the stock runs out at that rate, once the pending
   * repairs have taken theirs; undefined while nothing is wearing down.
   */
  readonly minutesUntilEmpty: number | undefined;
}

/** Says how long the base's stock of spare Components will last, as things stand. */
export function forecastSpareComponents(
  state: CampaignState,
): SpareComponentsForecast {
  const stock = inStock(state, catalogue.maintenance.spareComponentId);
  const pending =
    state.maintenance
      .filter((maintenance) => maintenance.visit === undefined)
      .reduce((total, maintenance) => {
        const worn = findWorn(state, maintenance.target);
        return (
          total + (worn === undefined ? 0 : visitFor(worn).spareComponents)
        );
      }, 0) +
    state.robots
      .filter(
        (robot) =>
          robot.selfRepair !== undefined &&
          robot.selfRepair.spareComponents === undefined,
      )
      .reduce((total, robot) => total + spareComponentsFor(robot), 0);
  const perMinute =
    wearPercentPerHour(state) /
    60 /
    catalogue.maintenance.conditionPercentPerSpareComponent;
  const left = Math.max(stock - pending, 0);
  return {
    inStock: stock,
    forPendingRepairs: pending,
    perEarthDay: perMinute * MINUTES_PER_EARTH_DAY,
    minutesUntilEmpty:
      perMinute === 0 ? undefined : Math.floor(left / perMinute),
  };
}

/**
 * Gives a warning as the time until the base's spare Components run out
 * falls to each of the data catalogue's warning levels. The rate of wear
 * changes from one game-minute to the next as the Robot and the Machines
 * start and stop work, so each level is given only once, until spare
 * Components arrive in the base's stock, as when a Launch brings more, or
 * the forecast is back above twice the highest level. `before` is the
 * forecast as the game-minute started.
 */
export function watchSpareComponents(
  state: CampaignState,
  before: SpareComponentsForecast,
): GameEvent[] {
  const forecast = forecastSpareComponents(state);
  const after = forecast.minutesUntilEmpty ?? Infinity;
  const levels = catalogue.spareComponentWarningEarthDaysLeft.map(
    (earthDays) => earthDays * MINUTES_PER_EARTH_DAY,
  );
  if (forecast.inStock > before.inStock || after > 2 * Math.max(...levels)) {
    state.spareComponentsWarnedMinutes = undefined;
  }
  const warned = state.spareComponentsWarnedMinutes ?? Infinity;
  const reached = levels.filter(
    (level) =>
      (before.minutesUntilEmpty ?? Infinity) > level &&
      after <= level &&
      level < warned,
  );
  if (reached.length === 0) return [];
  state.spareComponentsWarnedMinutes = Math.min(...reached);
  return [
    {
      kind: "spare-components-warning",
      atMinute: state.elapsedMinutes,
      inStock: forecast.inStock,
      minutesUntilEmpty: after,
    },
  ];
}

/**
 * How fast everything with a Condition is wearing down now, in percentage
 * points an hour, all added together: Dust on the Structures operating,
 * the Machines working or being driven, the Rovers being driven and the
 * Robots at work, the cold on Machines and Rovers unpowered at Night, and
 * the average damage of Micrometeorites.
 */
function wearPercentPerHour(state: CampaignState): number {
  const structures = state.structures
    .filter(isOperating)
    .reduce(
      (sum, structure) =>
        sum +
        (findStructureType(structure.structureTypeId)?.dustWearPercentPerHour ??
          0),
      0,
    );
  const night =
    readLunation(state.elapsedMinutes, catalogue.lunation).part === "night";
  const machines = state.machines
    .filter((machine) => !isMachineBroken(machine))
    .reduce((sum, machine) => {
      const type = findMachineType(machine.machineTypeId);
      const driven = state.robots.some(
        (robot) =>
          robot.activity.kind === "driving-machine" &&
          robot.activity.machineId === machine.id,
      );
      return (
        sum +
        (machine.activity.kind === "working" ||
        machine.activity.kind === "digging"
          ? (type?.dustWearPercentPerWorkingHour ?? 0)
          : 0) +
        (driven ? (type?.dustWearPercentPerDrivingHour ?? 0) : 0) +
        (night && !machine.powered
          ? (type?.coldWearPercentPerNightHour ?? 0)
          : 0)
      );
    }, 0);
  const { rover: roverType } = catalogue;
  const rovers = state.rovers
    .filter((rover) => !isRoverBroken(rover))
    .reduce((sum, rover) => {
      const driven =
        isAway(state, { roverId: rover.id }) ||
        state.robots.some(
          (robot) =>
            robot.activity.kind === "driving-rover" &&
            robot.activity.roverId === rover.id,
        );
      return (
        sum +
        (driven ? roverType.dustWearPercentPerDrivingHour : 0) +
        (night && !rover.powered ? roverType.coldWearPercentPerNightHour : 0)
      );
    }, 0);
  const robots = state.robots.filter(
    (robot) =>
      robot.activity.kind !== "idle" &&
      robot.activity.kind !== "repairing-itself",
  ).length;
  const { earthDaysBetween, conditionLossPercent } = catalogue.micrometeorites;
  const strikes =
    (conditionLossPercent.min + conditionLossPercent.max) /
    2 /
    (((earthDaysBetween.min + earthDaysBetween.max) / 2) * 24);
  return (
    structures +
    machines +
    rovers +
    robots * catalogue.robot.dustWearPercentPerHour +
    strikes
  );
}
