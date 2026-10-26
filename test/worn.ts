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
  stockpile: { components: { componentId: string; count: number }[] };
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
 * The Campaign as saved, but with a Structure worn down to a Condition and,
 * if given, a number of spare Components in the base's stock.
 */
export function worn(
  campaign: Campaign,
  structureId: string,
  conditionPercent: number,
  spares?: number,
): Campaign {
  return changed(campaign, (state) => {
    for (const saved of state.structures) {
      if (saved.id === structureId) saved.conditionPercent = conditionPercent;
    }
    for (const stock of state.stockpile.components) {
      if (
        stock.componentId === catalogue.maintenance.spareComponentId &&
        spares !== undefined
      ) {
        stock.count = spares;
      }
    }
  });
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
