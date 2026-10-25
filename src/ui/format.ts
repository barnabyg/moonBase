import { catalogue } from "../catalogue";
import type {
  ClockSnapshot,
  ConstructionSnapshot,
  ConstructionStage,
  LunationSnapshot,
  RobotSnapshot,
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

/** Says what is happening on a Construction right now, for the Construction panel. */
export function describeWork(
  construction: ConstructionSnapshot,
  robots: readonly RobotSnapshot[],
): string {
  const robot = robots.find(
    (candidate) =>
      candidate.activity.kind !== "idle" &&
      candidate.activity.constructionId === construction.id,
  );
  if (robot === undefined) return "Waiting for the Robot";
  const { activity } = robot;
  switch (activity.kind) {
    case "idle":
      return "Waiting for the Robot";
    case "walking":
      return activity.destination === "lander"
        ? "Robot walking to the Lander for the Components"
        : robot.carrying.length > 0
          ? "Robot carrying the Components to the site"
          : "Robot walking to the site";
    case "preparing-site":
      return "Robot clearing and grading the ground";
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
    case "waiting-for-components":
      return "Waiting: its Components aren't in the cargo stock";
  }
}
