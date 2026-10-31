import {
  batchHoursOf,
  componentOutputs,
  resourceOutputs,
  type Catalogue,
  type ResourceRef,
  type StructureType,
} from "../src/catalogue";

// The pacing report: how the Campaign's numbers fit together, worked out from
// the data catalogue alone, so that a balancing change can be judged without
// playing the game. `npm run pacing-report` prints it, and the catalogue's
// consistency rules (`catalogue-rules.ts`) reuse its figures. See
// docs/reference-campaign.md.

/** The parts of the data catalogue the report reads, so that a test can make up a small one. */
export type PacedCatalogue = Pick<
  Catalogue,
  | "researchTasks"
  | "designs"
  | "structureTypes"
  | "bulkResources"
  | "exports"
  | "launch"
  | "lander"
  | "lunation"
  | "gameSpeeds"
  | "observingProgramme"
>;

const HOURS_PER_EARTH_DAY = 24;
const MINUTES_PER_EARTH_DAY = HOURS_PER_EARTH_DAY * 60;

/** How long a span of Earth Days of game time takes at each game speed but the pause. */
export function realTimes(
  catalogue: Pick<PacedCatalogue, "gameSpeeds">,
  earthDays: number,
): { readonly speed: string; readonly seconds: number }[] {
  return catalogue.gameSpeeds
    .filter((speed) => speed.gameMinutesPerRealSecond > 0)
    .map((speed) => ({
      speed: speed.label,
      seconds:
        (earthDays * MINUTES_PER_EARTH_DAY) / speed.gameMinutesPerRealSecond,
    }));
}

/** One Research Task's completion in the Science timeline, and the Science by then. */
export interface ScienceStep {
  /** The Earth Day it was completed, counting from the first task's start. */
  readonly earthDay: number;
  readonly taskId: string;
  readonly earned: number;
  readonly spent: number;
  /** The Designs unlocked as it completed. */
  readonly unlockedDesignIds: readonly string[];
}

export interface ScienceTimeline {
  /** All the Research Tasks' lengths added up, whether or not all are reached. */
  readonly researchEarthDays: number;
  /** All the Research Tasks' Science added up, whether or not all are reached. */
  readonly scienceEarned: number;
  /** All the Designs' costs added up. */
  readonly designsCost: number;
  readonly steps: readonly ScienceStep[];
  /** The Designs still locked once no Research Task is left on offer. */
  readonly lockedDesignIds: readonly string[];
  /** The Research Tasks never offered, as the Design each needs stays locked. */
  readonly unreachedTaskIds: readonly string[];
}

/**
 * Science earned and spent over time: one Research Task at a time, back to
 * back, the shortest on offer first, unlocking the cheapest Design it can as
 * soon as it can.
 */
export function scienceTimeline(
  catalogue: Pick<PacedCatalogue, "researchTasks" | "designs">,
): ScienceTimeline {
  const { researchTasks, designs } = catalogue;
  const unlocked = new Set(
    designs.filter((design) => design.starting).map((design) => design.id),
  );
  const left = [...researchTasks].sort((a, b) => a.lengthHours - b.lengthHours);
  const steps: ScienceStep[] = [];
  let hours = 0;
  let earned = 0;
  let spent = 0;
  for (;;) {
    const index = left.findIndex(
      (task) =>
        task.requiresDesignId === undefined ||
        unlocked.has(task.requiresDesignId),
    );
    const [task] = index < 0 ? [] : left.splice(index, 1);
    if (task === undefined) break;
    hours += task.lengthHours;
    earned += task.science;
    const unlockedDesignIds: string[] = [];
    for (;;) {
      const next = designs
        .filter(
          (design) =>
            !unlocked.has(design.id) &&
            design.scienceCost <= earned - spent &&
            design.prerequisiteDesignIds.every((id) => unlocked.has(id)),
        )
        .sort((a, b) => a.scienceCost - b.scienceCost)[0];
      if (next === undefined) break;
      unlocked.add(next.id);
      spent += next.scienceCost;
      unlockedDesignIds.push(next.id);
    }
    steps.push({
      earthDay: hours / HOURS_PER_EARTH_DAY,
      taskId: task.id,
      earned,
      spent,
      unlockedDesignIds,
    });
  }
  return {
    researchEarthDays:
      researchTasks.reduce((total, task) => total + task.lengthHours, 0) /
      HOURS_PER_EARTH_DAY,
    scienceEarned: researchTasks.reduce(
      (total, task) => total + task.science,
      0,
    ),
    designsCost: designs.reduce(
      (total, design) => total + design.scienceCost,
      0,
    ),
    steps,
    lockedDesignIds: designs
      .filter((design) => !unlocked.has(design.id))
      .map((design) => design.id),
    unreachedTaskIds: left.map((task) => task.id),
  };
}

export interface DepthRank {
  readonly depth: number;
  readonly designs: number;
  readonly totalCost: number;
  readonly cheapest: number;
  readonly dearest: number;
}

/**
 * How deep each Design is in the Tech Tree: the starting ones 0, any other
 * one past its deepest prerequisite.
 */
function designDepths(
  catalogue: Pick<PacedCatalogue, "designs">,
): Map<string, number> {
  const depths = new Map<string, number>();
  const depthOf = (id: string): number => {
    const known = depths.get(id);
    if (known !== undefined) return known;
    const design = catalogue.designs.find((candidate) => candidate.id === id);
    const depth =
      design === undefined || design.starting
        ? 0
        : 1 + Math.max(0, ...design.prerequisiteDesignIds.map(depthOf));
    depths.set(id, depth);
    return depth;
  };
  for (const design of catalogue.designs) depthOf(design.id);
  return depths;
}

/** The Designs' cost at each depth in the Tech Tree, shallowest first. */
export function designsByDepth(
  catalogue: Pick<PacedCatalogue, "designs">,
): DepthRank[] {
  const depths = designDepths(catalogue);
  const ranks = new Map<number, number[]>();
  for (const design of catalogue.designs) {
    const depth = depths.get(design.id) ?? 0;
    ranks.set(depth, [...(ranks.get(depth) ?? []), design.scienceCost]);
  }
  return [...ranks]
    .sort(([a], [b]) => a - b)
    .map(([depth, costs]) => ({
      depth,
      designs: costs.length,
      totalCost: costs.reduce((total, cost) => total + cost, 0),
      cheapest: Math.min(...costs),
      dearest: Math.max(...costs),
    }));
}

/** What a full set of a Structure's Components comes to by Launch: infinite if a Launch can't bring them. */
export function importCost(
  catalogue: Pick<PacedCatalogue, "launch">,
  type: StructureType,
): { readonly millionDollars: number; readonly kilograms: number } {
  let millionDollars = 0;
  let kilograms = 0;
  for (const need of type.components) {
    const item = catalogue.launch.items.find(
      (candidate) =>
        candidate.brings.kind === "component" &&
        candidate.brings.componentId === need.componentId,
    );
    millionDollars += (item?.priceMillionDollars ?? Infinity) * need.count;
    kilograms += (item?.massKilograms ?? Infinity) * need.count;
  }
  return { millionDollars, kilograms };
}

function roundTripEarthDays(catalogue: Pick<PacedCatalogue, "lander">): number {
  const { toEarth, turnaround, toMoon } = catalogue.lander.roundTripEarthDays;
  return toEarth + turnaround + toMoon;
}

/** The share of the time Plants run, as they run only in Daylight. */
function daylightShare(catalogue: Pick<PacedCatalogue, "lunation">): number {
  const { daylightEarthDays, nightEarthDays } = catalogue.lunation;
  return daylightEarthDays / (daylightEarthDays + nightEarthDays);
}

/** A Plant's recipe that makes an Export, and what running it earns. */
export interface PlantEarning {
  readonly structureTypeId: string;
  readonly designId: string;
  readonly recipeId: string;
  /** What the Plant's Components come to by Launch, with no Launch fee. */
  readonly costMillionDollars: number;
  /** The Exports it makes that the Lander can carry away. */
  readonly exportKilogramsPerEarthDay: number;
  /** Whether it makes more than the Lander can carry away. */
  readonly returnMassLimited: boolean;
  /** What those Exports sell for, less what the Exports they use up would have. */
  readonly millionDollarsPerEarthDay: number;
  readonly paybackEarthDays: number;
}

/**
 * Every Plant recipe that makes an Export, running through Daylight with its
 * inputs always there, and selling all it makes up to what the Lander can
 * carry away, a full Return Mass every round trip.
 */
export function plantEarnings(
  catalogue: Pick<
    PacedCatalogue,
    "structureTypes" | "exports" | "launch" | "lander" | "lunation"
  >,
): PlantEarning[] {
  const priceOf = (resource: ResourceRef): number | undefined =>
    resource.kind === "bulk-resource"
      ? catalogue.exports.find(
          (sold) => sold.resourceId === resource.resourceId,
        )?.priceMillionDollarsPerKilogram
      : undefined;
  const hoursRunPerEarthDay = HOURS_PER_EARTH_DAY * daylightShare(catalogue);
  const carriedPerEarthDay =
    catalogue.lander.returnMassKilograms / roundTripEarthDays(catalogue);
  const earnings: PlantEarning[] = [];
  for (const type of catalogue.structureTypes) {
    for (const recipe of type.recipes ?? []) {
      let kilogramsPerHour = 0;
      let valuePerHour = 0;
      for (const output of resourceOutputs(recipe)) {
        const price = priceOf(output.resource);
        if (price === undefined) continue;
        kilogramsPerHour += output.kilogramsPerHour;
        valuePerHour += price * output.kilogramsPerHour;
      }
      if (kilogramsPerHour === 0) continue;
      for (const input of recipe.inputs) {
        valuePerHour -= (priceOf(input.resource) ?? 0) * input.kilogramsPerHour;
      }
      const made = kilogramsPerHour * hoursRunPerEarthDay;
      const sold = Math.min(made, carriedPerEarthDay);
      const millionDollarsPerEarthDay =
        valuePerHour * hoursRunPerEarthDay * (sold / made);
      const costMillionDollars = importCost(catalogue, type).millionDollars;
      earnings.push({
        structureTypeId: type.id,
        designId: type.designId,
        recipeId: recipe.id,
        costMillionDollars,
        exportKilogramsPerEarthDay: sold,
        returnMassLimited: made > carriedPerEarthDay,
        millionDollarsPerEarthDay,
        paybackEarthDays: costMillionDollars / millionDollarsPerEarthDay,
      });
    }
  }
  return earnings;
}

/** A Plant's recipe that makes Components, and what running it saves on Launches. */
export interface ComponentMaker {
  readonly structureTypeId: string;
  readonly recipeId: string;
  readonly componentId: string;
  /** How many it makes in a Lunation, running through Daylight with its inputs always there. */
  readonly madePerLunation: number;
  /** How many kilograms of inputs that takes. */
  readonly inputKilogramsPerLunation: number;
  /** What bringing as many by Launch would take of the Payload Mass and cost, with no Launch fee. */
  readonly savesKilogramsPerLunation: number;
  readonly savesMillionDollarsPerLunation: number;
  /** How many Lunations' Payload Mass saved its own Components' mass comes to. */
  readonly paybackLunations: number;
}

/** Every Plant recipe that makes Components, against bringing them by Launch. */
export function componentMakers(
  catalogue: Pick<PacedCatalogue, "structureTypes" | "launch" | "lunation">,
): ComponentMaker[] {
  const daylightHours =
    catalogue.lunation.daylightEarthDays * HOURS_PER_EARTH_DAY;
  return catalogue.structureTypes.flatMap((type) =>
    (type.recipes ?? []).flatMap((recipe) => {
      const batches = daylightHours / batchHoursOf(recipe);
      return componentOutputs(recipe).map(({ componentId, count }) => {
        const item = catalogue.launch.items.find(
          ({ brings }) =>
            brings.kind === "component" && brings.componentId === componentId,
        );
        const madePerLunation = batches * count;
        const savesKilogramsPerLunation =
          madePerLunation * (item?.massKilograms ?? 0);
        return {
          structureTypeId: type.id,
          recipeId: recipe.id,
          componentId,
          madePerLunation,
          inputKilogramsPerLunation: recipe.inputs.reduce(
            (total, input) => total + input.kilogramsPerHour * daylightHours,
            0,
          ),
          savesKilogramsPerLunation,
          savesMillionDollarsPerLunation:
            madePerLunation * (item?.priceMillionDollars ?? 0),
          paybackLunations:
            importCost(catalogue, type).kilograms / savesKilogramsPerLunation,
        };
      });
    }),
  );
}

/** A Design that earns Science, and whether and how soon that pays for it. */
export interface ScienceEarner {
  readonly designId: string;
  readonly scienceCost: number;
  /** What the Research Tasks it offers pay, once each. */
  readonly taskScience: number;
  /** What one telescope of its earns in a Lunation. */
  readonly sciencePerLunation: number;
  /** How soon that pays for it: undefined if it never does. */
  readonly paybackEarthDays: number | undefined;
}

/**
 * Every Design that earns Science: by the Research Tasks it offers, run back
 * to back, and by one telescope observing through every Night.
 */
export function scienceEarners(
  catalogue: Pick<
    PacedCatalogue,
    | "designs"
    | "researchTasks"
    | "structureTypes"
    | "lunation"
    | "observingProgramme"
  >,
): ScienceEarner[] {
  const { daylightEarthDays, nightEarthDays } = catalogue.lunation;
  const lunationEarthDays = daylightEarthDays + nightEarthDays;
  const { lengthHours, science } = catalogue.observingProgramme;
  const roundsPerLunation =
    (nightEarthDays * HOURS_PER_EARTH_DAY) / lengthHours;
  return catalogue.designs.flatMap((design) => {
    const tasks = catalogue.researchTasks.filter(
      (task) => task.requiresDesignId === design.id,
    );
    const taskScience = tasks.reduce((total, task) => total + task.science, 0);
    const taskEarthDays =
      tasks.reduce((total, task) => total + task.lengthHours, 0) /
      HOURS_PER_EARTH_DAY;
    const sciencePerLunation = catalogue.structureTypes.some(
      (type) => type.designId === design.id && type.telescope === true,
    )
      ? roundsPerLunation * science
      : 0;
    if (taskScience === 0 && sciencePerLunation === 0) return [];
    const perEarthDay =
      (taskEarthDays > 0 ? taskScience / taskEarthDays : 0) +
      sciencePerLunation / lunationEarthDays;
    return [
      {
        designId: design.id,
        scienceCost: design.scienceCost,
        taskScience,
        sciencePerLunation,
        paybackEarthDays:
          sciencePerLunation > 0 || taskScience >= design.scienceCost
            ? design.scienceCost / perEarthDay
            : undefined,
      },
    ];
  });
}

/** How fast each type of Plant that makes a bulk resource can make it, by the recipe that makes the most, in catalogue order. */
function kilogramsPerHourByPlant(
  catalogue: Pick<PacedCatalogue, "structureTypes">,
  resourceId: string,
): number[] {
  return catalogue.structureTypes.flatMap((type) => {
    const rates = (type.recipes ?? []).flatMap((recipe) =>
      resourceOutputs(recipe)
        .filter(
          ({ resource }) =>
            resource.kind === "bulk-resource" &&
            resource.resourceId === resourceId,
        )
        .map(({ kilogramsPerHour }) => kilogramsPerHour),
    );
    return rates.length === 0 ? [] : [Math.max(...rates)];
  });
}

/** How long a Plant making this much an hour takes to make a full Return Mass, running through Daylight. */
function earthDaysToFill(
  catalogue: Pick<PacedCatalogue, "lander" | "lunation">,
  kilogramsPerHour: number,
): number {
  return (
    catalogue.lander.returnMassKilograms /
    (kilogramsPerHour * HOURS_PER_EARTH_DAY * daylightShare(catalogue))
  );
}

export interface ExportEconomics {
  /** One of every Launch item: the whole of what Earth can sell the base. */
  readonly everyItem: {
    readonly millionDollars: number;
    readonly kilograms: number;
    readonly launchesToCarry: number;
  };
  readonly exports: readonly {
    readonly resourceId: string;
    /** A full Return Mass's price. */
    readonly incomeMillionDollars: number;
    readonly feeMillionDollars: number;
    readonly profitMillionDollars: number;
    /** How many Launches' profit buys one of every Launch item: undefined if there is none. */
    readonly launchesToBuyEverything: number | undefined;
    /**
     * How long each trip takes: a round trip, or as long as the first Plant
     * that makes the Export takes to fill the Return Mass, if that is longer.
     */
    readonly earthDaysPerTrip: number;
    /**
     * What limits how much of it can be sold in the end: "plant" if even the
     * fastest Plant that makes it fills the Return Mass more slowly than the
     * Lander makes the round trip, and "return-mass" if the Lander can't carry
     * away what that Plant makes.
     */
    readonly limitedBy: "plant" | "return-mass";
  }[];
}

/**
 * What each Launch earns and costs for each Export: every trip carries off a
 * full Return Mass of the one Export, and the Launch pays only the fee, so
 * that whatever it brings comes out of the profit.
 */
export function exportEconomics(
  catalogue: Pick<
    PacedCatalogue,
    "exports" | "launch" | "lander" | "lunation" | "structureTypes"
  >,
): ExportEconomics {
  const { items, feeMillionDollars, payloadMassLimitKilograms } =
    catalogue.launch;
  const millionDollars = items.reduce(
    (total, item) => total + item.priceMillionDollars,
    0,
  );
  const kilograms = items.reduce(
    (total, item) => total + item.massKilograms,
    0,
  );
  return {
    everyItem: {
      millionDollars,
      kilograms,
      launchesToCarry: Math.ceil(kilograms / payloadMassLimitKilograms),
    },
    exports: catalogue.exports.map((sold) => {
      const income =
        sold.priceMillionDollarsPerKilogram *
        catalogue.lander.returnMassKilograms;
      const profit = income - feeMillionDollars;
      const rates = kilogramsPerHourByPlant(catalogue, sold.resourceId);
      const fastest = Math.max(0, ...rates);
      return {
        resourceId: sold.resourceId,
        incomeMillionDollars: income,
        feeMillionDollars,
        profitMillionDollars: profit,
        launchesToBuyEverything:
          profit > 0 ? Math.ceil(millionDollars / profit) : undefined,
        earthDaysPerTrip: Math.max(
          roundTripEarthDays(catalogue),
          rates[0] === undefined ? 0 : earthDaysToFill(catalogue, rates[0]),
        ),
        limitedBy:
          fastest > 0 &&
          earthDaysToFill(catalogue, fastest) > roundTripEarthDays(catalogue)
            ? "plant"
            : "return-mass",
      };
    }),
  };
}

/** The stretch of game time an Act is meant to last, and what it brings to spend Funding on. */
export interface ActPlan {
  readonly label: string;
  readonly fromEarthDay: number;
  readonly toEarthDay: number;
  /** The Earth Day it wants Designs still to buy at. */
  readonly designsLeftAtEarthDay: number;
  /** The Designs whose Structures are the Act's big purchases. */
  readonly designIds: readonly string[];
}

/** Act 2's plan, as docs/balancing.md has it. */
export const act2Plan: ActPlan = {
  label: "Act 2",
  fromEarthDay: 350,
  toEarthDay: 900,
  designsLeftAtEarthDay: 700,
  designIds: [
    "parts-machining",
    "array-fabrication",
    "concentrator-towers",
    "thermal-storage",
    "cold-trap-mining",
  ],
};

/**
 * Roughly the Earth Day a base following the Milestones starts its first
 * Research Task, as the reference Campaign does, to set research's clock against
 * the Campaign's.
 */
const FIRST_RESEARCH_EARTH_DAY = 16;

export interface ActBalance {
  readonly plan: ActPlan;
  /** What Research Tasks pay over the Act, and what the Designs unlocked in it cost. */
  readonly scienceEarned: number;
  readonly scienceSpent: number;
  /** The Designs unlocked over the Act, in order. */
  readonly designsUnlockedIds: readonly string[];
  /** The Designs still locked at the Earth Day the Act wants some left at. */
  readonly designsLeftIds: readonly string[];
  /** The Earth Day the last Research Task is complete. */
  readonly researchEndsEarthDay: number;
  /** What the Act's Designs' Structures cost, one of each, with no Launch fee. */
  readonly purchases: readonly {
    readonly structureTypeId: string;
    readonly millionDollars: number;
    readonly kilograms: number;
  }[];
  readonly purchasesMillionDollars: number;
  /** A full Return Mass of the best Export sold at the rate its first Plant makes it, over the Act. */
  readonly incomeMillionDollars: number;
  /** The same, with the second-best Export filling all the Return Mass that leaves, a trip every round trip. */
  readonly incomeWithRestFilledMillionDollars: number;
}

/**
 * How Science and Funding balance over an Act, by the same assumptions as the
 * rest of the report: research on its clock from the first Research Task, every
 * Export as fast as its first Plant makes it, and no Launch fees.
 */
export function actBalance(
  catalogue: PacedCatalogue,
  plan: ActPlan = act2Plan,
): ActBalance {
  const { steps } = scienceTimeline(catalogue);
  const onClock = (step: ScienceStep) =>
    step.earthDay + FIRST_RESEARCH_EARTH_DAY;
  const upTo = (earthDay: number) =>
    steps.filter((step) => onClock(step) < earthDay).at(-1);
  const start = upTo(plan.fromEarthDay);
  const end = upTo(plan.toEarthDay);
  const unlockedBy = (earthDay: number) =>
    new Set(
      steps
        .filter((step) => onClock(step) < earthDay)
        .flatMap((step) => step.unlockedDesignIds),
    );
  const atLeft = unlockedBy(plan.designsLeftAtEarthDay);
  const types = catalogue.structureTypes.filter((type) =>
    plan.designIds.includes(type.designId),
  );
  const purchases = types.map((type) => ({
    structureTypeId: type.id,
    ...importCost(catalogue, type),
  }));
  const earthDays = plan.toEarthDay - plan.fromEarthDay;
  const { exports: sold } = exportEconomics(catalogue);
  const [best, next] = [...sold].sort(
    (a, b) => b.incomeMillionDollars - a.incomeMillionDollars,
  );
  const roundTrip = roundTripEarthDays(catalogue);
  const rest =
    best === undefined ? 0 : Math.max(1 - roundTrip / best.earthDaysPerTrip, 0);
  const income =
    best === undefined
      ? 0
      : (best.incomeMillionDollars / best.earthDaysPerTrip) * earthDays;
  return {
    plan,
    scienceEarned: (end?.earned ?? 0) - (start?.earned ?? 0),
    scienceSpent: (end?.spent ?? 0) - (start?.spent ?? 0),
    designsUnlockedIds: steps
      .filter(
        (step) =>
          onClock(step) >= plan.fromEarthDay && onClock(step) < plan.toEarthDay,
      )
      .flatMap((step) => step.unlockedDesignIds),
    designsLeftIds: catalogue.designs
      .filter((design) => !design.starting && !atLeft.has(design.id))
      .map((design) => design.id),
    researchEndsEarthDay:
      (steps.at(-1)?.earthDay ?? 0) + FIRST_RESEARCH_EARTH_DAY,
    purchases,
    purchasesMillionDollars: purchases.reduce(
      (total, purchase) => total + purchase.millionDollars,
      0,
    ),
    incomeMillionDollars: income,
    incomeWithRestFilledMillionDollars:
      income +
      (next === undefined
        ? 0
        : (next.incomeMillionDollars * rest * earthDays) / roundTrip),
  };
}

/**
 * Something a Design brings that can be weighed against what another brings:
 * a Structure type, one recipe of a Plant, or a tank of oxygen or water.
 */
export interface Offering {
  readonly thing: string;
  readonly designId: string;
  /** The job it does: only things doing the same one are compared. */
  readonly job: string;
  /** What it takes to have; less is better. */
  readonly costs: Readonly<Record<string, number>>;
  /** What it does; more is better, so anything where less is better is negative. */
  readonly worth: Readonly<Record<string, number>>;
}

/** The job a Structure type does, undefined for one that is a Plant, each of whose recipes has its own. */
function structureJob(type: StructureType): string | undefined {
  if (type.recipes !== undefined) return undefined;
  if (type.habitat) return "habitat";
  if (type.shieldsHabitat) return "shielding";
  if (type.waterWall !== undefined) return "water wall";
  if (type.landingPad) return "landing pad";
  if (type.parking !== undefined) return "parking";
  if (type.telescope === true) return "telescope";
  if (type.power.generationKilowatts > 0) return "power generation";
  if (type.power.storageKilowattHours > 0) return "power storage";
  if (type.lightRadiusMetres > 0) return "light";
  return `only ${type.id}`;
}

function outputId(resource: ResourceRef): string {
  return resource.kind === "bulk-resource"
    ? resource.resourceId
    : resource.stockId;
}

/** Everything each Design brings that can be weighed against what another brings. */
export function offerings(
  catalogue: Pick<PacedCatalogue, "designs" | "structureTypes" | "launch">,
): Offering[] {
  const scienceTo = (designId: string): number => {
    const seen = new Set<string>();
    let total = 0;
    const waiting = [designId];
    for (let id = waiting.pop(); id !== undefined; id = waiting.pop()) {
      if (seen.has(id)) continue;
      seen.add(id);
      const design = catalogue.designs.find((candidate) => candidate.id === id);
      total += design?.scienceCost ?? 0;
      waiting.push(...(design?.prerequisiteDesignIds ?? []));
    }
    return total;
  };
  const found: Offering[] = [];
  for (const type of catalogue.structureTypes) {
    const { millionDollars, kilograms } = importCost(catalogue, type);
    const { sitePreparation, componentDelivery, assembly, commissioning } =
      type.stageHours;
    const costs = {
      science: scienceTo(type.designId),
      millionDollars,
      kilograms,
    };
    const common = {
      buildHours: -(
        sitePreparation +
        componentDelivery +
        assembly +
        commissioning
      ),
      footprint: -type.footprintRadiusMetres,
      commissioningFailure: -type.commissioningFailureChance,
      dustWear: -type.dustWearPercentPerHour,
      dustCoating: -type.hazardMultipliers.dustCoating,
      micrometeorites: -type.hazardMultipliers.micrometeorites,
      plumeEjecta: -type.hazardMultipliers.plumeEjecta,
    };
    const job = structureJob(type);
    if (job !== undefined) {
      found.push({
        thing: type.id,
        designId: type.designId,
        job,
        costs,
        worth: {
          ...common,
          generation: type.power.generationKilowatts,
          storage: type.power.storageKilowattHours,
          light: type.lightRadiusMetres,
          draw: -type.power.drawKilowatts,
          nightDraw: -type.power.nightDrawKilowatts,
          buried: type.buried === true ? 1 : 0,
        },
      });
    }
    for (const recipe of type.recipes ?? []) {
      // What a recipe makes an hour, whether kilograms of a resource or a
      // number of a Component, each by the id it goes by.
      const made = [
        ...resourceOutputs(recipe).map((output) => ({
          id: outputId(output.resource),
          perHour: output.kilogramsPerHour,
        })),
        ...componentOutputs(recipe).map((output) => ({
          id: output.componentId,
          perHour: output.count / batchHoursOf(recipe),
        })),
      ];
      const madePerHour = made.reduce(
        (total, output) => total + output.perHour,
        0,
      );
      const worth: Record<string, number> = {
        ...common,
        draw: -type.power.drawKilowatts,
        recipeDrawPerKilogram: -recipe.drawKilowatts / madePerHour,
      };
      for (const output of made) {
        worth[`makes ${output.id}`] = output.perHour;
      }
      for (const input of recipe.inputs) {
        worth[`uses ${outputId(input.resource)} per kilogram`] =
          -input.kilogramsPerHour / madePerHour;
      }
      found.push({
        thing: `${type.id}: ${recipe.id}`,
        designId: type.designId,
        job: `making ${made
          .map((output) => output.id)
          .sort()
          .join(", ")}`,
        costs,
        worth,
      });
    }
  }
  for (const item of catalogue.launch.items) {
    if (item.brings.kind !== "life-support") continue;
    const { kilograms } = item.brings;
    found.push({
      thing: item.id,
      designId: item.designId,
      job: `bringing ${item.brings.stockId}`,
      costs: {
        science: scienceTo(item.designId),
        millionDollarsPerKilogram: item.priceMillionDollars / kilograms,
        kilogramsPerKilogram: item.massKilograms / kilograms,
      },
      worth: {},
    });
  }
  return found;
}

/** Whether one Offering is at least as good in every way as another, and better in some. */
function beats(a: Offering, b: Offering): boolean {
  if (a.job !== b.job) return false;
  const margins = [
    ...Object.keys(b.costs).map(
      (key) => (b.costs[key] ?? 0) - (a.costs[key] ?? 0),
    ),
    ...[...new Set([...Object.keys(a.worth), ...Object.keys(b.worth)])].map(
      (key) => (a.worth[key] ?? 0) - (b.worth[key] ?? 0),
    ),
  ];
  return margins.every((margin) => margin >= 0) && margins.some((m) => m > 0);
}

export interface BeatenDesign {
  readonly designId: string;
  /** Each thing it brings, and something another Design brings that beats it. */
  readonly beaten: readonly { readonly thing: string; readonly by: string }[];
}

/**
 * The Designs where something from another Design, for no more Science on the
 * way to it, no more money and no more mass, is at least as good at the same
 * job as everything the Design brings that can be weighed at all.
 */
export function beatenDesigns(
  catalogue: Pick<PacedCatalogue, "designs" | "structureTypes" | "launch">,
): BeatenDesign[] {
  const all = offerings(catalogue);
  return catalogue.designs.flatMap((design) => {
    const own = all.filter((offering) => offering.designId === design.id);
    const beaten = own.flatMap((offering) => {
      const by = all.find(
        (other) => other.designId !== design.id && beats(other, offering),
      );
      return by === undefined ? [] : [{ thing: offering.thing, by: by.thing }];
    });
    return own.length > 0 && beaten.length === own.length
      ? [{ designId: design.id, beaten }]
      : [];
  });
}

function formatRealTime(seconds: number): string {
  const whole = Math.round(seconds);
  if (whole < 90) return `${whole} s`;
  const minutes = Math.round(whole / 60);
  if (minutes < 90) return `${minutes} min`;
  const hours = whole / 3600;
  return `${hours.toFixed(1)} h`;
}

/** The real time a span of game time takes at each game speed, for a line of the report. */
function atEachSpeed(
  catalogue: Pick<PacedCatalogue, "gameSpeeds">,
  earthDays: number,
): string {
  return realTimes(catalogue, earthDays)
    .map(({ speed, seconds }) => `${formatRealTime(seconds)} at ${speed}`)
    .reverse()
    .join(", ");
}

function money(millionDollars: number): string {
  return `$${Number(millionDollars.toFixed(1))}M`;
}

function days(earthDays: number): string {
  return `${Number(earthDays.toFixed(1))} Earth Days`;
}

/** What the catalogue calls something, for a line of text. */
export function labelOf(
  entries: readonly { readonly id: string; readonly label: string }[],
  id: string,
): string {
  return entries.find((entry) => entry.id === id)?.label ?? id;
}

/** The report as lines of text, for `npm run pacing-report`. */
export function formatPacingReport(
  catalogue: PacedCatalogue & Pick<Catalogue, "version">,
): string[] {
  const timeline = scienceTimeline(catalogue);
  const economics = exportEconomics(catalogue);
  const earnings = plantEarnings(catalogue);
  const earners = scienceEarners(catalogue);
  const makers = componentMakers(catalogue);
  const beaten = beatenDesigns(catalogue);
  const best = [...economics.exports].sort(
    (a, b) => b.profitMillionDollars - a.profitMillionDollars,
  )[0];
  const roundTrip = roundTripEarthDays(catalogue);
  const act = actBalance(catalogue);
  return [
    `Pacing report: data catalogue version ${catalogue.version}. It reads only the catalogue; nothing is played.`,
    "",
    "Science earned and spent over time",
    "  Assumes one Research Task at a time, back to back, the shortest on offer first, and the cheapest Design it can afford unlocked as soon as it can. It leaves out the observing programme.",
    `  The Research Tasks take ${days(timeline.researchEarthDays)} back to back (${atEachSpeed(catalogue, timeline.researchEarthDays)}) and pay ${timeline.scienceEarned} Science. The Designs cost ${timeline.designsCost} Science.`,
    "  Earth Day  Earned  Spent  Research Task completed, and Designs unlocked",
    ...timeline.steps.map((step) => {
      const unlocks = step.unlockedDesignIds.map((id) =>
        labelOf(catalogue.designs, id),
      );
      return `  ${step.earthDay.toFixed(1).padStart(9)}  ${String(step.earned).padStart(6)}  ${String(step.spent).padStart(5)}  ${labelOf(catalogue.researchTasks, step.taskId)}${unlocks.length > 0 ? `; unlocks ${unlocks.join(", ")}` : ""} (${atEachSpeed(catalogue, step.earthDay)})`;
    }),
    ...(timeline.lockedDesignIds.length > 0
      ? [
          `  Still locked at the end: ${timeline.lockedDesignIds.map((id) => labelOf(catalogue.designs, id)).join(", ")}.`,
        ]
      : []),
    ...(timeline.unreachedTaskIds.length > 0
      ? [
          `  Never offered: ${timeline.unreachedTaskIds.map((id) => labelOf(catalogue.researchTasks, id)).join(", ")}.`,
        ]
      : []),
    "",
    "The Designs' cost by depth in the Tech Tree (starting Designs are depth 0)",
    "  Depth  Designs  Science  Cheapest  Dearest",
    ...designsByDepth(catalogue).map(
      (rank) =>
        `  ${String(rank.depth).padStart(5)}  ${String(rank.designs).padStart(7)}  ${String(rank.totalCost).padStart(7)}  ${String(rank.cheapest).padStart(8)}  ${String(rank.dearest).padStart(7)}`,
    ),
    "",
    "Payback of each Plant that earns anything",
    `  Assumes it runs only through Daylight, with its inputs always there and no Plant upstream counted, and sells all it makes up to a full Return Mass every ${days(roundTrip)}. Its cost is its Components' price, with no Launch fee. An Export it uses up counts against it at that Export's price.`,
    ...earnings.map(
      (earning) =>
        `  ${labelOf(catalogue.structureTypes, earning.structureTypeId)}, ${earning.recipeId}: costs ${money(earning.costMillionDollars)}, sells ${earning.exportKilogramsPerEarthDay.toFixed(2)} kg an Earth Day${earning.returnMassLimited ? " (all the Lander can carry)" : ""}, earns ${money(earning.millionDollarsPerEarthDay)} an Earth Day; pays back in ${days(earning.paybackEarthDays)} (${atEachSpeed(catalogue, earning.paybackEarthDays)}).`,
    ),
    "",
    "Each Plant that makes Components, against bringing them by Launch",
    "  Assumes it runs only through Daylight, with its inputs always there. Its payback is its own Components' mass against the Payload Mass it saves.",
    ...makers.map(
      (maker) =>
        `  ${labelOf(catalogue.structureTypes, maker.structureTypeId)}, ${maker.recipeId}: makes ${Number(maker.madePerLunation.toFixed(1))} ${maker.componentId} a Lunation from ${Number(maker.inputKilogramsPerLunation.toFixed(1))} kg of inputs; saves ${Number(maker.savesKilogramsPerLunation.toFixed(1))} kg of Payload Mass and ${money(maker.savesMillionDollarsPerLunation)} a Lunation; pays back its mass in ${Number(maker.paybackLunations.toFixed(1))} Lunations if all it makes is used.`,
    ),
    "",
    "Payback of each Design that earns Science",
    "  Assumes its own Research Tasks run back to back, and one telescope, if it brings one, through every Night.",
    ...earners.map((earner) => {
      const label = labelOf(catalogue.designs, earner.designId);
      const earns = [
        ...(earner.taskScience > 0
          ? [`its Research Tasks pay ${earner.taskScience}`]
          : []),
        ...(earner.sciencePerLunation > 0
          ? [
              `a telescope earns ${earner.sciencePerLunation.toFixed(1)} a Lunation`,
            ]
          : []),
      ].join(", ");
      return `  ${label}: costs ${earner.scienceCost} Science, ${earns}; ${
        earner.paybackEarthDays === undefined
          ? "never pays back"
          : `pays back in ${days(earner.paybackEarthDays)} (${atEachSpeed(catalogue, earner.paybackEarthDays)})`
      }.`;
    }),
    "",
    "Income and cost of each Launch, for each Export",
    `  Assumes every trip carries off a full Return Mass (${catalogue.lander.returnMassKilograms} kg) of the one Export, and the Launch pays only its fee, so that whatever it brings comes out of the profit. A trip waits for the first Plant that makes it to fill the Return Mass, running through Daylight. A round trip takes ${days(roundTrip)} (${atEachSpeed(catalogue, roundTrip)}).`,
    `  One of every Launch item comes to ${money(economics.everyItem.millionDollars)} and ${economics.everyItem.kilograms} kg, ${economics.everyItem.launchesToCarry} Launches to carry.`,
    ...economics.exports.map((sold) => {
      const { launchesToBuyEverything: launches } = sold;
      return `  ${labelOf(catalogue.bulkResources, sold.resourceId)}: sells for ${money(sold.incomeMillionDollars)}, less the ${money(sold.feeMillionDollars)} fee is ${money(sold.profitMillionDollars)} profit; ${
        launches === undefined
          ? "no number of Launches' profit buys one of every Launch item"
          : `the profit of ${launches} Launches buys one of every Launch item (a trip every ${days(sold.earthDaysPerTrip)}, so ${days(launches * sold.earthDaysPerTrip)}, ${atEachSpeed(catalogue, launches * sold.earthDaysPerTrip)})`
      }. What limits it: ${sold.limitedBy === "plant" ? "a Plant's rate, as even the fastest fills the Return Mass more slowly than a round trip" : "the Return Mass, as the Lander can't carry away what the fastest Plant makes"}.`;
    }),
    ...(best === undefined || best.launchesToBuyEverything === undefined
      ? []
      : [
          `  So Funding stops being a limit about ${days(best.launchesToBuyEverything * best.earthDaysPerTrip)} after the base first sells ${labelOf(catalogue.bulkResources, best.resourceId).toLowerCase()}.`,
        ]),
    "",
    `Science and Funding over ${act.plan.label} (Earth Days ${act.plan.fromEarthDay} to ${act.plan.toEarthDay})`,
    `  Assumes research runs as above from about Earth Day ${FIRST_RESEARCH_EARTH_DAY}, the first Plant that makes each Export runs through Daylight, and no Launch fees.`,
    `  Science: the Research Tasks pay ${act.scienceEarned} over the Act, and it unlocks Designs for ${act.scienceSpent}: ${act.designsUnlockedIds.map((id) => labelOf(catalogue.designs, id)).join(", ") || "none"}.`,
    `  At Earth Day ${act.plan.designsLeftAtEarthDay} there are still to buy: ${act.designsLeftIds.map((id) => labelOf(catalogue.designs, id)).join(", ") || "none"}. The last Research Task is complete about Earth Day ${act.researchEndsEarthDay.toFixed(0)}.`,
    `  Funding: its big purchases come to ${money(act.purchasesMillionDollars)}: ${act.purchases.map((purchase) => `${labelOf(catalogue.structureTypes, purchase.structureTypeId)} ${money(purchase.millionDollars)} (${purchase.kilograms} kg)`).join(", ")}.`,
    `  Against that, circuit boards alone earn about ${money(act.incomeMillionDollars)} over the Act, or ${money(act.incomeWithRestFilledMillionDollars)} with metals filling the rest of a Return Mass every round trip: buying them all takes ${((act.purchasesMillionDollars / act.incomeWithRestFilledMillionDollars) * 100).toFixed(0)}% of that.`,
    "",
    "Designs that something cheaper beats outright",
    "  Compares only things that do the same job: Science on the way to it, money and mass against everything it does, including how fast it is built and how well it stands up to Hazards.",
    ...(beaten.length === 0
      ? ["  None."]
      : beaten.map(
          (entry) =>
            `  ${labelOf(catalogue.designs, entry.designId)}: ${entry.beaten.map(({ thing, by }) => `${thing} is beaten by ${by}`).join("; ")}.`,
        )),
  ];
}
