import { catalogue, type StructureType } from "../catalogue";
import type { Renderer } from "../render/renderer";
import type { Campaign, GroundPosition, Snapshot } from "../simulation";
import { setText } from "./dom";

/** A pointer that moves less than this between press and release has clicked rather than dragged. */
const CLICK_TOLERANCE_PX = 6;

export interface BuildMenu {
  update(snapshot: Snapshot): void;
}

/**
 * The build menu. The player picks a Structure, moves its translucent preview
 * over the map, and clicks to plan a Construction there. The menu only sends
 * the plan to the Campaign; the simulation decides whether it is allowed.
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
  options.className = "build-menu__options";
  const hint = document.createElement("p");
  hint.className = "build-menu__hint";
  hint.setAttribute("role", "status");
  hint.setAttribute("aria-label", "Placement");
  panel.append(heading, options, hint);
  container.append(panel);

  let placing: StructureType | undefined;
  /** Where the next take-off or landing blasts Plume Ejecta, as of the latest snapshot. */
  let plumeEjecta: Snapshot["plumeEjecta"];
  /** How many more of each Structure the base's stock can supply, as of the latest snapshot. */
  const available = new Map<string, number>();
  const buttons = catalogue.structureTypes.map((type) => {
    const button = document.createElement("button");
    button.type = "button";
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
    options.append(button);
    return { type, button, stock, count, meaning };
  });

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
      `Click the map to place the ${type.label.toLowerCase()}. Right-click or press Esc to cancel.${stockWarning(type)}`,
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
    renderer.showPlacementPreview({
      structureTypeId: placing.id,
      position: check.ok ? check.position : position,
      allowed: check.ok,
      plumeEjecta,
    });
    setText(
      hint,
      check.ok
        ? `Click to place the ${placing.label.toLowerCase()} here.${plumeWarning(placing, check.position)}${stockWarning(placing)}`
        : check.message,
    );
    return { type: placing, position };
  }

  const { canvas } = renderer;
  let pressed: { x: number; y: number; button: number } | undefined;
  canvas.addEventListener("pointermove", (event) => {
    preview(event.clientX, event.clientY);
  });
  canvas.addEventListener("pointerleave", () => {
    renderer.showPlacementPreview(undefined);
  });
  canvas.addEventListener("pointerdown", (event) => {
    pressed = { x: event.clientX, y: event.clientY, button: event.button };
  });
  canvas.addEventListener("pointerup", (event) => {
    const start = pressed;
    pressed = undefined;
    if (
      placing === undefined ||
      start === undefined ||
      start.button !== event.button ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) >
        CLICK_TOLERANCE_PX
    ) {
      return;
    }
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
    if (event.key === "Escape" && placing !== undefined) stopPlacing("");
  });

  showPlacing();

  return {
    update(snapshot) {
      ({ plumeEjecta } = snapshot);
      for (const { type, stock, count, meaning } of buttons) {
        const sets = setsAvailable(type, snapshot);
        available.set(type.id, sets);
        // One made from Regolith alone never runs short.
        const unlimited = type.components.length === 0;
        setText(count, unlimited ? "–" : String(sets));
        setText(meaning, unlimited ? " no Components needed" : " available");
        stock.classList.toggle(
          "build-menu__stock--none",
          !unlimited && sets === 0,
        );
        stock.title = unlimited ? "No Components needed" : `${sets} available`;
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
