import { catalogue, type LaunchItem } from "../catalogue";
import type { CampaignState } from "./campaign";
import { valueAboard } from "./exports";
import { addCounts, addToStock } from "./stockpile";

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
  /**
   * Whether it is locked: from the Lander leaving Earth with it, paid for,
   * until it lands.
   */
  readonly locked: boolean;
}

export type ManifestRefusal =
  | "unknown-item"
  | "invalid-count"
  | "over-payload-mass"
  | "over-funding"
  | "manifest-locked"
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
 * and the Funding balance can pay for it, counting what any Exports aboard
 * the Lander will sell for, as they are sold before it is paid for;
 * otherwise leaves the manifest as it was and says which limit it would go
 * over. Once the Lander has left Earth with the manifest, it is locked until
 * the Lander lands.
 */
export function setLaunchManifest(
  state: CampaignState,
  manifest: readonly ManifestLine[],
): ManifestResult {
  if (isLocked(state)) {
    return refuse(
      "manifest-locked",
      "The manifest is locked: the Lander has left Earth with it. A new one starts once it has landed.",
    );
  }
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
  const exportsValue = valueAboard(state);
  if (costMillionDollars > state.fundingMillionDollars + exportsValue) {
    const exports =
      exportsValue === 0
        ? ""
        : ` and the ${millionDollars(exportsValue)} the Exports aboard will sell for`;
    return refuse(
      "over-funding",
      `That would bring the manifest's cost to ${millionDollars(costMillionDollars)}, more than the Funding balance of ${millionDollars(state.fundingMillionDollars)}${exports}.`,
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
    locked: isLocked(state),
  };
}

/**
 * Pays for the Launch manifest as the Lander leaves Earth with it, which
 * locks it, and returns what it cost: nothing if it is empty. Running out of
 * Funding never ends the Campaign.
 */
export function payForLaunch(state: CampaignState): number {
  const { costMillionDollars } = totals(state.launchManifest);
  state.fundingMillionDollars -= costMillionDollars;
  return costMillionDollars;
}

/**
 * Unloads everything on the Launch manifest as the Lander lands: oxygen and
 * water join the life support stocks, and Components join the base's stock
 * at the stockpile beside the landing site, or, on a landing pad, stay
 * aboard for the Robot to carry there. A new, empty manifest starts, and
 * what was delivered is returned.
 */
export function deliverLaunch(
  state: CampaignState,
  onLandingPad: boolean,
): ManifestLine[] {
  const delivered = state.launchManifest;
  for (const { itemId, count } of delivered) {
    const brings = findLaunchItem(itemId)?.brings;
    if (brings?.kind === "component") {
      const components = [{ componentId: brings.componentId, count }];
      if (onLandingPad) addCounts(state.lander.cargo, components);
      else addToStock(state, components);
    } else if (brings?.kind === "life-support") {
      const stock = state.lifeSupport.find(
        (candidate) => candidate.stockId === brings.stockId,
      );
      if (stock !== undefined) stock.kilograms += brings.kilograms * count;
    }
  }
  state.launchManifest = [];
  return delivered;
}

/** Whether the Lander has left Earth with the manifest and not yet landed. */
function isLocked(state: CampaignState): boolean {
  return state.lander.trip?.leg === "travelling-to-moon";
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

/** An amount of money as a refusal gives it, for example "$12.5M", to the nearest $0.1M. */
function millionDollars(value: number): string {
  return `$${Math.round(value * 10) / 10}M`;
}

function findLaunchItem(id: string): LaunchItem | undefined {
  return catalogue.launch.items.find((item) => item.id === id);
}

function refuse(reason: ManifestRefusal, message: string): ManifestResult {
  return { ok: false, reason, message };
}
