import type {
  ComponentCount,
  PlantRecipe,
  RecipeOutput,
  ResourceFlow,
} from "./types";

/** The resources a recipe makes, leaving out any Components. */
export function resourceOutputs(
  recipe: { readonly outputs: readonly RecipeOutput[] } | undefined,
): ResourceFlow[] {
  return (recipe?.outputs ?? []).filter((output) => "resource" in output);
}

/** The Components a recipe makes in each batch, leaving out any resources. */
export function componentOutputs(
  recipe: { readonly outputs: readonly RecipeOutput[] } | undefined,
): ComponentCount[] {
  return (recipe?.outputs ?? []).filter((output) => "componentId" in output);
}

/** How many game-hours of work at full performance a batch of a recipe takes. */
export function batchHoursOf(recipe: Pick<PlantRecipe, "batchHours">): number {
  return recipe.batchHours ?? 1;
}
