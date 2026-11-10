import {
  catalogue,
  componentOutputs,
  resourceOutputs,
  type Design,
  type ResourceRef,
  type PlantRecipe,
} from "../catalogue";
import {
  actAsks,
  actLabel,
  milestoneActId,
  milestoneLabel,
  recipeOf,
  workingRecipeOf,
  type BulkResourceForecast,
  type DiggingHold,
  type ExpeditionReward,
  type ExpeditionSnapshot,
  type ExperimentsLabShortage,
  type ExportLine,
  type ExportLoadingSnapshot,
  type HabitatPowerForecast,
  type LanderLeg,
  type LanderSnapshot,
  type LifeSupportForecast,
  type LifeSupportSnapshot,
  type MilestoneMeasure,
  type MissionDirectorResidence,
  type InfraredStop,
  type InfraredTelescopeSnapshot,
  type RadioArrayStop,
  type RadioArraySnapshot,
  type ObservingProgrammeSnapshot,
  type PowerForecast,
  type PowerNetworkSnapshot,
  type RadiationDoseForecast,
  type ResearchTaskSnapshot,
  type ScienceForecast,
  type ScienceSource,
  type SelfSufficiencySnapshot,
  type Snapshot,
  type SolarParticleEventSnapshot,
  type SpareComponentsForecast,
  type StructureSnapshot,
} from "../simulation";
import {
  formatCharge,
  formatDuration,
  formatKilograms,
  formatScience,
  formatShortDuration,
  kilowatts,
  kilowattsRounded,
  listInWords,
  millisieverts,
  plural,
  signed,
} from "./format";
import {
  componentsInWords,
  inSentence,
  formatExportLines,
  machineLabel,
  researchTaskLabel,
  resourceLabel,
  resourceRefLabel,
  stockLabel,
  structureLabel,
} from "./labels";
import type { Stat } from "./stat";
import { describeDesignState } from "./tech-tree-text";

// The status panel's figures in words, and the summaries beside its folded
// sections' titles.

/**
 * The game-minutes left until a moment, none once it has passed, or none if
 * there is no moment to wait for.
 */
function minutesUntil(
  atMinute: number | undefined,
  elapsedMinutes: number,
): number {
  return Math.max((atMinute ?? elapsedMinutes) - elapsedMinutes, 0);
}

/** Adds up one figure across all the base's power networks. */
function sumNetworks(
  power: Snapshot["power"],
  pick: (network: PowerNetworkSnapshot) => number,
): number {
  return power.networks.reduce((sum, network) => sum + pick(network), 0);
}

/**
 * Says how much power the base has to spare across its networks, or how far
 * short it falls, as it does at Night when its solar arrays make none, then
 * what it makes and uses, for example "+9.7 kW" and "10.0 kW made, 0.3 kW
 * used". One decimal place is enough to steer by.
 */
export function formatBasePower(power: Snapshot["power"]): Stat {
  const total = (pick: (network: PowerNetworkSnapshot) => number) =>
    sumNetworks(power, pick);
  const made = total((network) => network.generationKilowatts);
  const used = total((network) => network.consumptionKilowatts);
  return {
    value: signed(made - used, 1, "kW"),
    note: `${kilowattsRounded(made)} made, ${kilowattsRounded(used)} used`,
  };
}

/**
 * Sums power networks to the hundredth of a kilowatt, for a Structure's
 * pop-up, where one network's small loads show, for example "10.00 kW made"
 * and "0.30 kW used".
 */
export function formatPower(power: Snapshot["power"]): Stat {
  const total = (pick: (network: PowerNetworkSnapshot) => number) =>
    sumNetworks(power, pick);
  return {
    value: `${kilowatts(total((network) => network.generationKilowatts))} made`,
    note: `${kilowatts(total((network) => network.consumptionKilowatts))} used`,
  };
}

/**
 * What a network's stored energy does when the forecast finds it doesn't run
 * out. The forecast follows the Daylight and Night ahead (see
 * `PowerForecast`), so that is what it means, in Daylight as much as at
 * Night, where "doesn't run out" read as being about now.
 */
const LASTS_THE_NIGHT = "lasts the Night";

/**
 * Says how much energy the base has stored and when it will run out, for
 * example "42.0 / 60.0 kWh" and "lasts 8d 8h", or "lasts the Night" when it
 * doesn't, with how full its battery banks are, from 0 to 1, or undefined if
 * it has none.
 */
export function formatStoredPower(
  power: Snapshot["power"],
  forecast: PowerForecast,
): Stat & { readonly fraction: number | undefined } {
  const total = (pick: (network: PowerNetworkSnapshot) => number) =>
    sumNetworks(power, pick);
  const capacity = total((network) => network.storageCapacityKilowattHours);
  if (capacity === 0) return { value: "no battery banks", fraction: undefined };
  const storedKilowattHours = total((network) => network.storedKilowattHours);
  const value = formatCharge(storedKilowattHours, capacity);
  const fraction = storedKilowattHours / capacity;
  const { minutesUntilEmpty } = forecast;
  if (minutesUntilEmpty !== undefined) {
    return {
      value,
      note: `lasts ${formatShortDuration(minutesUntilEmpty)}`,
      fraction,
    };
  }
  return {
    value,
    note: storedKilowattHours > 0 ? LASTS_THE_NIGHT : "empty",
    fraction,
  };
}

/** Whether a Structure of this type generates or stores power. */
function isPowerSource(structureTypeId: string): boolean {
  const type = catalogue.structureTypes.find(
    ({ id }) => id === structureTypeId,
  );
  return (
    type !== undefined &&
    (type.power.generationKilowatts > 0 || type.power.storageKilowattHours > 0)
  );
}

/**
 * The network of the Habitat the Mission Director lives in, if it is apart
 * from some of the base's power: another network has a solar array or a
 * battery bank, which the base's totals count but the Habitat can't draw on.
 * Undefined while they live aboard the Lander, or when no other network
 * has a power source.
 */
export function habitatNetworkApart(
  power: Snapshot["power"],
  missionDirector: MissionDirectorResidence,
  structures: Snapshot["structures"],
): PowerNetworkSnapshot | undefined {
  if (missionDirector.residence !== "habitat") return undefined;
  const { habitatId } = missionDirector;
  const home = power.networks.find((network) =>
    network.structureIds.includes(habitatId),
  );
  if (home === undefined) return undefined;
  const sources = new Set(
    structures
      .filter(({ structureTypeId }) => isPowerSource(structureTypeId))
      .map(({ id }) => id),
  );
  const apart = power.networks.some(
    (network) =>
      network !== home && network.structureIds.some((id) => sources.has(id)),
  );
  return apart ? home : undefined;
}

/**
 * Says how much energy the Habitat's own network has stored and when it will
 * run out, for example "115.3 / 200.0 kWh" and "own network, lasts 3d 18h",
 * or "own network, lasts the Night" when it doesn't, with how full its
 * battery banks are, from 0 to 1, or undefined if it has none.
 */
export function formatHabitatNetworkPower(
  network: PowerNetworkSnapshot,
  forecast: PowerForecast,
): Stat & { readonly fraction: number | undefined } {
  const capacity = network.storageCapacityKilowattHours;
  if (capacity === 0) {
    return {
      value: "no battery banks",
      note: "own network",
      fraction: undefined,
    };
  }
  const stored = network.storedKilowattHours;
  const first = network.structureIds[0];
  const minutesUntilEmpty = forecast.networks.find(({ structureIds }) =>
    structureIds.includes(first ?? ""),
  )?.minutesUntilEmpty;
  const lasts =
    minutesUntilEmpty !== undefined
      ? `lasts ${formatShortDuration(minutesUntilEmpty)}`
      : stored > 0
        ? LASTS_THE_NIGHT
        : "empty";
  return {
    value: formatCharge(stored, capacity),
    note: `own network, ${lasts}`,
    fraction: stored / capacity,
  };
}

/**
 * Sums up the base's power for its folded section: the power to spare
 * across its networks, and how full its battery banks are if it has any,
 * for example "+9.7 kW · 78%". With the Habitat's network apart from some
 * of the base's power (see `habitatNetworkApart`), it also says how full
 * the Habitat's own battery banks are, for example "+9.7 kW · 78% ·
 * Habitat 58%".
 */
export function summarisePower(
  power: Snapshot["power"],
  habitatNetwork?: PowerNetworkSnapshot,
): string {
  const total = (pick: (network: PowerNetworkSnapshot) => number) =>
    sumNetworks(power, pick);
  const spare = signed(
    total((network) => network.generationKilowatts) -
      total((network) => network.consumptionKilowatts),
    1,
    "kW",
  );
  const capacity = total((network) => network.storageCapacityKilowattHours);
  const parts = [spare];
  if (capacity > 0) {
    const stored = total((network) => network.storedKilowattHours);
    parts.push(`${Math.round((stored / capacity) * 100)}%`);
  }
  if (habitatNetwork !== undefined) {
    const habitatCapacity = habitatNetwork.storageCapacityKilowattHours;
    parts.push(
      habitatCapacity === 0
        ? "Habitat no storage"
        : `Habitat ${Math.round((habitatNetwork.storedKilowattHours / habitatCapacity) * 100)}%`,
    );
  }
  return parts.join(" · ");
}

/**
 * Says where the Mission Director lives and, in a Habitat, whether it has
 * power and when it will lose it, on one line, for example "in the Buried
 * Habitat" and "powered", "power fails in 1d 16h" or "power failed". Aboard
 * the Lander, which needs none from the base, it is just "aboard the Lander".
 */
export function formatResidence(
  missionDirector: MissionDirectorResidence,
  structures: readonly Pick<
    StructureSnapshot,
    "id" | "structureTypeId" | "powered"
  >[],
  forecast: Pick<HabitatPowerForecast, "minutesUntilPowerLost"> | undefined,
): Stat {
  if (missionDirector.residence === "lander") {
    return { value: "aboard the Lander" };
  }
  const { habitatId } = missionDirector;
  const habitat = structures.find((structure) => structure.id === habitatId);
  const value = `in the ${structureLabel(habitat?.structureTypeId ?? "habitat")}`;
  if (habitat?.powered !== true) return { value, note: "power failed" };
  return {
    value,
    note:
      forecast?.minutesUntilPowerLost === undefined
        ? "powered"
        : `power fails in ${formatShortDuration(forecast.minutesUntilPowerLost)}`,
  };
}

/**
 * Says what state the Lander is in, any Exports aboard and, while it is
 * away, when it next arrives or leaves, for example "landed on the landing
 * pad with 40 kg of wafers aboard" and "free to fly", or "travelling to
 * Earth with 40 kg of wafers" and "arrives in 2d 23h". On its way back it
 * says when it lands, not where, which the map shows.
 */
export function formatLander(
  lander: LanderSnapshot,
  elapsedMinutes: number,
  exportsAboard: readonly ExportLine[],
  exportLoading?: ExportLoadingSnapshot,
): Stat {
  const onPad = lander.landingPadId === undefined ? "" : " on the landing pad";
  const aboard =
    exportsAboard.length === 0
      ? ""
      : ` with ${formatExportLines(exportsAboard)} aboard`;
  switch (lander.state) {
    case "landed-occupied":
      return { value: "landed", note: "Mission Director aboard" };
    case "landed-free":
      if (lander.cargo.length > 0) {
        return {
          value: `landed${onPad}${aboard}`,
          note: "cargo waiting for the Robot to unload it",
        };
      }
      return {
        value: `landed${onPad}${aboard}`,
        note:
          exportLoading === undefined
            ? "free to fly"
            : `waiting for the Robot to load ${formatExportLines(exportLoading.exports)}`,
      };
    default: {
      const words = landerLegWords[lander.state];
      // Exports go aboard only to be sold on Earth.
      const carrying =
        lander.state === "travelling-to-earth" && exportsAboard.length > 0
          ? ` with ${formatExportLines(exportsAboard)}`
          : "";
      return {
        value: `${words.doing}${carrying}`,
        note: `${words.next} in ${formatShortDuration(minutesUntil(lander.legEndsAtMinute, elapsedMinutes))}`,
      };
    }
  }
}

/**
 * What the Lander does on each leg of its round trip and at the end of it,
 * in full for its status line, for example "travelling to Earth" and
 * "arrives", and for a folded section's title, which doesn't say what it
 * is doing now, for example "at Earth".
 */
const landerLegWords: Readonly<
  Record<
    LanderLeg,
    {
      readonly doing: string;
      readonly next: string;
      readonly nextInShort: string;
    }
  >
> = {
  "travelling-to-earth": {
    doing: "travelling to Earth",
    next: "arrives",
    nextInShort: "at Earth",
  },
  turnaround: {
    doing: "in turnaround on Earth",
    next: "leaves",
    nextInShort: "leaves Earth",
  },
  "travelling-to-moon": {
    doing: "travelling to the Moon",
    next: "lands",
    nextInShort: "lands",
  },
};

/**
 * Sums up the Lander and any Expedition under way for their folded
 * section, with when each next arrives or leaves, for example "landed" or
 * "lands in 2d · Rover back in 5h".
 */
export function summariseTravel(
  lander: LanderSnapshot,
  expedition: ExpeditionSnapshot | undefined,
  elapsedMinutes: number,
): string {
  const left = (atMinute: number | undefined): string =>
    formatShortDuration(minutesUntil(atMinute, elapsedMinutes), true);
  const where =
    lander.state === "landed-occupied" || lander.state === "landed-free"
      ? "landed"
      : `${landerLegWords[lander.state].nextInShort} in ${left(lander.legEndsAtMinute)}`;
  if (expedition === undefined) return where;
  return expedition.stage === "away"
    ? `${where} · Rover back in ${left(expedition.returnsAtMinute)}`
    : `${where} · Rover on Expedition`;
}

/**
 * Says how much of a life support stock is left and when it will run out,
 * for example "24.2 kg" and "lasts 28d 19h", or how fast it is rising while
 * the base's Plants make more than is used, for example "rising 2.8 kg a
 * day", and when it will run out even so, if the Plants standing idle at
 * Night leave it too little to last the Night, with the reason kept for
 * hovering over the line. The amount is shown against what
 * the base can hold, for example "399.5 of 400 kg", and while the Plants are
 * holding it there the line says so, whatever else it might have said.
 */
export function formatLifeSupport(
  stock: LifeSupportSnapshot,
  forecast: LifeSupportForecast | undefined,
  missionDirector: MissionDirectorResidence,
): Stat {
  const value = `${stock.kilograms.toFixed(1)} of ${stock.limitKilograms} kg`;
  if (forecast?.holdingFull === true) {
    return { value, note: "holding full" };
  }
  if ((forecast?.kilogramsPerEarthDay ?? 0) > 0) {
    const rising = `rising ${(forecast?.kilogramsPerEarthDay ?? 0).toFixed(1)} kg a day`;
    // Rising now, but not enough to last the Night ahead.
    return forecast?.minutesUntilEmpty === undefined
      ? { value, note: rising }
      : {
          value,
          note: `${rising}, lasts ${formatShortDuration(forecast.minutesUntilEmpty)}`,
          explanation:
            "It is rising now, but lasts only that long: the Plants that make it may stand idle at Night.",
        };
  }
  if (stock.kilograms === 0) return { value, note: "ran out" };
  if (forecast?.minutesUntilEmpty !== undefined) {
    return {
      value,
      note: `lasts ${formatShortDuration(forecast.minutesUntilEmpty)}`,
    };
  }
  return missionDirector.residence === "lander"
    ? { value, note: "safe aboard the Lander" }
    : { value };
}

/**
 * Says whether the base is self-sufficient in a life support stock, for
 * example "yes", with the share of the Mission Director's use the base
 * made over the window, for example "140%", and the whole story to show on
 * demand.
 */
export function formatSelfSufficiency(
  selfSufficiency: SelfSufficiencySnapshot,
  missionDirector: MissionDirectorResidence,
): {
  readonly value: string;
  readonly share: string | undefined;
  readonly explanation: string;
} {
  if (missionDirector.residence === "lander") {
    return {
      value: "no",
      share: undefined,
      explanation: "Nothing is used aboard the Lander.",
    };
  }
  const window = selfSufficiencyWindow();
  const share =
    selfSufficiency.coveredShare === undefined
      ? undefined
      : `${Math.round(selfSufficiency.coveredShare * 100)}%`;
  const made =
    share === undefined
      ? "Nothing used"
      : `${share} of the Mission Director's use made at the base`;
  if (!selfSufficiency.windowComplete) {
    return {
      value: "not yet",
      share,
      explanation: `${made} so far. It is judged once a whole Lunation has been recorded.`,
    };
  }
  return {
    value: selfSufficiency.selfSufficient ? "yes" : "no",
    share,
    explanation: `${made} over ${window}.`,
  };
}

/** The window self-sufficiency is judged over, in words, for example "the last Lunation". */
function selfSufficiencyWindow(): string {
  const { windowLunations } = catalogue.selfSufficiency;
  return windowLunations === 1
    ? "the last Lunation"
    : `the last ${windowLunations} Lunations`;
}

/** The chemical formulas of the life support stocks, short enough for a section's title. */
const stockFormulas: Readonly<Record<string, string>> = {
  oxygen: "O₂",
  water: "H₂O",
};

/**
 * Sums up how the Mission Director is keeping for their folded section:
 * how long each life support stock lasts, for example "O₂ 29d · H₂O 5d",
 * or that they are safe aboard the Lander, where none is used.
 */
export function summariseMissionDirector(
  missionDirector: MissionDirectorResidence,
  stocks: readonly LifeSupportSnapshot[],
  forecasts: readonly LifeSupportForecast[],
): string {
  if (missionDirector.residence === "lander") return "aboard the Lander";
  return stocks
    .map((stock) => {
      const forecast = forecasts.find(
        (candidate) => candidate.stockId === stock.stockId,
      );
      const name = stockFormulas[stock.stockId] ?? stockLabel(stock.stockId);
      return `${name} ${summariseLifeSupport(stock, forecast)}`;
    })
    .join(" · ");
}

/** How long a life support stock lasts, or that it is rising or has run out. */
function summariseLifeSupport(
  stock: LifeSupportSnapshot,
  forecast: LifeSupportForecast | undefined,
): string {
  if (forecast?.holdingFull === true) return "full";
  const rising = (forecast?.kilogramsPerEarthDay ?? 0) > 0;
  if (stock.kilograms === 0 && !rising) return "ran out";
  // Falling, or rising now but not enough to last the Night ahead.
  if (forecast?.minutesUntilEmpty !== undefined) {
    return formatShortDuration(forecast.minutesUntilEmpty, true);
  }
  return rising ? "rising" : `${stock.kilograms.toFixed(1)} kg`;
}

/**
 * Says how many spare Components the base has and how long they will last
 * at the current rate of wear, for example "6 in stock" and "last 9d 4h", or,
 * while the base's Plants make more than is used, how fast they are rising,
 * and when they will run out even so, if the Plants standing idle at Night
 * leave too few to last it, with the reason kept for hovering over the line.
 */
export function formatSpareComponents(forecast: SpareComponentsForecast): Stat {
  const pending =
    forecast.forPendingRepairs === 0
      ? ""
      : `, ${forecast.forPendingRepairs} needed for repairs waiting`;
  const value = `${forecast.inStock} in stock${pending}`;
  const net = forecast.madePerEarthDay - forecast.perEarthDay;
  if (net > 0) {
    const rising = `rising ${net.toFixed(1)} a day`;
    if (forecast.minutesUntilEmpty === undefined) {
      return { value, note: rising };
    }
    return forecast.minutesUntilEmpty === 0
      ? {
          value,
          note: `${rising}, but too few for the wear until a batch finishes`,
        }
      : {
          value,
          note: `${rising}, last ${formatShortDuration(forecast.minutesUntilEmpty)}`,
          explanation:
            "They are rising now, but last only that long: the Plants that make them may stand idle at Night.",
        };
  }
  if (forecast.minutesUntilEmpty === undefined) {
    return {
      value,
      note:
        forecast.perEarthDay === 0
          ? "nothing wearing down"
          : "enough until Daylight",
    };
  }
  return {
    value,
    note:
      forecast.minutesUntilEmpty === 0
        ? "too few for the wear"
        : `last ${formatShortDuration(forecast.minutesUntilEmpty)}`,
  };
}

/**
 * Sums up the base's stock for its folded section: how many spare
 * Components it has and how long they last, which is what keeps it running,
 * for example "6 spares, last 9d".
 */
export function summariseStock(spares: SpareComponentsForecast): string {
  const count = plural(spares.inStock, "spare");
  if (spares.madePerEarthDay > spares.perEarthDay) return `${count}, rising`;
  return spares.minutesUntilEmpty === undefined
    ? count
    : spares.minutesUntilEmpty === 0
      ? `${count}, too few`
      : `${count}, last ${formatShortDuration(spares.minutesUntilEmpty, true)}`;
}

/**
 * Sums up the base's bulk resources for their folded section: how long the
 * one that will run out soonest lasts, then how much there is of the first
 * other in stock, which is Regolith to build with once the base has any, for
 * example "Silicon 2d · Regolith 1250 kg", or that there is none in stock.
 */
export function summariseBulkResources(
  bulkResources: Snapshot["bulkResources"],
  forecasts: readonly BulkResourceForecast[],
): string {
  const held = bulkResources.filter((stock) => stock.kilograms > 0);
  if (held.length === 0) return "none in stock";
  const left = (resourceId: string): number =>
    forecasts.find((forecast) => forecast.resourceId === resourceId)
      ?.minutesUntilEmpty ?? Infinity;
  const soonest = held.reduce((first, stock) =>
    left(stock.resourceId) < left(first.resourceId) ? stock : first,
  );
  const falling = left(soonest.resourceId) !== Infinity;
  const other = held.find((stock) => !falling || stock !== soonest);
  return [
    ...(falling
      ? [
          `${resourceLabel(soonest.resourceId)} ${formatShortDuration(left(soonest.resourceId), true)}`,
        ]
      : []),
    ...(other === undefined
      ? []
      : [
          `${resourceLabel(other.resourceId)} ${formatKilograms(other.kilograms)}`,
        ]),
  ].join(" · ");
}

/**
 * Says how much radiation the Mission Director has absorbed against the
 * limit, and how fast it is rising, for example "64.0 / 600 mSv" and "+30.0
 * a day, limit in 17d 21h".
 */
export function formatRadiationDose(
  doseMillisieverts: number,
  forecast: RadiationDoseForecast,
  missionDirector: MissionDirectorResidence,
): Stat {
  const limit = catalogue.radiation.doseLimitMillisieverts;
  const value = `${doseMillisieverts.toFixed(1)} / ${millisieverts(limit, 0)}`;
  if (doseMillisieverts >= limit) return { value, note: "limit reached" };
  if (forecast.minutesUntilLimit !== undefined) {
    return {
      value,
      // Fine enough to show what a Buried Habitat cuts it to.
      note: `+${forecast.millisievertsPerEarthDay.toFixed(forecast.millisievertsPerEarthDay < 0.1 ? 3 : 1)} a day, limit in ${formatShortDuration(forecast.minutesUntilLimit)}`,
    };
  }
  return missionDirector.residence === "lander"
    ? { value, note: "none aboard the Lander" }
    : { value };
}

/**
 * Says when a Solar Particle Event the Mission Director knows of starts or
 * ends, and how much it multiplies their dose rate, for example "starts in
 * 4h, lasts 18h" and "10× the dose rate".
 */
export function formatSolarParticleEvent(
  event: SolarParticleEventSnapshot,
  elapsedMinutes: number,
): Stat {
  const note = `${event.doseRateMultiplier}× the dose rate`;
  return event.state === "coming"
    ? {
        value: `starts in ${formatShortDuration(event.startsAtMinute - elapsedMinutes)}, lasts ${formatShortDuration(event.endsAtMinute - event.startsAtMinute)}`,
        note,
      }
    : {
        value: `under way, ends in ${formatShortDuration(event.endsAtMinute - elapsedMinutes)}`,
        note,
      };
}

/**
 * Lists the Components in the base's stock, each with how many there are and
 * its name in the plural where there are several, for example 2 "solar
 * panels" and 1 "array mast", in catalogue order, leaving out those there are
 * none of.
 */
export function listStock(
  stockpile: Snapshot["stockpile"],
): { readonly count: number; readonly name: string }[] {
  return stockpile.components
    .filter((stock) => stock.count > 0)
    .map(({ componentId, count }) => ({
      count,
      name: componentsInWords(componentId, count),
    }));
}

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

/**
 * Says why the resource the excavator digs isn't being dug though the base
 * needs it, for example "not dug while the excavator is parked for Night".
 */
export function formatDiggingHold(hold: DiggingHold): string {
  const machine = inSentence(machineLabel(catalogue.digging.machineTypeId));
  const why =
    hold === "parked-for-night"
      ? "parked for Night"
      : hold === "construction"
        ? "busy with Construction"
        : hold === "broken"
          ? "Broken"
          : "undergoing Maintenance";
  return `not dug while the ${machine} is ${why}`;
}

/**
 * Lists the base's stock of bulk resources, each with its amount and,
 * if it is falling, roughly how long it will last at the current rate, for
 * example "Water ice", "190 kg" and "~7d 22h". One with a limit is shown against
 * it, for example "450.0 of 450 kg", and while the Plants are holding it there the
 * line says so. The one the excavator digs says why it isn't being dug, if
 * the base needs it and something keeps the excavator from it (see
 * `formatDiggingHold`). Each says whether it is a warning, as one falling with
 * little time left is, and whether it is in play, with any in stock or being
 * made or used.
 */
export function formatBulkResources(
  bulkResources: Snapshot["bulkResources"],
  forecasts: readonly BulkResourceForecast[],
): (Stat & {
  readonly label: string;
  readonly empty: boolean;
  readonly warning: boolean;
  readonly inPlay: boolean;
})[] {
  const warnFrom = catalogue.bulkResourceWarningEarthDaysLeft * 24 * 60;
  return bulkResources.map((stock) => {
    const label = resourceLabel(stock.resourceId);
    // With a limit of none, as with no Plant to hold it, there is nothing to say of it.
    const value =
      stock.limitKilograms === undefined || stock.limitKilograms === 0
        ? formatKilograms(stock.kilograms)
        : `${stock.kilograms.toFixed(1)} of ${stock.limitKilograms} kg`;
    const empty = stock.kilograms < 1;
    const forecast = forecasts.find(
      (candidate) => candidate.resourceId === stock.resourceId,
    );
    const perDay = (forecast?.kilogramsPerHour ?? 0) * 24;
    const minutes = forecast?.minutesUntilEmpty;
    // How fast it is changing, if at all, and how long it lasts if falling.
    const rate =
      Math.abs(perDay) < 0.05
        ? undefined
        : `${perDay > 0 ? "+" : "−"}${Math.abs(perDay).toFixed(1)} kg/day`;
    const lasts =
      minutes === undefined || stock.kilograms === 0
        ? undefined
        : `~${formatShortDuration(minutes, true)}`;
    const held =
      forecast?.holdingFull !== true
        ? undefined
        : stock.kilograms > (stock.limitKilograms ?? Infinity)
          ? "holding full, over the limit"
          : "holding full";
    const diggingHold =
      forecast?.diggingHold === undefined
        ? undefined
        : formatDiggingHold(forecast.diggingHold);
    const note = [held, rate, lasts, diggingHold]
      .filter((part) => part !== undefined)
      .join(", ");
    const shown = {
      label,
      value,
      empty,
      // With none left, it may be that nothing wants any.
      warning:
        stock.kilograms > 0 && minutes !== undefined && minutes <= warnFrom,
      inPlay: stock.kilograms > 0 || note !== "",
    };
    return note === "" ? shown : { ...shown, note };
  });
}

/**
 * Says which Research Task is running and how long it has left, for the
 * status panel, for example "Seismic monitoring" and "2d 5h left", or "1d 3h
 * left at ×2" while automated experiments labs speed it up, or that none is.
 */
export function formatResearchTask(
  running: ResearchTaskSnapshot | undefined,
): Stat {
  return running === undefined
    ? { value: "none running" }
    : {
        value: researchTaskLabel(running.researchTaskId),
        note: `${formatShortDuration(running.minutesLeftAtRate)} left${running.rate > 1 ? ` at ${formatResearchRate(running.rate)}` : ""}`,
      };
}

/** What an automated experiments lab lacks, in a few words. */
function labShortage(shortOf: ExperimentsLabShortage): string {
  switch (shortOf.reason) {
    case "power":
      return "short of power";
    case "supply":
      return `short of ${inSentence(resourceRefLabel(shortOf.resource))}`;
    case "broken":
      return "Broken";
    case "switched-off":
      return "switched off";
  }
}

/**
 * Says what the base's automated experiments labs are doing for the Research Task
 * running, for the Research Tasks screen, for example "2 automated experiments
 * labs speeding it up and 1 short of oxygen", or undefined if it has none.
 */
export function formatExperimentsLabs(
  snapshot: Pick<Snapshot, "experimentsLabs" | "researchTask">,
): string | undefined {
  const { labs, speedingUp, short } = snapshot.experimentsLabs;
  if (labs === 0) return undefined;
  const name = inSentence(structureLabel("experiments-lab"));
  const count = (n: number) => `${String(n)} ${n === 1 ? name : `${name}s`}`;
  if (snapshot.researchTask === undefined) {
    return `${count(labs)} standing idle until a Research Task runs`;
  }
  const reasons = new Map<string, number>();
  for (const { shortOf } of short) {
    const reason = labShortage(shortOf);
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  const parts = [
    ...(speedingUp > 0 ? [[speedingUp, "speeding it up"] as const] : []),
    ...[...reasons].map(([reason, n]) => [n, reason] as const),
  ];
  return listInWords(
    parts.map(([n, what], index) =>
      index === 0 ? `${count(n)} ${what}` : `${String(n)} ${what}`,
    ),
  );
}

/**
 * How fast the Research Task running advances, as automated experiments labs
 * speed it up, for example "×2" or "×2.5".
 */
export function formatResearchRate(rate: number): string {
  return `×${String(Math.round(rate * 10) / 10)}`;
}

/**
 * The Designs the base's Science would unlock now: those not yet unlocked
 * whose cost it covers and whose prerequisites are unlocked, in catalogue
 * order.
 */
export function designsToUnlock(
  snapshot: Pick<Snapshot, "science" | "unlockedDesignIds">,
): Design[] {
  return catalogue.designs.filter(
    (design) => describeDesignState(design, snapshot).state === "unlockable",
  );
}

/**
 * Says what is queued behind the Research Task running, in the order they will
 * start, for the status panel, for example "1. Seismic monitoring, 2. Ice
 * volatiles assay", or that none is. With none queued, it also says when the
 * base's Science would unlock a Design, by name if there is one and how many
 * otherwise, for example "enough Science to unlock 3 Designs", as unspent
 * Science is easy to overlook.
 */
export function formatResearchQueue(
  queue: readonly string[],
  toUnlock: readonly Pick<Design, "label">[] = [],
): Stat {
  if (queue.length > 0) {
    return {
      value: queue
        .map((id, index) => `${index + 1}. ${researchTaskLabel(id)}`)
        .join(", "),
    };
  }
  const [only] = toUnlock;
  if (only === undefined) return { value: "none" };
  return {
    value: "none",
    note: `enough Science to unlock ${toUnlock.length === 1 ? only.label : `${toUnlock.length} Designs`}`,
  };
}

/** A rate of Science an Earth Day, to the hundredth below a tenth, which the slow sources earn. */
function sciencePerDay(perEarthDay: number): string {
  return perEarthDay.toFixed(perEarthDay < 0.1 ? 2 : 1);
}

/** Names where Science comes from, the way a sentence would. */
function scienceSourceLabel(source: ScienceSource): string {
  switch (source) {
    case "research-task":
      return "the Research Task running";
    case "observing-programme":
      return catalogue.observingProgramme.label;
    case "infrared-survey":
      return infraredSurveyLabel();
    case "radio-survey":
      return radioSurveyLabel();
    case "growing":
      return "growing";
  }
}

/**
 * Says how much Science the base earns an Earth Day as things stand, for
 * example "+3.0 a day", or that none is being earned, with where it comes
 * from kept for hovering over the line. Science comes a round at a time, so
 * this is what the rounds under way would earn spread over the time they
 * take (see `ScienceForecast`).
 */
export function formatScienceRate(forecast: ScienceForecast): Stat {
  const earning = forecast.sources.filter((source) => source.perEarthDay > 0);
  if (earning.length === 0) {
    return {
      value: "none being earned",
      explanation:
        "A Research Task, a telescope or a Greenhouse earns Science.",
    };
  }
  return {
    value: `+${sciencePerDay(forecast.perEarthDay)} a day`,
    explanation: `As things stand, over a Lunation: ${listInWords(
      earning.map(
        ({ source, perEarthDay }) =>
          `${scienceSourceLabel(source)} ${sciencePerDay(perEarthDay)}`,
      ),
    )} Science a day.`,
  };
}

/**
 * Says how the observing programme is going, for the status panel's
 * Research section: the standing Research Task the base's telescopes work
 * on at Night, with how long its round has left while they observe, for
 * example "Night-sky survey" and "observing, 1d 4h left", or why none
 * does. Undefined while the base has no telescope.
 */
export function formatObservingProgramme(
  programme: ObservingProgrammeSnapshot,
): Stat | undefined {
  if (programme.telescopes === 0) return undefined;
  const value = catalogue.observingProgramme.label;
  if (programme.minutesLeft !== undefined) {
    const who =
      programme.observing === 1
        ? "observing"
        : `${programme.observing} telescopes observing`;
    return {
      value,
      note: `${who}, ${formatShortDuration(programme.minutesLeft)} left`,
    };
  }
  switch (programme.stoppedFor) {
    case "broken":
      return {
        value,
        note: `${programme.telescopes === 1 ? "telescope" : "telescopes"} Broken`,
      };
    case "no-power":
      return { value, note: "no power to observe" };
    case "daylight":
    case undefined:
      return { value, note: "waits for Night" };
  }
}

/** The name of the infrared telescopes' survey. */
function infraredSurveyLabel(): string {
  return (
    catalogue.structureTypes.find((type) => type.observingRounds !== undefined)
      ?.observingRounds?.label ?? "Infrared survey"
  );
}

/** The name of the radio telescope arrays' survey. */
function radioSurveyLabel(): string {
  return (
    catalogue.structureTypes.find((type) => type.radioArray !== undefined)
      ?.radioArray?.label ?? "Radio survey"
  );
}

/** Why an infrared telescope isn't observing, in a few words. */
const INFRARED_STOPS: Record<InfraredStop, string> = {
  daylight: "waits for Night",
  light: "a lit Structure within its dark radius",
  propellant: "short of propellant",
  power: "no power to observe",
  "switched-off": "switched off",
  broken: "Broken",
};

/**
 * Says how the base's infrared telescopes are getting on with their survey, for
 * example "2 infrared telescopes observing, 1d 4h left" with the least time left
 * of any round, or why the first of them isn't observing, for example "a lit
 * Structure within its dark radius"; undefined while the base has none.
 */
export function formatInfraredSurvey(
  telescopes: readonly InfraredTelescopeSnapshot[],
): Stat | undefined {
  const [first] = telescopes;
  if (first === undefined) return undefined;
  const value = infraredSurveyLabel();
  const observing = telescopes.filter((telescope) => telescope.observing);
  if (observing.length > 0) {
    const left = Math.min(
      ...observing.map(({ minutesLeft }) => minutesLeft ?? Infinity),
    );
    return {
      value,
      note: `${plural(observing.length, "infrared telescope")} observing, ${formatShortDuration(left)} left`,
    };
  }
  const stopped = telescopes.find(
    ({ stoppedFor }) => stoppedFor !== "daylight",
  );
  return {
    value,
    note: INFRARED_STOPS[(stopped ?? first).stoppedFor ?? "daylight"],
  };
}

/** Why a radio telescope array isn't working, in a few words. */
const RADIO_STOPS: Record<RadioArrayStop, string> = {
  plant: "a Plant within its quiet radius",
  power: "no power to work",
  broken: "Broken",
};

/**
 * Says how the base's radio telescope arrays are getting on with their survey,
 * for example "2 radio telescope arrays working, 14h left" with the least time
 * left of any round, or why the first of them isn't working, for example "a
 * Plant within its quiet radius"; undefined while the base has none.
 */
export function formatRadioSurvey(
  arrays: readonly RadioArraySnapshot[],
): Stat | undefined {
  const [first] = arrays;
  if (first === undefined) return undefined;
  const value = radioSurveyLabel();
  const working = arrays.filter((array) => array.working);
  if (working.length > 0) {
    const left = Math.min(
      ...working.map(({ minutesLeft }) => minutesLeft ?? Infinity),
    );
    return {
      value,
      note: `${plural(working.length, "radio telescope array")} working, ${formatShortDuration(left)} left`,
    };
  }
  return { value, note: RADIO_STOPS[first.stoppedFor ?? "power"] };
}

/**
 * Explains the observing programme, for hovering over its line in the
 * status panel: what it is, what a round takes and pays, and how far the
 * round under way has got.
 */
export function explainObservingProgramme(
  programme: ObservingProgrammeSnapshot,
): string {
  const { lengthHours, science } = catalogue.observingProgramme;
  return `The standing Research Task the base's telescopes work on at Night, beside the one running: each round, ${lengthHours} hours of a telescope's observing, pays ${formatScience(science)}. This round is ${Math.floor(programme.progress * 100)}% done.`;
}

/**
 * Sums up Research for its folded section: the Research Task running and
 * how far it has got, for example "Seismic monitoring · 45%", or that none
 * is, then, once the base has a telescope, how far the observing
 * programme's round has got, for example "Night-sky survey · 20%".
 */
export function summariseResearch(
  running: ResearchTaskSnapshot | undefined,
  programme: ObservingProgrammeSnapshot,
): string {
  const task =
    running === undefined
      ? "none running"
      : `${researchTaskLabel(running.researchTaskId)} · ${Math.floor(running.progress * 100)}%`;
  return programme.telescopes === 0
    ? task
    : `${task}, ${catalogue.observingProgramme.label} · ${Math.floor(programme.progress * 100)}%`;
}

/**
 * Names the current Act and says what it asks of the player, or that it has
 * all been done once every Milestone is reached.
 */
export function formatAct(milestones: Snapshot["milestones"]): {
  readonly label: string;
  readonly asks: string;
} {
  return {
    label: actLabel(milestones.currentActId),
    asks:
      milestones.currentId === undefined
        ? "Everything this Act asks of you is done."
        : actAsks(milestones.currentActId),
  };
}

/**
 * Names the Milestone after the current one, with its Act if that is a later
 * one, for example "Lander departs" or "Workshop running, in Act 2:
 * Independence"; undefined when none is left, and the line has nothing to say.
 */
export function formatNextMilestone(
  milestones: Snapshot["milestones"],
): string | undefined {
  const { nextId, currentActId } = milestones;
  if (nextId === undefined) return undefined;
  const actId = milestoneActId(nextId);
  return actId === currentActId
    ? milestoneLabel(nextId)
    : `${milestoneLabel(nextId)}, in ${actLabel(actId)}`;
}

/**
 * Says where the current Milestone comes among its Act's, for example
 * "Milestone 3 of 5"; undefined once every one is reached.
 */
export function formatMilestonePlace(
  milestones: Pick<Snapshot["milestones"], "place">,
): string | undefined {
  const { place } = milestones;
  return place === undefined
    ? undefined
    : `Milestone ${place.number} of ${place.of}`;
}

/**
 * Says how far along the current Milestone is by one of its measures, as a
 * line of its own with a bar, from 0 to 1: for example "Return Mass", "212
 * of 300 kg", or "Oxygen", "45 of 612 kg" and "room for only 400 kg" where
 * the base can't yet hold what a Structure is stocked with. An amount short
 * of what it has to reach is rounded down, and that is rounded up, so that
 * the line never says it is there before it is.
 */
export function formatMilestoneMeasure(
  measure: MilestoneMeasure,
): Stat & { readonly label: string; readonly fraction: number } {
  const amounts = (kilograms: number, targetKilograms: number) => {
    const target = Math.ceil(targetKilograms);
    const amount =
      kilograms >= targetKilograms
        ? Math.max(Math.floor(kilograms), target)
        : Math.floor(kilograms);
    return {
      value: `${amount} of ${target} kg`,
      fraction: Math.min(Math.max(kilograms / targetKilograms, 0), 1),
    };
  };
  switch (measure.kind) {
    case "life-support-made":
    case "spare-components-made":
      return {
        label: "Made here",
        value:
          measure.share === undefined
            ? "none used yet"
            : `${Math.floor(measure.share * 100)}% of use`,
        note: measure.windowComplete
          ? `needs 100% over ${selfSufficiencyWindow()}`
          : "judged once a whole Lunation is recorded",
        fraction: Math.min(measure.share ?? 0, 1),
      };
    case "return-mass":
      return {
        label: "Return Mass",
        ...amounts(measure.kilograms, measure.targetKilograms),
      };
    case "exports-loaded":
      return {
        label: "Exports",
        ...amounts(measure.kilograms, measure.targetKilograms),
        note: "aboard or to load",
      };
    case "stocked-with": {
      const { limitKilograms, targetKilograms } = measure;
      const shown = {
        label: stockLabel(measure.stockId),
        ...amounts(measure.kilograms, targetKilograms),
      };
      // Nothing to say of the room once there is enough of it in stock.
      return limitKilograms === undefined ||
        limitKilograms >= targetKilograms ||
        measure.kilograms >= targetKilograms
        ? shown
        : {
            ...shown,
            note: `room for only ${formatKilograms(limitKilograms)}`,
          };
    }
  }
}

/** Sums up the Milestones for their folded section: the one to aim for now. */
export function summariseMilestones(
  milestones: Pick<Snapshot["milestones"], "currentId">,
): string {
  return milestones.currentId === undefined
    ? "every Milestone reached"
    : milestoneLabel(milestones.currentId);
}

/** Says what a type of Expedition brings back, for example "200 kg of water ice" or "25 Science". */
export function describeExpeditionReward(reward: ExpeditionReward): string {
  return reward.kind === "science"
    ? `${reward.science} Science`
    : `${formatKilograms(reward.kilograms)} of ${inSentence(resourceLabel(reward.resourceId))}`;
}

/**
 * Says how the Expedition under way is going, and when it will be back,
 * for example "away, back in 2 Earth Days 5 hours", or that there is none.
 */
export function describeExpedition(
  expedition: ExpeditionSnapshot | undefined,
  elapsedMinutes: number,
): string {
  if (expedition === undefined) return "none under way";
  const cargo = describeExpeditionReward(expedition.reward);
  switch (expedition.stage) {
    case "boarding":
      return "leaving once the Robot has finished its Work Order and boarded the Rover";
    case "driving-out":
      return "the Robot is driving the Rover to the map edge";
    case "away":
      return `away, back in ${formatDuration(minutesUntil(expedition.returnsAtMinute, elapsedMinutes))}`;
    case "driving-back":
      return `back on the map for ${cargo}, driving to the stockpile`;
    case "unloading":
      return `handing over what it brought at the stockpile, for ${cargo}`;
  }
}
