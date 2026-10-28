import { catalogue, type LifeSupportStock } from "../catalogue";
import type { CampaignState } from "./campaign";
import { MINUTES_PER_EARTH_DAY } from "./clock";
import type { GameEvent } from "./events";
import { fellToWarningLevel, killMissionDirector } from "./mission-director";
import { lunationMinutes, partsAhead, readLunation } from "./lunation";
import {
  isMadeByPlants,
  kilogramsToCountOn,
  productionPerHour,
} from "./plants";
import { recordLifeSupport } from "./self-sufficiency";

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
   * what the Mission Director uses. Positive while it is rising.
   */
  readonly kilogramsPerEarthDay: number;
  /**
   * Game-minutes until it runs out, or undefined if it doesn't within the
   * forecast's look-ahead (see `minutesUntilEmpty`).
   */
  readonly minutesUntilEmpty: number | undefined;
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
    inUse,
  }));
}

export function forecastLifeSupport(
  state: CampaignState,
): LifeSupportForecast[] {
  return state.lifeSupport.map((stock) => {
    const minutes = minutesUntilEmpty(state, stock);
    return {
      stockId: stock.stockId,
      kilogramsPerEarthDay: netPerMinute(state, stock) * MINUTES_PER_EARTH_DAY,
      minutesUntilEmpty: Number.isFinite(minutes) ? minutes : undefined,
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
 */
export function useLifeSupport(state: CampaignState): GameEvent[] {
  if (!isInUse(state)) return [];
  const warnings: GameEvent[] = [];
  let ranOut: LifeSupportState | undefined;
  for (const stock of state.lifeSupport) {
    const type = findStock(stock.stockId);
    const perMinute = netPerMinute(state, stock);
    const before = minutesUntilEmpty(state, stock);
    const used = Math.min(usePerMinute(type), stock.kilograms);
    stock.kilograms -= used;
    recordLifeSupport(state, stock.stockId, { used });
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
 * How many kilograms a stock is changing by in a game-minute now: what the
 * base's Plants made in the latest one, less what the Mission Director uses.
 */
function netPerMinute(state: CampaignState, stock: LifeSupportState): number {
  const made =
    productionPerHour(state, {
      kind: "life-support",
      stockId: stock.stockId,
    }) / 60;
  return made - (isInUse(state) ? usePerMinute(findStock(stock.stockId)) : 0);
}

/**
 * How many parts of a Lunation the life support forecast looks ahead: far
 * enough to see a stock that rises in Daylight run out in the Night after.
 */
const FORECAST_LUNATION_PARTS = 6;

/**
 * The whole game-minutes until a stock runs out, or Infinity if it doesn't
 * within the forecast's look-ahead. With no Plant making it, it falls at
 * its current rate. A Plant that makes it stands idle at Night, as Plants
 * run only on power no battery bank can store, so the forecast follows the
 * Lunation ahead: the rest of a Daylight at the current rate, then each
 * Night at what the Mission Director uses, and each Daylight after again at
 * the current rate. At Night, when what the Plants make in Daylight isn't
 * known, it looks only as far as the next Daylight. It starts from what
 * the base can count on of the stock as the Plants' batches go, which is
 * never more than it will have (see `kilogramsToCountOn`).
 */
function minutesUntilEmpty(
  state: CampaignState,
  stock: LifeSupportState,
): number {
  const perMinute = netPerMinute(state, stock);
  const resource = { kind: "life-support" as const, stockId: stock.stockId };
  const counted = { ...stock, kilograms: kilogramsToCountOn(state, resource) };
  if (!isInUse(state) || !isMadeByPlants(state, resource)) {
    return minutesLeft(counted, perMinute);
  }
  const used = usePerMinute(findStock(stock.stockId));
  // Too little to last until the batches running now make more, it falls
  // at what the Mission Director uses until it runs out, or they finish.
  if (counted.kilograms <= 0) return minutesLeft(stock, -used);
  const daylightRate =
    readLunation(state.elapsedMinutes, catalogue.lunation).part === "daylight"
      ? perMinute
      : undefined;
  // Each whole Lunation from the next one on changes the stock the same way.
  const { daylight, lunation } = lunationMinutes(catalogue.lunation);
  const perLunation =
    (daylightRate ?? 0) * daylight - used * (lunation - daylight);
  let kilograms = counted.kilograms;
  let skipped = 0;
  let parts = 0;
  for (const part of partsAhead(state.elapsedMinutes, Infinity)) {
    if (part.daylight && daylightRate === undefined) return Infinity;
    parts += 1;
    // Skipping leaves a Lunation or two to run out in, at most.
    if (parts > 2 * FORECAST_LUNATION_PARTS) return Infinity;
    if (parts === FORECAST_LUNATION_PARTS + 1) {
      // Past the look-ahead, it only ever runs out if each Lunation leaves
      // less: skip all but the last of the whole Lunations it lasts.
      if (perLunation >= 0) return Infinity;
      const lunations = Math.max(Math.floor(kilograms / -perLunation) - 1, 0);
      skipped = lunations * lunation;
      kilograms += lunations * perLunation;
    }
    const rate = part.daylight ? (daylightRate ?? 0) : -used;
    const left = minutesLeft({ ...stock, kilograms }, rate);
    if (left <= part.minutes) return skipped + part.start + left;
    kilograms += rate * part.minutes;
  }
  return Infinity;
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
