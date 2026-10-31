import type { ResourceRef } from "../catalogue";
import type { CampaignState } from "./campaign";
import { MINUTES_PER_EARTH_DAY } from "./clock";
import { isBroken, type StructureState } from "./construction";
import type { GameEvent } from "./events";
import { kilogramsAboveReserve } from "./life-support-reserve";
import {
  addWithinLimit,
  amountOf,
  isSameResource,
  storageLimitKilograms,
  storageTankOf,
  workingTanks,
} from "./storage-limits";

/** A storage tank as it stands, for the Base panel and the model. */
export interface TankSnapshot {
  readonly resource: ResourceRef;
  /** What it adds to the base's limit, whether or not it is Broken. */
  readonly addsKilograms: number;
  /** Its share of the stock, in proportion to what it holds of the limit, up to all it can hold; none if it is Broken. */
  readonly heldKilograms: number;
  /** Whether it had no power during the latest game-minute of Night, so is losing what it holds. */
  readonly losing: boolean;
}

export function readTank(
  state: CampaignState,
  structure: StructureState,
  night: boolean,
): TankSnapshot | undefined {
  const tank = storageTankOf(structure);
  if (tank === undefined) return undefined;
  return {
    resource: tank.resource,
    addsKilograms: tank.kilograms,
    heldKilograms: isBroken(structure)
      ? 0
      : shareOf(state, tank.resource, tank.kilograms),
    losing: isLosing(structure, night),
  };
}

/**
 * The tanks with no power during the latest game-minute, given whether it was
 * Night: in Daylight they draw nothing, and so lose nothing.
 */
export function tanksWithoutPower(
  state: CampaignState,
  night: boolean,
): StructureState[] {
  return workingTanks(state).filter((tank) => isLosing(tank, night));
}

function isLosing(structure: StructureState, night: boolean): boolean {
  return night && !isBroken(structure) && !structure.powered;
}

/**
 * Takes what the tanks have lost out of the base's stocks, once the game-minute's
 * wear, work and power are done, given the tanks that were working as it started
 * and the ids of those that were then already without power. Every tank holds its
 * share of a stock, so nothing needs saving to know what one loses.
 *
 * A Broken tank's share is lost. One the Robot has started taking apart loses only
 * what no longer fits anywhere, as the rest can be moved to the tanks left. One
 * with no power at Night loses a little of its share. A stock already over its
 * limit before the tank went keeps the excess, as such a stock always does, and
 * none of this takes a life support stock below the Mission Director's reserve.
 * Nobody depends on a bulk resource, so nothing keeps a reserve of one.
 */
export function watchTanks(
  state: CampaignState,
  workingBefore: readonly StructureState[],
  withoutPowerBefore: ReadonlySet<string>,
  night: boolean,
): GameEvent[] {
  const events: GameEvent[] = [];
  const gone = workingBefore.filter(
    (tank) => isBroken(tank) || !state.structures.includes(tank),
  );
  // One at a time, each from the limit as it stood with those still to go.
  let stillToGo = gone;
  for (const structure of gone) {
    const tank = storageTankOf(structure);
    const limit = tank && storageLimitKilograms(state, tank.resource);
    if (tank === undefined || limit === undefined) continue;
    const dismantled = !state.structures.includes(structure);
    const stock = amountOf(state, tank.resource);
    const limitBefore =
      limit +
      stillToGo.reduce((sum, other) => {
        const theirs = storageTankOf(other);
        return theirs !== undefined &&
          isSameResource(theirs.resource, tank.resource)
          ? sum + theirs.kilograms
          : sum;
      }, 0);
    stillToGo = stillToGo.filter((other) => other !== structure);
    const kilograms = lose(
      state,
      tank.resource,
      dismantled
        ? Math.min(Math.max(stock - limit, 0), tank.kilograms)
        : Math.min((stock * tank.kilograms) / limitBefore, tank.kilograms),
    );
    if (kilograms > 0) {
      events.push({
        kind: "storage-tank-lost",
        atMinute: state.elapsedMinutes,
        structureTypeId: structure.structureTypeId,
        resource: tank.resource,
        cause: dismantled ? "dismantled" : "broken",
        kilograms,
      });
    }
  }
  const withoutPower = tanksWithoutPower(state, night);
  for (const structure of withoutPower) {
    const tank = storageTankOf(structure);
    if (tank === undefined) continue;
    lose(
      state,
      tank.resource,
      (shareOf(state, tank.resource, tank.kilograms) *
        tank.shareLostPerEarthDayWithoutPower) /
        MINUTES_PER_EARTH_DAY,
    );
  }
  for (const tank of withoutPower) {
    if (withoutPowerBefore.has(tank.id)) continue;
    events.push({
      kind: "storage-tank-without-power",
      atMinute: state.elapsedMinutes,
      structureId: tank.id,
      structureTypeId: tank.structureTypeId,
    });
  }
  return events;
}

/**
 * A tank's share of a stock: as much of it as the tank holds of the limit, and no
 * more than it can hold, as what a stock has over its limit is held elsewhere.
 */
function shareOf(
  state: CampaignState,
  resource: ResourceRef,
  kilograms: number,
): number {
  const limit = storageLimitKilograms(state, resource);
  return limit === undefined || limit === 0
    ? 0
    : Math.min((amountOf(state, resource) * kilograms) / limit, kilograms);
}

/** Takes up to so many kilograms out of a stock, as far as the reserve, and says how many went. */
function lose(
  state: CampaignState,
  resource: ResourceRef,
  kilograms: number,
): number {
  const lost = Math.min(kilograms, mayLose(state, resource));
  if (lost <= 0) return 0;
  addWithinLimit(state, resource, -lost);
  return lost;
}

function mayLose(state: CampaignState, resource: ResourceRef): number {
  return resource.kind === "bulk-resource"
    ? amountOf(state, resource)
    : kilogramsAboveReserve(state, resource.stockId);
}
