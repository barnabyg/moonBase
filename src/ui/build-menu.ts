import { catalogue, type StructureType } from "../catalogue";
import type { Renderer } from "../render/renderer";
import {
  isPlannedAsItself,
  nextSolarArray,
  SOLAR_ARRAY_ID,
  solarArraysInStock,
  structuresInTheWay,
  type Campaign,
  type GroundPosition,
  type Snapshot,
} from "../simulation";
import { describeBuild, describeStructure, designOf } from "./describe";
import { onClick } from "./click";
import { setText } from "./dom";
import { formatInTheWay } from "./keep-clear-text";
import { inSentence } from "./labels";
import { createPanelSection } from "./panel-section";
import {
  groupBuildOptions,
  summariseBuildGroup,
  type BuildOptionStock,
} from "./build-menu-text";

export interface BuildMenu {
  update(snapshot: Snapshot): void;
  /** Whether the player is placing a Structure, so that a click on the map plans it. */
  isPlacing(): boolean;
}

/**
 * The build menu. It lists the Structures in the groups the Base panel
 * uses, by what they are for, each of which the player can fold away, and
 * dims one whose Components aren't in the base's stock, so that what can be
 * built now stands out. Hovering over a Structure says what it does. The
 * player picks one, moves its translucent preview over the map, and clicks
 * to plan a Construction there. A Structure whose Design isn't unlocked
 * isn't offered until it is, nor a group until it offers one. The menu only
 * sends the plan to the Campaign; the simulation decides whether it is
 * allowed.
 */
export function createBuildMenu(
  container: HTMLElement,
  campaign: Campaign,
  renderer: Renderer,
): BuildMenu {
  const panel = document.createElement("aside");
  panel.className = "build-menu";
  panel.setAttribute("aria-label", "Build menu");
  const heading = document.createElement("h2");
  heading.textContent = "Build";
  const options = document.createElement("div");
  options.className = "build-menu__groups";
  const hint = document.createElement("p");
  hint.className = "build-menu__hint";
  hint.setAttribute("role", "status");
  hint.setAttribute("aria-label", "Placement");
  panel.append(heading, options, hint);
  container.append(panel);

  let placing: StructureType | undefined;
  /** Where the next take-off or landing blasts Plume Ejecta, as of the latest snapshot. */
  let plumeEjecta: Snapshot["plumeEjecta"];
  /** The commissioned Structures, as of the latest snapshot. */
  let structures: Snapshot["structures"] = [];
  /** How many more of each Structure the base's stock can supply, as of the latest snapshot. */
  const available = new Map<string, number>();
  /** What each Structure's badge shows, as of the latest snapshot. */
  const stocks = new Map<string, BuildOptionStock>();
  // A solar array is planned as one, and its parts decide its kind.
  const offered = catalogue.structureTypes.filter(isPlannedAsItself);
  /** What the next solar array will be, as of the latest snapshot. */
  let nextArray = "";
  // Each group keeps its place and each Structure its place in it, whatever
  // the stock, so that a button never moves under the pointer.
  const groups = groupBuildOptions(offered).map((group) => {
    const section = createPanelSection(`build:${group.id}`, group.label);
    section.element.classList.add("build-group");
    const grid = document.createElement("div");
    grid.className = "build-menu__options";
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", group.label);
    section.body.append(grid);
    options.append(section.element);
    return { section, grid, types: group.types };
  });
  const buttons = groups.flatMap(({ grid, types }) =>
    types.map((type) => {
      const button = document.createElement("button");
      button.type = "button";
      // What it does, on hover, so that the choice needs no other screen.
      button.title = [
        designOf(type.designId)?.description,
        describeStructure(type),
        describeBuild(type),
      ]
        .filter((text) => text !== undefined)
        .join(" ");
      const name = document.createElement("span");
      name.textContent = type.label;
      // How many the stock can supply, as a badge; the words are for screen
      // readers.
      const stock = document.createElement("span");
      stock.className = "build-menu__stock";
      const count = document.createElement("span");
      const meaning = document.createElement("span");
      meaning.className = "visually-hidden";
      stock.append(count, meaning);
      button.append(name, " ", stock);
      button.addEventListener("click", () => {
        if (placing === type) stopPlacing("");
        else startPlacing(type);
      });
      grid.append(button);
      return { type, button, stock, count, meaning };
    }),
  );

  function showPlacing(): void {
    for (const { type, button } of buttons) {
      button.setAttribute("aria-pressed", String(placing === type));
    }
  }

  function startPlacing(type: StructureType): void {
    placing = type;
    showPlacing();
    setText(
      hint,
      `Click the map to place the ${inSentence(type.label)}. Right-click or press Esc to cancel.${type.id === SOLAR_ARRAY_ID ? nextArray : ""}${stockWarning(type)}`,
    );
  }

  /** Warns that a Structure's Construction will wait, because the base's stock can't supply it. */
  function stockWarning(type: StructureType): string {
    return (available.get(type.id) ?? 0) > 0
      ? ""
      : " Its Components aren't in the base's stock, so its Construction will wait for them.";
  }

  /** Warns that a Structure placed here would be worn down by Plume Ejecta. */
  function plumeWarning(type: StructureType, position: GroundPosition): string {
    return plumeEjecta !== undefined &&
      Math.hypot(
        position.x - plumeEjecta.position.x,
        position.y - plumeEjecta.position.y,
      ) <
        plumeEjecta.radiusMetres + type.footprintRadiusMetres
      ? " Plume Ejecta from the Lander's take-offs and landings will wear it down here."
      : "";
  }

  /**
   * Says what, within the radius a Structure must be kept clear within, would
   * stop it working here, or that nothing would.
   */
  function keepClearWarning(type: StructureType, at: GroundPosition): string {
    const words = formatInTheWay(type.id, at, structures);
    if (words === undefined) return "";
    return structuresInTheWay(type.id, at, structures).length === 0
      ? ` Nothing stops it working here: ${words}.`
      : ` It won't work here: ${words}.`;
  }

  function stopPlacing(message: string): void {
    placing = undefined;
    showPlacing();
    renderer.showPlacementPreview(undefined);
    setText(hint, message);
  }

  /** Previews the Structure under the pointer and says whether it may go there. */
  function preview(
    clientX: number,
    clientY: number,
  ): { type: StructureType; position: GroundPosition } | undefined {
    if (placing === undefined) return undefined;
    const position = renderer.pickGround(clientX, clientY);
    if (position === undefined) {
      renderer.showPlacementPreview(undefined);
      return undefined;
    }
    const check = campaign.checkPlacement({
      structureTypeId: placing.id,
      position,
    });
    // Shown where it would stand, such as centred on the Habitat it shields.
    const at = check.ok ? check.position : position;
    const rule = placing.keepClear;
    renderer.showPlacementPreview({
      structureTypeId: placing.id,
      position: at,
      allowed: check.ok,
      plumeEjecta,
      ...(rule === undefined
        ? {}
        : {
            keepClear: {
              radiusMetres: rule.radiusMetres,
              inTheWay: structuresInTheWay(placing.id, at, structures).map(
                (other) => ({
                  position: other.position,
                  footprintRadiusMetres:
                    catalogue.structureTypes.find(
                      ({ id }) => id === other.structureTypeId,
                    )?.footprintRadiusMetres ?? 1,
                }),
              ),
            },
          }),
    });
    setText(
      hint,
      check.ok
        ? `Click to place the ${inSentence(placing.label)} here.${keepClearWarning(placing, at)}${plumeWarning(placing, check.position)}${placing.id === SOLAR_ARRAY_ID ? nextArray : ""}${stockWarning(placing)}`
        : check.message,
    );
    return { type: placing, position };
  }

  const { canvas } = renderer;
  canvas.addEventListener("pointermove", (event) => {
    preview(event.clientX, event.clientY);
  });
  canvas.addEventListener("pointerleave", () => {
    renderer.showPlacementPreview(undefined);
  });
  onClick(canvas, (event) => {
    if (placing === undefined) return;
    if (event.button === 2) {
      stopPlacing("");
      return;
    }
    if (event.button !== 0) return;
    const target = preview(event.clientX, event.clientY);
    if (target === undefined) return;
    const result = campaign.planConstruction({
      structureTypeId: target.type.id,
      position: target.position,
    });
    if (result.ok) {
      stopPlacing(
        `${target.type.label} planned. The Robot will carry out its Construction.`,
      );
    } else {
      setText(hint, result.message);
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && placing !== undefined) {
      // Claims the Esc, so that nothing else closes on it too.
      event.preventDefault();
      stopPlacing("");
    }
  });

  showPlacing();

  return {
    isPlacing() {
      return placing !== undefined;
    },
    update(snapshot) {
      ({ plumeEjecta, structures } = snapshot);
      for (const { type, button, stock, count, meaning } of buttons) {
        // Not offered until its Design is unlocked.
        button.hidden = !snapshot.unlockedDesignIds.includes(type.designId);
        const sets =
          type.id === SOLAR_ARRAY_ID
            ? solarArraysInStock(snapshot)
            : setsAvailable(type, snapshot);
        if (type.id === SOLAR_ARRAY_ID) {
          const next = nextSolarArray(snapshot, snapshot.launchManifest.items);
          nextArray =
            next === undefined
              ? ""
              : ` The next one will be a ${inSentence(next.label)}, from what the base has and what is on sale.`;
          const about = [
            designOf(next?.designId ?? type.designId)?.description,
            describeStructure(next ?? type),
            describeBuild(next ?? type),
            nextArray.trim(),
          ]
            .filter((text) => text !== undefined)
            .join(" ");
          if (button.title !== about) button.title = about;
        }
        available.set(type.id, sets);
        // One made from Regolith alone never runs short.
        const unlimited = type.components.length === 0;
        setText(count, unlimited ? "–" : String(sets));
        setText(meaning, unlimited ? " no Components needed" : " available");
        // Dimmed, while the badge's "0" says so in words.
        const short = !unlimited && sets === 0;
        stock.classList.toggle("build-menu__stock--none", short);
        button.classList.toggle("build-menu__option--short", short);
        stock.title = unlimited ? "No Components needed" : `${sets} available`;
        stocks.set(type.id, { sets, unlimited });
      }
      // A group shows only while it offers something, and says how many of
      // those could be built now, for while it is folded.
      for (const { section, types } of groups) {
        const shown = types.filter((type) =>
          snapshot.unlockedDesignIds.includes(type.designId),
        );
        section.element.hidden = shown.length === 0;
        section.count(shown.length);
        section.summarise(
          shown.length === 0
            ? undefined
            : summariseBuildGroup(
                shown.map(
                  ({ id }) => stocks.get(id) ?? { sets: 0, unlimited: false },
                ),
              ),
        );
      }
    },
  };
}

/**
 * How many more of a Structure the base's stock can supply, leaving aside the
 * Components already promised to planned Constructions that haven't taken
 * them yet. Planning more than this leaves a Construction waiting for
 * Components. One with no Components has no limit.
 */
function setsAvailable(type: StructureType, snapshot: Snapshot): number {
  const promised = (componentId: string) =>
    snapshot.constructions
      .filter((construction) => !construction.componentsTaken)
      .flatMap(
        (construction) =>
          catalogue.structureTypes.find(
            (other) => other.id === construction.structureTypeId,
          )?.components ?? [],
      )
      .filter((need) => need.componentId === componentId)
      .reduce((total, need) => total + need.count, 0);
  return Math.min(
    ...type.components.map((need) => {
      const inStock =
        snapshot.stockpile.components.find(
          (stock) => stock.componentId === need.componentId,
        )?.count ?? 0;
      return Math.max(
        Math.floor((inStock - promised(need.componentId)) / need.count),
        0,
      );
    }),
  );
}
