import { catalogue } from "../catalogue";
import type { CampaignEnd, CampaignState } from "./campaign";
import type { ConstructionStage, MachineStage } from "./construction";
import type { DismantlingStage } from "./dismantling";
import type { DeathCause } from "./events";
import type { MachineActivity } from "./machines";
import type { MissionDirectorResidence } from "./mission-director";
import { MAX_SEED } from "./random";
import type { RobotActivity, WalkingDestination } from "./robot";
import type { WorkOrderKind } from "./work-orders";

/** What every save document says it is, to tell it from any other JSON. */
const SAVE_FORMAT = "moonbase-save";

/**
 * Upgrades a save document from one format version to the next. It is given
 * the parsed JSON of the older version and returns that of the newer; the
 * version number is updated for it.
 */
export type Migration = (
  document: Readonly<Record<string, unknown>>,
) => Record<string, unknown>;

/**
 * The migrations from each save format version to the next: the first from
 * version 1 to version 2, and so on, so that the current version is one more
 * than their number. A released format is a compatibility contract
 * (ADR-0006): changing the format means adding a migration here, never
 * editing one that has been released.
 */
export const migrations: readonly Migration[] = [
  // 1 to 2: the Lander's cargo stock became the base's stock, kept at a
  // stockpile beside the landing site, and Robots walk there rather than to
  // the Lander to load and unload Components.
  // Anything not as expected is left for reading the document to refuse.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { cargo, robots, ...rest } = state;
    return {
      ...document,
      state: {
        ...rest,
        robots: Array.isArray(robots)
          ? robots.map((robot: unknown) =>
              isRecord(robot) &&
              isRecord(robot["activity"]) &&
              robot["activity"]["kind"] === "walking" &&
              robot["activity"]["destination"] === "lander"
                ? {
                    ...robot,
                    activity: {
                      ...robot["activity"],
                      destination: "stockpile",
                    },
                  }
                : robot,
            )
          : robots,
        // Where the stockpile stood when format version 2 came in.
        stockpile: { position: { x: 9, y: -10 }, components: cargo },
      },
    };
  },
  // 2 to 3: the base programme has Funding, which a Campaign starts with
  // from the Programme Grant, and a Launch manifest, which starts empty.
  // The grant is the one when format version 3 came in, so that tuning it
  // later doesn't change what this migration gives.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    return {
      ...document,
      state: {
        ...state,
        fundingMillionDollars: 400,
        launchManifest: [],
      },
    };
  },
];

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
 * with every field present and valid, is refused with the reason.
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
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

const structureTypeId = catalogueId(catalogue.structureTypes, "Structure type");

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
  const drivingOrActivating = object({
    kind: oneOf({ "driving-machine": true, "activating-machine": true }),
    structureId: text,
    machineId: text,
  });
  const working = object({
    kind: oneOf({
      "loading-components": true,
      "unloading-components": true,
      assembling: true,
      commissioning: true,
      "laying-cable": true,
      dismantling: true,
      "returning-components": true,
    }),
    structureId: text,
  });
  return tagged("kind", {
    idle: object({ kind: exactly("idle") }),
    walking: object({
      kind: exactly("walking"),
      structureId: text,
      destination: oneOf<WalkingDestination>({
        site: true,
        stockpile: true,
        machine: true,
        cable: true,
      }),
    }),
    "driving-machine": drivingOrActivating,
    "activating-machine": drivingOrActivating,
    "loading-components": working,
    "unloading-components": working,
    assembling: working,
    commissioning: working,
    "laying-cable": working,
    dismantling: working,
    "returning-components": working,
  } satisfies Record<RobotActivity["kind"], unknown>);
})();

const workOrder = object({
  structureId: text,
  kind: oneOf<WorkOrderKind>({
    "prepare-site": true,
    "deliver-components": true,
    assemble: true,
    commission: true,
    "lay-cable": true,
    dismantle: true,
    "return-components": true,
  }),
});

const machineActivity: Decoder<MachineActivity> = (() => {
  const busy = object({
    kind: oneOf({ "being-positioned": true, working: true }),
    constructionId: text,
  });
  return tagged("kind", {
    idle: object({ kind: exactly("idle") }),
    "being-positioned": busy,
    working: busy,
  } satisfies Record<MachineActivity["kind"], unknown>);
})();

const machineAssignment = object({
  constructionId: text,
  stage: oneOf<MachineStage>({ "site-preparation": true, assembly: true }),
  destination: groundPosition,
  activationMinutes: wholeNumber,
  working: boolean,
});

/** The Campaign state apart from the random generator's. */
const simulationState = object({
  elapsedMinutes: wholeNumber,
  nextStructureNumber: wholeNumber,
  nextPlanNumber: wholeNumber,
  lander: object({ position: groundPosition }),
  missionDirector,
  lifeSupport: list(
    object({
      stockId: catalogueId(catalogue.lifeSupportStocks, "life support stock"),
      kilograms: finiteNumber,
    }),
  ),
  radiationDoseMillisieverts: finiteNumber,
  solarParticleEvent: object({
    warnsAtMinute: wholeNumber,
    startsAtMinute: wholeNumber,
    endsAtMinute: wholeNumber,
  }),
  fundingMillionDollars: finiteNumber,
  launchManifest: list(
    object({
      itemId: catalogueId(catalogue.launch.items, "Launch item"),
      count: wholeNumber,
    }),
  ),
  ended: optional(campaignEnd),
  robots: list(
    object({
      id: text,
      position: groundPosition,
      activity: robotActivity,
      carrying: list(componentCount),
      workOrder: optional(workOrder),
    }),
  ),
  machines: list(
    object({
      id: text,
      machineTypeId: catalogueId(catalogue.machineTypes, "Machine type"),
      position: groundPosition,
      activity: machineActivity,
      assignment: optional(machineAssignment),
    }),
  ),
  stockpile: object({
    position: groundPosition,
    components: list(componentCount),
  }),
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
      workedMinutes: wholeNumber,
      componentsTaken: boolean,
      failedCommissionings: wholeNumber,
    }),
  ),
  structures: list(
    object({
      id: text,
      structureTypeId,
      position: groundPosition,
      powered: boolean,
      lit: boolean,
      storedKilowattHours: finiteNumber,
    }),
  ),
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
      workedMinutes: wholeNumber,
      recovered: list(componentCount),
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
}) satisfies Decoder<Omit<CampaignState, "random">>;

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
