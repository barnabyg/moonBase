import { catalogue } from "../catalogue";
import {
  actAsks,
  actLabel,
  milestoneActId,
  milestoneLabel,
  recipeOf,
  type BulkResourceForecast,
  type ExpeditionSnapshot,
  type ExportLine,
  type ExportLoadingSnapshot,
  type HabitatPowerForecast,
  type LanderLeg,
  type LanderSnapshot,
  type LifeSupportForecast,
  type LifeSupportSnapshot,
  type MissionDirectorResidence,
  type ObservingProgrammeSnapshot,
  type PowerForecast,
  type PowerNetworkSnapshot,
  type RadiationDoseForecast,
  type ResearchTaskSnapshot,
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
  listInWords,
  millisieverts,
  plural,
  signed,
} from "./format";
import {
  formatComponents,
  formatExportLines,
  researchTaskLabel,
  resourceLabel,
  stockLabel,
  structureLabel,
} from "./labels";
import type { Stat } from "./stat";

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

/** Sums the base's power networks, for example "10.00 kW made" and "0.30 kW used". */
export function formatPower(power: Snapshot["power"]): Stat {
  const total = (pick: (network: PowerNetworkSnapshot) => number) =>
    sumNetworks(power, pick);
  return {
    value: `${kilowatts(total((network) => network.generationKilowatts))} made`,
    note: `${kilowatts(total((network) => network.consumptionKilowatts))} used`,
  };
}

/**
 * Says how much energy the base has stored and when it will run out, for
 * example "42.0 / 60.0 kWh" and "lasts 8d 8h", with how full its battery
 * banks are, from 0 to 1, or undefined if it has none.
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
    note: storedKilowattHours > 0 ? "doesn't run out" : "empty",
    fraction,
  };
}

/**
 * Sums up the base's power for its folded section: the power to spare
 * across its networks, and how full its battery banks are if it has any,
 * for example "+9.70 kW · 78%".
 */
export function summarisePower(power: Snapshot["power"]): string {
  const total = (pick: (network: PowerNetworkSnapshot) => number) =>
    sumNetworks(power, pick);
  const spare = signed(
    total((network) => network.generationKilowatts) -
      total((network) => network.consumptionKilowatts),
    2,
    "kW",
  );
  const capacity = total((network) => network.storageCapacityKilowattHours);
  if (capacity === 0) return spare;
  const stored = total((network) => network.storedKilowattHours);
  return `${spare} · ${Math.round((stored / capacity) * 100)}%`;
}

/** Says where the Mission Director lives, for example "aboard the Lander". */
export function formatMissionDirector(
  missionDirector: MissionDirectorResidence,
  structures: Snapshot["structures"],
): string {
  if (missionDirector.residence === "lander") return "aboard the Lander";
  const { habitatId } = missionDirector;
  const habitat = structures.find((structure) => structure.id === habitatId);
  return `in the ${structureLabel(habitat?.structureTypeId ?? "habitat")}`;
}

/**
 * Says whether the Habitat the Mission Director lives in has power and when
 * it will lose it, for example "on" and "fails in 1d 16h", or undefined
 * while they live aboard the Lander.
 */
export function formatHabitatPower(
  missionDirector: MissionDirectorResidence,
  structures: Snapshot["structures"],
  forecast: HabitatPowerForecast | undefined,
): Stat | undefined {
  if (missionDirector.residence !== "habitat") return undefined;
  const { habitatId } = missionDirector;
  const habitat = structures.find((structure) => structure.id === habitatId);
  if (habitat?.powered !== true) return { value: "failed" };
  return {
    value: "on",
    note:
      forecast?.minutesUntilPowerLost === undefined
        ? "doesn't fail"
        : `fails in ${formatShortDuration(forecast.minutesUntilPowerLost)}`,
  };
}

/**
 * Says what state the Lander is in, any Exports aboard and, while it is
 * away, when it next arrives or leaves, for example "landed on the landing
 * pad with 40 kg of wafers aboard" and "free to fly", or "travelling to
 * Earth with 40 kg of wafers" and "arrives in 2d 23h".
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
      // Where it lands matters only on the way back to the Moon.
      const where = lander.state === "travelling-to-moon" ? onPad : "";
      return {
        value: `${words.doing}${carrying}`,
        note: `${words.next}${where} in ${formatShortDuration(minutesUntil(lander.legEndsAtMinute, elapsedMinutes))}`,
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
 * Night leave it too little to last the Night.
 */
export function formatLifeSupport(
  stock: LifeSupportSnapshot,
  forecast: LifeSupportForecast | undefined,
  missionDirector: MissionDirectorResidence,
): Stat {
  const value = `${stock.kilograms.toFixed(1)} kg`;
  if ((forecast?.kilogramsPerEarthDay ?? 0) > 0) {
    const rising = `rising ${(forecast?.kilogramsPerEarthDay ?? 0).toFixed(1)} kg a day`;
    // Rising now, but not enough to last the Night ahead.
    return forecast?.minutesUntilEmpty === undefined
      ? { value, note: rising }
      : {
          value,
          note: `${rising}, but lasts only ${formatShortDuration(forecast.minutesUntilEmpty)}: Plants may stand idle at Night`,
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
  const { windowLunations } = catalogue.selfSufficiency;
  const window =
    windowLunations === 1
      ? "the last Lunation"
      : `the last ${windowLunations} Lunations`;
  const share =
    selfSufficiency.coveredShare === undefined
      ? undefined
      : `${Math.round(selfSufficiency.coveredShare * 100)}%`;
  const made =
    share === undefined ? "Nothing used" : `${share} of use made at the base`;
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
 * at the current rate of wear, for example "6 in stock" and "last 9d 4h".
 */
export function formatSpareComponents(forecast: SpareComponentsForecast): Stat {
  const pending =
    forecast.forPendingRepairs === 0
      ? ""
      : `, ${forecast.forPendingRepairs} needed for repairs waiting`;
  const value = `${forecast.inStock} in stock${pending}`;
  if (forecast.minutesUntilEmpty === undefined) {
    return { value, note: "nothing wearing down" };
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
      note: `+${forecast.millisievertsPerEarthDay.toFixed(1)} a day, limit in ${formatShortDuration(forecast.minutesUntilLimit)}`,
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
 * Lists the Components in the base's stock, for example "2 solar panels and
 * 4 mast poles".
 */
export function formatStock(stockpile: Snapshot["stockpile"]): string {
  const held = stockpile.components.filter((stock) => stock.count > 0);
  return held.length === 0 ? "no Components" : formatComponents(held);
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
  const off = structures.filter((structure) => {
    if (!structure.switchedOff) return false;
    return (recipeOf(structure)?.outputs ?? []).some(
      (flow) =>
        flow.resource.kind === "life-support" &&
        flow.resource.stockId === stockId,
    );
  });
  if (off.length === 0) return stat;
  const labels = [
    ...new Set(
      off.map((structure) =>
        structureLabel(structure.structureTypeId).toLowerCase(),
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
 * Lists the base's stock of bulk resources, each with its amount and,
 * if it is falling, roughly how long it will last at the current rate, for
 * example "Water ice", "190 kg" and "~7d 22h". Each says whether it is a
 * warning, as one falling with little time left is, and whether it is in
 * play, with any in stock or being made or used.
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
    const value = formatKilograms(stock.kilograms);
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
        : `~${formatShortDuration(minutes)}`;
    const note = [rate, lasts].filter((part) => part !== undefined).join(", ");
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
 * status panel, for example "Seismic monitoring" and "2d 5h left", or that
 * none is.
 */
export function formatResearchTask(
  running: ResearchTaskSnapshot | undefined,
): Stat {
  return running === undefined
    ? { value: "none running" }
    : {
        value: researchTaskLabel(running.researchTaskId),
        note: `${formatShortDuration(running.minutesLeft)} left`,
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
 * Independence", or says that none is left. The line stays when there is
 * none, so that the lines below it don't move up.
 */
export function formatNextMilestone(
  milestones: Snapshot["milestones"],
): string {
  const { nextId, currentActId } = milestones;
  if (nextId === undefined) return "none left";
  const actId = milestoneActId(nextId);
  return actId === currentActId
    ? milestoneLabel(nextId)
    : `${milestoneLabel(nextId)}, in ${actLabel(actId)}`;
}

/** Sums up the Milestones for their folded section: the one to aim for now. */
export function summariseMilestones(
  milestones: Snapshot["milestones"],
): string {
  return milestones.currentId === undefined
    ? "every Milestone reached"
    : milestoneLabel(milestones.currentId);
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
  const cargo = `${formatKilograms(expedition.kilograms)} of ${resourceLabel(expedition.resourceId).toLowerCase()}`;
  switch (expedition.stage) {
    case "boarding":
      return "leaving once the Robot has finished its Work Order and boarded the Rover";
    case "driving-out":
      return "the Robot is driving the Rover to the map edge";
    case "away":
      return `away, back in ${formatDuration(minutesUntil(expedition.returnsAtMinute, elapsedMinutes))}`;
    case "driving-back":
      return `back on the map with ${cargo}, driving to the stockpile`;
    case "unloading":
      return `unloading ${cargo} at the stockpile`;
  }
}
