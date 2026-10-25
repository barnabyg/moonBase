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
  const buttons = catalogue.structureTypes.map((type) => {
    const button = document.createElement("button");
    button.type = "button";
    const name = document.createElement("span");
    name.textContent = type.label;
    const stock = document.createElement("span");
    stock.className = "build-menu__stock";
    button.append(name, stock);
    button.addEventListener("click", () => {
      if (placing === type) stopPlacing("");
      else startPlacing(type);
    });
    options.append(button);
    return { type, button, stock };
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
      `Click the map to place the ${type.label.toLowerCase()}. Right-click or press Esc to cancel.`,
    );
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
    renderer.showPlacementPreview({
      structureTypeId: placing.id,
      position,
      allowed: check.ok,
    });
    setText(
      hint,
      check.ok
        ? `Click to place the ${placing.label.toLowerCase()} here.`
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
      stopPlacing(`${target.type.label} planned. The Robot will build it.`);
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
      for (const { type, stock } of buttons) {
        setText(stock, `${setsInCargo(type, snapshot)} in cargo`);
      }
    },
  };
}

/** How many of a Structure the Components in the cargo stock would make. */
function setsInCargo(type: StructureType, snapshot: Snapshot): number {
  return Math.min(
    ...type.components.map((need) => {
      const inStock =
        snapshot.cargo.find((stock) => stock.componentId === need.componentId)
          ?.count ?? 0;
      return Math.floor(inStock / need.count);
    }),
  );
}
