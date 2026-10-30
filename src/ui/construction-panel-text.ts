import { catalogue } from "../catalogue";
import type {
  ConstructionSnapshot,
  ConstructionStage,
  ConstructionWait,
  DismantlingSnapshot,
  DismantlingStage,
  DrivenSubject,
  ExportLoadingSnapshot,
  GroundPosition,
  MaintenanceSnapshot,
  MaintenanceStep,
  MaintenanceWait,
  ParkingSnapshot,
  RobotActivity,
  RobotSnapshot,
  Snapshot,
  UnloadingSnapshot,
  WalkingDestination,
} from "../simulation";
import { formatKilograms, plural } from "./format";
import {
  drivenLabel,
  formatComponents,
  formatExportLines,
  inSentence,
  machineLabel,
  stockLabel,
  structureLabel,
  subjectLabel,
} from "./labels";

// What is happening on each Work Order, in words, for the Work panel and a
// Structure's details.

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

/**
 * Whether a Robot's activity is for a Machine or Rover, by what it is: its
 * Maintenance, or parking it.
 */
function isForDriven(activity: RobotActivity, subject: DrivenSubject): boolean {
  return subject.kind === "machine"
    ? "machineId" in activity && activity.machineId === subject.machineId
    : "roverId" in activity && activity.roverId === subject.roverId;
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
 * Says where a Machine or Rover is being parked: "in a bay of the parking
 * area", or "beside the battery bank".
 */
export function formatParkingPlace(
  parking: Pick<ParkingSnapshot, "structureTypeId" | "inBay">,
): string {
  const structure = structureLabel(parking.structureTypeId).toLowerCase();
  return parking.inBay
    ? `in a bay of the ${structure}`
    : `beside the ${structure}`;
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
  const place = formatParkingPlace(parking);
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
      return `Waiting for the Robot to park the ${machine} ${place}`;
  }
}

/** Says why a Maintenance Work Order is waiting, for the Work panel. */
export function formatMaintenanceWait(waiting: MaintenanceWait): string {
  return waiting.reason === "machine-at-work"
    ? "Waiting for the Machine to finish its work on a site"
    : `Waiting: ${plural(waiting.missing, "more spare Component")} needed in the base's stock. Put spare Components on the Launch manifest`;
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
