import { catalogue } from "../catalogue";
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
  LunationSnapshot,
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

const stageLabels: Record<ConstructionStage, string> = {
  "site-preparation": "Site Preparation",
  "component-delivery": "Component delivery",
  assembly: "Assembly",
  commissioning: "Commissioning",
};

export function formatStage(stage: ConstructionStage): string {
  return stageLabels[stage];
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
          `${machineLabel(machine.machineTypeId)} grading the ground by itself`,
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
