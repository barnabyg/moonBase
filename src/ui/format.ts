import { catalogue } from "../catalogue";
import type {
  ClockSnapshot,
  Snapshot,
  ComponentCount,
  ConstructionSnapshot,
  ConstructionWait,
  ConstructionStage,
  LunationSnapshot,
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
  const totalHours = Math.ceil(lunation.minutesRemaining / 60);
  const earthDays = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const parts = [
    ...(earthDays > 0 ? [plural(earthDays, "Earth Day")] : []),
    ...(hours > 0 || earthDays === 0 ? [plural(hours, "hour")] : []),
  ];
  return `${part}: ${parts.join(" ")} left`;
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

/** Says what is happening on a Construction right now, for the Construction panel. */
export function describeWork(
  construction: ConstructionSnapshot,
  snapshot: Pick<Snapshot, "robots" | "machines">,
): string {
  if (construction.waiting !== undefined) {
    return formatWaiting(construction.waiting);
  }
  const machine = snapshot.machines.find(
    (candidate) =>
      candidate.activity.kind === "working" &&
      candidate.activity.constructionId === construction.id,
  );
  if (machine !== undefined) {
    return `${machineLabel(machine.machineTypeId)} grading the ground by itself`;
  }
  const robot = snapshot.robots.find(
    (candidate) =>
      candidate.activity.kind !== "idle" &&
      candidate.activity.constructionId === construction.id,
  );
  if (robot === undefined) return "Waiting for the Robot";
  const { activity } = robot;
  const machineName = (machineId: string) =>
    machineLabel(
      snapshot.machines.find((candidate) => candidate.id === machineId)
        ?.machineTypeId ?? machineId,
    ).toLowerCase();
  switch (activity.kind) {
    case "idle":
      return "Waiting for the Robot";
    case "walking":
      switch (activity.destination) {
        case "lander":
          return "Robot walking to the Lander for the Components";
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
      break;
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
  }
}
