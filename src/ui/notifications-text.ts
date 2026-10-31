import { catalogue } from "../catalogue";
import {
  actAsks,
  actLabel,
  designLabel,
  launchItemLabel,
  milestoneLabel,
  type GameEvent,
  type ManifestLine,
  type RobotSnapshot,
  type StrikeTarget,
} from "../simulation";
import { hasComponents } from "./construction-panel-text";
import {
  formatCondition,
  formatDuration,
  formatKilograms,
  formatMillionDollars,
  formatScience,
  listInWords,
  plural,
} from "./format";
import { describeCause } from "./game-over-text";
import {
  formatComponents,
  formatExportLines,
  machineLabel,
  researchTaskLabel,
  resourceLabel,
  robotLabel,
  stockLabel,
  structureLabel,
  subjectLabel,
  inSentence,
} from "./labels";

// What happened in each event, in words, for the notification list.

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
    case "act-started":
      return `${actLabel(event.actId)} begins. ${actAsks(event.actId)}`;
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
            `the ${inSentence(structureLabel(damage.structureTypeId))} to ${formatCondition(damage.conditionPercent)}`,
        ),
      )}`;
    case "structure-broken":
      return `${structureLabel(event.structureTypeId)} is Broken, and has stopped working until the Robot repairs it`;
    case "machine-broken":
      return `${machineLabel(event.machineTypeId)} is Broken, and has stopped where it stood until the Robot repairs it`;
    case "rover-broken":
      return `${catalogue.rover.label} is Broken, and has stopped where it stood until the Robot repairs it`;
    case "maintenance-needed":
      return `${subjectLabel(event.target)} needs Maintenance: ${listInWords([
        ...(event.restoresCondition
          ? [`Condition down to ${formatCondition(event.conditionPercent)}`]
          : []),
        ...(event.cleans
          ? [`Dust coating up to ${Math.round(event.dustCoatingPercent)}%`]
          : []),
      ])}; the Robot will ${listInWords([
        ...(event.restoresCondition ? ["repair"] : []),
        ...(event.cleans ? ["clean"] : []),
      ])} it by itself${event.restoresCondition ? ", using spare Components" : ""}`;
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
    case "observing-round-completed":
      return `${catalogue.observingProgramme.label}: a round of observing complete, earning ${formatScience(event.science)}`;
    case "design-unlocked":
      return `${designLabel(event.designId)} unlocked, for ${formatScience(event.science)}`;
    case "self-sufficiency-gained":
      return `The base is now self-sufficient in ${selfSufficiencySubject(event.stockId)}`;
    case "self-sufficiency-lost":
      return `The base is no longer self-sufficient in ${selfSufficiencySubject(event.stockId)}`;
    case "spare-components-warning":
      return `Spare Components will run out in ${formatDuration(event.minutesUntilEmpty)}, with ${event.inStock} in stock`;
    case "micrometeorite-strike":
      return `Micrometeorite struck ${strikeTargetLabel(event.target, robots)}, leaving it at ${formatCondition(event.conditionPercent)} Condition`;
    case "mission-director-died":
      return `The Mission Director has died: ${describeCause(event.cause)}`;
  }
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

/** What the base is or isn't self-sufficient in, for a sentence. */
function selfSufficiencySubject(stockId: string): string {
  return stockId === catalogue.maintenance.spareComponentId
    ? "spare Components"
    : stockLabel(stockId).toLowerCase();
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
      return `the ${inSentence(structureLabel(target.structureTypeId))}`;
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
