import { catalogue, type LifeSupportStock } from "../catalogue";
import type { CampaignState } from "./campaign";
import { MINUTES_PER_EARTH_DAY } from "./clock";
import type { GameEvent } from "./events";

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
  /** Game-minutes until it runs out, or undefined while it isn't being used up. */
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
  const inUse = isInUse(state);
  return state.lifeSupport.map((stock) => ({
    stockId: stock.stockId,
    minutesUntilEmpty: inUse ? minutesLeft(stock) : undefined,
  }));
}

/**
 * Uses up a game-minute of every life support stock while the Mission
 * Director lives in a Habitat. If one runs out, the Mission Director dies at
 * once, which ends the Campaign; the death is then the only event, as any
 * warning that minute would come too late to matter.
 */
export function useLifeSupport(state: CampaignState): GameEvent[] {
  if (!isInUse(state)) return [];
  const warnings: GameEvent[] = [];
  let ranOut: LifeSupportState | undefined;
  for (const stock of state.lifeSupport) {
    const type = findStock(stock.stockId);
    const before = minutesLeft(stock);
    stock.kilograms -= usePerMinute(type);
    const after = minutesLeft(stock);
    if (after === 0) {
      stock.kilograms = 0;
      ranOut ??= stock;
    } else if (
      type.warningEarthDaysLeft.some((earthDays) => {
        const warningMinutes = earthDays * MINUTES_PER_EARTH_DAY;
        return before > warningMinutes && after <= warningMinutes;
      })
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
  const cause = { kind: "ran-out", stockId: ranOut.stockId } as const;
  state.ended = { atMinute: state.elapsedMinutes, cause };
  return [
    { kind: "mission-director-died", atMinute: state.elapsedMinutes, cause },
  ];
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

/** The whole game-minutes of use left in a stock. */
function minutesLeft(stock: LifeSupportState): number {
  const minutes =
    stock.kilograms / usePerMinute(findStock(stock.stockId)) - MINUTE_TOLERANCE;
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
