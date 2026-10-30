import { catalogue } from "../catalogue";
import type { Campaign, Snapshot, StructureSnapshot } from "../simulation";
import { structureLabel } from "./labels";
import type { ChoiceResult } from "./refusal";
import { isHabitat, isToBeDismantled } from "./structure-state";

/** The choices the player can make about a commissioned Structure, which the Campaign decides on. */
export type StructureChoices = Pick<
  Campaign,
  | "dismantleStructure"
  | "moveMissionDirectorIn"
  | "setPlantRecipe"
  | "switchPlant"
>;

export interface StructureControls {
  /** The controls, in order, to place where they go: they keep their place as they show and hide. */
  readonly elements: readonly HTMLElement[];
  /** Keeps the controls in step with the Campaign: which apply now, and what a Plant's are set to. */
  update(snapshot: Snapshot, structure: StructureSnapshot): void;
}

/**
 * The controls for a commissioned Structure, as the Base panel's entry
 * for it and its pop-up on the map both show them: a recipe list for a
 * Plant with more than one recipe, a switch for every Plant, "Move in"
 * for a Habitat while the Mission Director lives aboard the Lander, and
 * "Dismantle". Each sends the choice to the Campaign, which decides
 * whether it is allowed, and passes the result on to say why not.
 */
export function createStructureControls(
  structure: Pick<StructureSnapshot, "id" | "structureTypeId" | "switchedOff">,
  campaign: StructureChoices,
  showResult: (result: ChoiceResult) => void,
): StructureControls {
  const structureId = structure.id;
  // The recipes of a Plant that has more than one, to choose from.
  const recipes =
    catalogue.structureTypes.find(
      (type) => type.id === structure.structureTypeId,
    )?.recipes ?? [];
  let recipe: HTMLSelectElement | undefined;
  if (recipes.length > 1) {
    const select = document.createElement("select");
    select.className = "panel-button";
    select.setAttribute(
      "aria-label",
      `${structureLabel(structure.structureTypeId)} recipe`,
    );
    select.title =
      "Choose what it makes. It switches in the next game-minute, with no work for the Robot.";
    for (const { id, label } of recipes) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = label;
      select.append(option);
    }
    select.addEventListener("change", () => {
      showResult(campaign.setPlantRecipe(structureId, select.value));
    });
    recipe = select;
  }
  // Every Plant can be switched off and on again; the button says which
  // it will do, and the update keeps it in step with the Campaign.
  let switcher: HTMLButtonElement | undefined;
  if (recipes.length > 0) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "panel-button";
    showSwitch(button, structure.switchedOff);
    button.addEventListener("click", () => {
      showResult(
        campaign.switchPlant(
          structureId,
          button.dataset["switchedOff"] === "true" ? "on" : "off",
        ),
      );
    });
    switcher = button;
  }
  const moveIn = document.createElement("button");
  moveIn.type = "button";
  moveIn.className = "panel-button panel-button--primary";
  moveIn.textContent = "Move in";
  moveIn.title =
    "Move the Mission Director from the Lander into this Habitat, which needs power. It happens at once and can't be undone.";
  moveIn.hidden = true;
  moveIn.addEventListener("click", () => {
    showResult(campaign.moveMissionDirectorIn(structureId));
  });
  const dismantle = document.createElement("button");
  dismantle.type = "button";
  dismantle.className = "panel-button";
  dismantle.textContent = "Dismantle";
  dismantle.title =
    "Have the Robot take it apart and carry most of its Components back into the base's stock.";
  dismantle.addEventListener("click", () => {
    showResult(campaign.dismantleStructure(structureId));
  });

  return {
    elements: [
      ...(recipe === undefined ? [] : [recipe]),
      ...(switcher === undefined ? [] : [switcher]),
      moveIn,
      dismantle,
    ],
    update(snapshot, current) {
      const toBeDismantled = isToBeDismantled(snapshot, current.id);
      // The recipe it runs, which a refused choice leaves as it was.
      if (
        recipe !== undefined &&
        current.recipeId !== undefined &&
        recipe.value !== current.recipeId
      ) {
        recipe.value = current.recipeId;
      }
      if (switcher !== undefined) {
        showSwitch(switcher, current.switchedOff);
        // Like Dismantle, there is nothing more to choose for it.
        switcher.hidden = toBeDismantled;
      }
      dismantle.hidden = toBeDismantled;
      moveIn.hidden =
        toBeDismantled ||
        snapshot.missionDirector.residence !== "lander" ||
        !isHabitat(current.structureTypeId);
    },
  };
}

/**
 * Has a Plant's switch offer to switch it on if it is switched off, or off
 * if it isn't, changing the page only when that changes.
 */
function showSwitch(button: HTMLButtonElement, switchedOff: boolean): void {
  const state = String(switchedOff);
  if (button.dataset["switchedOff"] === state) return;
  button.dataset["switchedOff"] = state;
  button.textContent = switchedOff ? "Switch on" : "Switch off";
  button.title = switchedOff
    ? "Let it start batches again, from the next game-minute, with no work for the Robot."
    : "Stop it starting new batches, so that it takes no inputs and leaves its power to other Plants, with no work for the Robot. A batch under way finishes.";
}
