import {
  batchHoursOf,
  catalogue,
  componentOutputs,
  resourceOutputs,
  type ComponentCount,
  type Design,
  type LaunchItem,
  type PlantRecipe,
  type ResourceFlow,
  type StructureType,
} from "../catalogue";
import type { Snapshot } from "../simulation";
import { formatScience, listInWords } from "./format";
import {
  componentInSentence,
  componentLabel,
  formatComponents,
  machineLabel,
  researchTaskLabel,
  resourceRefLabel,
  stockLabel,
} from "./labels";

// What things in the game are for, in words built from the data catalogue,
// for the screens where the player chooses them and for the Guide.

/** How a Plant works, and how it gets its power, which the player has to plan around. */
const plantsAtNight = (batchHours: number) =>
  `Like every Plant, it works in batches${
    batchHours === 1
      ? " of an hour: it starts one once it has an hour's worth of each input"
      : `, here of ${formatHours(batchHours)}: it starts one once it has a batch's worth of each input`
  }, and the outputs come as it finishes. It runs only on power nothing else needs: in Daylight once the battery banks are full, and at Night while they hold more than everything else needs through the Night and ${formatHours(catalogue.nightReserveHours)} more. Once they have none to spare it stands idle: keep enough of what it makes to last the Night.`;

const generates = (kilowatts: number) =>
  `generates ${kilowatts} kW in Daylight`;
const stores = (kilowattHours: number) => `stores ${kilowattHours} kWh`;
/** What a Night load draws: a light while it is on, or a telescope while it observes. */
const drawsAtNight = ({ power, telescope }: StructureType) =>
  telescope === true
    ? `draws ${power.nightDrawKilowatts} kW at Night while it observes, and nothing in Daylight`
    : `draws ${power.nightDrawKilowatts} kW while its light is on`;
const drawsWhileRunning = (kilowatts: number) =>
  `draws ${kilowatts} kW while it runs`;
const drawsAllTheTime = (kilowatts: number) =>
  `draws ${kilowatts} kW all the time`;

/**
 * What a Structure is rated to generate, store and draw, in the data
 * catalogue's figures, in the words the build menu and the Guide use: for
 * a Plant, what the recipe given draws while it runs. Empty if it needs no
 * power.
 */
export function powerRatings(
  type: StructureType,
  recipe: PlantRecipe | undefined,
): string[] {
  const { power } = type;
  return [
    ...(power.generationKilowatts > 0
      ? [generates(power.generationKilowatts)]
      : []),
    ...(power.storageKilowattHours > 0
      ? [stores(power.storageKilowattHours)]
      : []),
    ...(power.nightDrawKilowatts > 0 ? [drawsAtNight(type)] : []),
    ...(recipe === undefined ? [] : [drawsWhileRunning(recipe.drawKilowatts)]),
    ...(power.drawKilowatts > 0 ? [drawsAllTheTime(power.drawKilowatts)] : []),
  ];
}

/** Says what a Structure does once it is commissioned, in figures. */
export function describeStructure(type: StructureType): string {
  const { power } = type;
  const facts = [
    ...(power.generationKilowatts > 0
      ? [generates(power.generationKilowatts)]
      : []),
    ...(power.storageKilowattHours > 0
      ? [stores(power.storageKilowattHours)]
      : []),
    ...(type.lightRadiusMetres > 0
      ? [
          `lights the ground ${type.lightRadiusMetres} m round it at Night, switching itself off to save power once the battery banks hold only enough for everything else through the Night and ${formatHours(catalogue.nightReserveHours)} more`,
        ]
      : []),
    ...(type.habitat ? ["the Mission Director can move into it"] : []),
    ...(type.buried === true
      ? [
          `already under the Regolith, so that it takes neither shielding nor a water wall, with a Radiation Dose of ${catalogue.radiation.doseRateMillisievertsPerEarthDay.buriedHabitat} mSv an Earth Day inside`,
        ]
      : []),
    ...(type.shieldsHabitat
      ? ["goes over a commissioned Habitat, cutting the Radiation Dose inside"]
      : []),
    ...(type.waterWall === undefined
      ? []
      : [
          `goes over a Habitat's Regolith shielding, filled with ${type.waterWall.kilograms} kg of ${stockLabel(type.waterWall.stockId).toLowerCase()}`,
        ]),
    ...(type.landingPad
      ? ["the Lander lands on it without blasting Plume Ejecta"]
      : []),
    ...(type.parking === undefined
      ? []
      : [
          `has ${type.parking.bayOffsets.length} bays, each with a power socket, where the Robot parks idle Machines and the Rover together before Night rather than beside other Structures, once it is cabled to battery banks that will keep them warm through the Night`,
        ]),
    ...(type.recipes ?? []).map(
      (recipe) =>
        `runs for ${recipe.label.toLowerCase()}, ${describeRecipeFlows(recipe)}, and ${drawsWhileRunning(recipe.drawKilowatts)}`,
    ),
    ...(type.telescope === true
      ? [
          `observes the sky at Night for the ${catalogue.observingProgramme.label}, the base's standing Research Task, completing a round for ${formatScience(catalogue.observingProgramme.science)} every ${formatHours(catalogue.observingProgramme.lengthHours)} it observes, switching itself off to save power once the battery banks hold only enough for everything else through the Night and ${formatHours(catalogue.nightReserveHours)} more`,
        ]
      : []),
    ...(power.nightDrawKilowatts > 0 ? [drawsAtNight(type)] : []),
    ...(power.drawKilowatts > 0 ? [drawsAllTheTime(power.drawKilowatts)] : []),
  ];
  const stage = type.stageMachines.assembly;
  return [
    facts.length === 0 ? "It needs no power." : `It ${listInWords(facts)}.`,
    ...(type.recipes?.[0] === undefined
      ? []
      : [plantsAtNight(batchHoursOf(type.recipes[0]))]),
    ...(stage === undefined
      ? []
      : [`The ${machineLabel(stage).toLowerCase()} builds it.`]),
  ].join(" ");
}

/** Says what a Structure is built from and how long the work takes. */
export function describeBuild(type: StructureType): string {
  const { sitePreparation, componentDelivery, assembly, commissioning } =
    type.stageHours;
  const hours = sitePreparation + componentDelivery + assembly + commissioning;
  return `Built from ${type.components.length === 0 ? "Regolith alone" : formatComponents(type.components)}, in about ${formatHours(hours)} of work.`;
}

/**
 * Says what unlocking a Design brings, a sentence for each kind of thing:
 * its Structures, with what each does, its Launch items, the Launch fee it
 * cuts and its Research Tasks.
 */
export function describeUnlocks(design: Design): string[] {
  const structures = catalogue.structureTypes.filter(
    (type) => type.designId === design.id,
  );
  const items = [
    ...new Set(
      catalogue.launch.items
        .filter((item) => item.designId === design.id)
        .map(({ brings }) => {
          switch (brings.kind) {
            case "component":
              return componentLabel(brings.componentId).toLowerCase();
            case "life-support":
              return stockLabel(brings.stockId).toLowerCase();
            case "robot":
              return "Robots";
          }
        }),
    ),
  ];
  const tasks = catalogue.researchTasks
    .filter((task) => task.requiresDesignId === design.id)
    .map((task) => researchTaskLabel(task.id));
  return [
    ...structures.map(
      (type) => `Unlocks the ${type.label}. ${describeStructure(type)}`,
    ),
    ...(items.length === 0
      ? []
      : [`On the Launch manifest: ${listInWords(items)}.`]),
    ...(tasks.length === 0
      ? []
      : [
          `Offers the ${listInWords(tasks)} Research Task${tasks.length === 1 ? "" : "s"}.`,
        ]),
  ];
}

/** Says what a Component is for: the Structures built from it, or Maintenance. */
export function describeComponentUse(componentId: string): string {
  if (componentId === catalogue.maintenance.spareComponentId) {
    const makers = catalogue.structureTypes.filter((type) =>
      type.recipes?.some((recipe) =>
        componentOutputs(recipe).some(
          (made) => made.componentId === componentId,
        ),
      ),
    );
    return `Used up by Maintenance: each restores ${catalogue.maintenance.conditionPercentPerSpareComponent} percentage points of Condition.${
      makers.length === 0
        ? ""
        : ` A ${listInWords(makers.map((type) => type.label))} makes them at the base.`
    }`;
  }
  const uses = catalogue.structureTypes.flatMap((type) =>
    type.components
      .filter((need) => need.componentId === componentId)
      .map((need) => `${need.count} for each ${type.label}`),
  );
  return uses.length === 0 ? "" : `Used to build: ${listInWords(uses)}.`;
}

/** Says what a Launch item is for, beside it on the Launch manifest. */
export function describeLaunchItemUse(item: LaunchItem): string {
  const { brings } = item;
  switch (brings.kind) {
    case "component":
      return describeComponentUse(brings.componentId);
    case "life-support": {
      const stock = catalogue.lifeSupportStocks.find(
        ({ id }) => id === brings.stockId,
      );
      return stock === undefined
        ? ""
        : `In a Habitat, the Mission Director uses ${stock.usePerEarthDayKilograms} kg of ${stock.label.toLowerCase()} an Earth Day, so this lasts them about ${Math.floor(brings.kilograms / stock.usePerEarthDayKilograms)} Earth Days.`;
    }
    case "robot":
      return "Another Robot, which shares the Work Orders with the rest.";
  }
}

/**
 * The Designs the player could unlock next, cheapest first: those not
 * unlocked yet whose prerequisites all are.
 */
export function nextDesigns(
  snapshot: Pick<Snapshot, "unlockedDesignIds">,
): Design[] {
  return catalogue.designs
    .filter(
      (design) =>
        !snapshot.unlockedDesignIds.includes(design.id) &&
        design.prerequisiteDesignIds.every((id) =>
          snapshot.unlockedDesignIds.includes(id),
        ),
    )
    .sort((a, b) => a.scienceCost - b.scienceCost);
}

/**
 * The Designs that earning more Science would put within reach: those the
 * player could unlock next that cost more than the Science they have, but
 * no more than that and the Science earned.
 */
export function designsBroughtWithinReach(
  snapshot: Pick<Snapshot, "unlockedDesignIds" | "science">,
  earned: number,
): Design[] {
  return nextDesigns(snapshot).filter(
    (design) =>
      design.scienceCost > snapshot.science &&
      design.scienceCost <= snapshot.science + earned,
  );
}

/**
 * Says what earning more Science, as a Research Task pays, would do for the
 * Designs the player could unlock next: bring some within reach, or else
 * leave them short of the cheapest still out of reach, and by how much.
 * Undefined once every Design the player could unlock next is affordable,
 * or there is none.
 */
export function describeScienceReach(
  snapshot: Pick<Snapshot, "unlockedDesignIds" | "science">,
  earned: number,
): string | undefined {
  const within = designsBroughtWithinReach(snapshot, earned);
  if (within.length > 0) {
    return `Brings within reach: ${listInWords(within.map((design) => design.label))}`;
  }
  const afterwards = snapshot.science + earned;
  const beyond = nextDesigns(snapshot).filter(
    (design) => design.scienceCost > afterwards,
  );
  const [cheapest] = beyond;
  if (cheapest === undefined) return undefined;
  const cost = cheapest.scienceCost;
  const towards = beyond.filter((design) => design.scienceCost === cost);
  return `Towards ${listInWords(towards.map((design) => design.label))} (${formatScience(cost)}): ${formatScience(cost - afterwards)} short after this task`;
}

export function designOf(designId: string): Design | undefined {
  return catalogue.designs.find((design) => design.id === designId);
}

export function formatHours(hours: number): string {
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

function flows(resources: readonly ResourceFlow[], hours: number = 1): string {
  return listInWords(
    resources.map(
      (flow) =>
        `${Number((flow.kilogramsPerHour * hours).toFixed(2))} kg of ${resourceRefLabel(flow.resource).toLowerCase()}`,
    ),
  );
}

/**
 * Says what a recipe takes in and puts out, for example "turning 4 kg of
 * regolith into 0.15 kg of oxygen an hour", for one that makes Components what a
 * batch does, for example "turning 3.6 kg of metals into 1 spare Component every
 * 24 hours", or for one that takes nothing in what it gets from the ground, for
 * example "making 0.4 kg of water ice an hour from the ground".
 */
function describeRecipeFlows(recipe: PlantRecipe): string {
  const components = componentOutputs(recipe);
  if (components.length === 0) {
    return recipe.inputs.length === 0
      ? `making ${flows(resourceOutputs(recipe))} an hour from the ground`
      : `turning ${flows(recipe.inputs)} into ${flows(resourceOutputs(recipe))} an hour`;
  }
  const hours = batchHoursOf(recipe);
  return `turning ${flows(recipe.inputs, hours)} into ${formatComponentsMade(components)} every ${formatHours(hours)}`;
}

/** Lists the Components a batch makes, for example "1 spare Component". */
export function formatComponentsMade(
  components: readonly ComponentCount[],
): string {
  return listInWords(
    components.map(
      ({ componentId, count }) =>
        `${count} ${componentInSentence(componentId)}${count === 1 ? "" : "s"}`,
    ),
  );
}
