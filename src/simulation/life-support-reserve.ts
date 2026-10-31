import { catalogue } from "../catalogue";
import type { CampaignState } from "./campaign";

/** How many kilograms of a life support stock some Earth Days of the Mission Director's use come to. */
export function earthDaysOfUseKilograms(
  stockId: string,
  earthDays: number,
): number {
  const use =
    catalogue.lifeSupportStocks.find((stock) => stock.id === stockId)
      ?.usePerEarthDayKilograms ?? 0;
  return earthDays * use;
}

/**
 * How many kilograms of a life support stock are kept for the Mission Director:
 * the data catalogue's reserve, which nothing else that takes from the stock
 * may take it below.
 */
export function reserveKilograms(stockId: string): number {
  const reserve =
    catalogue.lifeSupportStocks.find((stock) => stock.id === stockId)
      ?.reserveEarthDays ?? 0;
  return earthDaysOfUseKilograms(stockId, reserve);
}

/**
 * How many kilograms of a life support stock anything but the Mission Director
 * may take now, which is below nothing once the stock is below the reserve.
 */
export function kilogramsAboveReserve(
  state: CampaignState,
  stockId: string,
): number {
  const kilograms =
    state.lifeSupport.find((stock) => stock.stockId === stockId)?.kilograms ??
    0;
  return kilograms - reserveKilograms(stockId);
}
