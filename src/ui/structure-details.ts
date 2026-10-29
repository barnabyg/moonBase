import { catalogue, type StructureType } from "../catalogue";
import {
  habitatDoseRate,
  type ConstructionSnapshot,
  type DismantlingSnapshot,
  type Snapshot,
  type StructureSnapshot,
} from "../simulation";
import { designOf } from "./describe";
import {
  formatCondition,
  formatDismantlingStage,
  formatPerformance,
  formatPlantRates,
  formatStage,
  formatWaiting,
  listInWords,
  maintenanceState,
  structureLabel,
  type Stat,
} from "./format";
import { isHome, structureState } from "./structure-state";

// What the pop-up shown for a Structure clicked on the map says about it,
// from the latest snapshot. Its lines depend only on the Structure's type,
// and keep their order as it goes from Construction to Commissioning to
// dismantling, so that nothing in the pop-up jumps about as it updates:
// what doesn't apply yet shows as a dash.

/** One line of the pop-up: a label, a figure with an optional note, and how full a bar under it is, if it has one. */
export interface DetailLine {
  readonly label: string;
  readonly stat: Stat;
  readonly fraction?: number | undefined;
  readonly warning?: boolean;
}

export interface StructureDetails {
  readonly structureId: string;
  readonly structureTypeId: string;
  /** Its name, which for a Structure is its type, such as "Solar array". */
  readonly title: string;
  /** What it does, in a sentence, as the Guide says. */
  readonly description: string;
  readonly lines: readonly DetailLine[];
  /** The Structure once it is commissioned, for its controls; undefined while under Construction or being taken apart. */
  readonly commissioned: StructureSnapshot | undefined;
  /** Whether it is to be dismantled, or is being. */
  readonly toBeDismantled: boolean;
}

/** What doesn't apply yet, such as the Condition of a Structure under Construction. */
const NOT_YET: Stat = { value: "–" };

/**
 * What the pop-up says about a Structure, commissioned, under
 * Construction or being dismantled, or undefined once it is gone.
 */
export function structureDetails(
  snapshot: Snapshot,
  structureId: string,
): StructureDetails | undefined {
  const structure = snapshot.structures.find(({ id }) => id === structureId);
  const construction = snapshot.constructions.find(
    ({ id }) => id === structureId,
  );
  const dismantling = snapshot.dismantlings.find(
    ({ id }) => id === structureId,
  );
  const structureTypeId =
    structure?.structureTypeId ??
    construction?.structureTypeId ??
    dismantling?.structureTypeId;
  const type = catalogue.structureTypes.find(
    ({ id }) => id === structureTypeId,
  );
  if (structureTypeId === undefined || type === undefined) return undefined;
  const toBeDismantled = dismantling !== undefined;
  return {
    structureId,
    structureTypeId,
    title: structureLabel(structureTypeId),
    description: designOf(type.designId)?.description ?? "",
    lines: [
      stageLine(construction, structure, dismantling),
      {
        label: "State",
        stat: {
          value:
            structure !== undefined
              ? structureState(structure, toBeDismantled)
              : construction !== undefined
                ? "under Construction"
                : "being dismantled",
        },
        warning: structure !== undefined && structure.conditionPercent <= 0,
      },
      conditionLine(snapshot, structure),
      { label: "Power", stat: { value: describePower(type, structure) } },
      networkLine(snapshot, structure),
      ...(type.power.storageKilowattHours > 0
        ? [batteryLine(type, structure)]
        : []),
      ...(type.recipes === undefined ? [] : plantLines(type, structure)),
      ...(type.habitat ? habitatLines(snapshot, structureId, structure) : []),
      ...(type.lightRadiusMetres > 0 ? [lightLine(snapshot, structure)] : []),
      ...(type.power.generationKilowatts > 0 ? [dustLine(structure)] : []),
    ],
    commissioned: structure,
    toBeDismantled,
  };
}

/** Its stage of Construction or dismantling, and how far that has got. */
function stageLine(
  construction: ConstructionSnapshot | undefined,
  structure: StructureSnapshot | undefined,
  dismantling: DismantlingSnapshot | undefined,
): DetailLine {
  const label = "Stage";
  if (construction !== undefined) {
    const value = `${formatStage(construction.stage)} ${percent(construction.stageProgress)}`;
    return {
      label,
      stat:
        construction.waiting === undefined
          ? { value }
          : { value, note: formatWaiting(construction.waiting) },
      fraction: construction.stageProgress,
    };
  }
  // Until the Robot starts taking it apart, it stays a Structure.
  if (structure !== undefined) {
    return {
      label,
      stat: {
        value: dismantling === undefined ? "commissioned" : "to be dismantled",
      },
    };
  }
  return {
    label,
    stat: {
      value: `${dismantling === undefined ? "" : formatDismantlingStage(dismantling.stage)} ${percent(dismantling?.stageProgress ?? 0)}`,
    },
    fraction: dismantling?.stageProgress,
  };
}

function conditionLine(
  snapshot: Snapshot,
  structure: StructureSnapshot | undefined,
): DetailLine {
  const label = "Condition";
  if (structure === undefined) return { label, stat: NOT_YET };
  const broken = structure.conditionPercent <= 0;
  const maintenance = snapshot.maintenance.find(
    ({ target }) =>
      target.kind === "structure" && target.structureId === structure.id,
  );
  const notes = [
    broken ? "Broken" : undefined,
    maintenanceState(maintenance),
    formatPerformance(structure.performance),
  ].filter((note) => note !== undefined);
  const value = formatCondition(structure.conditionPercent);
  return {
    label,
    stat: notes.length === 0 ? { value } : { value, note: notes.join(", ") },
    fraction: structure.conditionPercent / 100,
    warning: broken,
  };
}

/** What it generates and draws, once commissioned, from the data catalogue. */
function describePower(
  type: StructureType,
  structure: StructureSnapshot | undefined,
): string {
  const { power } = type;
  // A Plant draws what the recipe it runs needs, while it runs.
  const recipe =
    type.recipes?.find(({ id }) => id === structure?.recipeId) ??
    type.recipes?.[0];
  const facts = [
    ...(power.generationKilowatts > 0
      ? [`generates up to ${power.generationKilowatts} kW in Daylight`]
      : []),
    ...(power.drawKilowatts > 0 ? [`draws ${power.drawKilowatts} kW`] : []),
    ...(power.nightDrawKilowatts > 0
      ? [`draws ${power.nightDrawKilowatts} kW while lit at Night`]
      : []),
    ...(recipe === undefined
      ? []
      : [`draws ${recipe.drawKilowatts} kW while it runs`]),
  ];
  return facts.length === 0 ? "needs no power" : facts.join(", ");
}

/** What the power network it is on makes and uses. */
function networkLine(
  snapshot: Snapshot,
  structure: StructureSnapshot | undefined,
): DetailLine {
  const label = "Network";
  if (structure === undefined) return { label, stat: NOT_YET };
  const network = snapshot.power.networks.find(({ structureIds }) =>
    structureIds.includes(structure.id),
  );
  if (network === undefined) {
    return { label, stat: { value: "not on a network" } };
  }
  return {
    label,
    stat: {
      value: `${network.generationKilowatts.toFixed(2)} kW made`,
      note: `${network.consumptionKilowatts.toFixed(2)} kW used`,
    },
  };
}

/** How much a battery bank holds, out of what its Condition lets it store. */
function batteryLine(
  type: StructureType,
  structure: StructureSnapshot | undefined,
): DetailLine {
  const label = "Battery";
  if (structure === undefined) return { label, stat: NOT_YET };
  const capacity = type.power.storageKilowattHours * structure.performance;
  return {
    label,
    stat: {
      value: `${structure.storedKilowattHours.toFixed(1)} / ${capacity.toFixed(1)} kWh`,
    },
    fraction: capacity > 0 ? structure.storedKilowattHours / capacity : 0,
  };
}

/** A Plant's recipe and what it makes and uses an hour. */
function plantLines(
  type: StructureType,
  structure: StructureSnapshot | undefined,
): DetailLine[] {
  if (structure === undefined) {
    return [
      { label: "Recipe", stat: NOT_YET },
      { label: "Output", stat: NOT_YET },
    ];
  }
  const recipe = type.recipes?.find(({ id }) => id === structure.recipeId);
  return [
    { label: "Recipe", stat: { value: recipe?.label ?? "–" } },
    {
      label: "Output",
      stat: {
        value: formatPlantRates(structure) ?? "nothing while it stands idle",
      },
    },
  ];
}

/** Who lives in a Habitat, what shields it, and the Radiation Dose rate inside. */
function habitatLines(
  snapshot: Snapshot,
  structureId: string,
  structure: StructureSnapshot | undefined,
): DetailLine[] {
  const shielding = [
    ...(structure?.shielded === true ? ["Regolith shielding"] : []),
    ...(structure?.waterWalled === true ? ["a water wall"] : []),
  ];
  const event = snapshot.solarParticleEvent;
  const multiplier =
    event?.state === "under-way" ? event.doseRateMultiplier : 1;
  const rate = habitatDoseRate(
    {
      shielded: structure?.shielded === true,
      waterWalled: structure?.waterWalled === true,
    },
    multiplier,
  );
  const value = `${rate.toFixed(2)} mSv a day`;
  return [
    {
      label: "Residents",
      stat: {
        value: isHome(snapshot, structureId)
          ? "the Mission Director"
          : "nobody",
      },
    },
    {
      label: "Shielding",
      stat: {
        value: shielding.length === 0 ? "none" : listInWords(shielding),
      },
    },
    {
      label: "Dose rate",
      stat:
        multiplier === 1
          ? { value }
          : {
              value,
              note: `${multiplier}× during the Solar Particle Event`,
            },
    },
  ];
}

/** Whether its light is on, and how far it reaches. */
function lightLine(
  snapshot: Snapshot,
  structure: StructureSnapshot | undefined,
): DetailLine {
  const label = "Light";
  if (structure === undefined) return { label, stat: NOT_YET };
  return {
    label,
    stat: {
      value: structure.lit
        ? `on, ${Math.round(structure.lightRadiusMetres)} m round it`
        : structure.savingPower
          ? "off to save power"
          : snapshot.lunation.part === "daylight"
            ? "off in Daylight"
            : "off",
    },
  };
}

/** How thickly Dust coats a solar array, cutting what it generates. */
function dustLine(structure: StructureSnapshot | undefined): DetailLine {
  const label = "Dust coating";
  if (structure === undefined) return { label, stat: NOT_YET };
  return {
    label,
    stat: { value: `${Math.round(structure.dustCoatingPercent)}%` },
    fraction: structure.dustCoatingPercent / 100,
  };
}

function percent(fraction: number): string {
  return `${Math.floor(fraction * 100)}%`;
}
