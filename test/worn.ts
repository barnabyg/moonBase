import { catalogue } from "../src/catalogue";
import { loadCampaign, type Campaign } from "../src/simulation";

/** The parts of a save document's simulation state that tests change. */
export interface SavedState {
  structures: {
    id: string;
    conditionPercent: number;
    dustCoatingPercent: number;
    storedKilowattHours: number;
  }[];
  machines: { id: string; conditionPercent: number }[];
  rovers: { id: string; conditionPercent: number }[];
  robots: { id: string; conditionPercent: number }[];
  stockpile: { components: { componentId: string; count: number }[] };
  bulkResources: { resourceId: string; kilograms: number }[];
  lifeSupport: { stockId: string; kilograms: number }[];
  fundingMillionDollars: number;
  launchFeePaidMillionDollars: number | null;
  science: number;
}

/**
 * The Campaign as saved, changed as given, then loaded: a stand-in for
 * wear and the like that the game has no quicker way to bring about.
 */
export function changed(
  campaign: Campaign,
  change: (state: SavedState) => void,
): Campaign {
  const document = JSON.parse(campaign.save()) as { state: SavedState };
  change(document.state);
  const loaded = loadCampaign(JSON.stringify(document));
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.campaign;
}

/**
 * The Campaign as saved, but with the Funding balance given: a stand-in for
 * the Launches that would have spent the Programme Grant down to it.
 */
export function withFunding(
  campaign: Campaign,
  fundingMillionDollars: number,
): Campaign {
  return changed(campaign, (state) => {
    state.fundingMillionDollars = fundingMillionDollars;
  });
}

/**
 * The Campaign as saved, but with a Structure, Machine, Rover or Robot worn down
 * to a Condition and, if given, a number of spare Components in the base's
 * stock.
 */
export function worn(
  campaign: Campaign,
  id: string,
  conditionPercent: number,
  spares?: number,
): Campaign {
  return changed(campaign, (state) => {
    for (const saved of [
      ...state.structures,
      ...state.machines,
      ...state.rovers,
      ...state.robots,
    ]) {
      if (saved.id === id) saved.conditionPercent = conditionPercent;
    }
    if (spares !== undefined) withSpares(state, spares);
  });
}

/** Sets the number of spare Components in a saved base's stock. */
export function withSpares(state: SavedState, spares: number): void {
  for (const stock of state.stockpile.components) {
    if (stock.componentId === catalogue.maintenance.spareComponentId) {
      stock.count = spares;
    }
  }
}

/** The Campaign as saved, but with a solar array coated with Dust to a percentage. */
export function coated(
  campaign: Campaign,
  structureId: string,
  dustCoatingPercent: number,
): Campaign {
  return changed(campaign, (state) => {
    for (const saved of state.structures) {
      if (saved.id === structureId) {
        saved.dustCoatingPercent = dustCoatingPercent;
      }
    }
  });
}
