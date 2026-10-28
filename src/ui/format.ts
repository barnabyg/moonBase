import {
  catalogue,
  type Design,
  type Export,
  type LaunchItem,
  type ResourceRef,
} from "../catalogue";
import {
  designLabel,
  launchItemLabel,
  milestoneLabel,
  readClock,
  robotNumber,
  type BulkResourceForecast,
  type CampaignEnd,
  type DeathCause,
  type GameEvent,
  type HabitatPowerForecast,
  type LifeSupportForecast,
  type LifeSupportSnapshot,
  type RadiationDoseForecast,
  type SelfSufficiencySnapshot,
  type SpareComponentsForecast,
  type SolarParticleEventSnapshot,
} from "../simulation";
import type {
  ClockSnapshot,
  GroundPosition,
  PowerForecast,
  PowerNetworkSnapshot,
  RobotActivity,
  RobotSnapshot,
  Snapshot,
  StrikeTarget,
  StructureSnapshot,
  ComponentCount,
  ConstructionSnapshot,
  ConstructionWait,
  ConstructionStage,
  DrivenSubject,
  ExpeditionSnapshot,
  RoverSnapshot,
  DismantlingSnapshot,
  DismantlingStage,
  ExportLine,
  ExportLoadingSnapshot,
  ExportsSnapshot,
  LanderSnapshot,
  LaunchManifestSnapshot,
  LunationSnapshot,
  MachineSnapshot,
  MaintenanceSnapshot,
  MaintenanceStep,
  MaintenanceSubject,
  MaintenanceWait,
  ManifestLine,
  ParkingSnapshot,
  PlantSnapshot,
  ResearchTaskSnapshot,
  MissionDirectorResidence,
  UnloadingSnapshot,
  WalkingDestination,
} from "../simulation";

const twoDigits = (value: number): string => String(value).padStart(2, "0");

/**
 * A figure in the status panel: its value, and an optional note on where
 * it is heading, shown after it, for example "24.2 kg" and "lasts 28d 19h".
 */
export interface Stat {
  readonly value: string;
  readonly note?: string;
}

/**
 * Formats the game clock to the hour, for example "Earth Day 3, 07:00". The
 * minutes are left out because at 1x they change six times a real second,
 * which is distracting.
 */
export function formatClock(clock: ClockSnapshot): string {
  return `Earth Day ${clock.earthDay}, ${twoDigits(clock.hour)}:00`;
}

/** Formats a moment in the Campaign to the minute, for example "Earth Day 23, 05:17". */
export function formatMoment(atMinute: number): string {
  const clock = readClock(atMinute);
  return `Earth Day ${clock.earthDay}, ${twoDigits(clock.hour)}:${twoDigits(clock.minute)}`;
}

const plural = (count: number, unit: string): string =>
  `${count} ${unit}${count === 1 ? "" : "s"}`;

/**
 * Formats the current part of the Lunation and the time left in it, for
 * example "Daylight · 7d 23h left". The time left is rounded up to the hour,
 * so that it adds up with the clock, which is rounded down.
 */
export function formatLunation(lunation: LunationSnapshot): string {
  const part = lunation.part === "daylight" ? "Daylight" : "Night";
  return `${part} · ${formatShortDuration(lunation.minutesRemaining)} left`;
}

/**
 * Formats a span of game time in Earth Days and hours for the status panel,
 * where space is short, for example "7d 23h", rounded up to the hour.
 */
export function formatShortDuration(minutes: number): string {
  const totalHours = Math.ceil(minutes / 60);
  const earthDays = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return [
    ...(earthDays > 0 ? [`${earthDays}d`] : []),
    ...(hours > 0 || earthDays === 0 ? [`${hours}h`] : []),
  ].join(" ");
}

/**
 * Formats a span of game time in Earth Days and hours, for example "7 Earth
 * Days 23 hours", rounded up to the hour.
 */
export function formatDuration(minutes: number): string {
  const totalHours = Math.ceil(minutes / 60);
  const earthDays = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return [
    ...(earthDays > 0 ? [plural(earthDays, "Earth Day")] : []),
    ...(hours > 0 || earthDays === 0 ? [plural(hours, "hour")] : []),
  ].join(" ");
}

const kilowatts = (value: number): string => `${value.toFixed(2)} kW`;
const kilowattHours = (value: number): string => `${value.toFixed(1)} kWh`;

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
  const value = `${storedKilowattHours.toFixed(1)} / ${kilowattHours(capacity)}`;
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
  const left = formatShortDuration(
    Math.max((lander.legEndsAtMinute ?? elapsedMinutes) - elapsedMinutes, 0),
  );
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
    case "travelling-to-earth":
      return {
        value:
          exportsAboard.length === 0
            ? "travelling to Earth"
            : `travelling to Earth with ${formatExportLines(exportsAboard)}`,
        note: `arrives in ${left}`,
      };
    case "turnaround":
      return { value: "in turnaround on Earth", note: `leaves in ${left}` };
    case "travelling-to-moon":
      return {
        value: "travelling to the Moon",
        note: `lands${onPad} in ${left}`,
      };
  }
}

export function stockLabel(stockId: string): string {
  return (
    catalogue.lifeSupportStocks.find((stock) => stock.id === stockId)?.label ??
    stockId
  );
}

/**
 * Says how much of a life support stock is left and when it will run out,
 * for example "24.2 kg" and "lasts 28d 19h", or how fast it is rising while
 * the base's Plants make more than is used, for example "rising 2.8 kg a
 * day".
 */
export function formatLifeSupport(
  stock: LifeSupportSnapshot,
  forecast: LifeSupportForecast | undefined,
  missionDirector: MissionDirectorResidence,
): Stat {
  const value = `${stock.kilograms.toFixed(1)} kg`;
  if ((forecast?.kilogramsPerEarthDay ?? 0) > 0) {
    return {
      value,
      note: `rising ${(forecast?.kilogramsPerEarthDay ?? 0).toFixed(1)} kg a day`,
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

/**
 * Formats a Condition to the whole percent, for example "73%". Only a
 * Broken one shows as 0%, and one that has worn down at all shows below
 * 100% once it is half a percentage point down.
 */
export function formatCondition(conditionPercent: number): string {
  if (conditionPercent <= 0) return "0%";
  return `${Math.min(Math.max(Math.round(conditionPercent), 1), 100)}%`;
}

/**
 * Says how well something works, if its Condition has cut its output, for
 * example "working at 80%"; undefined at full performance or once Broken.
 */
export function formatPerformance(performance: number): string | undefined {
  return performance > 0 && performance < 1
    ? `working at ${Math.max(Math.round(performance * 100), 1)}%`
    : undefined;
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
 * Says what happened in an event, for the notification list, for example
 * "Night has fallen". Given the base's Robots, it says which Robot an
 * event is about when there are several, as the Base panel names them;
 * otherwise it just says "Robot".
 */
export function formatEvent(
  event: GameEvent,
  robots: readonly Pick<RobotSnapshot, "id">[] = [],
): string {
  switch (event.kind) {
    case "night-started":
      return "Night has fallen";
    case "daylight-started":
      return "Daylight has come";
    case "lights-switched-off":
      return "Lights switching off to save power, so the battery banks carry the rest of the base through the Night";
    case "construction-completed":
      return `${structureLabel(event.structureTypeId)} commissioned`;
    case "structure-dismantled":
      return hasComponents(event.structureTypeId)
        ? `${structureLabel(event.structureTypeId)} dismantled, its Components back in the base's stock`
        : `${structureLabel(event.structureTypeId)} dismantled`;
    case "life-support-warning":
      return `${stockLabel(event.stockId)} will run out in ${formatDuration(event.minutesUntilEmpty)}`;
    case "habitat-power-warning":
      return `Habitat power will fail in ${formatDuration(event.minutesUntilPowerLost)}`;
    case "radiation-dose-warning":
      return `Radiation Dose will reach the limit in ${formatDuration(event.minutesUntilLimit)}`;
    case "solar-particle-event-warning":
      return `Solar Particle Event coming in ${formatDuration(event.startsAtMinute - event.atMinute)}, lasting ${formatDuration(event.endsAtMinute - event.startsAtMinute)}`;
    case "solar-particle-event-started":
      return `Solar Particle Event under way, for ${formatDuration(event.endsAtMinute - event.atMinute)}`;
    case "solar-particle-event-ended":
      return "Solar Particle Event over";
    case "milestone-reached":
      return `Milestone reached: ${milestoneLabel(event.milestoneId)}`;
    case "lander-took-off":
      return event.exports.length === 0
        ? "Lander took off for Earth"
        : `Lander took off for Earth with ${formatExportLines(event.exports)}`;
    case "lander-reached-earth":
      return event.sold.length === 0
        ? "Lander reached Earth for turnaround"
        : `Lander reached Earth for turnaround, and sold ${formatExportLines(event.sold)} for ${formatMillionDollars(event.earnedMillionDollars)}`;
    case "lander-left-earth":
      return event.chargedMillionDollars === 0
        ? "Lander left Earth for the Moon, with nothing aboard"
        : `Lander left Earth for the Moon; the Launch cost ${formatMillionDollars(event.chargedMillionDollars)}`;
    case "lander-landed":
      return event.delivered.length === 0
        ? "Lander landed"
        : `Lander landed with ${formatManifestLines(event.delivered)}`;
    case "lander-unloaded":
      return `Robot unloaded the Lander: ${formatComponents(event.components)} now in the base's stock`;
    case "lander-loaded":
      return `Robot loaded the Lander: ${formatExportLines(event.exports)} now aboard`;
    case "plume-ejecta-damage":
      return `Plume Ejecta wore down ${listInWords(
        event.damaged.map(
          (damage) =>
            `the ${structureLabel(damage.structureTypeId).toLowerCase()} to ${formatCondition(damage.conditionPercent)}`,
        ),
      )}`;
    case "structure-broken":
      return `${structureLabel(event.structureTypeId)} is Broken, and has stopped working`;
    case "machine-broken":
      return `${machineLabel(event.machineTypeId)} is Broken, and has stopped where it stood`;
    case "rover-broken":
      return `${catalogue.rover.label} is Broken, and has stopped where it stood`;
    case "maintenance-needed":
      return `${subjectLabel(event.target)} needs Maintenance: ${listInWords([
        ...(event.restoresCondition
          ? [`Condition down to ${formatCondition(event.conditionPercent)}`]
          : []),
        ...(event.cleans
          ? [`Dust coating up to ${Math.round(event.dustCoatingPercent)}%`]
          : []),
      ])}`;
    case "maintenance-completed":
      return `${subjectLabel(event.target)} maintained: ${listInWords([
        ...(event.spareComponents > 0
          ? [
              `back to 100% Condition, using ${plural(event.spareComponents, "spare Component")}`,
            ]
          : []),
        ...(event.cleaned ? ["cleaned of Dust"] : []),
      ])}`;
    case "robot-self-repair-started":
      return event.makeshift
        ? `${robotLabel(event.robotId, robots)} at ${formatCondition(event.conditionPercent)} Condition, going to the ${event.home === "habitat" ? "Habitat" : "Lander"} for a makeshift repair: there aren't enough spare Components`
        : `${robotLabel(event.robotId, robots)} at ${formatCondition(event.conditionPercent)} Condition, going to repair itself at the ${event.home === "habitat" ? "Habitat" : "Lander"}`;
    case "robot-repaired":
      return event.spareComponents > 0
        ? `${robotLabel(event.robotId, robots)} repaired itself, back to ${formatCondition(event.conditionPercent)}, using ${plural(event.spareComponents, "spare Component")}`
        : `${robotLabel(event.robotId, robots)} made a makeshift repair, back to ${formatCondition(event.conditionPercent)}, and works on slowly`;
    case "robot-arrived":
      return `${robots.length > 1 ? robotLabel(event.robotId, robots) : "A Robot"} has arrived from Earth, and is ready for work at the stockpile`;
    case "expedition-left":
      return `Expedition left the map, back in ${formatDuration(event.returnsAtMinute - event.atMinute)}`;
    case "expedition-returned":
      return `Expedition back with ${formatKilograms(event.kilograms)} of ${resourceLabel(event.resourceId).toLowerCase()}, now in the base's stock`;
    case "expedition-called-off":
      return "Expedition called off: the Rover is Broken";
    case "research-task-completed":
      return `${researchTaskLabel(event.researchTaskId)} complete, earning ${formatScience(event.science)}`;
    case "design-unlocked":
      return `${designLabel(event.designId)} unlocked, for ${formatScience(event.science)}`;
    case "self-sufficiency-gained":
      return `The base is now self-sufficient in ${stockLabel(event.stockId).toLowerCase()}`;
    case "self-sufficiency-lost":
      return `The base is no longer self-sufficient in ${stockLabel(event.stockId).toLowerCase()}`;
    case "spare-components-warning":
      return `Spare Components will run out in ${formatDuration(event.minutesUntilEmpty)}, with ${event.inStock} in stock`;
    case "micrometeorite-strike":
      return `Micrometeorite struck ${strikeTargetLabel(event.target, robots)}, leaving it at ${formatCondition(event.conditionPercent)} Condition`;
    case "mission-director-died":
      return `The Mission Director has died: ${describeCause(event.cause)}`;
  }
}

/**
 * Explains how the Mission Director died, for the game-over screen, for
 * example "The oxygen in the Habitat ran out on Earth Day 30, 18:17, and
 * the Mission Director died at once."
 */
export function formatDeath(end: CampaignEnd): string {
  const cause = describeCause(end.cause);
  return `${cause.charAt(0).toUpperCase()}${cause.slice(1)} on ${formatMoment(end.atMinute)}, and the Mission Director died at once.`;
}

/** What killed the Mission Director, for example "the oxygen in the Habitat ran out". */
function describeCause(cause: DeathCause): string {
  switch (cause.kind) {
    case "ran-out":
      return `the ${stockLabel(cause.stockId).toLowerCase()} in the Habitat ran out`;
    case "habitat-power-failed":
      return "Habitat power failed";
    case "radiation-dose-limit":
      return `Radiation Dose reached the ${millisieverts(catalogue.radiation.doseLimitMillisieverts, 0)} limit`;
  }
}

const millisieverts = (value: number, digits: number): string =>
  `${value.toFixed(digits)} mSv`;

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

const stageLabels: Record<ConstructionStage, string> = {
  "site-preparation": "Site Preparation",
  "component-delivery": "Component delivery",
  assembly: "Assembly",
  commissioning: "Commissioning",
};

export function formatStage(stage: ConstructionStage): string {
  return stageLabels[stage];
}

/** Whether a Structure is assembled from Components, rather than from Regolith alone. */
export function hasComponents(structureTypeId: string): boolean {
  return (
    (catalogue.structureTypes.find((type) => type.id === structureTypeId)
      ?.components.length ?? 0) > 0
  );
}

export function structureLabel(structureTypeId: string): string {
  return (
    catalogue.structureTypes.find((type) => type.id === structureTypeId)
      ?.label ?? structureTypeId
  );
}

/**
 * Formats an amount of money to the nearest $0.1M, for example "$12.5M" for
 * 12.5 million dollars, or "$60M" for 60.004 million.
 */
export function formatMillionDollars(value: number): string {
  return `$${Math.round(value * 10) / 10}M`;
}

/**
 * Lists the Components in the base's stock, for example "2 solar panels and
 * 4 mast poles".
 */
export function formatStock(stockpile: Snapshot["stockpile"]): string {
  const held = stockpile.components.filter((stock) => stock.count > 0);
  return held.length === 0 ? "no Components" : formatComponents(held);
}

/** Names a bulk resource or life support stock, for example "Regolith" or "Oxygen". */
export function resourceRefLabel(resource: ResourceRef): string {
  return resource.kind === "bulk-resource"
    ? resourceLabel(resource.resourceId)
    : stockLabel(resource.stockId);
}

/**
 * Says whether a Plant is running, and why not, for its line in the status
 * panel, for example "running" or "stopped: out of Regolith"; undefined
 * once it is Broken, which the line says already.
 */
export function formatPlant(plant: PlantSnapshot): string | undefined {
  switch (plant.stoppedFor?.reason) {
    case undefined:
      return "running";
    case "broken":
      return undefined;
    case "no-input":
      return `stopped: out of ${resourceRefLabel(plant.stoppedFor.resource)}`;
    case "no-power":
      return "stopped: no power to spare";
  }
}

export function resourceLabel(resourceId: string): string {
  return (
    catalogue.bulkResources.find((resource) => resource.id === resourceId)
      ?.label ?? resourceId
  );
}

/** Formats an amount in kilograms, rounded down to the whole kilogram, for example "1250 kg". */
export function formatKilograms(kilograms: number): string {
  return `${Math.floor(kilograms)} kg`;
}

/**
 * Lists the base's stock of bulk resources, each with its amount and,
 * if it is falling, roughly how long it will last at the current rate, for
 * example "Water ice", "190 kg" and "~7d 22h".
 */
export function formatBulkResources(
  bulkResources: Snapshot["bulkResources"],
  forecasts: readonly BulkResourceForecast[],
): (Stat & { readonly label: string; readonly empty: boolean })[] {
  return bulkResources.map((stock) => {
    const label = resourceLabel(stock.resourceId);
    const value = formatKilograms(stock.kilograms);
    const empty = stock.kilograms < 1;
    const minutes = forecasts.find(
      (forecast) => forecast.resourceId === stock.resourceId,
    )?.minutesUntilEmpty;
    return minutes === undefined || stock.kilograms === 0
      ? { label, value, empty }
      : { label, value, note: `~${formatShortDuration(minutes)}`, empty };
  });
}

/** Says how much Funding the base programme has, for example "$400M". */
export function formatFunding(fundingMillionDollars: number): string {
  return formatMillionDollars(fundingMillionDollars);
}

/** Says how much Science the base has or a Research Task pays, for example "20 Science". */
export function formatScience(science: number): string {
  return `${science} Science`;
}

/** Names a Research Task, for example "Seismic monitoring". */
export function researchTaskLabel(researchTaskId: string): string {
  return (
    catalogue.researchTasks.find((task) => task.id === researchTaskId)?.label ??
    researchTaskId
  );
}

/**
 * Whether a Design is unlocked, can be unlocked now or is out of reach, in
 * words for the Tech Tree screen, for example "Can be unlocked now", "Needs
 * Large battery banks first" or "Needs 12 more Science".
 */
export function describeDesignState(
  design: Design,
  snapshot: Pick<Snapshot, "science" | "unlockedDesignIds">,
): {
  readonly state: "unlocked" | "unlockable" | "out-of-reach";
  readonly text: string;
} {
  if (snapshot.unlockedDesignIds.includes(design.id)) {
    return { state: "unlocked", text: "Unlocked" };
  }
  const missing = design.prerequisiteDesignIds.filter(
    (id) => !snapshot.unlockedDesignIds.includes(id),
  );
  if (missing.length > 0) {
    return {
      state: "out-of-reach",
      text: `Needs ${missing.map(designLabel).join(" and ")} first`,
    };
  }
  if (snapshot.science < design.scienceCost) {
    return {
      state: "out-of-reach",
      text: `Needs ${design.scienceCost - snapshot.science} more Science`,
    };
  }
  return { state: "unlockable", text: "Can be unlocked now" };
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
 * Lists what a Launch brings the way a sentence would, for example "2 ×
 * Solar panel and 1 × Oxygen, 25 kg".
 */
export function formatManifestLines(lines: readonly ManifestLine[]): string {
  return listInWords(
    lines.map(({ itemId, count }) => {
      const item = catalogue.launch.items.find(
        (candidate) => candidate.id === itemId,
      );
      return `${count} × ${item === undefined ? itemId : launchItemLabel(item)}`;
    }),
  );
}

/** Joins phrases the way a sentence would, for example "a, b and c". */
function listInWords(phrases: readonly string[]): string {
  const items = [...phrases];
  const last = items.pop();
  return items.length === 0
    ? (last ?? "")
    : `${items.join(", ")} and ${last ?? ""}`;
}

/** Says a Launch item's mass and price, for example "60 kg, $4M". */
export function formatLaunchItem(item: LaunchItem): string {
  return `${item.massKilograms} kg, ${formatMillionDollars(item.priceMillionDollars)}`;
}

/**
 * Says the manifest's Payload Mass against the Launch's limit, for example
 * "Payload Mass: 230 of 2000 kg".
 */
export function formatPayloadMass(manifest: LaunchManifestSnapshot): string {
  return `Payload Mass: ${manifest.payloadMassKilograms} of ${catalogue.launch.payloadMassLimitKilograms} kg`;
}

/**
 * Says what the manifest costs against the Funding balance, and what any
 * Exports aboard the Lander will sell for before it is paid for, for
 * example "Cost: $230M of $400M Funding, including the $150M Launch fee" or
 * "Cost: $480M of $400M Funding and $150M from the Exports aboard,
 * including the $150M Launch fee". An empty manifest costs nothing, so the
 * fee is left out until it has an item. Once it is locked, it has been paid
 * for.
 */
export function formatLaunchCost(
  manifest: LaunchManifestSnapshot,
  fundingMillionDollars: number,
  valueAboardMillionDollars: number,
): string {
  if (manifest.locked) {
    return `Cost: ${formatMillionDollars(manifest.costMillionDollars)}, paid as the Lander left Earth`;
  }
  const funding = `${formatMillionDollars(fundingMillionDollars)} Funding${
    valueAboardMillionDollars === 0
      ? ""
      : ` and ${formatMillionDollars(valueAboardMillionDollars)} from the Exports aboard`
  }`;
  return manifest.items.length === 0
    ? `Cost: nothing of ${funding}, while the manifest is empty`
    : `Cost: ${formatMillionDollars(manifest.costMillionDollars)} of ${funding}, including the ${formatMillionDollars(catalogue.launch.feeMillionDollars)} Launch fee`;
}

/**
 * Lists Exports the way a sentence would, for example "40 kg of wafers and
 * 10 kg of circuit boards".
 */
export function formatExportLines(lines: readonly ExportLine[]): string {
  return listInWords(
    lines.map(
      ({ resourceId, kilograms }) =>
        `${formatKilograms(kilograms)} of ${resourceLabel(resourceId).toLowerCase()}`,
    ),
  );
}

/** Says an Export's price, for example "$1.5M a kg". */
export function formatExportPrice(sold: Export): string {
  return `${formatMillionDollars(sold.priceMillionDollarsPerKilogram)} a kg`;
}

/**
 * Formats a stock an Export can be loaded from, rounded down to the tenth of
 * a kilogram the player can set, for example "46.5 kg".
 */
export function formatExportStock(kilograms: number): string {
  return `${Math.floor(kilograms * 10) / 10} kg`;
}

/**
 * Formats an amount the player sets in kilograms, to the nearest tenth, for
 * example "35.5".
 */
export function formatKilogramAmount(kilograms: number): string {
  return String(Math.round(kilograms * 10) / 10);
}

/**
 * Says the mass of the Exports aboard the Lander and to load against its
 * Return Mass, for example "Return Mass: 40 of 100 kg".
 */
export function formatReturnMass(exports: ExportsSnapshot): string {
  const aboard = exports.aboard.reduce(
    (total, line) => total + line.kilograms,
    0,
  );
  return `Return Mass: ${formatKilogramAmount(exports.massKilograms + aboard)} of ${catalogue.lander.returnMassKilograms} kg`;
}

/**
 * Says what the Exports to load will sell for, for example "Value: $60M,
 * sold when the Lander reaches Earth".
 */
export function formatExportsValue(exports: ExportsSnapshot): string {
  return exports.toLoad.length === 0
    ? "Value: nothing, while there are no Exports to load"
    : `Value: ${formatMillionDollars(exports.valueMillionDollars)}, sold when the Lander reaches Earth`;
}

function componentLabel(componentId: string): string {
  return (
    catalogue.componentTypes.find((type) => type.id === componentId)?.label ??
    componentId
  );
}

/** Lists Components the way a sentence would, for example "2 solar panels and 1 array mast". */
export function formatComponents(counts: readonly ComponentCount[]): string {
  return listInWords(
    counts.map(({ componentId, count }) => {
      const label = componentLabel(componentId).toLowerCase();
      return `${count} ${label}${count === 1 ? "" : "s"}`;
    }),
  );
}

export function machineLabel(machineTypeId: string): string {
  return (
    catalogue.machineTypes.find((type) => type.id === machineTypeId)?.label ??
    machineTypeId
  );
}

/**
 * Says what a Machine is doing, and whether it is plugged in and powered,
 * working below par or due Maintenance, for the status panel, for example
 * "idle" and "plugged in and powered", or "Broken" and "awaiting
 * Maintenance". Its Condition is shown beside it.
 */
export function formatMachine(
  machine: MachineSnapshot,
  maintenance: readonly MaintenanceSnapshot[],
): Stat {
  const broken = machine.conditionPercent <= 0;
  const doing = broken
    ? "Broken"
    : machine.activity.kind === "working"
      ? "working"
      : machine.activity.kind === "being-positioned"
        ? "being driven to a site"
        : machine.activity.kind === "being-parked"
          ? "being parked"
          : machine.activity.kind === "being-positioned-to-dig"
            ? "being set digging"
            : machine.activity.kind === "digging"
              ? `digging ${resourceLabel(catalogue.digging.resourceId)}`
              : "idle";
  const order = maintenance.find(
    ({ target }) =>
      target.kind === "machine" && target.machineId === machine.id,
  );
  return {
    value: doing,
    ...notes([
      broken ? undefined : plugState(machine),
      formatPerformance(machine.performance),
      maintenanceState(order),
    ]),
  };
}

/** Whether a Machine or Rover is plugged in to charge, and whether it has power. */
function plugState(driven: {
  readonly pluggedIn: boolean;
  readonly powered: boolean;
}): string {
  return !driven.pluggedIn
    ? "not plugged in"
    : driven.powered
      ? "plugged in and powered"
      : "plugged in, no power";
}

/** Whether a Maintenance Work Order is waiting or under way, if there is one. */
export function maintenanceState(
  order: MaintenanceSnapshot | undefined,
): string | undefined {
  if (order === undefined) return undefined;
  return order.underWay ? "undergoing Maintenance" : "awaiting Maintenance";
}

/** Joins the notes that apply into one, or leaves the note out if none do. */
function notes(parts: readonly (string | undefined)[]): { note?: string } {
  const present = parts.filter((part) => part !== undefined);
  return present.length === 0 ? {} : { note: present.join(", ") };
}

/**
 * Says what a Robot is doing, and whether it works below par, for the
 * status panel, for example "working", "repairing itself at the Habitat"
 * and "working at 18%", or, for one a Launch has just brought, "climbing
 * down from the Lander". Its Condition is shown beside it.
 */
export function formatRobot(
  robot: RobotSnapshot,
  expedition?: ExpeditionSnapshot,
): Stat {
  const { activity, selfRepair } = robot;
  const performance = notes([formatPerformance(robot.performance)]);
  if (isOnExpedition(robot.id, expedition)) {
    return { value: "on an Expedition", ...performance };
  }
  if (activity.kind === "climbing-down") {
    return { value: "climbing down from the Lander", ...performance };
  }
  if (activity.kind === "walking-to-stockpile") {
    return { value: "walking to the stockpile, just arrived", ...performance };
  }
  const where =
    selfRepair === undefined
      ? ""
      : ` at the ${selfRepair.home === "habitat" ? "Habitat" : "Lander"}`;
  const doing =
    selfRepair === undefined
      ? activity.kind === "idle"
        ? "idle"
        : "working"
      : activity.kind === "repairing-itself"
        ? `${selfRepair.makeshift ? "making a makeshift repair" : "repairing itself"}${where}`
        : `going to repair itself${where}`;
  return { value: doing, ...performance };
}

/**
 * Whether a Robot has set off on an Expedition, so that every Work Order
 * waits for it: from walking to the Rover until it has unloaded what it
 * brought back.
 */
export function isOnExpedition(
  robotId: string,
  expedition: ExpeditionSnapshot | undefined,
): boolean {
  return (
    expedition !== undefined &&
    expedition.robotId === robotId &&
    expedition.stage !== "boarding"
  );
}

/**
 * Whether every Robot has set off on an Expedition, so that every Work
 * Order waits until one is back.
 */
export function isEveryRobotOnExpedition(
  robots: readonly Pick<RobotSnapshot, "id">[],
  expedition: ExpeditionSnapshot | undefined,
): boolean {
  return (
    robots.length > 0 &&
    robots.every((robot) => isOnExpedition(robot.id, expedition))
  );
}

/**
 * Names a Robot, for the Base panel and the notifications: "Robot" while
 * it is the only one, otherwise numbered by its id, for example "Robot 2",
 * so that its name never changes. A Robot whose id has no number is
 * numbered by where it comes in the list.
 */
export function robotLabel(
  robotId: string,
  robots: readonly Pick<RobotSnapshot, "id">[],
): string {
  if (robots.length <= 1) return "Robot";
  const number =
    robotNumber(robotId) ??
    robots.findIndex((robot) => robot.id === robotId) + 1;
  return `Robot ${number}`;
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
      return `away, back in ${formatDuration(Math.max((expedition.returnsAtMinute ?? elapsedMinutes) - elapsedMinutes, 0))}`;
    case "driving-back":
      return `back on the map with ${cargo}, driving to the stockpile`;
    case "unloading":
      return `unloading ${cargo} at the stockpile`;
  }
}

/**
 * Names what a Micrometeorite struck, for example "the solar array", "the
 * Robot", or "Robot 2" when there are several.
 */
function strikeTargetLabel(
  target: StrikeTarget,
  robots: readonly Pick<RobotSnapshot, "id">[],
): string {
  switch (target.kind) {
    case "structure":
      return `the ${structureLabel(target.structureTypeId).toLowerCase()}`;
    case "machine":
      return `the ${machineLabel(target.machineTypeId).toLowerCase()}`;
    case "rover":
      return `the ${catalogue.rover.label}`;
    case "robot":
      return robots.length > 1
        ? robotLabel(target.robotId, robots)
        : "the Robot";
  }
}

/** Names a Machine or Rover, for example "Excavator" or "Rover". */
export function drivenLabel(subject: DrivenSubject): string {
  return subject.kind === "machine"
    ? machineLabel(subject.machineTypeId)
    : catalogue.rover.label;
}

/** Names what a Maintenance Work Order is for, for example "Solar array" or "Excavator". */
export function subjectLabel(subject: MaintenanceSubject): string {
  return subject.kind === "structure"
    ? structureLabel(subject.structureTypeId)
    : drivenLabel(subject);
}

/** Lowercases a name, except one, such as the Rover, that the glossary always capitalises. */
export function inSentence(label: string): string {
  return label === catalogue.rover.label ? label : label.toLowerCase();
}

/**
 * Whether a Robot's activity is for a Machine or Rover, by what it is: its
 * Maintenance, or parking it.
 */
function isForDriven(activity: RobotActivity, subject: DrivenSubject): boolean {
  return subject.kind === "machine"
    ? "machineId" in activity && activity.machineId === subject.machineId
    : "roverId" in activity && activity.roverId === subject.roverId;
}

/**
 * Says what the Rover is doing, and whether it is plugged in and powered,
 * working below par or due Maintenance, for the status panel, for example
 * "parked" and "not plugged in", or "Broken" and "awaiting Maintenance".
 * Its Condition is shown beside it.
 */
export function formatRover(
  rover: RoverSnapshot,
  maintenance: readonly MaintenanceSnapshot[],
): Stat {
  const broken = rover.conditionPercent <= 0;
  const doing = broken
    ? "Broken"
    : rover.activity.kind === "being-parked"
      ? "being parked"
      : rover.activity.kind === "on-expedition"
        ? "on an Expedition"
        : "parked";
  const order = maintenance.find(
    ({ target }) => target.kind === "rover" && target.roverId === rover.id,
  );
  return {
    value: doing,
    ...notes([
      broken ? undefined : plugState(rover),
      formatPerformance(rover.performance),
      maintenanceState(order),
    ]),
  };
}

/** Whether a Robot's activity is for a Structure, by its id. */
export function isFor(activity: RobotActivity, structureId: string): boolean {
  return "structureId" in activity && activity.structureId === structureId;
}

/** Says why a Construction is waiting, for the Construction panel. */
export function formatWaiting(waiting: ConstructionWait): string {
  if (waiting.reason === "water-reserve") {
    const stock = stockLabel(waiting.stockId).toLowerCase();
    return `Waiting for ${formatKilograms(waiting.missingKilograms)} more ${stock}: filling it must leave the Mission Director a reserve`;
  }
  if (waiting.reason !== "missing-components") {
    const machine = machineLabel(waiting.machineTypeId).toLowerCase();
    switch (waiting.reason) {
      case "machine-busy":
        return `Waiting for the ${machine}, which is working on another site`;
      case "machine-broken":
        return `Waiting for the ${machine}, which is Broken until it has been maintained`;
      case "machine-maintained":
        return `Waiting for the ${machine}, which is undergoing Maintenance`;
    }
  }
  const missing = formatComponents(waiting.missing);
  const verb =
    waiting.missing.length === 1 && waiting.missing[0]?.count === 1
      ? "isn't"
      : "aren't";
  return `Waiting: ${missing} ${verb} in the base's stock`;
}

/**
 * Says what is happening on a Construction right now, for the Construction
 * panel: what a Machine and each Robot are doing on it, or else why it is
 * waiting.
 */
export function describeWork(
  construction: ConstructionSnapshot,
  snapshot: Pick<Snapshot, "robots" | "machines" | "structures" | "cables">,
): string {
  const machine = snapshot.machines.find(
    (candidate) =>
      candidate.activity.kind === "working" &&
      candidate.activity.constructionId === construction.id,
  );
  // One Robot may lay its cable while another works on its stage.
  const robots = snapshot.robots.filter((candidate) =>
    isFor(candidate.activity, construction.id),
  );
  const work = [
    ...(machine === undefined
      ? []
      : [
          `${machineLabel(machine.machineTypeId)} ${machineWork(construction)} by itself`,
        ]),
    ...robots.map((robot) => describeRobotWork(construction, robot, snapshot)),
  ];
  if (work.length > 0) return work.join("; ");
  return construction.waiting === undefined
    ? "Waiting for the Robot"
    : formatWaiting(construction.waiting);
}

/** What a Machine carrying out a Construction's current stage is doing. */
function machineWork(construction: ConstructionSnapshot): string {
  return construction.stage === "site-preparation"
    ? "grading the ground"
    : `building the ${structureLabel(construction.structureTypeId).toLowerCase()}`;
}

function describeRobotWork(
  construction: ConstructionSnapshot,
  robot: RobotSnapshot,
  snapshot: Pick<Snapshot, "machines" | "structures" | "cables">,
): string {
  const { activity } = robot;
  const machineName = (machineId: string) =>
    machineLabel(
      snapshot.machines.find((candidate) => candidate.id === machineId)
        ?.machineTypeId ?? machineId,
    ).toLowerCase();
  const cable = snapshot.cables.find(
    (candidate) => candidate.toStructureId === construction.id,
  );
  const cableSource = structureLabel(
    snapshot.structures.find(
      (structure) => structure.id === cable?.fromStructureId,
    )?.structureTypeId ?? "",
  ).toLowerCase();
  const describeWalk = (destination: WalkingDestination): string => {
    switch (destination) {
      case "stockpile":
        return "Robot walking to the stockpile for the Components";
      case "cable":
        return `Robot walking to the ${cableSource} to lay power cable`;
      // Only ever done to unload the Lander.
      case "lander":
        return "Waiting for the Robot";
      case "machine": {
        const positioning = snapshot.machines.find(
          (candidate) =>
            "constructionId" in candidate.activity &&
            candidate.activity.constructionId === construction.id,
        );
        return positioning === undefined
          ? "Robot walking to the Machine"
          : `Robot walking to the ${machineName(positioning.id)}`;
      }
      case "site":
        return robot.carrying.length > 0
          ? "Robot carrying the Components to the site"
          : "Robot walking to the site";
    }
  };
  switch (activity.kind) {
    case "idle":
      return "Waiting for the Robot";
    case "walking":
      return "structureId" in activity
        ? describeWalk(activity.destination)
        : "Waiting for the Robot";
    case "laying-cable":
      return `Robot laying power cable from the ${cableSource}: ${Math.floor(routeLength(cable?.route ?? []))} m so far`;
    case "driving-machine":
      return `Robot driving the ${machineName(activity.machineId)} to the site`;
    case "activating-machine":
      return `Robot activating the ${machineName(activity.machineId)}`;
    case "loading-components":
      return "Robot loading the Components at the stockpile";
    case "unloading-components":
      return "Robot unloading the Components at the site";
    case "assembling":
      return `Robot assembling the ${structureLabel(construction.structureTypeId).toLowerCase()}`;
    case "commissioning":
      return construction.failedCommissionings === 0
        ? "Robot testing it before it goes live"
        : `Commissioning failed ${plural(construction.failedCommissionings, "time")}; Robot retrying`;
    // Only ever done for a Structure being dismantled or maintained, to
    // unload or load the Lander, for the Robot's repair of itself, or as it
    // arrives from Earth, when it does nothing for anything else.
    case "driving-rover":
    case "on-expedition":
    case "unloading-expedition":
    case "dismantling":
    case "returning-components":
    case "loading-cargo":
    case "unloading-cargo":
    case "loading-exports":
    case "putting-exports-aboard":
    case "maintaining":
    case "cleaning":
    case "walking-to-repair":
    case "loading-spare-components":
    case "repairing-itself":
    case "climbing-down":
    case "walking-to-stockpile":
      return "Waiting for the Robot";
  }
}

const dismantlingStageLabels: Record<DismantlingStage, string> = {
  "taking-apart": "Taking apart",
  "returning-components": "Returning Components",
};

export function formatDismantlingStage(stage: DismantlingStage): string {
  return dismantlingStageLabels[stage];
}

/**
 * Says what is happening on a Structure being dismantled right now, for the
 * Work panel: what the Robot is doing on it, or else what it is waiting for.
 */
export function describeDismantling(
  dismantling: DismantlingSnapshot,
  snapshot: Pick<Snapshot, "robots">,
): string {
  const recovered = formatComponents(dismantling.recovered);
  const robot = snapshot.robots.find((candidate) =>
    isFor(candidate.activity, dismantling.id),
  );
  switch (robot?.activity.kind) {
    case "walking":
      if (robot.activity.destination === "stockpile") {
        return `Robot carrying ${recovered} to the stockpile`;
      }
      return dismantling.stage === "taking-apart"
        ? "Robot walking to the site"
        : `Robot walking to the site for ${recovered}`;
    case "dismantling":
      return `Robot taking the ${structureLabel(dismantling.structureTypeId).toLowerCase()} apart`;
    case "returning-components":
      return `Robot unloading ${recovered} at the stockpile`;
    default:
      return dismantling.stage === "taking-apart"
        ? "Waiting for the Robot; it keeps working until then"
        : `Waiting for the Robot to carry ${recovered} to the stockpile`;
  }
}

/**
 * Says what is happening on the unloading of the Lander's cargo right now,
 * for the Work panel: what the Robot is doing with it, or else that it is
 * waiting for the Robot.
 */
export function describeUnloading(
  unloading: UnloadingSnapshot,
  snapshot: Pick<Snapshot, "robots">,
): string {
  const cargo = formatComponents(unloading.cargo);
  const robot = snapshot.robots.find((candidate) =>
    isFor(candidate.activity, unloading.landingPadId),
  );
  switch (robot?.activity.kind) {
    case "walking":
      return robot.activity.destination === "lander"
        ? `Robot walking to the Lander for ${cargo}`
        : `Robot carrying ${cargo} to the stockpile`;
    case "loading-cargo":
      return `Robot taking ${cargo} off the Lander`;
    case "unloading-cargo":
      return `Robot unloading ${cargo} at the stockpile`;
    default:
      return unloading.collected
        ? `Waiting for the Robot to carry ${cargo} to the stockpile`
        : `Waiting for the Robot to take ${cargo} off the Lander`;
  }
}

/**
 * Says what is happening on the loading of the Exports onto the Lander
 * right now, for the Work panel: what the Robot is doing with them, or
 * else that it is waiting for the Robot.
 */
export function describeExportLoading(
  loading: ExportLoadingSnapshot,
  snapshot: Pick<Snapshot, "robots">,
): string {
  const exports = formatExportLines(loading.exports);
  const robot = snapshot.robots.find(
    ({ activity }) =>
      activity.kind === "loading-exports" ||
      activity.kind === "putting-exports-aboard" ||
      (activity.kind === "walking" && "purpose" in activity),
  );
  switch (robot?.activity.kind) {
    case "walking":
      return robot.activity.destination === "stockpile"
        ? `Robot walking to the stockpile for ${exports}`
        : `Robot carrying ${exports} to the Lander`;
    case "loading-exports":
      return `Robot loading ${exports} at the stockpile`;
    case "putting-exports-aboard":
      return `Robot putting ${exports} aboard the Lander`;
    default:
      return loading.collected
        ? `Waiting for the Robot to carry ${exports} to the Lander`
        : `Waiting for the Robot to load ${exports} at the stockpile`;
  }
}

/**
 * Says what is happening on parking a Machine right now, for the Work
 * panel: what the Robot is doing with it, or else that it is waiting for
 * the Robot.
 */
export function describeParking(
  parking: ParkingSnapshot,
  snapshot: Pick<Snapshot, "robots">,
): string {
  const machine = inSentence(drivenLabel(parking.subject));
  const beside = structureLabel(parking.structureTypeId).toLowerCase();
  const robot = parking.underWay
    ? snapshot.robots.find(({ activity }) =>
        isForDriven(activity, parking.subject),
      )
    : undefined;
  switch (robot?.activity.kind) {
    case "walking":
      return `Robot walking to the ${machine}`;
    case "driving-machine":
    case "driving-rover":
      return `Robot driving the ${machine} to the ${beside}, to plug it in`;
    default:
      return `Waiting for the Robot to park the ${machine} beside the ${beside}`;
  }
}

/** Says why a Maintenance Work Order is waiting, for the Work panel. */
export function formatMaintenanceWait(waiting: MaintenanceWait): string {
  return waiting.reason === "machine-at-work"
    ? "Waiting for the Machine to finish its work on a site"
    : `Waiting: ${plural(waiting.missing, "more spare Component")} needed in the base's stock`;
}

/**
 * Says what is happening on a Maintenance Work Order right now, for the Work
 * panel: what the Robot is doing on it, or else what it is waiting for.
 */
export function describeMaintenance(
  maintenance: MaintenanceSnapshot,
  snapshot: Pick<Snapshot, "robots">,
): string {
  const spares = plural(maintenance.spareComponents, "spare Component");
  const { target } = maintenance;
  const label = inSentence(subjectLabel(target));
  const robot = maintenance.underWay
    ? snapshot.robots.find(({ activity }) =>
        target.kind === "structure"
          ? isFor(activity, target.structureId)
          : isForDriven(activity, target),
      )
    : undefined;
  switch (robot?.activity.kind) {
    case "walking":
      if (robot.activity.destination === "stockpile") {
        return `Robot walking to the stockpile for ${spares}`;
      }
      return maintenance.spareComponents > 0
        ? `Robot carrying ${spares} to the ${label}`
        : `Robot walking to the ${label} to clean it`;
    case "loading-components":
      return `Robot loading ${spares} at the stockpile`;
    case "maintaining":
      return `Robot restoring the ${label}'s Condition`;
    case "cleaning":
      return `Robot cleaning the Dust off the ${label}`;
    default:
      if (maintenance.waiting !== undefined) {
        return formatMaintenanceWait(maintenance.waiting);
      }
      return maintenance.spareComponents > 0
        ? `Waiting for the Robot, which will use ${spares}`
        : "Waiting for the Robot, which will clean it";
  }
}

const maintenanceStepLabels: Record<MaintenanceStep, string> = {
  "loading-spare-components": "Loading spare Components",
  "restoring-condition": "Restoring Condition",
  cleaning: "Cleaning",
};

export function formatMaintenanceStep(step: MaintenanceStep): string {
  return maintenanceStepLabels[step];
}

/** Says how thickly Dust coats a solar array, for example "Dust coating 12%"; undefined for anything else. */
export function formatDustCoating(
  structure: Pick<StructureSnapshot, "structureTypeId" | "dustCoatingPercent">,
): string | undefined {
  const generates =
    (catalogue.structureTypes.find(
      (type) => type.id === structure.structureTypeId,
    )?.power.generationKilowatts ?? 0) > 0;
  return generates
    ? `Dust coating ${Math.round(structure.dustCoatingPercent)}%`
    : undefined;
}

/** The length of a line of points on the ground, in metres. */
export function routeLength(route: readonly GroundPosition[]): number {
  let total = 0;
  for (let index = 1; index < route.length; index++) {
    const from = route[index - 1];
    const to = route[index];
    if (from !== undefined && to !== undefined) {
      total += Math.hypot(to.x - from.x, to.y - from.y);
    }
  }
  return total;
}
