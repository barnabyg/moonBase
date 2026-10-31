import { catalogue, type LaunchItem } from "../catalogue";
import {
  launchItemLabel,
  type Campaign,
  type ExportLine,
  type ManifestLine,
  type Snapshot,
} from "../simulation";
import { describeLaunchItemUse } from "./describe";
import { setText } from "./dom";
import {
  formatExportStock,
  formatKilogramAmount,
  formatMillionDollars,
} from "./format";
import { holdHeight } from "./hold";
import { formatExportLines, resourceLabel } from "./labels";
import {
  formatExportPrice,
  formatExportsValue,
  formatItemsShown,
  formatLaunchCost,
  formatLaunchItem,
  formatPayloadMass,
  formatReturnMass,
  groupLaunchItems,
  matchesItemFilter,
  offersItemFilter,
} from "./launch-manifest-text";
import { createGauge, createScreen } from "./screen";

export interface LaunchManifestScreen {
  open(): void;
  update(snapshot: Snapshot): void;
}

/**
 * The Launch manifest screen, where the player chooses what the next Launch
 * brings from Earth and what the Lander carries off the Moon, on a tab
 * each. On the Imports tab, the totals against the Payload Mass limit and
 * the Funding balance stay in sight over the items, in the groups of
 * {@link groupLaunchItems}, each with what it is for, its mass and price and
 * how many the manifest has. An item whose Design isn't unlocked isn't listed
 * until it is. Once the list is long, a box that stays in sight with the
 * totals finds an item by its name, what it is for or its group; only the
 * player changes what is typed in it, so it holds still as the game runs. On
 * the Exports tab, the Return Mass and what the Exports will sell
 * for stay in sight over each Export, with what is in stock, what is aboard
 * the Lander already, its price and the kilograms to load. It only sends what the player asks for to the
 * Campaign, which decides whether it is allowed and says why not. The game
 * runs on while it is open.
 */
export function createLaunchManifestScreen(
  container: HTMLElement,
  campaign: Pick<Campaign, "setLaunchManifest" | "loadExports">,
): LaunchManifestScreen {
  const screen = createScreen(container, {
    className: "launch-manifest",
    title: "Launch manifest",
  });
  screen.lead.textContent =
    "What the next Launch brings from Earth, and the Exports the Lander takes back to sell.";
  const [importsTab, exportsTab] = screen.addTabs("Launch manifest", [
    { id: "launch", label: "Imports" },
    { id: "exports", label: "Exports" },
  ]);
  if (importsTab === undefined || exportsTab === undefined) {
    throw new Error("The Launch manifest screen has no tabs");
  }

  const payloadMass = createGauge("Payload Mass");
  const cost = createGauge("Launch cost");
  const intro = document.createElement("p");
  intro.className = "launch-manifest__intro";
  // It says more, in a box, once the manifest is locked.
  intro.dataset["row"] = "Launch manifest intro";
  holdHeight(intro);
  const find = createItemFinder();
  importsTab.panel.append(
    createSummary(payloadMass.element, cost.element, find.element),
    intro,
  );

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
    screen.refuse(result.ok ? undefined : result.message);
  };

  const groups = groupLaunchItems(catalogue.launch.items).map((group) => {
    const section = document.createElement("section");
    section.className = "launch-manifest__group";
    section.setAttribute("aria-label", group.label);
    // Headed by its group, in the place of a heading of its own, so that the
    // groups take no more room than the rows need.
    const table = createTable([group.label, "Mass and price", "Count", ""]);
    table.table.className = "launch-manifest__items";
    section.append(table.table);
    importsTab.panel.append(section);
    return { ...group, section, body: table.body };
  });

  const rows = groups.flatMap((group) =>
    group.items.map((item) => createItemRow(item, group.label, group.body)),
  );
  function createItemRow(
    item: LaunchItem,
    groupLabel: string,
    body: HTMLTableSectionElement,
  ) {
    const label = launchItemLabel(item);
    const purpose = describeLaunchItemUse(item);
    const row = document.createElement("tr");
    row.dataset["row"] = item.id;
    const name = document.createElement("th");
    name.scope = "row";
    // What it is for, under its name.
    const use = document.createElement("span");
    use.className = "launch-manifest__use";
    use.textContent = purpose;
    name.append(label, use);
    const details = document.createElement("td");
    details.className = "launch-manifest__details";
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
    const about = `${label} ${purpose} ${groupLabel}`;
    return { item, about, row, count, remove, add };
  }

  /** The Designs unlocked as of the latest snapshot. */
  let unlocked: readonly string[] = [];
  /**
   * Shows the rows of the items whose Design is unlocked and that match what
   * is typed, in the groups that have any. They keep their order throughout,
   * being only ever hidden or shown.
   */
  const showRows = (): void => {
    const listed = rows.filter(({ item }) => unlocked.includes(item.designId));
    const offered = offersItemFilter(listed.length);
    find.element.hidden = !offered;
    // A shorter list, from another Campaign loaded, has no box to clear it with.
    if (!offered) find.input.value = "";
    let shown = 0;
    for (const { item, about, row } of rows) {
      const match =
        unlocked.includes(item.designId) &&
        matchesItemFilter(find.input.value, about);
      row.hidden = !match;
      if (match) shown++;
    }
    for (const { section, body } of groups) {
      section.hidden = [...body.rows].every((row) => row.hidden);
    }
    setText(find.shown, formatItemsShown(shown, listed.length));
    find.clear.disabled = find.input.value === "";
  };
  find.input.addEventListener("input", () => {
    showRows();
    // What is left starts at the top, whatever had been scrolled past.
    screen.body.scrollTop = 0;
  });
  find.clear.addEventListener("click", () => {
    find.input.value = "";
    showRows();
    screen.body.scrollTop = 0;
    find.input.focus();
  });

  const returnMass = createGauge("Return Mass");
  const exportsValue = createGauge("Export value");
  const exportsIntro = document.createElement("p");
  exportsIntro.className = "launch-manifest__intro";
  const exportsTable = createTable([
    "Export",
    "In stock",
    "Aboard",
    "Price",
    "Kilograms to load",
  ]);
  exportsTab.panel.append(
    createSummary(returnMass.element, exportsValue.element),
    exportsIntro,
    exportsTable.table,
  );

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
    screen.refuse(result.ok ? undefined : result.message);
  };

  const exportRows = catalogue.exports.map((sold) => {
    const label = resourceLabel(sold.resourceId);
    const row = document.createElement("tr");
    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = label;
    const inStock = document.createElement("td");
    inStock.className = "launch-manifest__count";
    const aboard = document.createElement("td");
    aboard.className = "launch-manifest__count";
    const price = document.createElement("td");
    price.className = "launch-manifest__details";
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
    row.append(name, inStock, aboard, price, amount);
    exportsTable.body.append(row);
    return { sold, row, inStock, aboard, input };
  });

  return {
    open() {
      screen.open();
    },
    update(snapshot) {
      setText(
        screen.figure,
        `${formatMillionDollars(snapshot.fundingMillionDollars)} Funding`,
      );
      manifest = snapshot.launchManifest.items;
      const { locked } = snapshot.launchManifest;
      setText(
        intro,
        locked
          ? "Locked: the Lander has left Earth with this manifest, paid for. A new one starts once it has landed."
          : "Choose what the next Launch brings from Earth. It is paid for as the Lander leaves Earth.",
      );
      intro.classList.toggle("launch-manifest__intro--locked", locked);
      unlocked = snapshot.unlockedDesignIds;
      showRows();
      for (const { item, row, count, remove, add } of rows) {
        const onManifest = countOf(item.id);
        setText(count, String(onManifest));
        row.classList.toggle("launch-manifest__row--chosen", onManifest > 0);
        remove.disabled = locked || onManifest === 0;
        add.disabled = locked;
      }
      payloadMass.show(
        formatPayloadMass(snapshot.launchManifest),
        snapshot.launchManifest.payloadMassKilograms /
          catalogue.launch.payloadMassLimitKilograms,
      );
      // Against what it can be paid with, until it is paid for.
      const { funds } = snapshot.launchManifest;
      cost.show(
        formatLaunchCost(snapshot.launchManifest),
        funds === undefined || funds.totalMillionDollars <= 0
          ? undefined
          : snapshot.launchManifest.costMillionDollars /
              funds.totalMillionDollars,
      );

      toLoad = snapshot.exports.toLoad;
      const away = snapshot.lander.legEndsAtMinute !== undefined;
      // Once the Robot has loaded them, they can't change until they're aboard.
      const carried = snapshot.exportLoading?.collected === true;
      setText(exportsIntro, describeExports(snapshot));
      for (const { sold, row, inStock, aboard, input } of exportRows) {
        setText(
          inStock,
          formatExportStock(
            snapshot.bulkResources.find(
              (stock) => stock.resourceId === sold.resourceId,
            )?.kilograms ?? 0,
          ),
        );
        const kilogramsAboard =
          snapshot.exports.aboard.find(
            (line) => line.resourceId === sold.resourceId,
          )?.kilograms ?? 0;
        setText(aboard, `${formatKilogramAmount(kilogramsAboard)} kg`);
        input.disabled = away || carried;
        row.classList.toggle(
          "launch-manifest__row--chosen",
          kilogramsOf(sold.resourceId) > 0 || kilogramsAboard > 0,
        );
        // Not while the player is typing in it.
        if (document.activeElement !== input) {
          const shown = formatKilogramAmount(kilogramsOf(sold.resourceId));
          if (input.value !== shown) input.value = shown;
        }
      }
      const massAboard = snapshot.exports.aboard.reduce(
        (total, line) => total + line.kilograms,
        0,
      );
      returnMass.show(
        formatReturnMass(snapshot.exports),
        (snapshot.exports.massKilograms + massAboard) /
          snapshot.exports.returnMassKilograms,
      );
      exportsValue.show(formatExportsValue(snapshot.exports), undefined);
    },
  };
}

/** The box to find an item in, what it finds, and a button to empty it. */
function createItemFinder(): {
  readonly element: HTMLElement;
  readonly input: HTMLInputElement;
  readonly shown: HTMLElement;
  readonly clear: HTMLButtonElement;
} {
  const element = document.createElement("div");
  element.className = "launch-manifest__find";
  const input = document.createElement("input");
  input.type = "search";
  input.className = "launch-manifest__find-box";
  input.placeholder = "Find an item by its name or what it is for";
  input.autocomplete = "off";
  input.setAttribute("aria-label", "Find an item");
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "screen__button";
  clear.textContent = "Clear";
  const shown = document.createElement("p");
  shown.className = "launch-manifest__shown";
  shown.setAttribute("role", "status");
  shown.setAttribute("aria-label", "Items shown");
  element.append(input, clear, shown);
  return { element, input, shown, clear };
}

/** The figures that stay in sight at the top of a tab as its list scrolls. */
function createSummary(...gauges: readonly HTMLElement[]): HTMLElement {
  const summary = document.createElement("div");
  summary.className = "launch-manifest__summary";
  summary.append(...gauges);
  return summary;
}

/** A table with its column headings, and the body its rows go in. */
function createTable(headings: readonly string[]): {
  readonly table: HTMLTableElement;
  readonly body: HTMLTableSectionElement;
} {
  const table = document.createElement("table");
  const head = document.createElement("thead");
  const row = document.createElement("tr");
  for (const text of headings) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = text;
    row.append(cell);
  }
  head.append(row);
  const body = document.createElement("tbody");
  table.append(head, body);
  return { table, body };
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
