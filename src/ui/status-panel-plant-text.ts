import {
  catalogue,
  componentOutputs,
  resourceOutputs,
  type ResourceRef,
  type PlantRecipe,
} from "../catalogue";
import {
  recipeOf,
  workingRecipeOf,
  type StructureSnapshot,
} from "../simulation";
import { formatShortDuration, listInWords } from "./format";
import { inSentence, structureLabel } from "./labels";
import type { Stat } from "./stat";

// The status panel's words for the Plants that take from or add to the base's
// stocks, and for Plants making spare Components.

/**
 * Adds to what a life support stock's line says which of the Plants that
 * would make it are switched off, for example "lasts 4d 12h,
 * water-processing plant switched off", so that the player sees why it is
 * falling.
 */
export function withSwitchedOffPlants(
  stat: Stat,
  stockId: string,
  structures: readonly Pick<
    StructureSnapshot,
    "structureTypeId" | "recipeId" | "switchedOff"
  >[],
): Stat {
  return withPlantsOff(stat, structures, (recipe) =>
    resourceOutputs(recipe).some(
      (flow) =>
        flow.resource.kind === "life-support" &&
        flow.resource.stockId === stockId,
    ),
  );
}

/**
 * Adds to what a life support stock's line says which Plants are using it and
 * how much, and which are waiting at the Mission Director's reserve, for example
 * "lasts 14d 6h, optics works using 24 kg a day", and given it, how soon they will
 * have taken it down to the reserve, Night included, so that the player sees why it
 * is falling, why it has stopped falling so fast, and whether a Greenhouse will last
 * the Night.
 */
export function withPlantsTaking(
  stat: Stat,
  stockId: string,
  structures: readonly Pick<
    StructureSnapshot,
    "structureTypeId" | "recipeId" | "switchedOff" | "performance" | "plant"
  >[],
  minutesUntilReserve?: number,
): Stat {
  const isThisStock = (resource: ResourceRef) =>
    resource.kind === "life-support" && resource.stockId === stockId;
  const usingPerHour = (
    structure: (typeof structures)[number],
  ): number | undefined => {
    if (
      structure.plant?.running !== true ||
      structure.plant.runningOnAndOff === true ||
      structure.switchedOff
    ) {
      return undefined;
    }
    const flow = workingRecipeOf({
      ...structure,
      batch: structure.plant.batch,
    })?.inputs.find(({ resource }) => isThisStock(resource));
    return flow === undefined
      ? undefined
      : flow.kilogramsPerHour * structure.performance;
  };
  const using = structures.filter((s) => usingPerHour(s) !== undefined);
  const waiting = structures.filter(
    ({ plant }) =>
      plant?.stoppedFor?.reason === "reserve" &&
      isThisStock(plant.stoppedFor.resource),
  );
  const labelsOf = (plants: readonly (typeof structures)[number][]) =>
    listInWords([
      ...new Set(
        plants.map(({ structureTypeId }) =>
          inSentence(structureLabel(structureTypeId)),
        ),
      ),
    ]);
  const perEarthDay =
    using.reduce((sum, structure) => sum + (usingPerHour(structure) ?? 0), 0) *
    24;
  const said = [
    ...(using.length === 0
      ? []
      : [
          `${labelsOf(using)} using ${Number(perEarthDay.toFixed(1))} kg a day`,
          ...(minutesUntilReserve === undefined
            ? []
            : [
                `down to the reserve in ${formatShortDuration(minutesUntilReserve)}`,
              ]),
        ]),
    ...(waiting.length === 0
      ? []
      : [`${labelsOf(waiting)} waiting at the reserve`]),
  ];
  return said.length === 0
    ? stat
    : {
        ...stat,
        note: [...(stat.note === undefined ? [] : [stat.note]), ...said].join(
          ", ",
        ),
      };
}

/** Whether a Structure is a Plant set to make spare Components. */
export function makesSpareComponents(
  structure: Pick<StructureSnapshot, "structureTypeId" | "recipeId">,
): boolean {
  return componentOutputs(recipeOf(structure)).some(
    (made) => made.componentId === catalogue.maintenance.spareComponentId,
  );
}

/**
 * Adds to what the spare Components' line says which of the Plants that would
 * make them are switched off, for example "last 9d 4h, Workshop switched off".
 */
export function withSwitchedOffSpareMakers(
  stat: Stat,
  structures: readonly Pick<
    StructureSnapshot,
    "structureTypeId" | "recipeId" | "switchedOff"
  >[],
): Stat {
  return withPlantsOff(stat, structures, (recipe) =>
    componentOutputs(recipe).some(
      (made) => made.componentId === catalogue.maintenance.spareComponentId,
    ),
  );
}

/** Adds to a line which of the switched-off Plants' recipes make what it is about. */
function withPlantsOff(
  stat: Stat,
  structures: readonly Pick<
    StructureSnapshot,
    "structureTypeId" | "recipeId" | "switchedOff"
  >[],
  makes: (recipe: PlantRecipe) => boolean,
): Stat {
  const off = structures.filter((structure) => {
    const recipe = recipeOf(structure);
    return structure.switchedOff && recipe !== undefined && makes(recipe);
  });
  if (off.length === 0) return stat;
  const labels = [
    ...new Set(
      off.map((structure) =>
        inSentence(structureLabel(structure.structureTypeId)),
      ),
    ),
  ];
  const said = `${listInWords(labels)} switched off`;
  return {
    ...stat,
    note: stat.note === undefined ? said : `${stat.note}, ${said}`,
  };
}
