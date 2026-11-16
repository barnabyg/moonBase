// What the long-game play guide buys with Funding, and in what order.
import { catalogue } from "../../src/catalogue";
import {
  type GroundPosition,
  type ManifestLine,
  SOLAR_ARRAY_ID,
} from "../../src/simulation";
import { ACT_2_EARTH_DAY, type Play, succeed } from "../reference-campaign";
import { toGameMinutes } from "../scenario";
import { linesToOrder, missingFromStock } from "./buried-habitat";
import {
  BURIED_HABITAT_SITE,
  CREW_HABITAT_SITE,
  GREENHOUSE_EARTH_DAY,
  MINUTES_PER_EARTH_DAY,
  PURCHASE_STALL_EARTH_DAYS,
  TANKS_EARTH_DAY,
  WATER_FOR_THE_CREW_HABITAT_KILOGRAMS,
} from "./settings";

/** Something Funding buys from Act 2 on. */
export interface Purchase {
  readonly structureTypeId: string;
  readonly site: GroundPosition;
  /** The Earth Day it waits for, if its Design comes well before it is any use. */
  readonly fromEarthDay?: number;
  /** The Design it waits for, if another's Structure is what makes it any use. */
  readonly onceDesignId?: string;
  /** That it can stand planned for longer than the limit on making no progress, and why. */
  readonly strandedBecause?: string;
}

/** What a growing hall needs bought first, and the hall, once its Design is unlocked. */
const GROWING_HALL_PURCHASES = [
  ...[
    // A base this size uses more spare Components than three Workshops make.
    ["workshop", { x: 104, y: -92 }],
    ["large-battery-bank", { x: 54, y: -84 }],
    ["water-processing-plant", { x: 106, y: -56 }],
    ["water-processing-plant", { x: 116, y: -56 }],
    ["water-processing-plant", { x: 126, y: -56 }],
    ["cold-trap-ice-line", { x: 114, y: -33 }],
    ["cold-trap-ice-line", { x: 124, y: -33 }],
    ["cold-trap-ice-line", { x: 134, y: -33 }],
    ["cold-trap-ice-line", { x: 144, y: -33 }],
    ["growing-hall", { x: 92, y: -80 }],
  ].map(([structureTypeId, site]) => ({
    structureTypeId: structureTypeId as string,
    site: site as GroundPosition,
    onceDesignId: "growing-halls",
  })),
];

/**
 * Where the guide builds its late science (ADR-0009). The automated experiments
 * lab and the large battery banks that carry it and the telescopes through the
 * Night stand west of the landing site, clear of the Lander's Plume Ejecta on
 * the landing pad. The infrared telescope stands far to the north-west, over 80 m
 * from anything lit, the landing pad the nearest, and the radio telescope array
 * far to the north, over 120 m from any Plant, the lab and the telescope among
 * them, with its antenna fields round it on the side away from the base, each
 * within 10 m of the array's footprint (centres 24 m apart, footprints 8 m).
 */
const LAB_SITE = { x: -40, y: -62 } as const;

const LATE_SCIENCE_BATTERY_SITES: readonly GroundPosition[] = [
  { x: -40, y: -30 },
  { x: -40, y: -40 },
  { x: -40, y: -50 },
  { x: -52, y: -35 },
];

const INFRARED_TELESCOPE_SITE = { x: -130, y: 60 } as const;

const RADIO_ARRAY_SITE = { x: 60, y: 150 } as const;

export const ANTENNA_FIELD_SITES: readonly GroundPosition[] = [
  { x: 60, y: 174 },
  { x: 36, y: 150 },
];

/**
 * What the guide buys for its late science, once Automated experiments is
 * unlocked with Precision optics: a large battery bank and the lab, as the lab
 * is what shortens Act 4's research, then the telescopes, each with a large
 * battery bank for its Night, and the array's antenna fields. The lab draws 4 kW
 * through the Night, 912 kWh, as the infrared telescope does, the array 456 kWh
 * and each field 114 kWh, against 800 kWh in a large battery bank.
 */
const LATE_SCIENCE_PURCHASES: readonly Purchase[] = [
  ["large-battery-bank", LATE_SCIENCE_BATTERY_SITES[0]],
  ["experiments-lab", LAB_SITE],
  ["large-battery-bank", LATE_SCIENCE_BATTERY_SITES[1]],
  ["infrared-telescope", INFRARED_TELESCOPE_SITE],
  ["large-battery-bank", LATE_SCIENCE_BATTERY_SITES[2]],
  ["large-battery-bank", LATE_SCIENCE_BATTERY_SITES[3]],
  ["radio-telescope-array", RADIO_ARRAY_SITE],
  // Each is refused until the array is commissioned, and tried again.
  ...ANTENNA_FIELD_SITES.map((site) => ["antenna-field", site] as const),
].map(([structureTypeId, site]) => ({
  structureTypeId: structureTypeId as string,
  site: site as GroundPosition,
  onceDesignId: "automated-experiments",
}));

/**
 * What Funding buys from Act 2 on, in the order the guide wants it, each once its
 * Design is unlocked and its Components have come. It holds a good deal more
 * than a base can buy at once, so that it waits for Funding as well as Science.
 */
const PURCHASES: readonly Purchase[] = [
  { structureTypeId: "workshop", site: { x: 66, y: -33 } },
  // The Workshop and what makes its metals want more than two solar arrays.
  { structureTypeId: "solar-array", site: { x: 28, y: -33 } },
  // Metals to spare, to sell, and for the Workshop whatever the first runs for.
  { structureTypeId: "large-extraction-plant", site: { x: 44, y: -44 } },
  // One Workshop's 20 spare Components a Lunation fall short of what this base
  // uses once it grows: with only the one it ran out by Earth Day 530, and its
  // solar arrays wearing out unrepaired killed the Mission Director on 935.
  { structureTypeId: "workshop", site: { x: 74, y: -33 } },
  { structureTypeId: "array-works", site: { x: 54, y: -44 } },
  { structureTypeId: "concentrator-tower", site: { x: 66, y: -14 } },
  { structureTypeId: "cold-trap-ice-line", site: { x: 82, y: -33 } },
  // Act 3's and Act 4's Plants need no more power: the one tower's 100 kW covers
  // them all. A second and third tower drew 0.2 kW each through the Night, which
  // this base's battery banks couldn't carry: the Mission Director died on 1,255.
  { structureTypeId: "propellant-plant", site: { x: 92, y: -33 } },
  // Its Design is the Plant's, so this comes as soon as the Plant is up.
  { structureTypeId: "propellant-tank", site: { x: 92, y: -21 } },
  { structureTypeId: "large-propellant-plant", site: { x: 104, y: -33 } },
  // The large propellant plant uses about what the excavator digs, and only the
  // stock the heap holds goes into the Night. A purchase waits only for its own
  // Design, so these come with the large plant's, well before the optics works.
  // The digger draws power only from what is left over at Night, as Plants do.
  { structureTypeId: "bucket-wheel-digger", site: { x: 128, y: -8 } },
  { structureTypeId: "regolith-bin", site: { x: 92, y: -9 } },
  { structureTypeId: "optics-works", site: { x: 54, y: -56 } },
  { structureTypeId: "grinding-line", site: { x: 44, y: -56 } },
  // A Greenhouse drinks more than one water-processing plant makes, and its lamps
  // want about half a large battery bank through a Night, on top of all else.
  {
    structureTypeId: "large-battery-bank",
    site: { x: 54, y: -70 },
    fromEarthDay: GREENHOUSE_EARTH_DAY,
  },
  {
    structureTypeId: "water-processing-plant",
    site: { x: 86, y: -56 },
    fromEarthDay: GREENHOUSE_EARTH_DAY,
  },
  {
    structureTypeId: "water-processing-plant",
    site: { x: 96, y: -56 },
    fromEarthDay: GREENHOUSE_EARTH_DAY,
    // From Earth Day 1,626 to about 2,200, as `seeToPurchase` and docs/balancing-history.md say.
    strandedBecause: "planned on the first's Components",
  },
  {
    structureTypeId: "greenhouse",
    site: { x: 68, y: -72 },
    fromEarthDay: GREENHOUSE_EARTH_DAY,
  },
  // With two Workshops, the base growing from here ran out of spare Components
  // from about Earth Day 2,050 until the growing hall's Workshop came, at
  // version 80, where Plants running in Daylight paid for it all sooner.
  {
    structureTypeId: "workshop",
    site: { x: 114, y: -92 },
    fromEarthDay: GREENHOUSE_EARTH_DAY,
  },
  ...LATE_SCIENCE_PURCHASES,
  // Their Design comes in Act 1, but nothing here needs more than the base's own
  // tanks hold until the optics take water. So they wait until those have sold,
  // which also keeps them out of Act 2's and Act 3's dates.
  {
    structureTypeId: "water-tank",
    site: { x: 66, y: -56 },
    fromEarthDay: TANKS_EARTH_DAY,
  },
  {
    structureTypeId: "oxygen-tank",
    site: { x: 76, y: -56 },
    fromEarthDay: TANKS_EARTH_DAY,
  },
  // What a growing hall drinks and lights, then the hall. It wants 1,416 kg of water
  // a Lunation on top of all else, and 798 kWh through a Night.
  ...GROWING_HALL_PURCHASES,
  // What holds a Large-scale Crew Habitat's 600 kg of oxygen and 2,500 kg of water,
  // then the Habitat the Campaign builds towards, before a cistern for a Campaign played on.
  ...[
    ["water-tank", { x: 60, y: -104 }],
    ["water-tank", { x: 60, y: -114 }],
    ["oxygen-tank", { x: 50, y: -104 }],
    ["crew-habitat", CREW_HABITAT_SITE],
  ].map(([structureTypeId, site]) => ({
    structureTypeId: structureTypeId as string,
    site: site as GroundPosition,
    onceDesignId: "crew-habitats",
  })),
  // What holds a vault cistern's 2,000 kg, then the cistern, round the Buried Habitat.
  {
    structureTypeId: "water-tank",
    site: { x: 66, y: -92 },
    onceDesignId: "vault-cistern",
  },
  {
    structureTypeId: "vault-cistern",
    site: BURIED_HABITAT_SITE,
  },
];

/** What the array works makes the guide before it switches it off, and where those arrays go. */
export const ARRAYS_FROM_THE_WORKS: readonly GroundPosition[] = [
  { x: 26, y: -24 },
  { x: 26, y: -14 },
];

/** The Funding the guide keeps back, so that supplies can always be paid for. */
const FUNDING_KEPT_MILLION_DOLLARS = 300;

/** The metals the guide keeps from what it sells, for the Workshop and the circuit boards. */
export const METALS_KEPT_KILOGRAMS = 40;

/** What a tripled Return Mass comes to. */
export const TRIPLED_RETURN_MASS_KILOGRAMS = 300;

/** The propellant the guide keeps from what it sells, to burn. */
export const PROPELLANT_KEPT_KILOGRAMS = 400;

/**
 * The propellant it wants in stock, above which the Plants stop making it. It is
 * more than two Plants hold, which is what its propellant tank is for, and that
 * tank's limit leaves room to spare.
 */
export const PROPELLANT_HELD_KILOGRAMS = 1200;

/** The fewest circuit boards it is worth sending the Lander with. */
export const BOARDS_WORTH_A_TRIP_KILOGRAMS = 30;

/** What a Launch manifest line costs, and weighs. */
function launchItem(itemId: string): { price: number; mass: number } {
  const item = catalogue.launch.items.find(({ id }) => id === itemId);
  return {
    price: item?.priceMillionDollars ?? 0,
    mass: item?.massKilograms ?? 0,
  };
}

/**
 * Adds what the base lacks of a Structure to the Launch manifest, as much as its
 * Payload Mass leaves room for beside what is on it, once the Lander is away, if
 * the Funding runs to all of that and the supplies. Otherwise it waits.
 */
export function sendForAsFundingAllows(
  play: Play,
  missing: readonly ManifestLine[],
  what: string,
): void {
  const { state } = play;
  if (state.lander.state !== "travelling-to-earth") return;
  const manifest = new Map(
    state.launchManifest.items.map(({ itemId, count }) => [itemId, count]),
  );
  let room = catalogue.launch.payloadMassLimitKilograms;
  for (const [itemId, count] of manifest) {
    room -= launchItem(itemId).mass * count;
  }
  let cost = 0;
  for (const { itemId, count } of missing) {
    const { price, mass } = launchItem(itemId);
    const already = manifest.get(itemId) ?? 0;
    const more = Math.min(count - already, Math.floor(room / mass));
    if (more <= 0) continue;
    room -= more * mass;
    cost += more * price;
    manifest.set(itemId, already + more);
  }
  if (cost === 0) return;
  const paid =
    (state.launchManifest.items.length === 0
      ? catalogue.launch.feeMillionDollars
      : state.launchManifest.costMillionDollars) + cost;
  const funds =
    state.fundingMillionDollars + state.exports.valueAboardMillionDollars;
  if (paid > funds - FUNDING_KEPT_MILLION_DOLLARS) return;
  succeed(
    play.campaign.setLaunchManifest(
      [...manifest].map(([itemId, count]) => ({ itemId, count })),
    ),
    `Putting ${what} on the Launch manifest`,
  );
}

/** Launch manifest lines with those of the same item added up. */
function sumOfLines(lines: readonly ManifestLine[]): ManifestLine[] {
  const counts = new Map<string, number>();
  for (const { itemId, count } of lines) {
    counts.set(itemId, (counts.get(itemId) ?? 0) + count);
  }
  return [...counts].map(([itemId, count]) => ({ itemId, count }));
}

/** Something the purchases wait on, and why. */
export interface PurchaseWait {
  readonly what: string;
  readonly why: string;
  /**
   * How far it has got, such as which Components it still lacks: a change starts
   * the wait afresh, so that a purchase that comes a Launch at a time, as a
   * Large-scale Crew Habitat does, is waited on only while nothing comes.
   */
  readonly got?: string;
}

/**
 * Keeps track of how long each thing has been waited on, and gives up on the
 * Campaign once one has been waited on for longer than the limit, as playing on
 * to the end would take many minutes to say no more than that.
 */
export function purchaseStallWatch(
  limitEarthDays = PURCHASE_STALL_EARTH_DAYS,
): (atMinute: number, waits: readonly PurchaseWait[]) => void {
  const limit = toGameMinutes({ earthDays: limitEarthDays });
  const since = new Map<string, { from: number; got: string | undefined }>();
  return (atMinute, waits) => {
    for (const what of since.keys()) {
      if (!waits.some((wait) => wait.what === what)) since.delete(what);
    }
    for (const { what, why, got } of waits) {
      const before = since.get(what);
      const from =
        before === undefined || before.got !== got ? atMinute : before.from;
      since.set(what, { from, got });
      if (atMinute - from > limit) {
        throw new Error(
          `The purchases have made no progress for ${limitEarthDays} Earth Days, since Earth Day ${(from / MINUTES_PER_EARTH_DAY).toFixed(1)}: ${what} ${why}`,
        );
      }
    }
  };
}

/**
 * Sees to the next of the purchases coming, and builds it once it has, giving up
 * on the Campaign if one stops coming. A purchase whose Design is still locked or
 * whose Earth Day hasn't come isn't waited on, however long Science takes.
 */
export function buyInTurn(
  purchases: readonly Purchase[] = PURCHASES,
  watch = purchaseStallWatch(),
): (play: Play) => void {
  // The most water there has been since a Large-scale Crew Habitat was planned.
  let mostWater = 0;
  return (play) => {
    const { state } = play;
    if (
      state.clock.elapsedMinutes < toGameMinutes({ earthDays: ACT_2_EARTH_DAY })
    ) {
      return;
    }
    const water =
      state.lifeSupport.find(({ stockId }) => stockId === "water")?.kilograms ??
      0;
    mostWater = state.constructions.some(
      ({ structureTypeId }) => structureTypeId === "crew-habitat",
    )
      ? Math.max(mostWater, water)
      : 0;
    const stands = (
      footing: {
        readonly structureTypeId: string;
        readonly position: GroundPosition;
      },
      { structureTypeId, site }: Purchase,
    ) =>
      // A solar array is whatever kind its parts made it.
      (footing.structureTypeId === structureTypeId ||
        (structureTypeId === SOLAR_ARRAY_ID &&
          catalogue.structureTypes.find(
            ({ id }) => id === footing.structureTypeId,
          )?.solarArray !== undefined)) &&
      footing.position.x === site.x &&
      footing.position.y === site.y;
    const next = purchases.find((purchase) => {
      const type = catalogue.structureTypes.find(
        ({ id }) => id === purchase.structureTypeId,
      );
      return (
        type !== undefined &&
        state.unlockedDesignIds.includes(type.designId) &&
        (purchase.onceDesignId === undefined ||
          state.unlockedDesignIds.includes(purchase.onceDesignId)) &&
        state.clock.elapsedMinutes >=
          toGameMinutes({ earthDays: purchase.fromEarthDay ?? 0 }) &&
        ![...state.constructions, ...state.structures].some((footing) =>
          stands(footing, purchase),
        )
      );
    });
    const named = ({ structureTypeId, site }: Purchase) =>
      `a ${structureTypeId} at (${site.x}, ${site.y})`;
    watch(state.clock.elapsedMinutes, [
      // What is planned and never built holds up nothing after it, so it has to be watched too.
      ...purchases
        .filter(
          (purchase) =>
            purchase.strandedBecause === undefined &&
            state.constructions.some((footing) => stands(footing, purchase)),
        )
        .map((purchase) =>
          purchase.structureTypeId === "crew-habitat"
            ? stockingWait(named(purchase), mostWater)
            : {
                what: named(purchase),
                why: "is planned, and hasn't been commissioned",
              },
        ),
      ...(next === undefined
        ? []
        : [{ what: named(next), ...seeToPurchase(play, next) }]),
    ]);
  };
}

/**
 * The wait on a planned Large-scale Crew Habitat, which the guide stocks once
 * the water has risen to what it holds back for it. Each new high, in steps of
 * 100 kg, starts the wait afresh: with the Greenhouse and growing hall drinking,
 * it rose about 250 kg a Lunation at version 80, from the Habitat planned on
 * Earth Day 2,427, and would have reached it after more than 300 Earth Days.
 */
function stockingWait(what: string, mostWater: number): PurchaseWait {
  const most = Math.floor(mostWater / 100) * 100;
  return {
    what,
    why: `is planned, and hasn't been commissioned: the water has risen to ${most} kg of the ${WATER_FOR_THE_CREW_HABITAT_KILOGRAMS} kg held back to stock it`,
    got: `${most} kg of water`,
  };
}

/**
 * Orders a purchase, or plans it once it has come, and says what it waits on now
 * and, while it lacks Components, which.
 */
function seeToPurchase(
  play: Play,
  next: Purchase,
): { why: string; got?: string } {
  const { state } = play;
  // What is planned stays in stock until the Robot takes it, so that something
  // planned just after it looks to have its Components already, as the guide's second
  // water-processing plant did at its Greenhouse: planned on the first's, and waiting
  // since. So from the Greenhouse chain on it counts what is planned as well. Before
  // that it goes on as it does, so that the dates played stand.
  const lines = [
    ...linesToOrder(state, next.structureTypeId),
    ...(next.onceDesignId === undefined
      ? []
      : state.constructions
          .filter(({ componentsTaken }) => !componentsTaken)
          .flatMap(({ structureTypeId }) =>
            linesToOrder(state, structureTypeId),
          )),
  ];
  const missing = missingFromStock(state, sumOfLines(lines));
  if (missing.length === 0) {
    // A Machine or Rover may be standing there for now: it tries again.
    const planned = play.campaign.planConstruction({
      structureTypeId: next.structureTypeId,
      position: next.site,
    });
    return {
      why: planned.ok
        ? "has only just been planned"
        : `can't be planned: ${planned.message}`,
    };
  }
  sendForAsFundingAllows(play, missing, `a ${next.structureTypeId}`);
  const lacks = missing
    .map(({ itemId, count }) => `${count} ${itemId}`)
    .join(", ");
  return {
    why: `lacks ${lacks}, with $${state.fundingMillionDollars.toFixed(0)}M of Funding`,
    got: lacks,
  };
}
