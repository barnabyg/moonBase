import type { ComponentCount } from "../catalogue";
import type { CampaignState } from "./campaign";

/** Takes the Components from the cargo stock if they are all there; otherwise takes nothing. */
export function takeFromStock(
  state: CampaignState,
  needed: readonly ComponentCount[],
): boolean {
  if (
    needed.some(
      (need) => (stockOf(state, need.componentId)?.count ?? 0) < need.count,
    )
  ) {
    return false;
  }
  for (const need of needed) {
    const stock = stockOf(state, need.componentId);
    if (stock !== undefined) stock.count -= need.count;
  }
  return true;
}

/** Puts Components back into the cargo stock, which has a place for every Component. */
export function addToStock(
  state: CampaignState,
  counts: readonly ComponentCount[],
): void {
  for (const { componentId, count } of counts) {
    const stock = stockOf(state, componentId);
    if (stock !== undefined) stock.count += count;
  }
}

function stockOf(
  state: CampaignState,
  componentId: string,
): CampaignState["cargo"][number] | undefined {
  return state.cargo.find((stock) => stock.componentId === componentId);
}
