import { catalogue } from "../catalogue";
import {
  launchItemLabel,
  type Campaign,
  type ExportLine,
  type ManifestLine,
  type Snapshot,
} from "../simulation";
import { setText } from "./dom";
import {
  formatExportLines,
  formatExportPrice,
  formatExportStock,
  formatExportsValue,
  formatKilogramAmount,
  formatLaunchCost,
  formatLaunchItem,
  formatMillionDollars,
  formatPayloadMass,
  formatReturnMass,
  resourceLabel,
} from "./format";

export interface LaunchManifestScreen {
  open(): void;
  update(snapshot: Snapshot): void;
}

/**
 * The Launch manifest screen, where the player chooses what the next Launch
 * brings from Earth: each item with its mass and price, how many the
 * manifest has, and its totals against the Payload Mass limit and the
 * Funding balance, with what any Exports aboard the Lander will sell for.
 * An item whose Design isn't unlocked isn't listed until it is. Below that, they choose the Exports the Lander carries off the Moon: each
 * with what is in stock, its price and the kilograms to load, and their
 * totals against the Return Mass. It only sends what the player asks for to
 * the Campaign, which decides whether it is allowed and says why not. The
 * game runs on while it is open.
 */
export function createLaunchManifestScreen(
  container: HTMLElement,
  campaign: Pick<Campaign, "setLaunchManifest" | "loadExports">,
): LaunchManifestScreen {
  const dialog = document.createElement("dialog");
  dialog.className = "launch-manifest";
  dialog.setAttribute("aria-labelledby", "launch-manifest-title");

  const title = document.createElement("h2");
  title.id = "launch-manifest-title";
  title.textContent = "Launch manifest";
  const intro = document.createElement("p");
  intro.textContent = "Choose what the next Launch brings from Earth.";

  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headings = document.createElement("tr");
  for (const text of ["Item", "Mass and price", "Count", ""]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = text;
    headings.append(cell);
  }
  head.append(headings);
  const body = document.createElement("tbody");
  table.append(head, body);

  /** The manifest as of the latest snapshot. */
  let manifest: readonly ManifestLine[] = [];
  const countOf = (itemId: string): number =>
    manifest.find((line) => line.itemId === itemId)?.count ?? 0;
  /** Asks the Campaign for the manifest with one more, or one fewer, of an item. */
  const change = (itemId: string, by: number): void => {
    const asked = [
      ...manifest.filter((line) => line.itemId !== itemId),
      { itemId, count: Math.max(countOf(itemId) + by, 0) },
    ];
    const result = campaign.setLaunchManifest(asked);
    // At once, in case the player clicks again before the next snapshot.
    if (result.ok) manifest = asked;
    refusal.hidden = result.ok;
    setText(refusal, result.ok ? "" : result.message);
  };

  const rows = catalogue.launch.items.map((item) => {
    const label = launchItemLabel(item);
    const row = document.createElement("tr");
    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = label;
    const details = document.createElement("td");
    details.textContent = formatLaunchItem(item);
    const count = document.createElement("td");
    count.className = "launch-manifest__count";
    const actions = document.createElement("td");
    actions.className = "launch-manifest__actions";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "−";
    remove.setAttribute("aria-label", `Remove one ${label}`);
    remove.addEventListener("click", () => {
      change(item.id, -1);
    });
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "+";
    add.setAttribute("aria-label", `Add one ${label}`);
    add.addEventListener("click", () => {
      change(item.id, 1);
    });
    actions.append(remove, add);
    row.append(name, details, count, actions);
    body.append(row);
    return { item, row, count, remove, add };
  });

  const payloadMass = document.createElement("p");
  payloadMass.className = "launch-manifest__total";
  payloadMass.setAttribute("role", "status");
  payloadMass.setAttribute("aria-label", "Payload Mass");
  const cost = document.createElement("p");
  cost.className = "launch-manifest__total";
  cost.setAttribute("role", "status");
  cost.setAttribute("aria-label", "Launch cost");

  const exportsTitle = document.createElement("h3");
  exportsTitle.textContent = "Exports";
  const exportsIntro = document.createElement("p");

  const exportsTable = document.createElement("table");
  const exportsHead = document.createElement("thead");
  const exportsHeadings = document.createElement("tr");
  for (const text of ["Export", "In stock", "Price", "Kilograms to load"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = text;
    exportsHeadings.append(cell);
  }
  exportsHead.append(exportsHeadings);
  const exportsBody = document.createElement("tbody");
  exportsTable.append(exportsHead, exportsBody);

  /** The Exports to load as of the latest snapshot. */
  let toLoad: readonly ExportLine[] = [];
  const kilogramsOf = (resourceId: string): number =>
    toLoad.find((line) => line.resourceId === resourceId)?.kilograms ?? 0;
  /** Asks the Campaign to load the kilograms of an Export the player has typed. */
  const load = (resourceId: string, input: HTMLInputElement): void => {
    const asked = [
      ...toLoad.filter((line) => line.resourceId !== resourceId),
      // An emptied box asks for none.
      { resourceId, kilograms: input.value === "" ? 0 : Number(input.value) },
    ];
    const result = campaign.loadExports(asked);
    // At once, in case the player changes another before the next snapshot.
    if (result.ok) toLoad = asked;
    else input.value = formatKilogramAmount(kilogramsOf(resourceId));
    refusal.hidden = result.ok;
    setText(refusal, result.ok ? "" : result.message);
  };

  const exportRows = catalogue.exports.map((sold) => {
    const label = resourceLabel(sold.resourceId);
    const row = document.createElement("tr");
    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = label;
    const inStock = document.createElement("td");
    inStock.className = "launch-manifest__count";
    const price = document.createElement("td");
    price.textContent = formatExportPrice(sold);
    const amount = document.createElement("td");
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "any";
    input.className = "launch-manifest__kilograms";
    input.setAttribute("aria-label", `Kilograms of ${label} to load`);
    input.addEventListener("change", () => {
      load(sold.resourceId, input);
    });
    amount.append(input);
    row.append(name, inStock, price, amount);
    exportsBody.append(row);
    return { sold, inStock, input };
  });

  const returnMass = document.createElement("p");
  returnMass.className = "launch-manifest__total";
  returnMass.setAttribute("role", "status");
  returnMass.setAttribute("aria-label", "Return Mass");
  const exportsValue = document.createElement("p");
  exportsValue.className = "launch-manifest__total";
  exportsValue.setAttribute("role", "status");
  exportsValue.setAttribute("aria-label", "Export value");

  // Why the latest change was refused, until the next one.
  const refusal = document.createElement("p");
  refusal.className = "launch-manifest__refusal";
  refusal.setAttribute("role", "alert");
  refusal.hidden = true;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "launch-manifest__close";
  close.textContent = "Close";
  close.addEventListener("click", () => {
    dialog.close();
  });

  dialog.append(
    title,
    intro,
    table,
    payloadMass,
    cost,
    exportsTitle,
    exportsIntro,
    exportsTable,
    returnMass,
    exportsValue,
    refusal,
    close,
  );
  dialog.addEventListener("close", () => {
    refusal.hidden = true;
  });
  container.append(dialog);

  return {
    open() {
      if (!dialog.open) dialog.showModal();
    },
    update(snapshot) {
      manifest = snapshot.launchManifest.items;
      const { locked } = snapshot.launchManifest;
      setText(
        intro,
        locked
          ? "Locked: the Lander has left Earth with this manifest, paid for. A new one starts once it has landed."
          : "Choose what the next Launch brings from Earth.",
      );
      for (const { item, row, count, remove, add } of rows) {
        // Not listed until its Design is unlocked.
        row.hidden = !snapshot.unlockedDesignIds.includes(item.designId);
        const onManifest = countOf(item.id);
        setText(count, String(onManifest));
        remove.disabled = locked || onManifest === 0;
        add.disabled = locked;
      }
      setText(payloadMass, formatPayloadMass(snapshot.launchManifest));
      setText(
        cost,
        formatLaunchCost(
          snapshot.launchManifest,
          snapshot.fundingMillionDollars,
          snapshot.exports.valueAboardMillionDollars,
        ),
      );

      toLoad = snapshot.exports.toLoad;
      const away = snapshot.lander.legEndsAtMinute !== undefined;
      // Once the Robot has loaded them, they can't change until they're aboard.
      const carried = snapshot.exportLoading?.collected === true;
      setText(exportsIntro, describeExports(snapshot));
      for (const { sold, inStock, input } of exportRows) {
        setText(
          inStock,
          formatExportStock(
            snapshot.bulkResources.find(
              (stock) => stock.resourceId === sold.resourceId,
            )?.kilograms ?? 0,
          ),
        );
        input.disabled = away || carried;
        // Not while the player is typing in it.
        if (document.activeElement !== input) {
          const shown = formatKilogramAmount(kilogramsOf(sold.resourceId));
          if (input.value !== shown) input.value = shown;
        }
      }
      setText(returnMass, formatReturnMass(snapshot.exports));
      setText(exportsValue, formatExportsValue(snapshot.exports));
    },
  };
}

/**
 * Says what the player can do with the Exports as things stand: choose them
 * while the Lander is landed, unless the Robot is carrying the last ones
 * chosen to it, with what is aboard it already.
 */
function describeExports(snapshot: Snapshot): string {
  const { aboard, valueAboardMillionDollars } = snapshot.exports;
  if (snapshot.lander.legEndsAtMinute !== undefined) {
    return aboard.length === 0
      ? "The Lander is away. Exports can be loaded once it has landed."
      : `The Lander is away with ${formatExportLines(aboard)} aboard, to sell for ${formatMillionDollars(valueAboardMillionDollars)} when it reaches Earth.`;
  }
  const loading = snapshot.exportLoading;
  if (loading?.collected === true) {
    return `The Robot is carrying ${formatExportLines(loading.exports)} to the Lander. More can be loaded once they're aboard.`;
  }
  const already =
    aboard.length === 0
      ? ""
      : ` It has ${formatExportLines(aboard)} aboard already, and any more go aboard with them.`;
  return snapshot.lander.landingPadId === undefined
    ? `Choose what the Lander carries off the Moon, to sell when it reaches Earth. It takes them from the base's stock as it takes off.${already}`
    : `Choose what the Lander carries off the Moon, to sell when it reaches Earth. On its landing pad, the Robot carries them from the stockpile to it.${already}`;
}
