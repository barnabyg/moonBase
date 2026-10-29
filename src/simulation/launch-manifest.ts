import { catalogue, type LaunchItem } from "../catalogue";
import { deliverRobots } from "./arrival";
import type { CampaignState } from "./campaign";
import { valueAboard, valueToLoad } from "./exports";
import { addCounts, addToStock } from "./stockpile";
import { designLabel, isDesignUnlocked } from "./tech-tree";

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
   * The Launch fee in that cost: the one it was paid with once it is
   * locked, and the one in force otherwise, even while it is empty.
   */
  readonly feeMillionDollars: number;
  /**
   * Whether it is locked: from the Lander leaving Earth with it, paid for,
   * until it lands.
   */
  readonly locked: boolean;
}

export type ManifestRefusal =
  | "unknown-item"
  /** The Design the item belongs to isn't unlocked. */
  | "design-locked"
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
 * over. An item whose Design isn't unlocked is refused, whatever its count;
 * Components already in stock or on the way are not affected. Once the
 * Lander has left Earth with the manifest, it is locked until the Lander
 * lands.
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
    const item = findLaunchItem(itemId);
    if (item === undefined) {
      return refuse(
        "unknown-item",
        `A Launch can't bring anything called "${itemId}".`,
      );
    }
    if (!isDesignUnlocked(state, item.designId)) {
      return refuse(
        "design-locked",
        `${launchItemLabel(item)} needs the ${designLabel(item.designId)} Design unlocked first.`,
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
  const { payloadMassKilograms, costMillionDollars } = totals(
    items,
    launchFee(state),
  );
  const limit = catalogue.launch.payloadMassLimitKilograms;
  if (payloadMassKilograms > limit) {
    return refuse(
      "over-payload-mass",
      `That would bring the manifest's Payload Mass to ${payloadMassKilograms} kg, over the Launch's limit of ${limit} kg.`,
    );
  }
  if (costMillionDollars > spendable(state)) {
    return refuse(
      "over-funding",
      `That would bring the manifest's cost to ${millionDollars(costMillionDollars)}, more than ${spendableInWords(state)}.`,
    );
  }
  state.launchManifest = items;
  return { ok: true };
}

export function readLaunchManifest(
  state: CampaignState,
): LaunchManifestSnapshot {
  const feeMillionDollars =
    state.launchFeePaidMillionDollars ?? launchFee(state);
  return {
    items: state.launchManifest.map((line) => ({ ...line })),
    ...totals(state.launchManifest, feeMillionDollars),
    feeMillionDollars,
    locked: isLocked(state),
  };
}

/**
 * Pays for the Launch manifest as the Lander leaves Earth with it, which
 * locks it, and returns what it cost: nothing if it is empty. The fee it
 * was paid with stays with it until it lands, whatever is unlocked
 * meanwhile. Running out of Funding never ends the Campaign.
 */
export function payForLaunch(state: CampaignState): number {
  const fee = launchFee(state);
  const { costMillionDollars } = totals(state.launchManifest, fee);
  state.fundingMillionDollars -= costMillionDollars;
  state.launchFeePaidMillionDollars = fee;
  return costMillionDollars;
}

/**
 * What a Launch costs on top of the price of what it brings: the reduced
 * fee once the Design that cuts it is unlocked.
 */
export function launchFee(state: CampaignState): number {
  const { feeMillionDollars, reducedFee } = catalogue.launch;
  return isDesignUnlocked(state, reducedFee.designId)
    ? reducedFee.feeMillionDollars
    : feeMillionDollars;
}

/**
 * Unloads everything on the Launch manifest as the Lander lands: oxygen and
 * water join the life support stocks, Components join the base's stock
 * at the stockpile beside the landing site, or, on a landing pad, stay
 * aboard for the Robot to carry there, and Robots climb down from it,
 * wherever it has landed. A new, empty manifest starts, and what was
 * delivered is returned.
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
    } else if (brings?.kind === "robot") {
      deliverRobots(state, count);
    }
  }
  state.launchManifest = [];
  state.launchFeePaidMillionDollars = undefined;
  return delivered;
}

/**
 * What the manifest can be paid with as the Lander leaves Earth: the
 * Funding balance, and what the Exports aboard and to load will sell for
 * as it reaches Earth, before it is paid for.
 */
function spendable(state: CampaignState): number {
  return state.fundingMillionDollars + valueAboard(state) + valueToLoad(state);
}

/**
 * What the manifest can be paid with, as a refusal gives it, for example
 * "the Funding balance of $150M and the $45M the Exports to load will sell
 * for".
 */
function spendableInWords(state: CampaignState): string {
  const funding = `the Funding balance of ${millionDollars(state.fundingMillionDollars)}`;
  const aboard = valueAboard(state);
  const toLoad = valueToLoad(state);
  if (aboard === 0 && toLoad === 0) {
    return `${funding}, with no Exports aboard or to load to sell first`;
  }
  const exports =
    aboard === 0 ? "to load" : toLoad === 0 ? "aboard" : "aboard and to load";
  return `${funding} and the ${millionDollars(aboard + toLoad)} the Exports ${exports} will sell for`;
}

/** Whether the Lander has left Earth with the manifest and not yet landed. */
function isLocked(state: CampaignState): boolean {
  return state.lander.trip?.leg === "travelling-to-moon";
}

function totals(
  items: readonly ManifestLine[],
  feeMillionDollars: number,
): {
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
    costMillionDollars: items.length === 0 ? 0 : feeMillionDollars + price,
  };
}

/** An amount of money as a refusal gives it, for example "$12.5M", to the nearest $0.1M. */
function millionDollars(value: number): string {
  return `$${Math.round(value * 10) / 10}M`;
}

/** Names something a Launch can bring, for example "Solar panel", "Oxygen, 25 kg" or "Robot". */
export function launchItemLabel(item: LaunchItem): string {
  const { brings } = item;
  if (brings.kind === "robot") return "Robot";
  if (brings.kind === "component") {
    return (
      catalogue.componentTypes.find((type) => type.id === brings.componentId)
        ?.label ?? brings.componentId
    );
  }
  const stock =
    catalogue.lifeSupportStocks.find((entry) => entry.id === brings.stockId)
      ?.label ?? brings.stockId;
  return `${stock}, ${brings.kilograms} kg`;
}

function findLaunchItem(id: string): LaunchItem | undefined {
  return catalogue.launch.items.find((item) => item.id === id);
}

function refuse(reason: ManifestRefusal, message: string): ManifestResult {
  return { ok: false, reason, message };
}
