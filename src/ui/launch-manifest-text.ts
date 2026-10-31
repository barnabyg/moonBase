import { catalogue, type Export, type LaunchItem } from "../catalogue";
import {
  exportsCountedInWords,
  type ExportsSnapshot,
  type LaunchManifestSnapshot,
} from "../simulation";
import { formatKilogramAmount, formatMillionDollars } from "./format";

// What the Launch manifest carries, costs and earns, in words, for the
// Launch manifest screen and the Guide.

/** A heading on the Imports tab and the Launch items under it. */
export interface LaunchItemGroup {
  readonly label: string;
  readonly items: readonly LaunchItem[];
}

/**
 * How many items can be listed before the Imports tab offers a box to find
 * one: a Campaign starts with fewer, which a look down the groups will do for.
 */
const ITEMS_LISTED_WITHOUT_A_BOX = 30;

/** Whether a list this long needs a box to find an item in it. */
export function offersItemFilter(itemsListed: number): boolean {
  return itemsListed > ITEMS_LISTED_WITHOUT_A_BOX;
}

/** Whether an item is what the base keeps on buying, not part of a Structure. */
function isSupply(item: LaunchItem): boolean {
  const { brings } = item;
  return (
    brings.kind === "life-support" ||
    (brings.kind === "component" &&
      brings.componentId === catalogue.maintenance.spareComponentId)
  );
}

/**
 * Sorts Launch items into the groups the Imports tab lists them under, each
 * in the order given, with none left empty: first the Supplies the base keeps
 * on buying (oxygen, water and spare Components), then each of the Tech Tree's
 * categories, in its order, with the items of its Designs, so that an item is
 * found where the player unlocked it. The groups are in a fixed order, so one
 * unlocked later has its place waiting and the others keep theirs.
 */
export function groupLaunchItems(
  items: readonly LaunchItem[],
): LaunchItemGroup[] {
  const categoryOf = (item: LaunchItem): string | undefined =>
    catalogue.designs.find((design) => design.id === item.designId)?.category;
  return [
    { label: "Supplies", items: items.filter(isSupply) },
    ...catalogue.designCategories.map((category) => ({
      label: category.label,
      items: items.filter(
        (item) => !isSupply(item) && categoryOf(item) === category.id,
      ),
    })),
  ].filter((group) => group.items.length > 0);
}

/**
 * Whether what the player typed to find an item matches the words said about
 * it: every word typed has to be there, in any order and any case, even as
 * part of a longer word. With nothing typed, everything matches.
 */
export function matchesItemFilter(typed: string, about: string): boolean {
  const text = about.toLowerCase();
  return typed
    .toLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word));
}

/**
 * Says how many of the items listed are shown, for example "Showing 5 of 61
 * items", or "61 items" with none filtered out.
 */
export function formatItemsShown(shown: number, listed: number): string {
  if (shown === 0) return "No items match";
  return shown === listed
    ? `${listed} items`
    : `Showing ${shown} of ${listed} items`;
}

/** Says a Launch item's mass and price, for example "60 kg, $4M". */
export function formatLaunchItem(item: LaunchItem): string {
  return `${item.massKilograms} kg, ${formatMillionDollars(item.priceMillionDollars)}`;
}

/**
 * Says the manifest's Payload Mass against the Launch's limit, for example
 * "Payload Mass: 230 of 2000 kg".
 */
export function formatPayloadMass(manifest: LaunchManifestSnapshot): string {
  return `Payload Mass: ${manifest.payloadMassKilograms} of ${catalogue.launch.payloadMassLimitKilograms} kg`;
}

/**
 * Says what the manifest costs against what it can be paid with: the
 * Funding balance, and what any Exports aboard the Lander and to load will
 * sell for before it is paid for, for example "Cost: $230M of $400M
 * Funding, including the $150M Launch fee" or "Cost: $161M of $150M
 * Funding and $45M from the Exports to load, including the $150M Launch
 * fee". An empty manifest costs nothing, so the fee is left out until it
 * has an item. If it costs more, as once the Exports to load have been
 * lowered, it says the Lander can't leave with it. Once it is locked, it
 * has been paid for.
 */
export function formatLaunchCost(manifest: LaunchManifestSnapshot): string {
  const { funds } = manifest;
  if (funds === undefined) {
    return `Cost: ${formatMillionDollars(manifest.costMillionDollars)}, paid as the Lander left Earth`;
  }
  const funding = `${formatMillionDollars(funds.fundingMillionDollars)} Funding${
    funds.exportsCounted === "none"
      ? ""
      : ` and ${formatMillionDollars(funds.exportsMillionDollars)} from the Exports ${exportsCountedInWords(funds.exportsCounted)}`
  }`;
  if (manifest.items.length === 0) {
    return `Cost: nothing of ${funding}, while the manifest is empty`;
  }
  const over = funds.overFunding
    ? ". The Lander can't leave with it until it costs no more."
    : "";
  return `Cost: ${formatMillionDollars(manifest.costMillionDollars)} of ${funding}, including the ${formatMillionDollars(manifest.feeMillionDollars)} Launch fee${over}`;
}

/** Says an Export's price, for example "$1.5M a kg". */
export function formatExportPrice(sold: Export): string {
  return `${formatMillionDollars(sold.priceMillionDollarsPerKilogram)} a kg`;
}

/**
 * Says the mass of the Exports aboard the Lander and to load against its
 * Return Mass, for example "Return Mass: 40 of 100 kg", with the propellant it
 * will burn if it is to burn any.
 */
export function formatReturnMass(exports: ExportsSnapshot): string {
  const aboard = exports.aboard.reduce(
    (total, line) => total + line.kilograms,
    0,
  );
  const burning =
    exports.propellantToBurnKilograms > 0
      ? `, burning ${formatKilogramAmount(exports.propellantToBurnKilograms)} kg of propellant`
      : "";
  return `Return Mass: ${formatKilogramAmount(exports.massKilograms + aboard)} of ${formatKilogramAmount(exports.returnMassKilograms)} kg${burning}`;
}

/**
 * Says what the Exports to load will sell for, for example "Value: $60M,
 * sold when the Lander reaches Earth".
 */
export function formatExportsValue(exports: ExportsSnapshot): string {
  return exports.toLoad.length === 0
    ? "Value: nothing, while there are no Exports to load"
    : `Value: ${formatMillionDollars(exports.valueMillionDollars)}, sold when the Lander reaches Earth`;
}
