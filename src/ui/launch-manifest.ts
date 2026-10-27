import { catalogue, type LaunchItem } from "../catalogue";
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
import { createGauge, createScreen } from "./screen";

export interface LaunchManifestScreen {
  open(): void;
  update(snapshot: Snapshot): void;
}

/**
 * The Launch manifest screen, where the player chooses what the next Launch
 * brings from Earth and what the Lander carries off the Moon, on a tab
 * each. On the Launch tab, the totals against the Payload Mass limit and
 * the Funding balance stay in sight over the items, grouped as Components,
 * oxygen and water, and Robots, each with its mass and price and how many
 * the manifest has. An item whose Design isn't unlocked isn't listed until
 * it is. On the Exports tab, the Return Mass and what the Exports will sell
 * for stay in sight over each Export, with what is in stock, its price and
 * the kilograms to load. It only sends what the player asks for to the
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
  const [launchTab, exportsTab] = screen.addTabs("Launch manifest", [
    { id: "launch", label: "Launch" },
    { id: "exports", label: "Exports" },
  ]);
  if (launchTab === undefined || exportsTab === undefined) {
    throw new Error("The Launch manifest screen has no tabs");
  }

  const payloadMass = createGauge("Payload Mass");
  const cost = createGauge("Launch cost");
  const intro = document.createElement("p");
  intro.className = "launch-manifest__intro";
  launchTab.panel.append(
    createSummary(payloadMass.element, cost.element),
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

  // A table for each kind of item, in the order the catalogue first has one.
  const groups = new Map<LaunchItemKind, ItemGroup>();
  const groupOf = (kind: LaunchItemKind): ItemGroup => {
    const known = groups.get(kind);
    if (known !== undefined) return known;
    const label = GROUP_LABELS[kind];
    const section = document.createElement("section");
    section.className = "launch-manifest__group";
    section.setAttribute("aria-label", label);
    const heading = document.createElement("h3");
    heading.className = "screen__section-title";
    heading.textContent = label;
    const table = createTable(["Item", "Mass and price", "Count", ""]);
    section.append(heading, table.table);
    launchTab.panel.append(section);
    const group = { section, body: table.body };
    groups.set(kind, group);
    return group;
  };

  const rows = catalogue.launch.items.map((item) => {
    const label = launchItemLabel(item);
    const row = document.createElement("tr");
    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = label;
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
    groupOf(item.brings.kind).body.append(row);
    return { item, row, count, remove, add };
  });

  const returnMass = createGauge("Return Mass");
  const exportsValue = createGauge("Export value");
  const exportsIntro = document.createElement("p");
  exportsIntro.className = "launch-manifest__intro";
  const exportsTable = createTable([
    "Export",
    "In stock",
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
    row.append(name, inStock, price, amount);
    exportsTable.body.append(row);
    return { sold, row, inStock, input };
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
      for (const { item, row, count, remove, add } of rows) {
        // Not listed until its Design is unlocked.
        row.hidden = !snapshot.unlockedDesignIds.includes(item.designId);
        const onManifest = countOf(item.id);
        setText(count, String(onManifest));
        row.classList.toggle("launch-manifest__row--chosen", onManifest > 0);
        remove.disabled = locked || onManifest === 0;
        add.disabled = locked;
      }
      for (const { section, body } of groups.values()) {
        section.hidden = [...body.rows].every((row) => row.hidden);
      }
      // What the manifest can be paid with: the Funding, and what the
      // Exports aboard will sell for before it is paid.
      const spendable =
        snapshot.fundingMillionDollars +
        snapshot.exports.valueAboardMillionDollars;
      payloadMass.show(
        formatPayloadMass(snapshot.launchManifest),
        snapshot.launchManifest.payloadMassKilograms /
          catalogue.launch.payloadMassLimitKilograms,
      );
      cost.show(
        formatLaunchCost(
          snapshot.launchManifest,
          snapshot.fundingMillionDollars,
          snapshot.exports.valueAboardMillionDollars,
        ),
        locked || spendable <= 0
          ? undefined
          : snapshot.launchManifest.costMillionDollars / spendable,
      );

      toLoad = snapshot.exports.toLoad;
      const away = snapshot.lander.legEndsAtMinute !== undefined;
      // Once the Robot has loaded them, they can't change until they're aboard.
      const carried = snapshot.exportLoading?.collected === true;
      setText(exportsIntro, describeExports(snapshot));
      for (const { sold, row, inStock, input } of exportRows) {
        setText(
          inStock,
          formatExportStock(
            snapshot.bulkResources.find(
              (stock) => stock.resourceId === sold.resourceId,
            )?.kilograms ?? 0,
          ),
        );
        input.disabled = away || carried;
        row.classList.toggle(
          "launch-manifest__row--chosen",
          kilogramsOf(sold.resourceId) > 0,
        );
        // Not while the player is typing in it.
        if (document.activeElement !== input) {
          const shown = formatKilogramAmount(kilogramsOf(sold.resourceId));
          if (input.value !== shown) input.value = shown;
        }
      }
      const aboard = snapshot.exports.aboard.reduce(
        (total, line) => total + line.kilograms,
        0,
      );
      returnMass.show(
        formatReturnMass(snapshot.exports),
        (snapshot.exports.massKilograms + aboard) /
          catalogue.lander.returnMassKilograms,
      );
      exportsValue.show(formatExportsValue(snapshot.exports), undefined);
    },
  };
}

type LaunchItemKind = LaunchItem["brings"]["kind"];

interface ItemGroup {
  readonly section: HTMLElement;
  readonly body: HTMLTableSectionElement;
}

/** How the Launch tab heads each kind of item. */
const GROUP_LABELS: Record<LaunchItemKind, string> = {
  component: "Components",
  "life-support": "Oxygen and water",
  robot: "Robots",
};

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
