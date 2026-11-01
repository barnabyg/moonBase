import { catalogue, type LifeSupportStock } from "../catalogue";
import type { CampaignState } from "./campaign";
import { MINUTES_PER_EARTH_DAY } from "./clock";
import type { GameEvent } from "./events";
import { reserveKilograms } from "./life-support-reserve";
import { fellToWarningLevel, killMissionDirector } from "./mission-director";
import { minutesUntilEmptyThroughLunations } from "./lunation";
import {
  consumptionPerHour,
  isHeldFull,
  isMadeByPlantsWithInputs,
  kilogramsToCountOn,
  productionPerHour,
  waitingForSpacePerHour,
} from "./plants";
import { recordLifeSupport } from "./self-sufficiency";
import { storageLimitKilograms } from "./storage-limits";

/**
 * How far short of a whole game-minute of use a stock may be and still count
 * as lasting it, so that rounding in the stock never makes it last a
 * game-minute more or less than forecast.
 */
const MINUTE_TOLERANCE = 1e-6;

export interface LifeSupportState {
  stockId: string;
  kilograms: number;
}

export interface LifeSupportSnapshot {
  readonly stockId: string;
  readonly kilograms: number;
  /** How many kilograms the base can hold (see `storageLimitKilograms`). */
  readonly limitKilograms: number;
  /**
   * Whether it is being used up: only while the Mission Director lives in a
   * Habitat, and is alive.
   */
  readonly inUse: boolean;
}

export interface LifeSupportForecast {
  readonly stockId: string;
  /**
   * How fast it is changing now: what the base's Plants are making, less
   * what they are using and what the Mission Director uses. Positive while
   * it is rising, and none while it is held full.
   */
  readonly kilogramsPerEarthDay: number;
  /**
   * Game-minutes until it runs out, or undefined if it doesn't within the
   * forecast's look-ahead (see `minutesUntilEmpty`), or while it is held full.
   */
  readonly minutesUntilEmpty: number | undefined;
  /**
   * Whether the Plants that make it are holding it full, topping it up as it
   * is used, rather than its rising or running out (see `isHeldFull`).
   */
  readonly holdingFull: boolean;
  /**
   * Game-minutes until what the Plants take brings it down to the Mission
   * Director's reserve, when they stop, Night included; undefined while none is
   * taking any, or won't within the forecast's look-ahead.
   */
  readonly minutesUntilReserve: number | undefined;
}

export function startingLifeSupport(): LifeSupportState[] {
  return catalogue.lifeSupportStocks.map((stock) => ({
    stockId: stock.id,
    kilograms: stock.startingKilograms,
  }));
}

export function readLifeSupport(state: CampaignState): LifeSupportSnapshot[] {
  const inUse = isInUse(state);
  return state.lifeSupport.map((stock) => ({
    stockId: stock.stockId,
    kilograms: stock.kilograms,
    limitKilograms: storageLimitKilograms(state, resourceOf(stock)) ?? Infinity,
    inUse,
  }));
}

export function forecastLifeSupport(
  state: CampaignState,
): LifeSupportForecast[] {
  return state.lifeSupport.map((stock) => {
    // Over the limit, as an older save may be, nothing tops it up: it falls.
    if (
      isHeldFull(state, resourceOf(stock)) &&
      stock.kilograms <=
        (storageLimitKilograms(state, resourceOf(stock)) ?? Infinity)
    ) {
      return {
        stockId: stock.stockId,
        kilogramsPerEarthDay: 0,
        minutesUntilEmpty: undefined,
        holdingFull: true,
        minutesUntilReserve: undefined,
      };
    }
    const minutes = minutesUntilEmpty(state, stock);
    const toReserve = minutesUntilReserve(state, stock);
    return {
      stockId: stock.stockId,
      kilogramsPerEarthDay: netPerMinute(state, stock) * MINUTES_PER_EARTH_DAY,
      minutesUntilEmpty: Number.isFinite(minutes) ? minutes : undefined,
      holdingFull: false,
      minutesUntilReserve: Number.isFinite(toReserve) ? toReserve : undefined,
    };
  });
}

/**
 * Uses up a game-minute of every life support stock while the Mission
 * Director lives in a Habitat, after the base's Plants have made their
 * game-minute's worth. A warning comes as the time until a stock runs out,
 * as forecast (see `minutesUntilEmpty`), reaches a warning level: while the
 * Plants make as much as is used, Night included, none comes. If one runs out, the
 * Mission Director dies at once, which ends the Campaign; the death is then
 * the only event, as any warning that minute would come too late to matter.
 * What Plants could have made but for a full store counts towards
 * self-sufficiency, up to what is used, so that being full can't lose it.
 */
export function useLifeSupport(state: CampaignState): GameEvent[] {
  if (!isInUse(state)) return [];
  const warnings: GameEvent[] = [];
  let ranOut: LifeSupportState | undefined;
  for (const stock of state.lifeSupport) {
    const type = findStock(stock.stockId);
    const perMinute = netOfPlantUsePerMinute(state, stock);
    const before = minutesUntilEmpty(state, stock);
    const used = Math.min(usePerMinute(type), stock.kilograms);
    stock.kilograms -= used;
    recordLifeSupport(state, stock.stockId, {
      used,
      produced: Math.min(
        used,
        waitingForSpacePerHour(state, resourceOf(stock)) / 60,
      ),
    });
    const after = minutesUntilEmpty(state, stock);
    if (stock.kilograms === 0 || minutesLeft(stock, perMinute) === 0) {
      stock.kilograms = 0;
      ranOut ??= stock;
    } else if (
      fellToWarningLevel(
        type.warningEarthDaysLeft.map(
          (earthDays) => earthDays * MINUTES_PER_EARTH_DAY,
        ),
        before,
        after,
      )
    ) {
      warnings.push({
        kind: "life-support-warning",
        atMinute: state.elapsedMinutes,
        stockId: stock.stockId,
        minutesUntilEmpty: after,
      });
    }
  }
  if (ranOut === undefined) return warnings;
  return killMissionDirector(state, {
    kind: "ran-out",
    stockId: ranOut.stockId,
  });
}

/**
 * Life support is used up only while the Mission Director lives in a Habitat,
 * and only while they are alive.
 */
function isInUse(state: CampaignState): boolean {
  return (
    state.missionDirector.residence === "habitat" && state.ended === undefined
  );
}

/**
 * How many kilograms a stock is changing by in a game-minute now, apart from
 * what the Plants take: what they made in the latest one, less what the
 * Mission Director uses. Only this can run the stock out, as Plants stop at the
 * reserve.
 */
function netOfPlantUsePerMinute(
  state: CampaignState,
  stock: LifeSupportState,
): number {
  const made = productionPerHour(state, resourceOf(stock)) / 60;
  return made - (isInUse(state) ? usePerMinute(findStock(stock.stockId)) : 0);
}

/**
 * How many kilograms a stock is changing by in a game-minute now: what the
 * base's Plants made in the latest one, less what they used and what the
 * Mission Director uses.
 */
function netPerMinute(state: CampaignState, stock: LifeSupportState): number {
  return netOfPlantUsePerMinute(state, stock) - plantUsePerMinute(state, stock);
}

function plantUsePerMinute(
  state: CampaignState,
  stock: LifeSupportState,
): number {
  return consumptionPerHour(state, resourceOf(stock)) / 60;
}

function resourceOf(stock: LifeSupportState) {
  return { kind: "life-support" as const, stockId: stock.stockId };
}

/**
 * The whole game-minutes until a stock runs out, or Infinity if it doesn't
 * within the forecast's look-ahead. It starts from what the base can count on
 * of the stock as the Plants' batches go, which is never more than it will have
 * (see `kilogramsToCountOn`). While Plants are taking from it, they go on
 * taking until they reach the reserve, Night included as they may have the
 * power, and the Mission Director has that reserve to themselves after that.
 */
function minutesUntilEmpty(
  state: CampaignState,
  stock: LifeSupportState,
): number {
  const kilograms = kilogramsToCountOn(state, resourceOf(stock));
  const plantUse = plantUsePerMinute(state, stock);
  const alone = netOfPlantUsePerMinute(state, stock);
  const used = usePerMinute(findStock(stock.stockId));
  if (plantUse === 0) {
    return minutesFalling(state, stock, 0, kilograms, alone, used);
  }
  const reserve = reserveKilograms(stock.stockId);
  const toReserve = minutesUntilReserve(state, stock);
  if (!Number.isFinite(toReserve)) return Infinity;
  return (
    toReserve +
    minutesFalling(
      state,
      stock,
      toReserve,
      Math.min(kilograms, reserve),
      alone,
      used,
    )
  );
}

/**
 * The whole game-minutes until what the Plants take brings a stock down to the
 * Mission Director's reserve, through a Night too, or Infinity if it won't within
 * the forecast's look-ahead, or none is taking any.
 */
function minutesUntilReserve(
  state: CampaignState,
  stock: LifeSupportState,
): number {
  const plantUse = plantUsePerMinute(state, stock);
  if (plantUse === 0) return Infinity;
  const kilograms = kilogramsToCountOn(state, resourceOf(stock));
  const reserve = reserveKilograms(stock.stockId);
  return kilograms <= reserve
    ? 0
    : minutesFalling(
        state,
        stock,
        0,
        kilograms - reserve,
        netOfPlantUsePerMinute(state, stock) - plantUse,
        usePerMinute(findStock(stock.stockId)) + plantUse,
      );
}

/**
 * The whole game-minutes until an amount of a stock is gone, from so many
 * game-minutes from now, or Infinity if it isn't within the forecast's
 * look-ahead. With no Plant making the stock, it falls at its current rate. With
 * one, it follows the Lunation ahead, counting on no Plant making it at Night
 * (see `minutesUntilEmptyThroughLunations`). One short of its inputs is no Plant
 * making it, by Night as by day, so that the warnings come while there is time to
 * send for more, rather than only as Daylight shows it making none.
 */
function minutesFalling(
  state: CampaignState,
  stock: LifeSupportState,
  fromMinutes: number,
  kilograms: number,
  perMinute: number,
  usedPerMinute: number,
): number {
  const counted = { ...stock, kilograms };
  if (!isInUse(state) || !isMadeByPlantsWithInputs(state, resourceOf(stock))) {
    return minutesLeft(counted, perMinute);
  }
  // Too little to last until the batches running now make more, it falls
  // at what the Mission Director uses until it runs out, or they finish.
  if (kilograms <= 0) return minutesLeft(stock, -usedPerMinute);
  return minutesUntilEmptyThroughLunations(
    state.elapsedMinutes + fromMinutes,
    kilograms,
    perMinute,
    usedPerMinute,
    (amount, rate) => minutesLeft({ ...stock, kilograms: amount }, rate),
  );
}

/**
 * The whole game-minutes left in a stock at a rate of change, or Infinity
 * while it isn't falling.
 */
function minutesLeft(stock: LifeSupportState, perMinute: number): number {
  if (perMinute >= 0) return Infinity;
  const minutes = stock.kilograms / -perMinute - MINUTE_TOLERANCE;
  return Math.max(Math.ceil(minutes), 0);
}

function usePerMinute(stock: LifeSupportStock): number {
  return stock.usePerEarthDayKilograms / MINUTES_PER_EARTH_DAY;
}

function findStock(stockId: string): LifeSupportStock {
  const stock = catalogue.lifeSupportStocks.find(
    (candidate) => candidate.id === stockId,
  );
  if (stock === undefined) {
    throw new RangeError(`There is no life support stock called "${stockId}".`);
  }
  return stock;
}
