import { catalogue, type Export } from "../catalogue";
import { addBulk, bulkInStock } from "./bulk-resources";
import type { CampaignState } from "./campaign";

/** How many kilograms of an Export the Lander is to carry, or carries. */
export interface ExportLine {
  readonly resourceId: string;
  readonly kilograms: number;
}

/** The Exports to load onto the Lander, those aboard it, and what they come to. */
export interface ExportsSnapshot {
  /**
   * What the Lander is to carry when it next takes off, in catalogue order,
   * each Export once with an amount above none, until they are aboard. They
   * stay in the base's stock until the Lander takes off from the landing
   * site, or, on a landing pad, until the Robot loads them at the stockpile
   * to carry them to it; from then on, they are what the Robot took.
   */
  readonly toLoad: readonly ExportLine[];
  /** The mass of the Exports to load, against the Lander's Return Mass. */
  readonly massKilograms: number;
  /**
   * The Return Mass as things stand: what the Lander carries on what Earth
   * gives it, and more for the propellant in stock that isn't to be sold.
   */
  readonly returnMassKilograms: number;
  /** The propellant the Lander will burn as it takes off, for what is aboard and to load. */
  readonly propellantToBurnKilograms: number;
  /**
   * What the Exports to load will sell for: as much of each as the base
   * still has in stock, or, once the Robot has loaded them, what it
   * carries.
   */
  readonly valueMillionDollars: number;
  /**
   * The Exports aboard the Lander, from its take-off, or on a landing pad
   * from when the Robot puts them aboard, until they are sold as it
   * reaches Earth.
   */
  readonly aboard: readonly ExportLine[];
  /** What the Exports aboard will sell for: nothing once they are sold. */
  readonly valueAboardMillionDollars: number;
}

export type LoadExportsRefusal =
  | "unknown-export"
  | "invalid-amount"
  | "over-return-mass"
  | "over-stock"
  | "lander-away"
  | "exports-collected"
  | "campaign-ended";

export type LoadExportsResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: LoadExportsRefusal;
      /** The reason in words the player can read. */
      readonly message: string;
    };

/**
 * Makes these the Exports the Lander is to carry when it next takes off, if
 * they fit within its Return Mass, with any Exports already aboard, and the
 * base has them in stock; otherwise leaves the Exports to load as they were
 * and says why not. They can only be set while the Lander is landed, and
 * stay in the base's stock until it takes off, or, on a landing pad, until
 * the Robot loads them to carry them aboard. Once the Robot has loaded
 * them, they can't be changed until they are aboard; after that, any set
 * go aboard on top of them, in another round of loading on a landing pad.
 */
export function loadExports(
  state: CampaignState,
  exports: readonly ExportLine[],
): LoadExportsResult {
  if (state.lander.trip !== undefined) {
    return refuse(
      "lander-away",
      "The Lander is away. Exports can be loaded once it has landed.",
    );
  }
  if (state.exportLoading?.collected === true) {
    return refuse(
      "exports-collected",
      "The Robot is already carrying the Exports to load to the Lander. More can be loaded once they're aboard.",
    );
  }
  const lines: { resourceId: string; kilograms: number }[] = [];
  for (const { resourceId, kilograms } of exports) {
    if (findExport(resourceId) === undefined) {
      return refuse(
        "unknown-export",
        `The base can't sell anything called "${resourceId}" as an Export.`,
      );
    }
    if (!Number.isFinite(kilograms) || kilograms < 0) {
      return refuse(
        "invalid-amount",
        "How many kilograms of an Export the Lander carries must be a number from 0 up.",
      );
    }
    const line = lines.find((other) => other.resourceId === resourceId);
    if (line === undefined) lines.push({ resourceId, kilograms });
    else line.kilograms += kilograms;
  }
  const toLoad = inCatalogueOrder(lines);
  const aboard = massOf(state.lander.exports);
  const mass = massOf(toLoad) + aboard;
  const limit = returnMassWith(state, toLoad);
  if (mass > limit) {
    const already =
      aboard === 0 ? "" : ` with the ${kilogramsInWords(aboard)} kg aboard`;
    return refuse(
      "over-return-mass",
      `That would bring the Exports to ${kilogramsInWords(mass)} kg${already}, over the Lander's Return Mass of ${kilogramsInWords(limit)} kg.`,
    );
  }
  for (const { resourceId, kilograms } of toLoad) {
    const inStock = bulkInStock(state, resourceId);
    if (kilograms > inStock) {
      return refuse(
        "over-stock",
        `That would load ${kilogramsInWords(kilograms)} kg of ${labelOf(resourceId).toLowerCase()}, more than the ${stockInWords(inStock)} kg in stock.`,
      );
    }
  }
  state.exportsToLoad = toLoad;
  return { ok: true };
}

/**
 * Takes the Exports to load aboard the Lander as it takes off from the
 * landing site, straight from the base's stock beside it, and returns what
 * went aboard.
 */
export function takeExportsAboard(state: CampaignState): ExportLine[] {
  takeExportsFromStock(state);
  return putExportsAboard(state);
}

/**
 * Takes the Exports to load out of the base's stock, or as much of each as
 * there is if the stock has fallen since they were set, and makes what was
 * taken the Exports to load.
 */
export function takeExportsFromStock(state: CampaignState): void {
  state.exportsToLoad = toLoadInStock(state);
  for (const { resourceId, kilograms } of state.exportsToLoad) {
    addBulk(state, resourceId, -kilograms);
  }
}

/**
 * Puts the Exports to load, already out of the base's stock, aboard the
 * Lander with any there already, and returns them. The Exports to load are
 * then none, until the player sets more.
 */
export function putExportsAboard(state: CampaignState): ExportLine[] {
  const aboard = state.exportsToLoad;
  state.exportsToLoad = [];
  state.lander.exports = inCatalogueOrder([...state.lander.exports, ...aboard]);
  return aboard;
}

/**
 * The Return Mass, were these the Exports to load: what the Lander carries on
 * what Earth gives it, and a kilogram more for each share of the propellant in
 * stock, leaving out any still to come out of the stock to be sold. It goes no
 * higher than the Lander can lift.
 */
function returnMassWith(
  state: CampaignState,
  toLoad: readonly ExportLine[],
): number {
  const { returnMassKilograms, propellant } = catalogue.lander;
  const toSell =
    state.exportLoading?.collected === true
      ? 0
      : massOf(
          toLoad.filter((line) => line.resourceId === propellant.resourceId),
        );
  const toBurn = Math.max(
    0,
    bulkInStock(state, propellant.resourceId) - toSell,
  );
  return Math.min(
    propellant.mostReturnMassKilograms,
    returnMassKilograms + toBurn / propellant.kilogramsPerReturnKilogram,
  );
}

/** The propellant it takes to lift this mass of Exports. */
function propellantToLift(massKilograms: number): number {
  const { returnMassKilograms, propellant } = catalogue.lander;
  return (
    Math.max(0, massKilograms - returnMassKilograms) *
    propellant.kilogramsPerReturnKilogram
  );
}

/** Burns the propellant it takes to lift what is aboard, as the Lander takes off. */
export function burnPropellant(state: CampaignState): void {
  const { resourceId } = catalogue.lander.propellant;
  const burned = Math.min(
    propellantToLift(massOf(state.lander.exports)),
    bulkInStock(state, resourceId),
  );
  if (burned > 0) addBulk(state, resourceId, -burned);
}

/**
 * Sells everything aboard the Lander at its catalogue price as it reaches
 * Earth, raising the Funding by the total, and returns what was sold and
 * for how much.
 */
export function sellExports(state: CampaignState): {
  sold: ExportLine[];
  earnedMillionDollars: number;
} {
  const sold = state.lander.exports;
  const earnedMillionDollars = valueOf(sold);
  state.fundingMillionDollars += earnedMillionDollars;
  state.lander.exports = [];
  return { sold, earnedMillionDollars };
}

/** What the Exports aboard the Lander will sell for as it reaches Earth. */
export function valueAboard(state: CampaignState): number {
  return valueOf(state.lander.exports);
}

/**
 * What the Exports to load will sell for as the Lander reaches Earth: as
 * much of each as the base still has in stock, as no more goes aboard, or,
 * once the Robot has loaded them at the stockpile, what it carries. They
 * fit within the Return Mass, as they were refused otherwise.
 */
export function valueToLoad(state: CampaignState): number {
  return valueOf(toLoadAsTaken(state));
}

/**
 * What the Exports aboard and to load will sell for together as the Lander
 * reaches Earth, worked out just as the sale will, on the lines they will
 * make once all are aboard, so that it comes to exactly what the sale
 * raises the Funding by.
 */
export function valueToSell(state: CampaignState): number {
  return valueOf(
    inCatalogueOrder([...state.lander.exports, ...toLoadAsTaken(state)]),
  );
}

/**
 * Whether the base has less of any of the Exports to load in stock than was
 * set, as a Plant has used some since, so that less will go aboard. Once
 * the Robot has loaded them, they are what it carries, and never short.
 */
export function isShortOfExportsToLoad(state: CampaignState): boolean {
  return (
    state.exportLoading?.collected !== true &&
    state.exportsToLoad.some(
      ({ resourceId, kilograms }) => kilograms > bulkInStock(state, resourceId),
    )
  );
}

/**
 * The Exports to load as they will go aboard: as much of each as the base
 * has in stock, or, once the Robot has loaded them, what it carries.
 */
function toLoadAsTaken(state: CampaignState): ExportLine[] {
  return state.exportLoading?.collected === true
    ? state.exportsToLoad
    : toLoadInStock(state);
}

/**
 * The Exports to load, cut to as much of each as the base has in stock,
 * leaving out any it has none of.
 */
function toLoadInStock(state: CampaignState): ExportLine[] {
  return state.exportsToLoad.flatMap(({ resourceId, kilograms }) => {
    const inStock = Math.min(kilograms, bulkInStock(state, resourceId));
    return inStock > 0 ? [{ resourceId, kilograms: inStock }] : [];
  });
}

export function readExports(state: CampaignState): ExportsSnapshot {
  // Once it has left, it has burned what it took to lift what is aboard.
  const flying = state.lander.trip !== undefined;
  return {
    toLoad: state.exportsToLoad.map((line) => ({ ...line })),
    massKilograms: massOf(state.exportsToLoad),
    returnMassKilograms: Math.max(
      returnMassWith(state, state.exportsToLoad),
      flying ? massOf(state.lander.exports) : 0,
    ),
    propellantToBurnKilograms: flying
      ? 0
      : propellantToLift(
          massOf(state.exportsToLoad) + massOf(state.lander.exports),
        ),
    valueMillionDollars: valueToLoad(state),
    aboard: state.lander.exports.map((line) => ({ ...line })),
    valueAboardMillionDollars: valueAboard(state),
  };
}

/**
 * The lines in the order the catalogue lists the Exports, each once with
 * their amounts added together, leaving out any of none.
 */
function inCatalogueOrder(
  lines: readonly ExportLine[],
): { resourceId: string; kilograms: number }[] {
  return catalogue.exports.flatMap(({ resourceId }) => {
    const kilograms = lines
      .filter((line) => line.resourceId === resourceId)
      .reduce((total, line) => total + line.kilograms, 0);
    return kilograms > 0 ? [{ resourceId, kilograms }] : [];
  });
}

function massOf(lines: readonly ExportLine[]): number {
  return lines.reduce((total, line) => total + line.kilograms, 0);
}

function valueOf(lines: readonly ExportLine[]): number {
  return lines.reduce(
    (total, { resourceId, kilograms }) =>
      total +
      (findExport(resourceId)?.priceMillionDollarsPerKilogram ?? 0) * kilograms,
    0,
  );
}

/** An amount in kilograms, to the nearest tenth, as a refusal gives it. */
function kilogramsInWords(kilograms: number): string {
  return String(Math.round(kilograms * 10) / 10);
}

/**
 * A stock in kilograms, rounded down to the tenth, as a refusal gives it, so
 * it never reads as more than there is.
 */
function stockInWords(kilograms: number): string {
  return String(Math.floor(kilograms * 10) / 10);
}

function labelOf(resourceId: string): string {
  return (
    catalogue.bulkResources.find((resource) => resource.id === resourceId)
      ?.label ?? resourceId
  );
}

function findExport(resourceId: string): Export | undefined {
  return catalogue.exports.find((sold) => sold.resourceId === resourceId);
}

function refuse(
  reason: LoadExportsRefusal,
  message: string,
): LoadExportsResult {
  return { ok: false, reason, message };
}
