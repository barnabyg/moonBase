import { catalogue, type Export, type LaunchItem } from "../catalogue";
import {
  exportsCountedInWords,
  type ExportsSnapshot,
  type LaunchManifestSnapshot,
} from "../simulation";
import { formatKilogramAmount, formatMillionDollars } from "./format";

// What the Launch manifest carries, costs and earns, in words, for the
// Launch manifest screen and the Guide.

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
 * Return Mass, for example "Return Mass: 40 of 100 kg".
 */
export function formatReturnMass(exports: ExportsSnapshot): string {
  const aboard = exports.aboard.reduce(
    (total, line) => total + line.kilograms,
    0,
  );
  return `Return Mass: ${formatKilogramAmount(exports.massKilograms + aboard)} of ${catalogue.lander.returnMassKilograms} kg`;
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
