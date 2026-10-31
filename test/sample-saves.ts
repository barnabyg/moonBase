import { readFileSync } from "node:fs";
import { loadCampaign, type Campaign } from "../src/simulation";

/**
 * Save files written by released format versions, kept so that every one of
 * them must go on loading (ADR-0006). Never edit or regenerate them: add a
 * new sample for a new format version instead.
 */
export const samples = new URL("./saves/", import.meta.url);

/**
 * Runs a loaded sample until its battery banks are full, so that its Plants
 * get power again: they run only on what no battery bank can store, and a
 * battery bank may store more now than when the sample was saved.
 */
export function untilBatteriesFull(campaign: Campaign): void {
  for (let hours = 0; ; hours++) {
    const full = campaign
      .snapshot()
      .power.networks.every(
        (network) =>
          network.storedKilowattHours >=
          network.storageCapacityKilowattHours - 1e-6,
      );
    if (full) return;
    if (hours > 3 * 24) throw new Error("The battery banks never filled.");
    campaign.advance(60);
  }
}

export function loadSample(name: string): Campaign {
  const result = loadCampaign(readFileSync(new URL(name, samples), "utf8"));
  if (!result.ok) throw new Error(`${name}: ${result.message}`);
  return result.campaign;
}
