import { catalogue } from "../catalogue";
import {
  readClock,
  type CampaignEnd,
  type DeathCause,
  type GameEvent,
  type HabitatPowerForecast,
  type LifeSupportForecast,
  type LifeSupportSnapshot,
  type RadiationDoseForecast,
} from "../simulation";
import type {
  ClockSnapshot,
  GroundPosition,
  PowerForecast,
  PowerNetworkSnapshot,
  RobotSnapshot,
  Snapshot,
  ComponentCount,
  ConstructionSnapshot,
  ConstructionWait,
  ConstructionStage,
  DismantlingSnapshot,
  DismantlingStage,
  LanderSnapshot,
  LunationSnapshot,
  MissionDirectorResidence,
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

/** Says what state the Lander is in, for example "Lander: landed, free to fly". */
export function formatLander(lander: LanderSnapshot): string {
  return lander.state === "landed-occupied"
    ? "Lander: landed, with the Mission Director aboard"
    : "Lander: landed, free to fly";
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
        ? `${structureLabel(event.structureTypeId)} dismantled, its Components back in the cargo stock`
        : `${structureLabel(event.structureTypeId)} dismantled`;
    case "life-support-warning":
      return `${stockLabel(event.stockId)} will run out in ${formatDuration(event.minutesUntilEmpty)}`;
    case "habitat-power-warning":
      return `Habitat power will fail in ${formatDuration(event.minutesUntilPowerLost)}`;
    case "radiation-dose-warning":
      return `Radiation Dose will reach the limit in ${formatDuration(event.minutesUntilLimit)}`;
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

/** Lists Components the way a sentence would, for example "2 solar panels and 1 array mast". */
export function formatComponents(counts: readonly ComponentCount[]): string {
  const items = counts.map(({ componentId, count }) => {
    const label = (
      catalogue.componentTypes.find((type) => type.id === componentId)?.label ??
      componentId
    ).toLowerCase();
    return `${count} ${label}${count === 1 ? "" : "s"}`;
  });
  const last = items.pop();
  return items.length === 0
    ? (last ?? "")
    : `${items.join(", ")} and ${last ?? ""}`;
}

export function machineLabel(machineTypeId: string): string {
  return (
    catalogue.machineTypes.find((type) => type.id === machineTypeId)?.label ??
    machineTypeId
  );
}

/** Says why a Construction is waiting, for the Construction panel. */
export function formatWaiting(waiting: ConstructionWait): string {
  if (waiting.reason === "machine-busy") {
    return `Waiting for the ${machineLabel(waiting.machineTypeId).toLowerCase()}, which is working on another site`;
  }
  const missing = formatComponents(waiting.missing);
  const verb =
    waiting.missing.length === 1 && waiting.missing[0]?.count === 1
      ? "isn't"
      : "aren't";
  return `Waiting: ${missing} ${verb} in the cargo stock`;
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
  const robot = snapshot.robots.find(
    (candidate) =>
      candidate.activity.kind !== "idle" &&
      candidate.activity.structureId === construction.id,
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
      case "lander":
        return "Robot walking to the Lander for the Components";
      case "cable":
        return `Robot walking to the ${cableSource} to lay power cable`;
      case "machine": {
        const positioning = snapshot.machines.find(
          (candidate) =>
            candidate.activity.kind !== "idle" &&
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
      return "Robot loading the Components at the Lander";
    case "unloading-components":
      return "Robot unloading the Components at the site";
    case "assembling":
      return `Robot assembling the ${structureLabel(construction.structureTypeId).toLowerCase()}`;
    case "commissioning":
      return construction.failedCommissionings === 0
        ? "Robot testing it before it goes live"
        : `Commissioning failed ${plural(construction.failedCommissionings, "time")}; Robot retrying`;
    // Only ever done for a Structure being dismantled.
    case "dismantling":
    case "returning-components":
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
  const robot = snapshot.robots.find(
    (candidate) =>
      candidate.activity.kind !== "idle" &&
      candidate.activity.structureId === dismantling.id,
  );
  switch (robot?.activity.kind) {
    case "walking":
      if (robot.activity.destination === "lander") {
        return `Robot carrying ${recovered} to the Lander`;
      }
      return dismantling.stage === "taking-apart"
        ? "Robot walking to the site"
        : `Robot walking to the site for ${recovered}`;
    case "dismantling":
      return `Robot taking the ${structureLabel(dismantling.structureTypeId).toLowerCase()} apart`;
    case "returning-components":
      return `Robot unloading ${recovered} at the Lander`;
    default:
      return dismantling.stage === "taking-apart"
        ? "Waiting for the Robot; it keeps working until then"
        : `Waiting for the Robot to carry ${recovered} to the Lander`;
  }
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
