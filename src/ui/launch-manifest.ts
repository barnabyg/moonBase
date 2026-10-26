import { catalogue } from "../catalogue";
import type { Campaign, ManifestLine, Snapshot } from "../simulation";
import { setText } from "./dom";
import {
  formatLaunchCost,
  formatLaunchItem,
  formatPayloadMass,
  launchItemLabel,
} from "./format";

export interface LaunchManifestScreen {
  open(): void;
  update(snapshot: Snapshot): void;
}

/**
 * The Launch manifest screen, where the player chooses what the next Launch
 * brings from Earth: each item with its mass and price, how many the
 * manifest has, and its totals against the Payload Mass limit and the
 * Funding balance. It only sends the manifest the player asks for to the
 * Campaign, which decides whether it is allowed and says why not. The game
 * runs on while it is open.
 */
export function createLaunchManifestScreen(
  container: HTMLElement,
  campaign: Pick<Campaign, "setLaunchManifest">,
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
    return { item, count, remove, add };
  });

  const payloadMass = document.createElement("p");
  payloadMass.className = "launch-manifest__total";
  payloadMass.setAttribute("role", "status");
  payloadMass.setAttribute("aria-label", "Payload Mass");
  const cost = document.createElement("p");
  cost.className = "launch-manifest__total";
  cost.setAttribute("role", "status");
  cost.setAttribute("aria-label", "Launch cost");

  // Why the latest item was refused, until the next change.
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

  dialog.append(title, intro, table, payloadMass, cost, refusal, close);
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
      for (const { item, count, remove, add } of rows) {
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
        ),
      );
    },
  };
}
