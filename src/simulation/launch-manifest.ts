import { catalogue, type LaunchItem } from "../catalogue";
import type { CampaignState } from "./campaign";

/** How many of a Launch item the manifest asks for. */
export interface ManifestLine {
  readonly itemId: string;
  readonly count: number;
}

/** What the next Launch is to bring from Earth, and what that comes to. */
export interface LaunchManifestSnapshot {
  /** In catalogue order, each item once, with a count from 1 up. */
  readonly items: readonly ManifestLine[];
  /** The mass of everything on it, against the Launch's Payload Mass limit. */
  readonly payloadMassKilograms: number;
  /**
   * The Launch fee plus the price of everything on it, against the Funding
   * balance. Nothing while it is empty.
   */
  readonly costMillionDollars: number;
}

export type ManifestRefusal =
  | "unknown-item"
  | "invalid-count"
  | "over-payload-mass"
  | "over-funding"
  | "campaign-ended";

export type ManifestResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: ManifestRefusal;
      /** The reason in words the player can read. */
      readonly message: string;
    };

/**
 * Makes the manifest the Launch manifest, if a Launch can carry all of it
 * and the Funding balance can pay for it; otherwise leaves the manifest as
 * it was and says which limit it would go over.
 */
export function setLaunchManifest(
  state: CampaignState,
  manifest: readonly ManifestLine[],
): ManifestResult {
  const lines: { itemId: string; count: number }[] = [];
  for (const { itemId, count } of manifest) {
    if (findLaunchItem(itemId) === undefined) {
      return refuse(
        "unknown-item",
        `A Launch can't bring anything called "${itemId}".`,
      );
    }
    if (!Number.isSafeInteger(count) || count < 0) {
      return refuse(
        "invalid-count",
        "How many of an item a Launch brings must be a whole number from 0 up.",
      );
    }
    const line = lines.find((other) => other.itemId === itemId);
    if (line === undefined) lines.push({ itemId, count });
    else line.count += count;
  }
  const items = catalogue.launch.items.flatMap(
    (item) =>
      lines.find((line) => line.itemId === item.id && line.count > 0) ?? [],
  );
  const { payloadMassKilograms, costMillionDollars } = totals(items);
  const limit = catalogue.launch.payloadMassLimitKilograms;
  if (payloadMassKilograms > limit) {
    return refuse(
      "over-payload-mass",
      `That would bring the manifest's Payload Mass to ${payloadMassKilograms} kg, over the Launch's limit of ${limit} kg.`,
    );
  }
  if (costMillionDollars > state.fundingMillionDollars) {
    return refuse(
      "over-funding",
      `That would bring the manifest's cost to $${costMillionDollars}M, more than the Funding balance of $${state.fundingMillionDollars}M.`,
    );
  }
  state.launchManifest = items;
  return { ok: true };
}

export function readLaunchManifest(
  state: CampaignState,
): LaunchManifestSnapshot {
  return {
    items: state.launchManifest.map((line) => ({ ...line })),
    ...totals(state.launchManifest),
  };
}

function totals(items: readonly ManifestLine[]): {
  payloadMassKilograms: number;
  costMillionDollars: number;
} {
  let payloadMassKilograms = 0;
  let price = 0;
  for (const { itemId, count } of items) {
    const item = findLaunchItem(itemId);
    payloadMassKilograms += (item?.massKilograms ?? 0) * count;
    price += (item?.priceMillionDollars ?? 0) * count;
  }
  return {
    payloadMassKilograms,
    costMillionDollars:
      items.length === 0 ? 0 : catalogue.launch.feeMillionDollars + price,
  };
}

function findLaunchItem(id: string): LaunchItem | undefined {
  return catalogue.launch.items.find((item) => item.id === id);
}

function refuse(reason: ManifestRefusal, message: string): ManifestResult {
  return { ok: false, reason, message };
}
