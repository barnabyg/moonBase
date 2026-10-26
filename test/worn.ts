import { catalogue } from "../src/catalogue";
import { loadCampaign, type Campaign } from "../src/simulation";

interface SaveJson {
  state: {
    structures: { id: string; conditionPercent: number }[];
    stockpile: { components: { componentId: string; count: number }[] };
  };
}

/**
 * The Campaign as saved, but with a Structure worn down to a Condition and,
 * if given, a number of spare Components in the base's stock: a stand-in
 * for wear that the game has no quicker way to bring about.
 */
export function worn(
  campaign: Campaign,
  structureId: string,
  conditionPercent: number,
  spares?: number,
): Campaign {
  const document = JSON.parse(campaign.save()) as SaveJson;
  for (const saved of document.state.structures) {
    if (saved.id === structureId) saved.conditionPercent = conditionPercent;
  }
  for (const stock of document.state.stockpile.components) {
    if (
      stock.componentId === catalogue.maintenance.spareComponentId &&
      spares !== undefined
    ) {
      stock.count = spares;
    }
  }
  const loaded = loadCampaign(JSON.stringify(document));
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.campaign;
}
