import { catalogue, type ResourceRef } from "../catalogue";
import {
  robotNumber,
  type ComponentCount,
  type DrivenSubject,
  type ExportLine,
  type MaintenanceSubject,
  type RobotSnapshot,
} from "../simulation";
import { formatKilograms, listInWords } from "./format";

// The names of things in the game, from the data catalogue, and lists of
// them in words, shared by the panels and the notifications.

export function stockLabel(stockId: string): string {
  return (
    catalogue.lifeSupportStocks.find((stock) => stock.id === stockId)?.label ??
    stockId
  );
}

export function structureLabel(structureTypeId: string): string {
  return (
    catalogue.structureTypes.find((type) => type.id === structureTypeId)
      ?.label ?? structureTypeId
  );
}

/** Names a bulk resource or life support stock, for example "Regolith" or "Oxygen". */
export function resourceRefLabel(resource: ResourceRef): string {
  return resource.kind === "bulk-resource"
    ? resourceLabel(resource.resourceId)
    : stockLabel(resource.stockId);
}

export function resourceLabel(resourceId: string): string {
  return (
    catalogue.bulkResources.find((resource) => resource.id === resourceId)
      ?.label ?? resourceId
  );
}

/** Names a Research Task, for example "Seismic monitoring". */
export function researchTaskLabel(researchTaskId: string): string {
  return (
    catalogue.researchTasks.find((task) => task.id === researchTaskId)?.label ??
    researchTaskId
  );
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

export function componentLabel(componentId: string): string {
  return (
    catalogue.componentTypes.find((type) => type.id === componentId)?.label ??
    componentId
  );
}

/**
 * A Component's name in the middle of a sentence, keeping any term the
 * Glossary capitalises, for example "machine tool" or "spare Component".
 */
export function componentInSentence(componentId: string): string {
  const label = componentLabel(componentId);
  return `${label.charAt(0).toLowerCase()}${label.slice(1)}`;
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

/** Lowercases a name, except one, such as the Rover or a Workshop, that the glossary always capitalises. */
export function inSentence(label: string): string {
  return label === catalogue.rover.label || label === "Workshop"
    ? label
    : label.toLowerCase();
}
