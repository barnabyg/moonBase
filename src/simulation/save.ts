import { catalogue, type ResourceRef } from "../catalogue";
import type { CampaignEnd, CampaignState } from "./campaign";
import type {
  ConstructionStage,
  MachineStage,
  StructureState,
} from "./construction";
import type { DismantlingStage } from "./dismantling";
import type { DeathCause } from "./events";
import type { ExpeditionStage } from "./expeditions";
import type { LanderLeg } from "./lander";
import type { MachineActivity } from "./machines";
import type { MissionDirectorResidence } from "./mission-director";
import type { PlantStop } from "./plants";
import { MAX_SEED } from "./random";
import type { RobotActivity, WalkingDestination } from "./robot";
import type { RoverActivity } from "./rovers";
import {
  isRecord,
  isWholeNumber,
  migrations,
  type Migration,
} from "./save-migrations";
import type {
  MachineWorkOrderKind,
  RoverWorkOrderKind,
  StructureWorkOrderKind,
  WorkOrder,
  WorkOrderKind,
} from "./work-orders";

/** What every save document says it is, to tell it from any other JSON. */
const SAVE_FORMAT = "moonbase-save";

export type LoadRefusal =
  /** It isn't JSON, or isn't a Moon Base save document. */
  | "not-a-save"
  /** It comes from a newer save format version than this game can load. */
  | "newer-version"
  /** It is a save document, but something in it is missing or wrong. */
  | "damaged";

export type ReadResult =
  | { readonly ok: true; readonly state: CampaignState }
  | {
      readonly ok: false;
      readonly reason: LoadRefusal;
      /** The reason in words the player can read. */
      readonly message: string;
    };

/**
 * Writes the Campaign state as the text of a save document: JSON with the
 * format, its version, the random generator state and the rest of the
 * simulation state. Anything undefined is written as null, so that every
 * field is there to see.
 */
export function writeSaveDocument(state: CampaignState): string {
  const { random, ...rest } = state;
  return JSON.stringify(
    {
      format: SAVE_FORMAT,
      version: migrations.length + 1,
      random,
      state: rest,
    },
    (_key, value: unknown) => (value === undefined ? null : value),
    2,
  );
}

/**
 * Reads the text of a save document back into a Campaign state, first
 * bringing an older format version up to date through the chain of
 * migrations. Anything that isn't a save document of a version it can load,
 * with every field present and valid, is refused with the reason; the one
 * thing that may be missing is a count in the base's stock (see
 * `componentStock`).
 */
export function readSaveDocument(
  text: string,
  chain: readonly Migration[] = migrations,
): ReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return notASave;
  }
  if (!isRecord(parsed) || parsed["format"] !== SAVE_FORMAT) return notASave;
  const version = parsed["version"];
  if (!isWholeNumber(version) || version < 1) {
    return damaged("its version isn't a whole number from 1 up");
  }
  const currentVersion = chain.length + 1;
  if (version > currentVersion) {
    return {
      ok: false,
      reason: "newer-version",
      message: `It was saved by a newer version of Moon Base, in save format version ${version}. This version can load up to version ${currentVersion}.`,
    };
  }
  let document: Record<string, unknown> = parsed;
  for (const [index, migration] of chain.entries()) {
    const from = index + 1;
    if (from < version) continue;
    try {
      document = { ...migration(document), version: from + 1 };
    } catch {
      return damaged(
        `it couldn't be brought up to date from format version ${from}`,
      );
    }
  }
  try {
    const { random, state } = saveDocument(document, "");
    return { ok: true, state: { random, ...state } };
  } catch (error) {
    if (error instanceof DamagedSave) return damaged(error.message);
    throw error;
  }
}

const notASave: ReadResult = {
  ok: false,
  reason: "not-a-save",
  message: "It isn't a Moon Base save file.",
};

function damaged(problem: string): ReadResult {
  return {
    ok: false,
    reason: "damaged",
    message: `The save file is damaged: ${problem}.`,
  };
}

// What follows checks a parsed save document against the current format,
// field by field, and rebuilds it as a Campaign state. Each decoder takes the
// value and its path in the document, for the reason it gives if refused.

class DamagedSave extends Error {}

type Decoder<T> = (value: unknown, path: string) => T;

function refuse(path: string, problem: string): DamagedSave {
  return new DamagedSave(`${path} ${problem}`);
}

function at(path: string, key: string | number): string {
  return path === "" ? String(key) : `${path}.${key}`;
}

const finiteNumber: Decoder<number> = (value, path) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw refuse(path, "isn't a number");
  }
  return value;
};

/** A number from 0 up, not necessarily whole, such as working time done at less than full speed. */
const amount: Decoder<number> = (value, path) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw refuse(path, "isn't a number from 0 up");
  }
  return value;
};

const wholeNumber: Decoder<number> = (value, path) => {
  if (!isWholeNumber(value) || value < 0) {
    throw refuse(path, "isn't a whole number from 0 up");
  }
  return value;
};

/**
 * A word of the random generator's state: 32 bits, which the generator keeps
 * as a signed or an unsigned number.
 */
const randomWord: Decoder<number> = (value, path) => {
  if (!isWholeNumber(value) || value < -(2 ** 31) || value > MAX_SEED) {
    throw refuse(path, "isn't a 32-bit whole number");
  }
  return value;
};

const boolean: Decoder<boolean> = (value, path) => {
  if (typeof value !== "boolean") throw refuse(path, "isn't true or false");
  return value;
};

const text: Decoder<string> = (value, path) => {
  if (typeof value !== "string") throw refuse(path, "isn't text");
  return value;
};

/** One of the given words; a record of them all, so the compiler checks none is left out. */
function oneOf<T extends string>(options: Record<T, true>): Decoder<T> {
  const words = Object.keys(options);
  return (value, path) => {
    if (typeof value !== "string" || !words.includes(value)) {
      throw refuse(path, `isn't one of ${quoted(words)}`);
    }
    return value as T;
  };
}

function quoted(words: readonly string[]): string {
  return words.map((word) => `"${word}"`).join(", ");
}

function exactly<T extends string>(word: T): Decoder<T> {
  return oneOf({ [word]: true } as Record<T, true>);
}

/** The id of something in the data catalogue. */
function catalogueId(
  entries: readonly { readonly id: string }[],
  kind: string,
): Decoder<string> {
  return (value, path) => {
    if (!entries.some((entry) => entry.id === value)) {
      throw refuse(path, `isn't a ${kind} in the data catalogue`);
    }
    return value as string;
  };
}

/** Undefined in the Campaign state, which is written as null. */
function optional<T>(decoder: Decoder<T>): Decoder<T | undefined> {
  return (value, path) =>
    value === null || value === undefined ? undefined : decoder(value, path);
}

function list<T>(decoder: Decoder<T>): Decoder<T[]> {
  return (value, path) => {
    if (!Array.isArray(value)) throw refuse(path, "isn't a list");
    return value.map((item, index) => decoder(item, at(path, index)));
  };
}

/** What a decoder, or any of a union of decoders, gives. */
type Decodes<D> = D extends Decoder<infer T> ? T : never;

type Fields = Record<string, Decoder<unknown>>;
type Decoded<F extends Fields> = { -readonly [K in keyof F]: Decodes<F[K]> };

/**
 * An object with exactly these fields. It keeps the fields in the order the
 * document gives them, so that saving a loaded Campaign again writes the
 * same text.
 */
function object<F extends Fields>(fields: F): Decoder<Decoded<F>> {
  return (value, path) => {
    if (!isRecord(value)) throw refuse(path, "isn't an object");
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const decoder = Object.hasOwn(fields, key) ? fields[key] : undefined;
      if (decoder === undefined) {
        throw refuse(at(path, key), "isn't part of the save format");
      }
      result[key] = decoder(child, at(path, key));
    }
    for (const [key, decoder] of Object.entries(fields)) {
      if (!Object.hasOwn(value, key)) decoder(undefined, at(path, key));
    }
    return result as Decoded<F>;
  };
}

/** One of two kinds of object, told apart by whether they have a field. */
function byField<A, B>(
  key: string,
  withField: Decoder<A>,
  withoutField: Decoder<B>,
): Decoder<A | B> {
  return (value, path) =>
    isRecord(value) && Object.hasOwn(value, key)
      ? withField(value, path)
      : withoutField(value, path);
}

/** One of several kinds of object, told apart by the word in one field. */
function tagged<C extends Record<string, Decoder<unknown>>>(
  key: string,
  cases: C,
): Decoder<Decodes<C[keyof C]>> {
  const words = Object.keys(cases);
  return (value, path) => {
    if (!isRecord(value)) throw refuse(path, "isn't an object");
    const word = value[key];
    const decoder =
      typeof word === "string" && Object.hasOwn(cases, word)
        ? cases[word]
        : undefined;
    if (decoder === undefined) {
      throw refuse(at(path, key), `isn't one of ${quoted(words)}`);
    }
    return decoder(value, path) as Decodes<C[keyof C]>;
  };
}

const groundPosition = object({ x: finiteNumber, y: finiteNumber });

const componentCount = object({
  componentId: catalogueId(catalogue.componentTypes, "Component"),
  count: wholeNumber,
});

/**
 * The base's stock of Components: one count for every Component, in catalogue
 * order, and none of any the save has no count for, as it was written before
 * that Component was added. A count of a Component the data catalogue doesn't
 * have is refused, as any other unknown id is.
 */
const componentStock: Decoder<{ componentId: string; count: number }[]> = (
  value,
  path,
) => {
  const saved = list(componentCount)(value, path);
  return catalogue.componentTypes.map(
    ({ id }) =>
      saved.find((stock) => stock.componentId === id) ?? {
        componentId: id,
        count: 0,
      },
  );
};

/** The base's stock of bulk resources, read as `componentStock` reads Components. */
const bulkStock: Decoder<{ resourceId: string; kilograms: number }[]> = (
  value,
  path,
) => {
  const saved = list(
    object({
      resourceId: catalogueId(catalogue.bulkResources, "bulk resource"),
      kilograms: amount,
    }),
  )(value, path);
  return catalogue.bulkResources.map(
    ({ id }) =>
      saved.find((stock) => stock.resourceId === id) ?? {
        resourceId: id,
        kilograms: 0,
      },
  );
};

const structureTypeId = catalogueId(catalogue.structureTypes, "Structure type");

const researchTaskId = catalogueId(catalogue.researchTasks, "Research Task");

const designId = catalogueId(catalogue.designs, "Design");
const expeditionTypeId = catalogueId(
  catalogue.expeditions.types,
  "type of Expedition",
);

const resourceRef: Decoder<ResourceRef> = tagged("kind", {
  "bulk-resource": object({
    kind: exactly("bulk-resource"),
    resourceId: catalogueId(catalogue.bulkResources, "bulk resource"),
  }),
  "life-support": object({
    kind: exactly("life-support"),
    stockId: catalogueId(catalogue.lifeSupportStocks, "life support stock"),
  }),
} satisfies Record<ResourceRef["kind"], unknown>);

const plantStop: Decoder<PlantStop> = tagged("reason", {
  broken: object({ reason: exactly("broken") }),
  "no-input": object({ reason: exactly("no-input"), resource: resourceRef }),
  "output-full": object({
    reason: exactly("output-full"),
    resource: resourceRef,
  }),
  night: object({ reason: exactly("night") }),
  "no-power": object({ reason: exactly("no-power") }),
  "switched-off": object({ reason: exactly("switched-off") }),
  "switched-on": object({ reason: exactly("switched-on") }),
  "no-research-task": object({ reason: exactly("no-research-task") }),
} satisfies Record<PlantStop["reason"], unknown>);

/**
 * A commissioned Structure. If it is a Plant, its recipe, and that of any
 * batch it has started, must be one of its type's; if it isn't, it has no
 * recipe, batch or reason it didn't run, and isn't switched off.
 */
const structure: Decoder<StructureState> = (() => {
  const fields = object({
    id: text,
    structureTypeId,
    position: groundPosition,
    powered: boolean,
    lit: boolean,
    storedKilowattHours: finiteNumber,
    conditionPercent: finiteNumber,
    dustCoatingPercent: finiteNumber,
    recipeId: optional(text),
    batch: optional(object({ recipeId: text, minutesWorked: amount })),
    plantStop: optional(plantStop),
    switchedOff: boolean,
    growingMinutes: amount,
  });
  return (value, path) => {
    const decoded = fields(value, path);
    const recipes =
      catalogue.structureTypes.find(
        (type) => type.id === decoded.structureTypeId,
      )?.recipes ?? [];
    const notAPlant = "isn't null, though the Structure isn't a Plant";
    /** Refuses a recipe the Structure's type doesn't have, or any recipe if it isn't a Plant. */
    const refuseUnknownRecipe = (
      recipeId: string | undefined,
      field: string,
    ) => {
      const known =
        recipes.length === 0
          ? recipeId === undefined
          : recipes.some((recipe) => recipe.id === recipeId);
      if (!known) {
        throw refuse(
          field,
          recipes.length === 0
            ? notAPlant
            : `isn't one of ${quoted(recipes.map((recipe) => recipe.id))}`,
        );
      }
    };
    refuseUnknownRecipe(decoded.recipeId, at(path, "recipeId"));
    if (decoded.batch !== undefined) {
      refuseUnknownRecipe(
        decoded.batch.recipeId,
        at(at(path, "batch"), "recipeId"),
      );
    }
    if (recipes.length === 0 && decoded.plantStop !== undefined) {
      throw refuse(at(path, "plantStop"), notAPlant);
    }
    if (recipes.length === 0 && decoded.switchedOff) {
      throw refuse(
        at(path, "switchedOff"),
        "is true, though the Structure isn't a Plant",
      );
    }
    if (
      decoded.growingMinutes > 0 &&
      catalogue.structureTypes.find(
        (type) => type.id === decoded.structureTypeId,
      )?.growing === undefined
    ) {
      throw refuse(
        at(path, "growingMinutes"),
        "isn't 0, though the Structure isn't a Greenhouse",
      );
    }
    return decoded;
  };
})();

const exportLine = object({
  resourceId: catalogueId(
    catalogue.exports.map((sold) => ({ id: sold.resourceId })),
    "Export",
  ),
  kilograms: amount,
});

const missionDirector: Decoder<MissionDirectorResidence> = tagged("residence", {
  lander: object({ residence: exactly("lander") }),
  habitat: object({
    residence: exactly("habitat"),
    habitatId: text,
    movedInAtMinute: wholeNumber,
  }),
} satisfies Record<MissionDirectorResidence["residence"], unknown>);

const deathCause: Decoder<DeathCause> = tagged("kind", {
  "ran-out": object({
    kind: exactly("ran-out"),
    stockId: catalogueId(catalogue.lifeSupportStocks, "life support stock"),
  }),
  "habitat-power-failed": object({
    kind: exactly("habitat-power-failed"),
    habitatId: text,
  }),
  "radiation-dose-limit": object({ kind: exactly("radiation-dose-limit") }),
} satisfies Record<DeathCause["kind"], unknown>);

const campaignEnd: Decoder<CampaignEnd> = object({
  atMinute: wholeNumber,
  cause: deathCause,
});

const robotActivity: Decoder<RobotActivity> = (() => {
  const drivingOrActivating = byField(
    "structureId",
    object({
      kind: oneOf({ "driving-machine": true, "activating-machine": true }),
      structureId: text,
      machineId: text,
    }),
    object({
      kind: oneOf({ "driving-machine": true, "activating-machine": true }),
      machineId: text,
      purpose: exactly("digging"),
    }),
  );
  const working = object({
    kind: oneOf({
      "loading-components": true,
      "unloading-components": true,
      assembling: true,
      commissioning: true,
      "laying-cable": true,
      dismantling: true,
      "returning-components": true,
      "loading-cargo": true,
      "unloading-cargo": true,
      maintaining: true,
      cleaning: true,
    }),
    structureId: text,
  });
  // Loading the Exports onto the Lander on a landing pad.
  const forExports = object({
    kind: oneOf({ "loading-exports": true, "putting-exports-aboard": true }),
  });
  // Maintenance of a Machine.
  const forMachine = object({
    kind: oneOf({ "loading-components": true, maintaining: true }),
    machineId: text,
  });
  // Maintenance of a Rover.
  const forRover = object({
    kind: oneOf({ "loading-components": true, maintaining: true }),
    roverId: text,
  });
  const walking = byField(
    "roverId",
    object({
      kind: exactly("walking"),
      roverId: text,
      destination: oneOf({ stockpile: true, rover: true }),
    }),
    byField(
      "machineId",
      object({
        kind: exactly("walking"),
        machineId: text,
        destination: oneOf({ stockpile: true, machine: true }),
      }),
      byField(
        "purpose",
        object({
          kind: exactly("walking"),
          purpose: exactly("exports"),
          destination: oneOf({ stockpile: true, lander: true }),
        }),
        object({
          kind: exactly("walking"),
          structureId: text,
          destination: oneOf<WalkingDestination>({
            site: true,
            stockpile: true,
            machine: true,
            cable: true,
            lander: true,
          }),
        }),
      ),
    ),
  );
  const repairing = object({
    kind: oneOf({ "loading-spare-components": true, "repairing-itself": true }),
  });
  return tagged("kind", {
    idle: object({ kind: exactly("idle") }),
    walking,
    "walking-to-repair": object({
      kind: exactly("walking-to-repair"),
      destination: oneOf({ stockpile: true, habitat: true, lander: true }),
    }),
    "loading-spare-components": repairing,
    "repairing-itself": repairing,
    "driving-machine": drivingOrActivating,
    "activating-machine": drivingOrActivating,
    "driving-rover": byField(
      "structureId",
      object({
        kind: exactly("driving-rover"),
        roverId: text,
        structureId: text,
      }),
      object({
        kind: exactly("driving-rover"),
        roverId: text,
        purpose: exactly("expedition"),
      }),
    ),
    "on-expedition": object({ kind: exactly("on-expedition") }),
    "unloading-expedition": object({ kind: exactly("unloading-expedition") }),
    "climbing-down": object({ kind: exactly("climbing-down") }),
    "walking-to-stockpile": object({ kind: exactly("walking-to-stockpile") }),
    "loading-components": byField(
      "roverId",
      forRover,
      byField("machineId", forMachine, working),
    ),
    "unloading-components": working,
    assembling: working,
    commissioning: working,
    "laying-cable": working,
    dismantling: working,
    "returning-components": working,
    "loading-cargo": working,
    "unloading-cargo": working,
    "loading-exports": forExports,
    "putting-exports-aboard": forExports,
    maintaining: byField(
      "roverId",
      forRover,
      byField("machineId", forMachine, working),
    ),
    cleaning: working,
  } satisfies Record<RobotActivity["kind"], unknown>);
})();

const workOrder: Decoder<WorkOrder> = (() => {
  const onRover = object({
    roverId: text,
    kind: oneOf<RoverWorkOrderKind>({
      "maintain-rover": true,
      "park-rover": true,
    }),
  });
  const onMachine = object({
    machineId: text,
    kind: oneOf<MachineWorkOrderKind>({
      "maintain-machine": true,
      "park-machine": true,
      dig: true,
    }),
  });
  const onStructure = object({
    structureId: text,
    kind: oneOf<StructureWorkOrderKind>({
      "prepare-site": true,
      "deliver-components": true,
      assemble: true,
      commission: true,
      "lay-cable": true,
      dismantle: true,
      "return-components": true,
      "unload-lander": true,
      "load-lander": true,
      maintain: true,
    }),
  });
  return tagged("kind", {
    "prepare-site": onStructure,
    "deliver-components": onStructure,
    assemble: onStructure,
    commission: onStructure,
    "lay-cable": onStructure,
    dismantle: onStructure,
    "return-components": onStructure,
    "unload-lander": onStructure,
    "load-lander": onStructure,
    maintain: onStructure,
    "maintain-machine": onMachine,
    "park-machine": onMachine,
    dig: onMachine,
    "maintain-rover": onRover,
    "park-rover": onRover,
  } satisfies Record<WorkOrderKind, unknown>);
})();

const machineActivity: Decoder<MachineActivity> = (() => {
  const busy = object({
    kind: oneOf({ "being-positioned": true, working: true }),
    constructionId: text,
  });
  return tagged("kind", {
    idle: object({ kind: exactly("idle") }),
    "being-positioned": busy,
    working: busy,
    "being-parked": object({
      kind: exactly("being-parked"),
      structureId: text,
    }),
    "being-positioned-to-dig": object({
      kind: exactly("being-positioned-to-dig"),
    }),
    digging: object({ kind: exactly("digging") }),
  } satisfies Record<MachineActivity["kind"], unknown>);
})();

const machineAssignment = object({
  constructionId: text,
  stage: oneOf<MachineStage>({ "site-preparation": true, assembly: true }),
  destination: groundPosition,
  activationMinutes: amount,
  working: boolean,
});

const lifeSupportRecord = object({
  producedKilograms: amount,
  usedKilograms: amount,
});

const spareComponentRecord = object({ made: amount, used: amount });

const simulationFields = object({
  elapsedMinutes: wholeNumber,
  nextStructureNumber: wholeNumber,
  nextPlanNumber: wholeNumber,
  lander: object({
    position: groundPosition,
    trip: optional(
      object({
        leg: oneOf<LanderLeg>({
          "travelling-to-earth": true,
          turnaround: true,
          "travelling-to-moon": true,
        }),
        legStartedAtMinute: wholeNumber,
        legEndsAtMinute: wholeNumber,
      }),
    ),
    cargo: list(componentCount),
    exports: list(exportLine),
  }),
  missionDirector,
  lifeSupport: list(
    object({
      stockId: catalogueId(catalogue.lifeSupportStocks, "life support stock"),
      kilograms: finiteNumber,
    }),
  ),
  selfSufficiency: list(
    object({
      stockId: catalogueId(catalogue.lifeSupportStocks, "life support stock"),
      current: lifeSupportRecord,
      records: list(lifeSupportRecord),
    }),
  ),
  spareComponentSufficiency: object({
    current: spareComponentRecord,
    records: list(spareComponentRecord),
  }),
  radiationDoseMillisieverts: finiteNumber,
  solarParticleEvent: object({
    warnsAtMinute: wholeNumber,
    startsAtMinute: wholeNumber,
    endsAtMinute: wholeNumber,
  }),
  micrometeorite: object({ strikesAtMinute: wholeNumber }),
  spareComponentsWarnedMinutes: optional(wholeNumber),
  fundingMillionDollars: finiteNumber,
  launchManifest: list(
    object({
      itemId: catalogueId(catalogue.launch.items, "Launch item"),
      count: wholeNumber,
    }),
  ),
  launchFeePaidMillionDollars: optional(amount),
  exportsToLoad: list(exportLine),
  science: wholeNumber,
  researchTask: optional(object({ researchTaskId, workedMinutes: amount })),
  researchQueue: list(researchTaskId),
  completedResearchTaskIds: list(researchTaskId),
  observingMinutes: amount,
  unlockedDesignIds: list(designId),
  reachedMilestoneIds: list(catalogueId(catalogue.milestones, "Milestone")),
  ended: optional(campaignEnd),
  robots: list(
    object({
      id: text,
      position: groundPosition,
      activity: robotActivity,
      carrying: list(componentCount),
      workOrder: optional(workOrder),
      conditionPercent: finiteNumber,
      selfRepair: optional(
        object({
          home: oneOf({ habitat: true, lander: true }),
          spot: groundPosition,
          spareComponents: optional(wholeNumber),
          workedMinutes: wholeNumber,
        }),
      ),
      arrival: optional(object({ workedMinutes: wholeNumber })),
    }),
  ),
  machines: list(
    object({
      id: text,
      machineTypeId: catalogueId(catalogue.machineTypes, "Machine type"),
      position: groundPosition,
      activity: machineActivity,
      assignment: optional(machineAssignment),
      digging: optional(
        object({
          destination: groundPosition,
          activationMinutes: amount,
          working: boolean,
        }),
      ),
      conditionPercent: finiteNumber,
      powered: boolean,
    }),
  ),
  rovers: list(
    object({
      id: text,
      position: groundPosition,
      activity: tagged("kind", {
        idle: object({ kind: exactly("idle") }),
        "being-parked": object({
          kind: exactly("being-parked"),
          structureId: text,
        }),
        "on-expedition": object({ kind: exactly("on-expedition") }),
      } satisfies Record<RoverActivity["kind"], unknown>),
      conditionPercent: finiteNumber,
      powered: boolean,
    }),
  ),
  stockpile: object({
    position: groundPosition,
    components: componentStock,
  }),
  bulkResources: bulkStock,
  constructions: list(
    object({
      id: text,
      structureTypeId,
      position: groundPosition,
      planNumber: wholeNumber,
      workSpot: groundPosition,
      stage: oneOf<ConstructionStage>({
        "site-preparation": true,
        "component-delivery": true,
        assembly: true,
        commissioning: true,
      }),
      workedMinutes: amount,
      componentsTaken: boolean,
      failedCommissionings: wholeNumber,
    }),
  ),
  structures: list(structure),
  dismantlings: list(
    object({
      id: text,
      structureTypeId,
      position: groundPosition,
      planNumber: wholeNumber,
      workSpot: groundPosition,
      stage: oneOf<DismantlingStage>({
        "taking-apart": true,
        "returning-components": true,
      }),
      workedMinutes: amount,
      recovered: list(componentCount),
      collected: boolean,
    }),
  ),
  unloading: optional(
    object({
      landingPadId: text,
      planNumber: wholeNumber,
      cargo: list(componentCount),
      workedMinutes: amount,
      collected: boolean,
    }),
  ),
  exportLoading: optional(
    object({
      landingPadId: text,
      planNumber: wholeNumber,
      workedMinutes: amount,
      collected: boolean,
    }),
  ),
  cables: list(
    object({
      fromStructureId: text,
      toStructureId: text,
      start: groundPosition,
      end: groundPosition,
      route: list(groundPosition),
      complete: boolean,
    }),
  ),
  reconnections: list(object({ structureId: text, planNumber: wholeNumber })),
  maintenance: list(
    object({
      target: tagged("kind", {
        structure: object({ kind: exactly("structure"), structureId: text }),
        machine: object({ kind: exactly("machine"), machineId: text }),
        rover: object({ kind: exactly("rover"), roverId: text }),
      }),
      workSpot: groundPosition,
      visit: optional(
        object({ spareComponents: wholeNumber, cleaning: boolean }),
      ),
      workedMinutes: amount,
    }),
  ),
  parking: list(
    object({
      target: tagged("kind", {
        machine: object({ kind: exactly("machine"), machineId: text }),
        rover: object({ kind: exactly("rover"), roverId: text }),
      }),
      structureId: text,
      bayIndex: optional(wholeNumber),
      destination: groundPosition,
    }),
  ),
  expedition: optional(
    object({
      robotId: text,
      roverId: text,
      typeId: expeditionTypeId,
      stage: oneOf<ExpeditionStage>({
        boarding: true,
        "driving-out": true,
        away: true,
        "driving-back": true,
        unloading: true,
      }),
      exitPoint: optional(groundPosition),
      returnsAtMinute: optional(wholeNumber),
      workedMinutes: amount,
    }),
  ),
}) satisfies Decoder<Omit<CampaignState, "random">>;

/**
 * The Campaign state apart from the random generator's. Its queue is refused
 * if it holds one twice, the one running or one completed, any of which would
 * pay its Science again, or anything with nothing running ahead of it, which
 * would never start. Its length and what its Research Tasks need are left to
 * the data catalogue, whose changes mustn't make a released save unreadable.
 */
const simulationState: Decoder<Omit<CampaignState, "random">> = (
  value,
  path,
) => {
  const state = simulationFields(value, path);
  const field = at(path, "researchQueue");
  const queue = state.researchQueue;
  if (queue.length > 0 && state.researchTask === undefined) {
    throw refuse(field, "isn't empty, though no Research Task is running");
  }
  for (const [index, id] of queue.entries()) {
    if (queue.indexOf(id) !== index) {
      throw refuse(field, `names "${id}" twice`);
    }
    if (id === state.researchTask?.researchTaskId) {
      throw refuse(field, `names "${id}", which is running`);
    }
    if (state.completedResearchTaskIds.includes(id)) {
      throw refuse(field, `names "${id}", which is completed`);
    }
  }
  return state;
};

const saveDocument = object({
  format: exactly(SAVE_FORMAT),
  version: wholeNumber,
  random: object({
    a: randomWord,
    b: randomWord,
    c: randomWord,
    d: randomWord,
  }),
  state: simulationState,
});
