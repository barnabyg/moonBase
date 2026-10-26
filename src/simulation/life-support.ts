import { catalogue, type LifeSupportStock } from "../catalogue";
import type { CampaignState } from "./campaign";
import { MINUTES_PER_EARTH_DAY } from "./clock";
import type { GameEvent } from "./events";
import { fellToWarningLevel, killMissionDirector } from "./mission-director";
import { productionPerHour } from "./plants";
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
   * Game-minutes until it runs out at that rate, or undefined while it
   * isn't falling.
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
    const perMinute = netPerMinute(state, stock);
    return {
      stockId: stock.stockId,
      kilogramsPerEarthDay: perMinute * MINUTES_PER_EARTH_DAY,
      minutesUntilEmpty:
        perMinute < 0 ? minutesLeft(stock, perMinute) : undefined,
    };
  });
}

/**
 * Uses up a game-minute of every life support stock while the Mission
 * Director lives in a Habitat, after the base's Plants have made their
 * game-minute's worth. A warning comes as the time until a stock runs out,
 * at the rate it is falling, reaches a warning level; while the Plants make
 * as much as is used, it isn't falling and none comes. If one runs out, the
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
    const before = minutesLeft(stock, perMinute);
    const used = Math.min(usePerMinute(type), stock.kilograms);
    stock.kilograms -= used;
    recordLifeSupport(state, stock.stockId, { used });
    const after = minutesLeft(stock, perMinute);
    if (stock.kilograms === 0 || after === 0) {
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
