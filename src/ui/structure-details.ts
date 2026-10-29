import { catalogue, type StructureType } from "../catalogue";
import {
  baysTaken,
  habitatDoseRate,
  habitatUnder,
  shieldingOver,
  waterWallOver,
  type ConstructionSnapshot,
  type DismantlingSnapshot,
  type Snapshot,
  type StructureSnapshot,
} from "../simulation";
import { designOf, powerRatings } from "./describe";
import {
  formatCharge,
  formatCondition,
  formatObservingProgramme,
  formatDismantlingStage,
  formatPower,
  formatStage,
  formatStageProgress,
  formatWaiting,
  listInWords,
  structureLabel,
  type Stat,
} from "./format";
import {
  isHome,
  isToBeDismantled,
  structureNotes,
  structureStatus,
} from "./structure-state";

// What the pop-up shown for a Structure clicked on the map says about it,
// from the latest snapshot. Its lines depend only on the Structure's type,
// and keep their order as it goes from Construction to Commissioning to
// dismantling, so that nothing in the pop-up jumps about as it updates:
// what doesn't apply yet shows as a dash.

/** One line of the pop-up: a label, a figure with an optional note, and how full a bar under it is, if it has one. */
export interface DetailLine {
  readonly label: string;
  readonly stat: Stat;
  readonly fraction?: number;
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
  /**
   * The other Structures on the same spot, to switch the pop-up to: for a
   * Habitat, the Regolith shielding and water wall over it, which hide it
   * from clicks; for those, the Habitat under them.
   */
  readonly switchTo: readonly StructureLink[];
}

/** A Structure to switch the pop-up to. */
export interface StructureLink {
  readonly structureId: string;
  readonly title: string;
}

/** Anything with a Structure's footprint, commissioned, under Construction or being dismantled. */
type Footing = Pick<StructureSnapshot, "id" | "structureTypeId" | "position">;

/**
 * The Structure whose pop-up a click on a Structure opens: the Habitat
 * under Regolith shielding or a water wall, which cover it so that every
 * click on it lands on them, or else the Structure clicked.
 */
export function popUpFor(snapshot: Snapshot, clickedId: string): string {
  const clicked = footingOf(snapshot, clickedId);
  return clicked === undefined
    ? clickedId
    : (habitatUnder(snapshot, clicked)?.id ?? clickedId);
}

function footingOf(
  snapshot: Snapshot,
  structureId: string,
): Footing | undefined {
  return (
    snapshot.structures.find(({ id }) => id === structureId) ??
    snapshot.constructions.find(({ id }) => id === structureId) ??
    snapshot.dismantlings.find(({ id }) => id === structureId)
  );
}

/** What to switch to from a Habitat's pop-up, or from that of something over one. */
function switchesFrom(snapshot: Snapshot, footing: Footing): StructureLink[] {
  const habitat = habitatUnder(snapshot, footing);
  const others =
    habitat !== undefined
      ? [habitat]
      : [shieldingOver(snapshot, footing), waterWallOver(snapshot, footing)];
  return others
    .filter((other) => other !== undefined)
    .map(({ id, structureTypeId }) => ({
      structureId: id,
      title: structureLabel(structureTypeId),
    }));
}

/** What doesn't apply yet, such as the Condition of a Structure under Construction. */
const NOT_YET: Stat = { value: "–" };

/** Where a Structure is in its life, with what the snapshot says of it there. */
type Phase =
  | {
      readonly kind: "construction";
      readonly construction: ConstructionSnapshot;
    }
  | {
      /** Commissioned, and perhaps to be dismantled, until the Robot starts taking it apart. */
      readonly kind: "commissioned";
      readonly structure: StructureSnapshot;
      readonly toBeDismantled: boolean;
    }
  | {
      readonly kind: "dismantling";
      readonly dismantling: DismantlingSnapshot;
    };

function phaseOf(snapshot: Snapshot, structureId: string): Phase | undefined {
  const structure = snapshot.structures.find(({ id }) => id === structureId);
  if (structure !== undefined) {
    return {
      kind: "commissioned",
      structure,
      toBeDismantled: isToBeDismantled(snapshot, structureId),
    };
  }
  const construction = snapshot.constructions.find(
    ({ id }) => id === structureId,
  );
  if (construction !== undefined) return { kind: "construction", construction };
  const dismantling = snapshot.dismantlings.find(
    ({ id }) => id === structureId,
  );
  return dismantling === undefined
    ? undefined
    : { kind: "dismantling", dismantling };
}

/** Where it stands, in whichever phase it is in. */
function footingIn(phase: Phase): Footing {
  switch (phase.kind) {
    case "construction":
      return phase.construction;
    case "commissioned":
      return phase.structure;
    case "dismantling":
      return phase.dismantling;
  }
}

/**
 * What the pop-up says about a Structure, commissioned, under
 * Construction or being dismantled, or undefined once it is gone.
 */
export function structureDetails(
  snapshot: Snapshot,
  structureId: string,
): StructureDetails | undefined {
  const phase = phaseOf(snapshot, structureId);
  if (phase === undefined) return undefined;
  const footing = footingIn(phase);
  const { structureTypeId } = footing;
  const type = catalogue.structureTypes.find(
    ({ id }) => id === structureTypeId,
  );
  if (type === undefined) return undefined;
  const structure = phase.kind === "commissioned" ? phase.structure : undefined;
  return {
    structureId,
    structureTypeId,
    title: structureLabel(structureTypeId),
    description: designOf(type.designId)?.description ?? "",
    lines: [
      stageLine(phase),
      stateLine(phase),
      conditionLine(snapshot, structure),
      {
        label: "Rated",
        stat: { value: describePowerRatings(type, structure) },
      },
      networkLine(snapshot, structure),
      ...(type.power.storageKilowattHours > 0
        ? [batteryLine(type, structure)]
        : []),
      ...(type.recipes === undefined
        ? []
        : plantLines(snapshot, type, structure)),
      ...(type.habitat ? habitatLines(snapshot, structureId, structure) : []),
      ...(type.lightRadiusMetres > 0 ? [lightLine(snapshot, structure)] : []),
      ...(type.telescope === true ? telescopeLines(snapshot, structure) : []),
      ...(type.parking === undefined ? [] : [baysLine(snapshot, structure)]),
      ...(type.power.generationKilowatts > 0 ? [dustLine(structure)] : []),
    ],
    commissioned: structure,
    toBeDismantled:
      phase.kind === "dismantling" ||
      (phase.kind === "commissioned" && phase.toBeDismantled),
    switchTo: switchesFrom(snapshot, footing),
  };
}

/** Its stage of Construction or dismantling, and how far that has got. */
function stageLine(phase: Phase): DetailLine {
  const label = "Stage";
  switch (phase.kind) {
    case "construction": {
      const { construction } = phase;
      const value = formatStageProgress(
        formatStage(construction.stage),
        construction.stageProgress,
      );
      return {
        label,
        stat:
          construction.waiting === undefined
            ? { value }
            : { value, note: formatWaiting(construction.waiting) },
        fraction: construction.stageProgress,
      };
    }
    case "commissioned":
      return {
        label,
        stat: {
          value: phase.toBeDismantled ? "to be dismantled" : "commissioned",
        },
      };
    case "dismantling":
      return {
        label,
        stat: {
          value: formatStageProgress(
            formatDismantlingStage(phase.dismantling.stage),
            phase.dismantling.stageProgress,
          ),
        },
        fraction: phase.dismantling.stageProgress,
      };
  }
}

/** What state it is in, in a few words, as the Base panel says it once it is commissioned. */
function stateLine(phase: Phase): DetailLine {
  const label = "State";
  switch (phase.kind) {
    case "construction":
      return { label, stat: { value: "under Construction" } };
    case "commissioned":
      return {
        label,
        stat: { value: structureStatus(phase.structure, phase.toBeDismantled) },
        warning: phase.structure.conditionPercent <= 0,
      };
    case "dismantling":
      return { label, stat: { value: "being dismantled" } };
  }
}

function conditionLine(
  snapshot: Snapshot,
  structure: StructureSnapshot | undefined,
): DetailLine {
  const label = "Condition";
  if (structure === undefined) return { label, stat: NOT_YET };
  const broken = structure.conditionPercent <= 0;
  const { maintenance, performance } = structureNotes(snapshot, structure);
  const notes = [
    broken ? "Broken" : undefined,
    maintenance,
    performance,
  ].filter((note) => note !== undefined);
  const value = formatCondition(structure.conditionPercent);
  return {
    label,
    stat: notes.length === 0 ? { value } : { value, note: notes.join(", ") },
    fraction: structure.conditionPercent / 100,
    warning: broken,
  };
}

/**
 * What it is rated to generate, store and draw once commissioned, from the
 * data catalogue, as the build menu and the Guide say it, rather than
 * what it is doing now.
 */
function describePowerRatings(
  type: StructureType,
  structure: StructureSnapshot | undefined,
): string {
  // A Plant draws what the recipe it runs needs, while it runs.
  const recipe =
    type.recipes?.find(({ id }) => id === structure?.recipeId) ??
    type.recipes?.[0];
  const ratings = powerRatings(type, recipe);
  return ratings.length === 0 ? "needs no power" : listInWords(ratings);
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
  return { label, stat: formatPower({ networks: [network] }) };
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
    stat: { value: formatCharge(structure.storedKilowattHours, capacity) },
    fraction: capacity > 0 ? structure.storedKilowattHours / capacity : 0,
  };
}

/** A Plant's recipe and what it makes and uses an hour. */
function plantLines(
  snapshot: Snapshot,
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
        value:
          structureNotes(snapshot, structure).plantRates ??
          "nothing while it stands idle",
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

/** Whether its light is on, or off to save power, as the Base panel says it. */
function lightLine(
  snapshot: Snapshot,
  structure: StructureSnapshot | undefined,
): DetailLine {
  const label = "Light";
  if (structure === undefined) return { label, stat: NOT_YET };
  return {
    label,
    stat: { value: structureNotes(snapshot, structure).light ?? "off" },
  };
}

/**
 * Whether a telescope is observing, or why not, as the Base panel says
 * it, and how the observing programme the base's telescopes share is
 * going, as the status panel says it.
 */
function telescopeLines(
  snapshot: Snapshot,
  structure: StructureSnapshot | undefined,
): DetailLine[] {
  const programme = formatObservingProgramme(snapshot.observingProgramme);
  const programmeLine: DetailLine =
    structure === undefined || programme === undefined
      ? { label: "Programme", stat: NOT_YET }
      : {
          label: "Programme",
          stat: programme,
          fraction: snapshot.observingProgramme.progress,
        };
  if (structure === undefined) {
    return [{ label: "Observing", stat: NOT_YET }, programmeLine];
  }
  const notes = structureNotes(snapshot, structure);
  return [
    {
      label: "Observing",
      stat: {
        value:
          notes.observing ??
          notes.light ??
          (snapshot.lunation.part === "daylight"
            ? "waits for Night"
            : "not observing"),
      },
    },
    programmeLine,
  ];
}

/** How many of a parking area's bays have a Machine or the Rover in them. */
function baysLine(
  snapshot: Snapshot,
  structure: StructureSnapshot | undefined,
): DetailLine {
  const label = "Bays";
  if (structure === undefined) return { label, stat: NOT_YET };
  const { taken, bays } = baysTaken(structure, [
    ...snapshot.machines.map(({ position }) => position),
    ...snapshot.rovers.map(({ position }) => position),
  ]);
  return {
    label,
    stat: { value: `${taken} of ${bays} taken` },
    fraction: bays === 0 ? 0 : taken / bays,
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
