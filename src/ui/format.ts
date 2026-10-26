import { catalogue, type LaunchItem } from "../catalogue";
import {
  readClock,
  type CampaignEnd,
  type DeathCause,
  type GameEvent,
  type HabitatPowerForecast,
  type LifeSupportForecast,
  type LifeSupportSnapshot,
  type RadiationDoseForecast,
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
  DismantlingSnapshot,
  DismantlingStage,
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
  MissionDirectorResidence,
  UnloadingSnapshot,
  WalkingDestination,
} from "../simulation";

const twoDigits = (value: number): string => String(value).padStart(2, "0");

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
 * example "Daylight: 7 Earth Days 23 hours left". The time left is rounded up
 * to the hour, so that it adds up with the clock, which is rounded down.
 */
export function formatLunation(lunation: LunationSnapshot): string {
  const part = lunation.part === "daylight" ? "Daylight" : "Night";
  return `${part}: ${formatDuration(lunation.minutesRemaining)} left`;
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

/** Sums the base's power networks, for example "Power: 10.00 kW generated, 0.30 kW used". */
export function formatPower(power: Snapshot["power"]): string {
  const total = (pick: (network: PowerNetworkSnapshot) => number) =>
    sumNetworks(power, pick);
  return `Power: ${kilowatts(total((network) => network.generationKilowatts))} generated, ${kilowatts(total((network) => network.consumptionKilowatts))} used`;
}

/**
 * Says how much energy the base has stored and when it will run out, for
 * example "Stored: 42.0 of 60.0 kWh, runs out in 8 Earth Days 8 hours".
 */
export function formatStoredPower(
  power: Snapshot["power"],
  forecast: PowerForecast,
): string {
  const total = (pick: (network: PowerNetworkSnapshot) => number) =>
    sumNetworks(power, pick);
  const capacity = total((network) => network.storageCapacityKilowattHours);
  if (capacity === 0) return "Stored: no battery banks";
  const storedKilowattHours = total((network) => network.storedKilowattHours);
  const stored = `Stored: ${storedKilowattHours.toFixed(1)} of ${kilowattHours(capacity)}`;
  const { minutesUntilEmpty } = forecast;
  if (minutesUntilEmpty !== undefined) {
    return `${stored}, runs out in ${formatDuration(minutesUntilEmpty)}`;
  }
  return storedKilowattHours > 0
    ? `${stored}, doesn't run out`
    : `${stored}, empty`;
}

/** Says where the Mission Director lives, for example "Mission Director: aboard the Lander". */
export function formatMissionDirector(
  missionDirector: MissionDirectorResidence,
  structures: Snapshot["structures"],
): string {
  if (missionDirector.residence === "lander") {
    return "Mission Director: aboard the Lander";
  }
  const { habitatId } = missionDirector;
  const habitat = structures.find((structure) => structure.id === habitatId);
  return `Mission Director: living in the ${structureLabel(habitat?.structureTypeId ?? "habitat").toLowerCase()}`;
}

/**
 * Says whether the Habitat the Mission Director lives in has power and when
 * it will lose it, for example "Habitat power: on, fails in 1 Earth Day 16
 * hours", or undefined while they live aboard the Lander.
 */
export function formatHabitatPower(
  missionDirector: MissionDirectorResidence,
  structures: Snapshot["structures"],
  forecast: HabitatPowerForecast | undefined,
): string | undefined {
  if (missionDirector.residence !== "habitat") return undefined;
  const { habitatId } = missionDirector;
  const habitat = structures.find((structure) => structure.id === habitatId);
  if (habitat?.powered !== true) return "Habitat power: failed";
  return forecast?.minutesUntilPowerLost === undefined
    ? "Habitat power: on, doesn't fail"
    : `Habitat power: on, fails in ${formatDuration(forecast.minutesUntilPowerLost)}`;
}

/**
 * Says what state the Lander is in and, while it is away, when it next
 * arrives or leaves, for example "Lander: landed, free to fly" or "Lander:
 * in turnaround on Earth, leaves in 3 Earth Days 2 hours".
 */
export function formatLander(
  lander: LanderSnapshot,
  elapsedMinutes: number,
): string {
  const left = formatDuration(
    Math.max((lander.legEndsAtMinute ?? elapsedMinutes) - elapsedMinutes, 0),
  );
  const onPad = lander.landingPadId === undefined ? "" : " on the landing pad";
  switch (lander.state) {
    case "landed-occupied":
      return "Lander: landed, with the Mission Director aboard";
    case "landed-free":
      return lander.cargo.length === 0
        ? `Lander: landed${onPad}, free to fly`
        : `Lander: landed${onPad}, its cargo waiting for the Robot to unload it`;
    case "travelling-to-earth":
      return `Lander: travelling to Earth, arrives in ${left}`;
    case "turnaround":
      return `Lander: in turnaround on Earth, leaves in ${left}`;
    case "travelling-to-moon":
      return `Lander: travelling to the Moon, lands${onPad} in ${left}`;
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
 * for example "Oxygen: 24.2 kg, runs out in 28 Earth Days 19 hours".
 */
export function formatLifeSupport(
  stock: LifeSupportSnapshot,
  forecast: LifeSupportForecast | undefined,
  missionDirector: MissionDirectorResidence,
): string {
  const amount = `${stockLabel(stock.stockId)}: ${stock.kilograms.toFixed(1)} kg`;
  if (stock.kilograms === 0) return `${amount}, ran out`;
  if (forecast?.minutesUntilEmpty !== undefined) {
    return `${amount}, runs out in ${formatDuration(forecast.minutesUntilEmpty)}`;
  }
  return missionDirector.residence === "lander"
    ? `${amount}, kept safe aboard the Lander`
    : amount;
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
 * Says how well a Structure works, if its Condition has cut its output, for
 * example ", working at 80%"; nothing at full performance or once Broken.
 */
export function formatPerformance(performance: number): string {
  return performance > 0 && performance < 1
    ? `, working at ${Math.max(Math.round(performance * 100), 1)}%`
    : "";
}

/**
 * Says how many spare Components the base has and how long they will last
 * at the current rate of wear, for example "Spare Components: 6 in stock,
 * last 9 Earth Days 4 hours".
 */
export function formatSpareComponents(
  forecast: SpareComponentsForecast,
): string {
  const pending =
    forecast.forPendingRepairs === 0
      ? ""
      : `, ${forecast.forPendingRepairs} needed for repairs waiting`;
  const amount = `Spare Components: ${forecast.inStock} in stock${pending}`;
  if (forecast.minutesUntilEmpty === undefined) {
    return `${amount}, nothing wearing down`;
  }
  return forecast.minutesUntilEmpty === 0
    ? `${amount}, too few for the wear`
    : `${amount}, last ${formatDuration(forecast.minutesUntilEmpty)}`;
}

/** Says what happened in an event, for the notification list, for example "Night has fallen". */
export function formatEvent(event: GameEvent): string {
  switch (event.kind) {
    case "night-started":
      return "Night has fallen";
    case "daylight-started":
      return "Daylight has come";
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
    case "lander-took-off":
      return "Lander took off for Earth";
    case "lander-reached-earth":
      return "Lander reached Earth for turnaround";
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
        ? `Robot at ${formatCondition(event.conditionPercent)} Condition, going to the ${event.home === "habitat" ? "Habitat" : "Lander"} for a makeshift repair: there aren't enough spare Components`
        : `Robot at ${formatCondition(event.conditionPercent)} Condition, going to repair itself at the ${event.home === "habitat" ? "Habitat" : "Lander"}`;
    case "robot-repaired":
      return event.spareComponents > 0
        ? `Robot repaired itself, back to ${formatCondition(event.conditionPercent)}, using ${plural(event.spareComponents, "spare Component")}`
        : `Robot made a makeshift repair, back to ${formatCondition(event.conditionPercent)}, and works on slowly`;
    case "spare-components-warning":
      return `Spare Components will run out in ${formatDuration(event.minutesUntilEmpty)}, with ${event.inStock} in stock`;
    case "micrometeorite-strike":
      return `Micrometeorite struck the ${strikeTargetLabel(event.target)}, leaving it at ${formatCondition(event.conditionPercent)} Condition`;
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
 * limit, and how fast it is rising, for example "Radiation Dose: 64.0 of
 * 600 mSv, rising 30.0 mSv an Earth Day, limit in 17 Earth Days 21 hours".
 */
export function formatRadiationDose(
  doseMillisieverts: number,
  forecast: RadiationDoseForecast,
  missionDirector: MissionDirectorResidence,
): string {
  const limit = catalogue.radiation.doseLimitMillisieverts;
  const dose = `Radiation Dose: ${doseMillisieverts.toFixed(1)} of ${millisieverts(limit, 0)}`;
  if (doseMillisieverts >= limit) return `${dose}, limit reached`;
  if (forecast.minutesUntilLimit !== undefined) {
    return `${dose}, rising ${millisieverts(forecast.millisievertsPerEarthDay, 1)} an Earth Day, limit in ${formatDuration(forecast.minutesUntilLimit)}`;
  }
  return missionDirector.residence === "lander"
    ? `${dose}, none aboard the Lander`
    : dose;
}

/**
 * Says when a Solar Particle Event the Mission Director knows of starts or
 * ends, and how much it multiplies their dose rate, for example "Solar
 * Particle Event: starts in 4 hours, lasts 18 hours, 10× the dose rate".
 */
export function formatSolarParticleEvent(
  event: SolarParticleEventSnapshot,
  elapsedMinutes: number,
): string {
  const multiplied = `${event.doseRateMultiplier}× the dose rate`;
  return event.state === "coming"
    ? `Solar Particle Event: starts in ${formatDuration(event.startsAtMinute - elapsedMinutes)}, lasts ${formatDuration(event.endsAtMinute - event.startsAtMinute)}, ${multiplied}`
    : `Solar Particle Event: under way, ends in ${formatDuration(event.endsAtMinute - elapsedMinutes)}, ${multiplied}`;
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

/** Formats an amount of money, for example "$12.5M" for 12.5 million dollars. */
export function formatMillionDollars(value: number): string {
  return `$${Number.isInteger(value) ? value : value.toFixed(1)}M`;
}

/**
 * Lists the Components in the base's stock, for example "Stock: 2 solar
 * panels and 4 mast poles".
 */
export function formatStock(stockpile: Snapshot["stockpile"]): string {
  const held = stockpile.components.filter((stock) => stock.count > 0);
  return `Stock: ${held.length === 0 ? "no Components" : formatComponents(held)}`;
}

/** Says how much Funding the base programme has, for example "Funding: $400M". */
export function formatFunding(fundingMillionDollars: number): string {
  return `Funding: ${formatMillionDollars(fundingMillionDollars)}`;
}

/** Names something a Launch can bring, for example "Solar panel" or "Oxygen, 25 kg". */
export function launchItemLabel(item: LaunchItem): string {
  const { brings } = item;
  return brings.kind === "component"
    ? componentLabel(brings.componentId)
    : `${stockLabel(brings.stockId)}, ${brings.kilograms} kg`;
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
 * Says what the manifest costs against the Funding balance, for example
 * "Cost: $230M of $400M Funding, including the $150M Launch fee". An empty
 * manifest costs nothing, so the fee is left out until it has an item. Once
 * it is locked, it has been paid for.
 */
export function formatLaunchCost(
  manifest: LaunchManifestSnapshot,
  fundingMillionDollars: number,
): string {
  if (manifest.locked) {
    return `Cost: ${formatMillionDollars(manifest.costMillionDollars)}, paid as the Lander left Earth`;
  }
  const funding = `${formatMillionDollars(fundingMillionDollars)} Funding`;
  return manifest.items.length === 0
    ? `Cost: nothing of ${funding}, while the manifest is empty`
    : `Cost: ${formatMillionDollars(manifest.costMillionDollars)} of ${funding}, including the ${formatMillionDollars(catalogue.launch.feeMillionDollars)} Launch fee`;
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
 * Says what a Machine is doing, whether it is plugged in and powered, and
 * how intact it is, for the status panel, for example "Excavator: idle,
 * plugged in and powered, Condition 87%" or "Regolith printer: Broken,
 * Condition 0%, awaiting Maintenance".
 */
export function formatMachine(
  machine: MachineSnapshot,
  maintenance: readonly MaintenanceSnapshot[],
): string {
  const broken = machine.conditionPercent <= 0;
  const doing = broken
    ? "Broken"
    : machine.activity.kind === "working"
      ? "working"
      : machine.activity.kind === "being-positioned"
        ? "being driven to a site"
        : machine.activity.kind === "being-parked"
          ? "being parked"
          : "idle";
  const plug = broken
    ? ""
    : !machine.pluggedIn
      ? ", not plugged in"
      : machine.powered
        ? ", plugged in and powered"
        : ", plugged in, no power";
  const order = maintenance.find(
    ({ target }) =>
      target.kind === "machine" && target.machineId === machine.id,
  );
  const maintained =
    order === undefined
      ? ""
      : order.underWay
        ? ", undergoing Maintenance"
        : ", awaiting Maintenance";
  return `${machineLabel(machine.machineTypeId)}: ${doing}${plug}, Condition ${formatCondition(machine.conditionPercent)}${formatPerformance(machine.performance)}${maintained}`;
}

/**
 * Says what a Robot is doing and how intact it is, for the status panel,
 * for example "Robot: working, Condition 87%" or "Robot: repairing itself
 * at the Habitat, Condition 9%, working at 18%".
 */
export function formatRobot(robot: RobotSnapshot): string {
  const { activity, selfRepair } = robot;
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
  return `Robot: ${doing}, Condition ${formatCondition(robot.conditionPercent)}${formatPerformance(robot.performance)}`;
}

/** Names what a Micrometeorite struck, for example "solar array" or "Robot". */
function strikeTargetLabel(target: StrikeTarget): string {
  switch (target.kind) {
    case "structure":
      return structureLabel(target.structureTypeId).toLowerCase();
    case "machine":
      return machineLabel(target.machineTypeId).toLowerCase();
    case "robot":
      return "Robot";
  }
}

/** Names what a Maintenance Work Order is for, for example "Solar array" or "Excavator". */
export function subjectLabel(subject: MaintenanceSubject): string {
  return subject.kind === "structure"
    ? structureLabel(subject.structureTypeId)
    : machineLabel(subject.machineTypeId);
}

/** Whether a Robot's activity is for a Structure, by its id. */
export function isFor(activity: RobotActivity, structureId: string): boolean {
  return "structureId" in activity && activity.structureId === structureId;
}

/** Says why a Construction is waiting, for the Construction panel. */
export function formatWaiting(waiting: ConstructionWait): string {
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
 * panel: what a Machine and the Robot are doing on it, or else why it is
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
  const robot = snapshot.robots.find((candidate) =>
    isFor(candidate.activity, construction.id),
  );
  const work = [
    ...(machine === undefined
      ? []
      : [
          `${machineLabel(machine.machineTypeId)} ${machineWork(construction)} by itself`,
        ]),
    ...(robot === undefined
      ? []
      : [describeRobotWork(construction, robot, snapshot)]),
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
      return describeWalk(activity.destination);
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
    // unload the Lander, or for the Robot's repair of itself, when it does
    // nothing for anything else.
    case "dismantling":
    case "returning-components":
    case "loading-cargo":
    case "unloading-cargo":
    case "maintaining":
    case "cleaning":
    case "walking-to-repair":
    case "loading-spare-components":
    case "repairing-itself":
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
 * Says what is happening on parking a Machine right now, for the Work
 * panel: what the Robot is doing with it, or else that it is waiting for
 * the Robot.
 */
export function describeParking(
  parking: ParkingSnapshot,
  snapshot: Pick<Snapshot, "robots">,
): string {
  const machine = machineLabel(parking.machineTypeId).toLowerCase();
  const beside = structureLabel(parking.structureTypeId).toLowerCase();
  const robot = parking.underWay
    ? snapshot.robots.find(
        ({ activity }) =>
          "machineId" in activity && activity.machineId === parking.machineId,
      )
    : undefined;
  switch (robot?.activity.kind) {
    case "walking":
      return `Robot walking to the ${machine}`;
    case "driving-machine":
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
  const label = subjectLabel(target).toLowerCase();
  const robot = maintenance.underWay
    ? snapshot.robots.find(({ activity }) =>
        target.kind === "structure"
          ? isFor(activity, target.structureId)
          : "machineId" in activity && activity.machineId === target.machineId,
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

/** Says how thickly Dust coats a solar array, for example ", Dust coating 12%"; nothing for anything else. */
export function formatDustCoating(
  structure: Pick<StructureSnapshot, "structureTypeId" | "dustCoatingPercent">,
): string {
  const generates =
    (catalogue.structureTypes.find(
      (type) => type.id === structure.structureTypeId,
    )?.power.generationKilowatts ?? 0) > 0;
  return generates
    ? `, Dust coating ${Math.round(structure.dustCoatingPercent)}%`
    : "";
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
