import { catalogue, type ExpeditionType } from "../catalogue";
import { designLabel, type Campaign, type Snapshot } from "../simulation";
import { setText } from "./dom";
import { formatDuration } from "./format";
import {
  describeExpedition,
  describeExpeditionReward,
} from "./status-panel-text";
import { createScreen } from "./screen";

export interface ExpeditionsScreen {
  open(): void;
  update(snapshot: Snapshot): void;
}

/**
 * The Expeditions screen, where the player sends a Robot off the map in the
 * Rover, and sees how the Expedition under way is going and when it will
 * be back. It only sends the choice to start one to the Campaign, which
 * decides whether it is allowed and says why not. The game runs on while
 * it is open.
 */
export function createExpeditionsScreen(
  container: HTMLElement,
  campaign: Pick<Campaign, "startExpedition">,
): ExpeditionsScreen {
  const screen = createScreen(container, {
    className: "expeditions",
    title: "Expeditions",
  });
  screen.lead.textContent =
    "Choose what to go for. A Robot finishes the Work Order it holds, then drives the Rover off the map, and one Expedition can be under way at a time.";

  // The one under way, or that none is.
  const card = document.createElement("section");
  card.className = "screen__card";
  const heading = document.createElement("p");
  heading.className = "screen__eyebrow";
  const status = document.createElement("p");
  status.className = "expeditions__status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-label", "Expedition under way");
  card.append(heading, status);

  // Each type, with how long it takes and what it brings back. Its button stays
  // while another is under way, so that starting it says why it can't.
  const types = catalogue.expeditions.types.map((type: ExpeditionType) => {
    const row = document.createElement("section");
    row.className = "expeditions__type";
    row.setAttribute("aria-label", type.label);
    const about = document.createElement("p");
    about.textContent = `${type.label}: ${type.description} Away for ${formatDuration(type.awayEarthDays * 24 * 60)}, back with ${describeExpeditionReward(type)}.`;
    const start = document.createElement("button");
    start.type = "button";
    start.className = "screen__button";
    start.textContent = `Start: ${type.label}`;
    start.addEventListener("click", () => {
      const result = campaign.startExpedition(type.id);
      screen.refuse(result.ok ? undefined : result.message);
    });
    row.append(about, start);
    return { type, row, start };
  });
  // What the Tech Tree could add, so that the player knows there is more.
  const toCome = document.createElement("p");
  toCome.className = "expeditions__note";
  const note = document.createElement("p");
  note.className = "expeditions__note";
  note.textContent =
    "With only one Robot, every Work Order waits while it is away.";
  const actions = document.createElement("div");
  actions.className = "expeditions__actions";
  actions.append(note, toCome);

  screen.body.append(card, ...types.map(({ row }) => row), actions);

  return {
    open() {
      screen.open();
    },
    update(snapshot) {
      const underWay = snapshot.expedition !== undefined;
      setText(
        heading,
        snapshot.expedition === undefined
          ? "None under way"
          : `Under way: ${snapshot.expedition.label}`,
      );
      const described =
        snapshot.expedition === undefined
          ? "A Robot and the Rover are ready to go."
          : describeExpedition(
              snapshot.expedition,
              snapshot.clock.elapsedMinutes,
            );
      setText(status, described.charAt(0).toUpperCase() + described.slice(1));
      card.classList.toggle("screen__card--idle", !underWay);
      const offered = (type: ExpeditionType): boolean =>
        type.designId === undefined ||
        snapshot.unlockedDesignIds.includes(type.designId);
      for (const { type, row, start } of types) {
        row.hidden = !offered(type);
        start.classList.toggle("screen__button--primary", !underWay);
      }
      const designs = [
        ...new Set(
          catalogue.expeditions.types.flatMap((type) =>
            type.designId === undefined || offered(type) ? [] : [type.designId],
          ),
        ),
      ];
      setText(
        toCome,
        designs.length === 0
          ? ""
          : `More types come with ${designs.map(designLabel).join(" and ")} on the Tech Tree.`,
      );
      note.hidden = snapshot.robots.length > 1;
    },
  };
}
