import {
  batchHoursOf,
  catalogue,
  componentOutputs,
  resourceOutputs,
  type ComponentCount,
  type Design,
  type LaunchItem,
  type LifeSupportStock,
  type PlantRecipe,
  type ResourceFlow,
  type StructureType,
  solarArrayComponentEffects,
} from "../catalogue";
import {
  isPlannedAsItself,
  reserveKilograms,
  SOLAR_ARRAY_ID,
  type Snapshot,
} from "../simulation";
import { formatScience, listInWords, plural } from "./format";
import { describeKeepClear } from "./keep-clear-text";
import {
  componentInSentence,
  componentLabel,
  dismantlingReturn,
  inSentence,
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
  }, and the outputs come as it finishes. It runs only on power nothing else needs: in Daylight while the battery banks would still be full ${formatHours(catalogue.daylightChargeMarginHours)} before Night falls, and at Night while they hold more than everything else needs through the Night and ${formatHours(catalogue.nightReserveHours)} more. Once they have none to spare it stands idle, or runs on and off on the little that is freed: keep enough of what it makes to last the Night.`;

const generates = (kilowatts: number) =>
  `generates ${kilowatts} kW in Daylight`;
const stores = (kilowattHours: number) => `stores ${kilowattHours} kWh`;
/** What a Night load draws: a light while it is on, or a telescope while it observes. */
const drawsAtNight = ({
  power,
  telescope,
  speedsResearch,
  observingRounds,
}: StructureType) =>
  telescope === true || observingRounds !== undefined
    ? `draws ${power.nightDrawKilowatts} kW at Night while it observes, and nothing in Daylight`
    : speedsResearch !== undefined
      ? `draws ${power.nightDrawKilowatts} kW at Night while it runs`
      : `draws ${power.nightDrawKilowatts} kW while its light is on`;
const drawsThroughNight = (kilowatts: number) =>
  `draws ${kilowatts} kW all through the Night, and nothing in Daylight`;
const drawsWhileRunning = (kilowatts: number) =>
  `draws ${kilowatts} kW while it runs`;
const drawsInDaylight = ({ power, speedsResearch }: StructureType) =>
  speedsResearch !== undefined
    ? `draws ${power.daylightDrawKilowatts ?? 0} kW in Daylight while it runs`
    : `draws ${power.daylightDrawKilowatts ?? 0} kW all through Daylight`;
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
    ...((power.nightUpkeepKilowatts ?? 0) > 0
      ? [drawsThroughNight(power.nightUpkeepKilowatts ?? 0)]
      : []),
    ...((power.daylightDrawKilowatts ?? 0) > 0 ? [drawsInDaylight(type)] : []),
    ...(recipe === undefined || recipe.drawKilowatts === 0
      ? []
      : [drawsWhileRunning(recipe.drawKilowatts)]),
    ...(power.drawKilowatts > 0 ? [drawsAllTheTime(power.drawKilowatts)] : []),
  ];
}

/** The life support stocks a Structure's recipes take from. */
function stocksTaken(type: StructureType): LifeSupportStock[] {
  return catalogue.lifeSupportStocks.filter((stock) =>
    type.recipes?.some((recipe) =>
      recipe.inputs.some(
        ({ resource }) =>
          resource.kind === "life-support" && resource.stockId === stock.id,
      ),
    ),
  );
}

/**
 * What a Structure's recipes make of the life support stocks, with whether a
 * recipe makes nothing else, so that it waits when the store is full.
 */
function stocksMade(
  type: StructureType,
): { readonly stock: LifeSupportStock; readonly only: boolean }[] {
  return catalogue.lifeSupportStocks.flatMap((stock) => {
    const recipes = (type.recipes ?? []).filter((recipe) =>
      resourceOutputs(recipe).some(
        ({ resource }) =>
          resource.kind === "life-support" && resource.stockId === stock.id,
      ),
    );
    return recipes.length === 0
      ? []
      : [
          {
            stock,
            only: recipes.every(
              (recipe) => resourceOutputs(recipe).length === 1,
            ),
          },
        ];
  });
}

/** Says what a Structure does once it is commissioned, in figures. */
/** What dismantling a Structure gives back, as a sentence. */
function dismantledGives(structureTypeId: string): string {
  const recovered = dismantlingReturn(structureTypeId);
  return recovered === undefined
    ? "Dismantled, it gives nothing back."
    : `Dismantled, it gives back ${recovered}.`;
}

export function describeStructure(type: StructureType): string {
  const { power } = type;
  const facts = [
    ...(power.generationKilowatts > 0
      ? [generates(power.generationKilowatts)]
      : []),
    ...(type.solarArray?.sealed === true
      ? [
          `its mast is sealed, so that Dust wears it down ${type.dustWearPercentPerHour} percentage points an hour`,
        ]
      : []),
    ...(type.solarArray?.screened === true
      ? [
          `its panels are screened, so that Dust coats them at ${type.hazardMultipliers.dustCoating * 100}% of the usual rate`,
        ]
      : []),
    ...(type.solarArray?.prefabricated === true
      ? ["it comes in one piece, and is likelier to pass Commissioning"]
      : []),
    ...(power.storageKilowattHours > 0
      ? [stores(power.storageKilowattHours)]
      : []),
    ...(type.lightRadiusMetres > 0
      ? [
          `lights the ground ${type.lightRadiusMetres} m round it at Night, switching itself off to save power once the battery banks hold only enough for everything else through the Night and ${formatHours(catalogue.nightReserveHours)} more`,
        ]
      : []),
    ...(type.habitat ? ["is a home the Mission Director can move into"] : []),
    ...(type.buried === true
      ? [
          `is already under the Regolith, so that it takes neither shielding nor a water wall, with a Radiation Dose of ${catalogue.radiation.doseRateMillisievertsPerEarthDay.buriedHabitat} mSv an Earth Day inside`,
        ]
      : []),
    ...(type.shieldsHabitat
      ? ["goes over a commissioned Habitat, cutting the Radiation Dose inside"]
      : []),
    ...(type.waterWall === undefined
      ? []
      : [
          type.waterWall.overBuriedHabitat === true
            ? `goes round a commissioned Buried Habitat, filled all at once with ${type.waterWall.kilograms} kg of ${stockLabel(type.waterWall.stockId).toLowerCase()} from the base's tanks, cutting the Radiation Dose inside to ${catalogue.radiation.doseRateMillisievertsPerEarthDay.cisternedBuriedHabitat} mSv an Earth Day`
            : `goes over a Habitat's Regolith shielding, filled with ${type.waterWall.kilograms} kg of ${stockLabel(type.waterWall.stockId).toLowerCase()}`,
        ]),
    ...(type.stockedWith === undefined
      ? []
      : [
          `is stocked all at once as it is assembled with ${listInWords(type.stockedWith.map(({ kilograms, stockId }) => `${kilograms} kg of ${stockLabel(stockId).toLowerCase()}`))} from the base's tanks, which must leave the Mission Director their reserve: nobody moves in until Crew come`,
        ]),
    ...(type.landingPad
      ? ["the Lander lands on it without blasting Plume Ejecta"]
      : []),
    ...(type.parking === undefined
      ? []
      : [
          `has ${type.parking.bayOffsets.length} bays, each with a power socket, where the Robot parks idle Machines and the Rover together whenever they have nothing else to do, rather than leaving them about the base, once it is cabled to battery banks that will keep them warm through the Night`,
        ]),
    ...(type.growing !== undefined
      ? (type.recipes ?? []).map(
          (recipe) =>
            `grows a crop day and night, using ${flows(recipe.inputs)} an hour, and completes a round for ${formatScience(type.growing?.science ?? 0)} every ${formatHours(type.growing?.lengthHours ?? 0)} it grows`,
        )
      : type.speedsResearch !== undefined
        ? (type.recipes ?? []).map(
            (recipe) =>
              `runs day and night while a Research Task is running, using ${flows(recipe.inputs)} an hour, and makes that Research Task advance ${plural(type.speedsResearch?.addedMinutesPerMinute ?? 0, "game-minute")} more for every game-minute it runs, adding the same again for each lab`,
          )
        : type.observingRounds !== undefined
          ? (type.recipes ?? []).map(
              (recipe) =>
                `observes the sky at Night for the ${type.observingRounds?.label ?? ""}, a standing survey of its own, boiling off ${flows(recipe.inputs)} an hour to cool its camera, and completes a round for ${formatScience(type.observingRounds?.science ?? 0)} every ${formatHours(type.observingRounds?.lengthHours ?? 0)} it observes`,
            )
          : (type.recipes ?? []).map(
              (recipe) =>
                `runs for ${inSentence(recipe.label)}, ${describeRecipeFlows(recipe)}, and ${drawsWhileRunning(recipe.drawKilowatts)}`,
            )),
    ...(type.radioArray === undefined
      ? []
      : [
          `listens to the sky through Daylight and Night for the ${type.radioArray.label}, a standing survey of its own, completing a round for ${formatScience(type.radioArray.science)} every ${formatHours(type.radioArray.lengthHours)} it works with its one antenna field`,
        ]),
    ...(type.telescope === true
      ? [
          `observes the sky at Night for the ${catalogue.observingProgramme.label}, the base's standing Research Task, completing a round for ${formatScience(catalogue.observingProgramme.science)} every ${formatHours(catalogue.observingProgramme.lengthHours)} it observes, switching itself off to save power once the battery banks hold only enough for everything else through the Night and ${formatHours(catalogue.nightReserveHours)} more`,
        ]
      : []),
    ...(type.storageTank === undefined
      ? []
      : [
          `adds ${type.storageTank.kilograms} kg to what the base can hold of ${inSentence(resourceRefLabel(type.storageTank.resource))}`,
        ]),
    ...(power.nightDrawKilowatts > 0 ? [drawsAtNight(type)] : []),
    ...((power.nightUpkeepKilowatts ?? 0) > 0
      ? [drawsThroughNight(power.nightUpkeepKilowatts ?? 0)]
      : []),
    ...((power.daylightDrawKilowatts ?? 0) > 0 ? [drawsInDaylight(type)] : []),
    ...(power.drawKilowatts > 0 ? [drawsAllTheTime(power.drawKilowatts)] : []),
  ];
  const stage = type.stageMachines.assembly;
  return [
    facts.length === 0 ? "It needs no power." : `It ${listInWords(facts)}.`,
    ...(type.recipes?.[0] === undefined
      ? []
      : [
          type.observingRounds !== undefined
            ? `Unlike most Plants, it draws its power as a Night load, in its turn after the heaters, and gives it up before anything else goes without. It takes its propellant an hour's worth at a time, never what the Lander needs to lift and sell the Exports set to load.${type.keepClear === undefined ? "" : ` ${describeKeepClear(type.keepClear, "observe")}, and then draws no power: build it away from the base, at the end of a long cable.`} A shortage of propellant or power, or a light within its dark radius, loses what it has observed of its round, with a notification, and it starts a new one by itself; Daylight only pauses it. Switching it off gives up the round too. More of them earn more, each with its own round.`
            : type.speedsResearch !== undefined
              ? "Unlike most Plants, it draws its power in its turn among the Structures, not on what is left over, as it has to go on through the Night, and gives it up before anything else goes without. It takes its water and oxygen an hour's worth at a time, never below the Mission Director's reserve, and none while no Research Task is running, when it draws no power either. A shortage of any of them only stops the speed-up until it is supplied again: no Research Task is lost or changed."
              : type.growing === undefined
                ? plantsAtNight(batchHoursOf(type.recipes[0]))
                : "Unlike other Plants, it draws its power in its turn among the Structures, not on what is left over, as it has to go on through the Night. It takes its water an hour's worth at a time. A shortage of either loses what it has grown of its round, with a notification, and it starts a new one by itself once it is supplied. Switching it off gives up the round too. More of them earn more, each with its own round.",
        ]),
    ...(type.radioArray === undefined
      ? []
      : [
          `${type.keepClear === undefined ? "" : `${describeKeepClear(type.keepClear, "work")}, though it still draws its power: build it away from the base, at the end of a long cable. `}It isn't a Plant, so arrays never stop each other. A shortage of power, or a Plant within its quiet radius, loses what it has done of its round, with a notification, and it starts a new one by itself. More of them earn more, each with its own round.`,
        ]),
    ...(type.storageTank === undefined
      ? []
      : [
          `It comes empty, and holds its share of the stock. ${type.storageTank.shareLostPerEarthDayWithoutPower > 0 ? `With no power at Night it loses ${Math.round(type.storageTank.shareLostPerEarthDayWithoutPower * 100)}% of its share an Earth Day.` : "It needs no power to keep it."} A Broken one loses its share at once, and one taken apart whatever no longer fits.${type.storageTank.resource.kind === "life-support" ? " None of that takes the stock below the Mission Director's reserve." : ""}`,
        ]),
    ...(type.ownStorage === undefined
      ? []
      : [
          `It holds ${type.ownStorage.kilograms} kg of ${inSentence(resourceRefLabel(type.ownStorage.resource))} in its own tanks, and with no room for a batch in what the base can hold, it waits for tank space, using nothing. Broken or taken apart it no longer counts towards that, though what the base has stays.`,
        ]),
    ...stocksMade(type).map(({ stock, only }) =>
      only
        ? `The base's own tanks hold ${stock.storageLimitKilograms} kg of ${stock.label.toLowerCase()}: with no room for a batch, it waits for tank space, using nothing.`
        : `The base's own tanks hold ${stock.storageLimitKilograms} kg of ${stock.label.toLowerCase()}: once what the base can hold is full, it keeps running for what else it makes, and what doesn't fit is lost.`,
    ),
    ...stocksTaken(type).map(
      (stock) =>
        `It starts no batch that would take ${stock.label.toLowerCase()} below the Mission Director's reserve of ${reserveKilograms(stock.id)} kg, ${stock.reserveEarthDays} Earth Days of what they use, and waits instead.`,
    ),
    ...(stage === undefined
      ? []
      : [`The ${machineLabel(stage).toLowerCase()} builds it.`]),
    dismantledGives(type.id),
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
  // A solar array is planned as one, so its kinds aren't things to unlock.
  const structures = catalogue.structureTypes.filter(
    (type) => type.designId === design.id && isPlannedAsItself(type),
  );
  const items = [
    ...new Set(
      catalogue.launch.items
        .filter(
          (item) =>
            item.designId === design.id &&
            (item.alsoNeedsDesignIds ?? []).length === 0,
        )
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
  const expeditionTypes = catalogue.expeditions.types.filter(
    (type) => type.designId === design.id,
  );
  return [
    ...structures.map(
      (type) => `Unlocks the ${type.label}. ${describeStructure(type)}`,
    ),
    ...expeditionTypes.map(
      (type) =>
        `Offers an Expedition: ${type.label}, away for ${type.awayEarthDays} Earth Days.`,
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
  const solarArrayLabel =
    catalogue.structureTypes.find(({ id }) => id === SOLAR_ARRAY_ID)?.label ??
    "";
  const uses = [
    ...new Set(
      catalogue.structureTypes.flatMap((type) =>
        type.components
          .filter((need) => need.componentId === componentId)
          .map(
            (need) =>
              `${need.count} for each ${type.solarArray === undefined ? type.label : solarArrayLabel}`,
          ),
      ),
    ),
  ];
  const effect = solarArrayComponentEffects[componentId];
  return uses.length === 0
    ? ""
    : `Used to build: ${listInWords(uses)}.${effect === undefined ? "" : ` ${effect}`}`;
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
        `${Number((flow.kilogramsPerHour * hours).toFixed(2))} kg of ${inSentence(resourceRefLabel(flow.resource))}`,
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
