import { catalogue } from "../src/catalogue";
import {
  formatTimeline,
  LOOK_EVERY_MINUTES,
  playReferenceCampaign,
  referenceSteps,
  succeed,
  type Play,
  type PlayStep,
  type ReferenceTimeline,
} from "./reference-campaign";
import { catalogueUpToAct, exportEconomics, labelOf } from "./pacing-report";
import { toGameMinutes } from "./scenario";
import {
  nextSolarArray,
  SOLAR_ARRAY_ID,
  type GroundPosition,
  type ManifestLine,
  type Snapshot,
} from "../src/simulation";

// The long-game play guide: plays on well past the end of the reference
// Campaign, through the simulation interface alone, with the same seed and
// every Hazard, real Solar Particle Events and all, as far as the Campaign's
// content is meant to last, so that the late game's balance can be seen. It takes minutes,
// so no test plays it: CI does, with `npm run long-game` (see
// docs/reference-campaign.md).
//
// A later Act adds its steps to `longGameSteps`, and whatever Designs they use
// to `designsTheLongGameUses`.

/**
 * The Earth Day the long-game play guide ends: the end of the last Act, the
 * length the Campaign's content is meant to last, which a Buried Habitat lets
 * the Mission Director live to.
 */
export const LONG_GAME_END_EARTH_DAY = 3000;

/** The most the last step waits for the Campaign to get there, as it does nothing else. */
const LONGEST_PLAY_ON = { earthDays: LONG_GAME_END_EARTH_DAY };

/**
 * The Designs whose Structures or Launch items the long-game play guide
 * builds or sends for. It checks this as it ends; the data catalogue's
 * consistency rules read it, as they can't play the game to find out.
 */
export const designsTheLongGameUses: readonly string[] = [
  "solar-arrays",
  "battery-banks",
  "inflatable-habitat",
  "regolith-shielding",
  "water-wall-shielding",
  "landing-pads",
  "regolith-extraction",
  "vacuum-fabrication",
  "circuit-board-fabrication",
  "water-processing",
  "life-support-resupply",
  "bulk-supply-tanks",
  "lunar-greenhouses",
  "large-battery-banks",
  "robots",
  "maintenance-spares",
  "molten-regolith-electrolysis",
  "parts-machining",
  "array-fabrication",
  "concentrator-towers",
  "cold-trap-mining",
  "buried-habitat",
  "propellant-production",
  "large-propellant-production",
  "precision-optics",
  "optics-grinding-line",
  "growing-halls",
  "vault-cistern",
  "crew-habitats",
];

/**
 * How long one purchase may wait for its Funding, Components or site, or stand
 * planned, before the guide gives up. A purchase waited at most 22 Earth Days as
 * the guide played, up to Earth Day 2,400, and past that
 * docs/balancing-history.md has a vault cistern commissioned 40 after its
 * Design. Waiting for Science doesn't count.
 */
export const PURCHASE_STALL_EARTH_DAYS = 300;

/** The Earth Day Act 2 opens, when the guide turns to making its own spare Components. */
const ACT_2_EARTH_DAY = 350;

/** The Earth Day Act 2 is meant to last until. */
const ACT_2_END_EARTH_DAY = 900;

/** The Earth Day Act 4 opens. */
const ACT_4_EARTH_DAY = 1400;

/** Act 2's pacing targets, in Earth Days (docs/balancing.md). */
export const act2Targets = {
  workshopRunningBy: 500,
  sparesNeedNoLaunchBy: 800,
  designsStillToBuyAt: 700,
  researchLastsUntilAbout: ACT_2_END_EARTH_DAY,
  /** How far from that it may finish and still count as about then. */
  researchWithin: 50,
  /** How many Launches' profit one of every Launch item takes, at least. */
  launchesToBuyEverything: 20,
  metalsSoldBy: ACT_2_END_EARTH_DAY,
} as const;

/** Act 3's and Act 4's pacing targets, in Earth Days (docs/reference-campaign.md). */
export const laterActTargets = {
  propellantMadeBy: 1050,
  returnMassTripledBy: 1250,
  /** When research lasts until, for each of the two Acts. */
  act3ResearchUntilAbout: 1400,
  act4ResearchUntilAbout: LONG_GAME_END_EARTH_DAY,
  researchWithin: 50,
  opticsSoldBy: 2000,
  /** What the Campaign builds towards, its last Milestone, by the end of its content. */
  crewHabitatBy: LONG_GAME_END_EARTH_DAY,
} as const;

/** What the guide keeps in stock: it switches the Workshop off above this many, and back on below it. */
const SPARES_HELD = 40;

/** The Earth Day the guide sends for storage tanks: once it is selling precision optics. */
const TANKS_EARTH_DAY = 1750;

/**
 * The Earth Day the guide turns to its Greenhouse and the water it drinks: once
 * the Mission Director has moved into a Buried Habitat, which Funding goes to first.
 */
const GREENHOUSE_EARTH_DAY = 1600;

/** The water ice the guide wants in stock for its Plants, below which the Rover goes for more. */
const ICE_HELD_KILOGRAMS = 600;

/**
 * The water below which the guide holds its optics back, so that a Greenhouse has
 * a Night's water at dusk: 228 kg for it, 33 kg for the Mission Director and their
 * reserve of 49 kg, with a little over.
 */
const WATER_FOR_THE_NIGHT_KILOGRAMS = 320;

/** The water above which it lets them run again. */
const WATER_TO_SPARE_KILOGRAMS = 360;

/**
 * With a growing hall as well, what it takes through a Night comes on top: 456 kg,
 * with a little over.
 */
const WATER_FOR_THE_NIGHT_WITH_A_HALL_KILOGRAMS = 800;

/** What the guide lets the water rise to before filling a vault cistern: its 2,000 kg, the reserve and a little over. */
const WATER_FOR_THE_CISTERN_KILOGRAMS = 2200;

/**
 * What the guide lets the water rise to before a Large-scale Crew Habitat is stocked,
 * once it is planned: its 2,500 kg, the reserve and a little over.
 */
const WATER_FOR_THE_CREW_HABITAT_KILOGRAMS = 2700;

/**
 * The oxygen the guide has its large extraction plant make, in place of metals and
 * silicon, once it has the tanks to hold what a Large-scale Crew Habitat is stocked
 * with: its 600 kg, the reserve and a little over.
 */
const OXYGEN_FOR_THE_CREW_HABITAT_KILOGRAMS = 630;

/** Where the guide builds a Large-scale Crew Habitat, south of the rest of the base. */
const CREW_HABITAT_SITE = { x: 80, y: -116 } as const;

/**
 * The Earth Day the guide sends for a Buried Habitat, in good time to move in by
 * the Act's target of Earth Day 1,600: three Launches at a trip every 15 Earth
 * Days or so, then about 9 Earth Days to build it in the Daylight after the last.
 */
const BURIED_HABITAT_EARTH_DAY = 1530;

/** The latest Earth Day the guide should be moved in by, the Act's target. */
const BURIED_HABITAT_MOVED_IN_BY_EARTH_DAY = 1600;

/** Where a Buried Habitat stands: north of the old Habitat. */
const BURIED_HABITAT_SITE = { x: 46, y: 8 } as const;

/**
 * The Earth Days of Daylight the guide wants left as it plans a Buried Habitat:
 * enough to build it and dismantle the old Habitat, its water wall and its
 * shielding before Night falls, as this base's battery banks can't carry both
 * Habitats through a Night, and with both drawing power by day the Workshop,
 * last in line for it, makes too few spare Components. At version 80 building
 * took about 10.6 Earth Days and dismantling about 4.9: with 12 wanted, a
 * Buried Habitat planned with just over 12 left was moved into 1.4 Earth Days
 * before Night, dismantling ran 3.5 into it, and the Mission Director died
 * near its end. So a Buried Habitat whose Components come later than that
 * waits for the next Daylight.
 */
const DAYLIGHT_TO_BUILD_AND_MOVE = { earthDays: 16 };

/** The Components a type of Structure takes, as Launch manifest lines. */
function manifestLinesOf(structureTypeId: string): readonly ManifestLine[] {
  return (
    catalogue.structureTypes.find(({ id }) => id === structureTypeId)
      ?.components ?? []
  ).map(({ componentId, count }) => ({ itemId: componentId, count }));
}

/**
 * What to order of a type of Structure as things stand: for a solar array, the
 * parts on sale, as a Design takes the older ones off it.
 */
function linesToOrder(
  state: Snapshot,
  structureTypeId: string,
): readonly ManifestLine[] {
  if (structureTypeId !== SOLAR_ARRAY_ID) {
    return manifestLinesOf(structureTypeId);
  }
  const kind = nextSolarArray(
    {
      ...state,
      stockpile: { components: [] },
      lander: { cargo: [] },
      constructions: [],
    },
    [],
  );
  return manifestLinesOf(kind?.id ?? structureTypeId);
}

/** What of these Launch manifest lines the base lacks in its stock. */
function missingFromStock(
  state: Snapshot,
  lines: readonly ManifestLine[],
): ManifestLine[] {
  return lines.flatMap(({ itemId, count }) => {
    const inStock =
      state.stockpile.components.find((stock) => stock.componentId === itemId)
        ?.count ?? 0;
    return count > inStock ? [{ itemId, count: count - inStock }] : [];
  });
}

/**
 * Sends for what a Buried Habitat needs, as much on each Launch as its Payload
 * Mass leaves room for beside the supplies already on the manifest, and plans
 * it early in a Daylight once it has all come.
 */
function shipBuriedHabitat(play: Play): void {
  const { state } = play;
  const buried = "buried-habitat";
  if (
    state.clock.elapsedMinutes <
      toGameMinutes({ earthDays: BURIED_HABITAT_EARTH_DAY }) ||
    !state.unlockedDesignIds.includes(buried) ||
    [...state.constructions, ...state.structures].some(
      ({ structureTypeId }) => structureTypeId === buried,
    )
  ) {
    return;
  }
  const missing = missingFromStock(state, manifestLinesOf(buried));
  if (missing.length === 0) {
    if (
      state.lunation.part === "daylight" &&
      state.lunation.minutesRemaining >=
        toGameMinutes(DAYLIGHT_TO_BUILD_AND_MOVE)
    ) {
      play.plan(buried, BURIED_HABITAT_SITE);
    }
    return;
  }
  // The manifest can change until the Lander leaves Earth, and the trip before
  // has been unloaded, so all the base lacks has yet to be sent for.
  if (state.lander.state !== "travelling-to-earth") return;
  const massOf = (itemId: string) =>
    catalogue.launch.items.find(({ id }) => id === itemId)?.massKilograms ?? 0;
  const manifest = new Map(
    state.launchManifest.items.map(({ itemId, count }) => [itemId, count]),
  );
  let room = catalogue.launch.payloadMassLimitKilograms;
  for (const [itemId, count] of manifest) room -= massOf(itemId) * count;
  let added = false;
  for (const { itemId, count } of missing) {
    const already = manifest.get(itemId) ?? 0;
    const more = Math.min(count - already, Math.floor(room / massOf(itemId)));
    if (more <= 0) continue;
    room -= more * massOf(itemId);
    manifest.set(itemId, already + more);
    added = true;
  }
  if (added) {
    succeed(
      play.campaign.setLaunchManifest(
        [...manifest].map(([itemId, count]) => ({ itemId, count })),
      ),
      "Putting the Buried Habitat on the Launch manifest",
    );
  }
}

/**
 * Moves the Mission Director into a Buried Habitat as soon as it stands and has
 * power, then dismantles the old Habitat and what is over it, one by one.
 */
function moveIntoBuriedHabitat(play: Play): void {
  const { state } = play;
  const buried = state.structures.find(
    (structure) => structure.structureTypeId === "buried-habitat",
  );
  if (buried?.powered !== true) return;
  const { missionDirector } = state;
  if (
    missionDirector.residence !== "habitat" ||
    missionDirector.habitatId !== buried.id
  ) {
    succeed(
      play.campaign.moveMissionDirectorIn(buried.id),
      "Moving the Mission Director into the Buried Habitat",
    );
    return;
  }
  if (state.dismantlings.length > 0) return;
  for (const structureTypeId of [
    "water-wall",
    "regolith-shielding",
    "habitat",
  ]) {
    const next = state.structures.find(
      (structure) => structure.structureTypeId === structureTypeId,
    );
    if (next !== undefined) {
      succeed(
        play.campaign.dismantleStructure(next.id),
        `Dismantling the old ${structureTypeId}`,
      );
      return;
    }
  }
}

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
    // A base this size uses more spare Components than two Workshops make.
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
const ARRAYS_FROM_THE_WORKS: readonly GroundPosition[] = [
  { x: 26, y: -24 },
  { x: 26, y: -14 },
];

/** The Funding the guide keeps back, so that supplies can always be paid for. */
const FUNDING_KEPT_MILLION_DOLLARS = 300;

/** The metals the guide keeps from what it sells, for the Workshop and the circuit boards. */
const METALS_KEPT_KILOGRAMS = 40;

/** What a tripled Return Mass comes to. */
const TRIPLED_RETURN_MASS_KILOGRAMS = 300;

/** The propellant the guide keeps from what it sells, to burn. */
const PROPELLANT_KEPT_KILOGRAMS = 400;

/**
 * The propellant it wants in stock, above which the Plants stop making it. It is
 * more than two Plants hold, which is what its propellant tank is for, and that
 * tank's limit leaves room to spare.
 */
const PROPELLANT_HELD_KILOGRAMS = 1200;

/** The fewest circuit boards it is worth sending the Lander with. */
const BOARDS_WORTH_A_TRIP_KILOGRAMS = 30;

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
function sendForAsFundingAllows(
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
  return (play) => {
    const { state } = play;
    if (
      state.clock.elapsedMinutes < toGameMinutes({ earthDays: ACT_2_EARTH_DAY })
    ) {
      return;
    }
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
        .map((purchase) => ({
          what: named(purchase),
          why: "is planned, and hasn't been commissioned",
        })),
      ...(next === undefined
        ? []
        : [{ what: named(next), ...seeToPurchase(play, next) }]),
    ]);
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

/**
 * Sets a large extraction plant to metals and silicon, as what the base has it for,
 * but to oxygen while a Large-scale Crew Habitat is to be stocked and the base has
 * the tanks to hold it and too little.
 */
function runLargeExtractionPlant(play: Play): void {
  const { state } = play;
  const plant = state.structures.find(
    ({ structureTypeId }) => structureTypeId === "large-extraction-plant",
  );
  if (plant === undefined) return;
  const oxygenTanks = state.structures.filter(
    ({ structureTypeId }) => structureTypeId === "oxygen-tank",
  ).length;
  const recipeId =
    crewHabitatToStock(state) &&
    oxygenTanks >= 2 &&
    (state.lifeSupport.find(({ stockId }) => stockId === "oxygen")?.kilograms ??
      0) < OXYGEN_FOR_THE_CREW_HABITAT_KILOGRAMS
      ? "oxygen"
      : "metals-and-silicon";
  if (plant.recipeId === recipeId) return;
  succeed(
    play.campaign.setPlantRecipe(plant.id, recipeId),
    `Setting the large extraction plant to ${recipeId}`,
  );
}

/**
 * Whether the guide means to stock a Large-scale Crew Habitat that isn't stocked
 * yet: its Design is unlocked, and none stands nor has started its Assembly.
 */
function crewHabitatToStock(state: Snapshot): boolean {
  return (
    state.unlockedDesignIds.includes("crew-habitats") &&
    !state.structures.some(
      ({ structureTypeId }) => structureTypeId === "crew-habitat",
    ) &&
    !state.constructions.some(
      ({ structureTypeId, stage, stageProgress }) =>
        structureTypeId === "crew-habitat" &&
        (stage === "commissioning" ||
          (stage === "assembly" && stageProgress > 0)),
    )
  );
}

/**
 * Has the array works make what two more solar arrays are built from, plans them
 * once it has, and switches it off, as the base then has power enough.
 */
function runArrayWorks(play: Play): void {
  const { state } = play;
  const works = state.structures.find(
    ({ structureTypeId }) => structureTypeId === "array-works",
  );
  if (works === undefined) return;
  const planned = ARRAYS_FROM_THE_WORKS.filter(({ x, y }) =>
    [...state.constructions, ...state.structures].some(
      ({ position }) => position.x === x && position.y === y,
    ),
  );
  const site = ARRAYS_FROM_THE_WORKS[planned.length];
  if (site === undefined) {
    if (!works.switchedOff) {
      succeed(
        play.campaign.switchPlant(works.id, "off"),
        "Switching the array works off",
      );
    }
    return;
  }
  const lines = manifestLinesOf("solar-array");
  const missing = missingFromStock(state, lines);
  if (missing.length === 0) {
    // A Machine or Rover may be standing there for now: it tries again.
    play.campaign.planConstruction({
      structureTypeId: "solar-array",
      position: site,
    });
    return;
  }
  const recipeId = missing.some(({ itemId }) => itemId === "solar-panel")
    ? "solar-panels"
    : "array-masts";
  if (works.recipeId !== recipeId) {
    succeed(
      play.campaign.setPlantRecipe(works.id, recipeId),
      "Switching the array works' recipe",
    );
  }
}

/**
 * Loads the Lander whenever it is free and there is something worth a trip: all
 * the precision optics and circuit boards that its Return Mass will take, as they
 * are worth the propellant to lift them, then propellant if there is plenty and
 * metals if not, up to the 100 kg it can carry for nothing. Once, it loads metals
 * as well to make up a tripled Return Mass, to see that it can be done.
 */
function loadTheLander(play: Play): void {
  const { state } = play;
  if (
    state.clock.elapsedMinutes <
      toGameMinutes({ earthDays: ACT_2_EARTH_DAY }) ||
    state.lander.state !== "landed-free" ||
    state.exports.toLoad.length > 0 ||
    state.exports.aboard.length > 0
  ) {
    return;
  }
  const amount = (resourceId: string) =>
    state.bulkResources.find((stock) => stock.resourceId === resourceId)
      ?.kilograms ?? 0;
  const freeMass = catalogue.lander.returnMassKilograms;
  const limit = Math.floor(state.exports.returnMassKilograms);
  const optics = Math.floor(amount("precision-optics"));
  const boards = Math.floor(amount("circuit-boards"));
  if (optics + boards < BOARDS_WORTH_A_TRIP_KILOGRAMS) return;
  const opticsLoaded = Math.min(optics, limit);
  const boardsLoaded = Math.min(boards, limit - opticsLoaded);
  let loaded = opticsLoaded + boardsLoaded;
  const metalsSpare = Math.max(
    0,
    Math.floor(amount("metals") - METALS_KEPT_KILOGRAMS),
  );
  const tripling =
    limit >= TRIPLED_RETURN_MASS_KILOGRAMS &&
    !state.milestones.reachedIds.includes("return-mass-tripled") &&
    metalsSpare >= TRIPLED_RETURN_MASS_KILOGRAMS - loaded;
  let metals = 0;
  let propellant = 0;
  if (tripling) {
    metals = TRIPLED_RETURN_MASS_KILOGRAMS - loaded;
  } else if (loaded < freeMass) {
    // Selling it leaves less to burn, so only what the Lander won't need.
    const propellantSpare = Math.floor(
      amount("propellant") - PROPELLANT_KEPT_KILOGRAMS,
    );
    propellant = Math.min(freeMass - loaded, Math.max(0, propellantSpare));
    loaded += propellant;
    metals = Math.min(freeMass - loaded, metalsSpare);
  }
  const lines = [
    { resourceId: "precision-optics", kilograms: opticsLoaded },
    { resourceId: "circuit-boards", kilograms: boardsLoaded },
    { resourceId: "metals", kilograms: metals },
    { resourceId: "propellant", kilograms: propellant },
  ].filter(({ kilograms }) => kilograms > 0);
  // It waits for a Plant rather than send a Lander with no propellant or metals to fill it.
  if (
    lines.reduce((total, { kilograms }) => total + kilograms, 0) < freeMass &&
    boards < freeMass
  ) {
    return;
  }
  succeed(play.campaign.loadExports(lines), "Loading the Exports");
}

/**
 * Keeps the propellant plants running only while the stock is short of a few
 * trips' worth, so that they don't take all the Regolith.
 */
function runPropellantPlants(play: Play): void {
  const { state } = play;
  const inStock =
    state.bulkResources.find(({ resourceId }) => resourceId === "propellant")
      ?.kilograms ?? 0;
  const setting =
    inStock > PROPELLANT_HELD_KILOGRAMS
      ? "off"
      : inStock < PROPELLANT_HELD_KILOGRAMS / 2
        ? "on"
        : undefined;
  if (setting === undefined) return;
  for (const plant of state.structures) {
    if (
      (plant.structureTypeId === "propellant-plant" ||
        plant.structureTypeId === "large-propellant-plant") &&
      (setting === "off") !== plant.switchedOff
    ) {
      succeed(
        play.campaign.switchPlant(plant.id, setting),
        "Switching a propellant plant",
      );
    }
  }
}

/**
 * Runs the Workshops only as far as the spare Components need them, so that
 * they don't spend metals on more than the base will use for a long time.
 */
function runWorkshops(play: Play): void {
  const { state } = play;
  const spares =
    state.stockpile.components.find(
      (stock) => stock.componentId === catalogue.maintenance.spareComponentId,
    )?.count ?? 0;
  const setting =
    spares > SPARES_HELD ? "off" : spares < SPARES_HELD ? "on" : undefined;
  if (setting === undefined) return;
  for (const workshop of state.structures) {
    if (
      workshop.structureTypeId === "workshop" &&
      (setting === "off") !== workshop.switchedOff
    ) {
      succeed(
        play.campaign.switchPlant(workshop.id, setting),
        "Switching the Workshop",
      );
    }
  }
}

/**
 * Sends for a second Robot, so that one can be off on an Expedition with
 * Maintenance still seen to.
 */
function shipASecondRobot(play: Play): void {
  const { state } = play;
  if (
    state.clock.elapsedMinutes <
      toGameMinutes({ earthDays: GREENHOUSE_EARTH_DAY }) ||
    state.robots.length > 1 ||
    !state.unlockedDesignIds.includes("robots")
  ) {
    return;
  }
  sendForAsFundingAllows(play, [{ itemId: "robot", count: 1 }], "a Robot");
}

/**
 * Once there is a Greenhouse: keeps the Rover going for water ice whenever it is
 * free and there is too little in stock, and holds the optics back, which would
 * otherwise drink what it needs to last the Night. Once the last Design is unlocked,
 * Science has nothing left to buy, so it switches its Greenhouses and growing hall
 * off, as it does the optics until a vault cistern is filled, and lets the optics
 * have the water after that.
 */
function waterTheGreenhouse(play: Play): void {
  const { state } = play;
  if (
    !state.structures.some(
      ({ structureTypeId }) => structureTypeId === "greenhouse",
    )
  ) {
    return;
  }
  const ice =
    state.bulkResources.find(({ resourceId }) => resourceId === "water-ice")
      ?.kilograms ?? 0;
  if (
    state.expedition === undefined &&
    ice < ICE_HELD_KILOGRAMS &&
    state.rovers.some(({ conditionPercent }) => conditionPercent > 0)
  ) {
    // It may be refused for now, if no Robot is free: it tries again.
    play.campaign.startExpedition();
  }
  const water =
    state.lifeSupport.find(({ stockId }) => stockId === "water")?.kilograms ??
    0;
  const cisternToFill =
    state.unlockedDesignIds.includes("vault-cistern") &&
    !state.structures.some(
      ({ structureTypeId }) => structureTypeId === "vault-cistern",
    );
  if (state.unlockedDesignIds.includes("vault-cistern")) {
    for (const plant of state.structures) {
      if (
        (plant.structureTypeId === "greenhouse" ||
          plant.structureTypeId === "growing-hall") &&
        !plant.switchedOff
      ) {
        succeed(
          play.campaign.switchPlant(plant.id, "off"),
          "Switching off what earns Science, with nothing left to buy",
        );
      }
    }
  }
  const crewHabitatPlanned =
    crewHabitatToStock(state) &&
    state.constructions.some(
      ({ structureTypeId }) => structureTypeId === "crew-habitat",
    );
  const held = crewHabitatPlanned
    ? WATER_FOR_THE_CREW_HABITAT_KILOGRAMS
    : cisternToFill
      ? WATER_FOR_THE_CISTERN_KILOGRAMS
      : state.structures.some(
            ({ structureTypeId, switchedOff }) =>
              structureTypeId === "growing-hall" && !switchedOff,
          )
        ? WATER_FOR_THE_NIGHT_WITH_A_HALL_KILOGRAMS
        : WATER_FOR_THE_NIGHT_KILOGRAMS;
  const setting =
    water < held
      ? "off"
      : water > held + WATER_TO_SPARE_KILOGRAMS - WATER_FOR_THE_NIGHT_KILOGRAMS
        ? "on"
        : undefined;
  if (setting === undefined) return;
  for (const plant of state.structures) {
    if (
      (plant.structureTypeId === "optics-works" ||
        plant.structureTypeId === "grinding-line") &&
      (setting === "off") !== plant.switchedOff
    ) {
      succeed(
        play.campaign.switchPlant(plant.id, setting),
        "Switching the optics",
      );
    }
  }
}

/** Unlocks the cheapest Design it can, once the Science is there. */
function unlockEveryDesign(play: Play): void {
  const { state } = play;
  const next = catalogue.designs
    .filter(
      (design) =>
        !state.unlockedDesignIds.includes(design.id) &&
        design.scienceCost <= state.science &&
        design.prerequisiteDesignIds.every((id) =>
          state.unlockedDesignIds.includes(id),
        ),
    )
    .sort((a, b) => a.scienceCost - b.scienceCost)[0];
  if (next === undefined) return;
  succeed(play.campaign.unlockDesign(next.id), `Unlocking ${next.label}`);
}

/** Gives up on the Campaign if the guide has left any research undone. */
function checkEverythingResearched(play: Play): void {
  const { state } = play;
  const tasksLeft = catalogue.researchTasks.filter(
    (task) => !state.completedResearchTaskIds.includes(task.id),
  );
  if (tasksLeft.length > 0) {
    throw new Error(
      `Research Tasks not completed: ${tasksLeft.map((task) => task.label).join(", ")}.`,
    );
  }
  const designsLeft = catalogue.designs.filter(
    (design) => !state.unlockedDesignIds.includes(design.id),
  );
  if (designsLeft.length > 0) {
    throw new Error(
      `Designs not unlocked: ${designsLeft.map((design) => design.label).join(", ")}.`,
    );
  }
}

/** The long-game play guide: the reference Campaign, then each Act's steps in turn. */
export const longGameSteps: readonly PlayStep[] = [
  ...referenceSteps,
  {
    milestoneId: undefined,
    description: `Keep the base going as the reference Campaign's last step does, with a Research Task always running and the cheapest Design unlocked as soon as it can be, until Earth Day ${LONG_GAME_END_EARTH_DAY}. From Earth Day ${ACT_2_EARTH_DAY}, ship and build in turn, as the Science and Funding allow, a Workshop, a third solar array, a large extraction plant set to metals and silicon, a second Workshop, an array works that makes two more solar arrays, a concentrator tower and a cold-trap ice line. Once the Workshop runs stop bringing spare Components by Launch, switching them off while more than ${SPARES_HELD} are in stock, and fill what the circuit boards leave of each Return Mass with metals, or with propellant once it has more than it means to burn. As their Designs are unlocked, ship and build a propellant plant, a propellant tank, a large propellant plant, an optics works and a grinding line, and load the optics and circuit boards first, burning propellant to lift all there are. Once, make up a tripled Return Mass with metals. From Earth Day ${BURIED_HABITAT_EARTH_DAY}, send for a Buried Habitat over several Launches, build it early in a Daylight, move the Mission Director in as soon as it has power, and dismantle the old Habitat, with its water wall and shielding, before Night falls. From Earth Day ${GREENHOUSE_EARTH_DAY}, ship a second Robot, then ship and build a large battery bank, two more water-processing plants and a Greenhouse, and once it stands keep the Rover going for water ice while under ${ICE_HELD_KILOGRAMS} kg is in stock, and switch the optics off below ${WATER_FOR_THE_NIGHT_KILOGRAMS} kg of water, on again above ${WATER_TO_SPARE_KILOGRAMS} kg. From Earth Day ${TANKS_EARTH_DAY}, ship and build a water tank and an oxygen tank. Once Growing halls is unlocked, ship and build a third Workshop, a large battery bank, three more water-processing plants, four more cold-trap ice lines and a growing hall, holding its optics back below ${WATER_FOR_THE_NIGHT_WITH_A_HALL_KILOGRAMS} kg of water. Once Large-scale Crew Habitats is unlocked, ship and build two more water tanks and a second oxygen tank, set the large extraction plant to oxygen until there is ${OXYGEN_FOR_THE_CREW_HABITAT_KILOGRAMS} kg, then ship and build a Large-scale Crew Habitat over as many Launches as the Funding allows, holding the optics back once it is planned until there is ${WATER_FOR_THE_CREW_HABITAT_KILOGRAMS} kg of water to stock it. Once Vault cistern is unlocked, with nothing left for Science to buy, switch the Greenhouse and growing hall off, ship and build a second water tank and a vault cistern round the Buried Habitat, holding the optics back until there is ${WATER_FOR_THE_CISTERN_KILOGRAMS} kg of water to fill it, then let them have what is over.`,
    play(play) {
      keepTheBaseGoing(play);
      playOnUntil(play, LONG_GAME_END_EARTH_DAY);
      checkEverythingResearched(play);
    },
  },
];

/**
 * Has the long-game play guide's last step keep the base going, as its
 * description says, for as long as the Campaign is then played.
 */
export function keepTheBaseGoing(play: Play): void {
  play.keepUp(unlockEveryDesign);
  play.keepUp(buyInTurn());
  play.keepUp(runWorkshops);
  play.keepUp(runLargeExtractionPlant);
  play.keepUp(runArrayWorks);
  play.keepUp(loadTheLander);
  play.keepUp(runPropellantPlants);
  play.keepUp(shipBuriedHabitat);
  play.keepUp(moveIntoBuriedHabitat);
  play.keepUp(shipASecondRobot);
  play.keepUp(waterTheGreenhouse);
  // Last, to see what the others have just done.
  play.keepUp(giveUpOnMissedTargets());
}

/** Lets the Campaign run until the Earth Day given. */
export function playOnUntil(play: Play, earthDay: number): void {
  const end = toGameMinutes({ earthDays: earthDay });
  play.waitUntil(
    `Earth Day ${earthDay}`,
    (state) => state.clock.elapsedMinutes >= end,
    LONGEST_PLAY_ON,
  );
}

/** Plays the long-game play guide, as far as it goes. */
export function playLongGame(
  steps: readonly PlayStep[] = longGameSteps,
  onProgress?: (earthDay: number) => void,
): ReferenceTimeline {
  return playReferenceCampaign(steps, onProgress);
}

const MINUTES_PER_EARTH_DAY = toGameMinutes({ earthDays: 1 });

/** The Designs the long-game play guide says it uses, but built nothing of and sent for nothing of. */
export function designsNotUsed(timeline: ReferenceTimeline): string[] {
  const used = new Set([
    ...timeline.structureTypesBuilt.flatMap(
      ({ structureTypeId }) =>
        catalogue.structureTypes.find((type) => type.id === structureTypeId)
          ?.designId ?? [],
    ),
    ...timeline.launchItemsManifested.flatMap(
      (itemId) =>
        catalogue.launch.items.find((item) => item.id === itemId)?.designId ??
        [],
    ),
  ]);
  return designsTheLongGameUses.filter((designId) => !used.has(designId));
}

/**
 * What a Workshop did for the spare Components: when it was commissioned, how
 * many were in stock Lunation by Lunation, and what Launches brought before and
 * after it, as lines of text.
 */
function formatSpares(timeline: ReferenceTimeline): string[] {
  const day = (minute: number) => (minute / MINUTES_PER_EARTH_DAY).toFixed(0);
  const built = timeline.structureTypesBuilt.find(
    ({ structureTypeId }) => structureTypeId === "workshop",
  )?.atMinute;
  const shipped = (
    from: number,
    to: number,
  ): { launches: number; spares: number } => {
    const trips = timeline.sparesShipped.filter(
      ({ atMinute }) => atMinute >= from && atMinute < to,
    );
    return {
      launches: trips.length,
      spares: trips.reduce((total, { count }) => total + count, 0),
    };
  };
  const before = shipped(0, built ?? Infinity);
  const after = shipped(built ?? Infinity, Infinity);
  const since = timeline.sparesInStock.filter(
    ({ atMinute }) => built !== undefined && atMinute > built,
  );
  return [
    "Spare Components, Lunation by Lunation: Earth Day, then in stock (the fewest since the last line):",
    ...timeline.sparesInStock.map(
      ({ atMinute, inStock, fewest }) =>
        `  ${day(atMinute).padStart(6)}  ${inStock} (${fewest})`,
    ),
    built === undefined
      ? "No Workshop was commissioned."
      : `A Workshop was commissioned on Earth Day ${(built / MINUTES_PER_EARTH_DAY).toFixed(1)}. After it the stock was never below ${Math.min(...since.map(({ fewest }) => fewest))}.`,
    `Launches bringing spare Components: ${before.launches}, with ${before.spares}, before a Workshop; ${after.launches}, with ${after.spares}, after it.`,
  ];
}

/**
 * How the Buried Habitat came about, what the Radiation Dose stood at each
 * step, and how fast it rose behind the water wall and after, Solar Particle
 * Events and all, as lines of text.
 */
function formatBuriedHabitat(timeline: ReferenceTimeline): string[] {
  const day = (minute: number) => (minute / MINUTES_PER_EARTH_DAY).toFixed(1);
  const lookAt = (minute: number) =>
    timeline.looks.find(({ atMinute }) => atMinute >= minute) ??
    timeline.looks.at(-1);
  const dose = (minute: number) =>
    `${(lookAt(minute)?.radiationDoseMillisieverts ?? 0).toFixed(1)} mSv`;
  const rate = (from: number, to: number) =>
    (((lookAt(to)?.radiationDoseMillisieverts ?? 0) -
      (lookAt(from)?.radiationDoseMillisieverts ?? 0)) /
      (to - from)) *
    MINUTES_PER_EARTH_DAY;
  const kit = manifestLinesOf("buried-habitat").map(({ itemId }) => itemId);
  const launches = timeline.launchManifests.filter(({ items }) =>
    items.some(({ itemId }) => kit.includes(itemId) && itemId !== "airlock"),
  );
  const built = timeline.structureTypesBuilt.find(
    ({ structureTypeId }) => structureTypeId === "buried-habitat",
  )?.atMinute;
  const moved = timeline.moves.find(
    ({ structureTypeId }) => structureTypeId === "buried-habitat",
  )?.atMinute;
  const rates = catalogue.radiation.doseRateMillisievertsPerEarthDay;
  const { waterWallAtMinute, endMinute } = timeline;
  const firstSent = launches[0]?.atMinute;
  return [
    "The Buried Habitat, and the Radiation Dose at each step:",
    ...launches.map(
      ({ atMinute, items }) =>
        `  Earth Day ${day(atMinute)}, at ${dose(atMinute)}: the Lander left for Earth to bring ${items
          .filter(({ itemId }) => kit.includes(itemId))
          .map(({ itemId, count }) => `${count} ${itemId}`)
          .join(", ")}.`,
    ),
    ...(firstSent === undefined
      ? ["  It was never sent for."]
      : [
          `  Funding as it was first sent for: $${(lookAt(firstSent)?.fundingMillionDollars ?? 0).toFixed(0)}M.`,
        ]),
    built === undefined
      ? "  It was never commissioned."
      : `  Earth Day ${day(built)}, at ${dose(built)}: commissioned.`,
    ...(moved === undefined
      ? ["  The Mission Director never moved in."]
      : [
          `  Earth Day ${day(moved)}, at ${dose(moved)}: the Mission Director moved in.`,
          `  Earth Day ${day(endMinute)}, at ${dose(endMinute)}: the end, the Radiation Dose having risen ${rate(moved, endMinute).toFixed(4)} mSv an Earth Day since they moved in (${(rate(moved, endMinute) / rates.buriedHabitat).toFixed(2)} times the usual rate, for Solar Particle Events).`,
        ]),
    ...(waterWallAtMinute === undefined
      ? []
      : [
          `  Behind the water wall it rose ${rate(waterWallAtMinute, moved ?? endMinute).toFixed(3)} mSv an Earth Day (${(rate(waterWallAtMinute, moved ?? endMinute) / rates.waterWalledHabitat).toFixed(2)} times the usual rate).`,
        ]),
  ];
}

/** When a Greenhouse or a growing hall was commissioned, what it earned and what rounds it lost, as lines of text. */
function formatGreenhouse(
  timeline: ReferenceTimeline,
  structureTypeId: string,
  label: string,
): string[] {
  const built = timeline.structureTypesBuilt.find(
    (structure) => structure.structureTypeId === structureTypeId,
  )?.atMinute;
  if (built === undefined) return [`No ${label} was commissioned.`];
  const rounds = timeline.greenhouseRounds.filter(
    (round) => round.structureTypeId === structureTypeId,
  );
  const earned = rounds.filter(({ lostFor }) => lostFor === undefined);
  const lost = (reason: string) =>
    rounds.filter(({ lostFor }) => lostFor === reason).length;
  const science = earned.reduce((total, round) => total + round.science, 0);
  const years = (timeline.endMinute - built) / MINUTES_PER_EARTH_DAY;
  const lunations =
    years /
    (catalogue.lunation.daylightEarthDays + catalogue.lunation.nightEarthDays);
  return [
    `A ${label} was commissioned on Earth Day ${(built / MINUTES_PER_EARTH_DAY).toFixed(1)}. It earned ${science} Science in ${earned.length} rounds, ${(science / lunations).toFixed(0)} a Lunation, and lost ${lost("water")} rounds for want of water, ${lost("power")} for want of power and ${lost("switched-off")} by being switched off.`,
  ];
}

/** What the Greenhouse chain had the guide buy, and when, as lines of text. */
function formatLateBuying(timeline: ReferenceTimeline): string[] {
  const hall = timeline.designsUnlocked.find(
    ({ designId }) => designId === "growing-halls",
  )?.atMinute;
  if (hall === undefined) return [];
  const bought = timeline.structureTypesBuilt.filter(
    ({ atMinute }) => atMinute >= hall,
  );
  const fundingAt = (minute: number) =>
    timeline.looks.find(({ atMinute }) => atMinute >= minute)
      ?.fundingMillionDollars ?? 0;
  const held = (minute: number) => `$${fundingAt(minute).toFixed(0)}M`;
  return [
    `Growing halls was unlocked on Earth Day ${(hall / MINUTES_PER_EARTH_DAY).toFixed(1)}, with ${held(hall)} in hand. The first of each commissioned since:`,
    ...bought.map(
      ({ structureTypeId, atMinute }) =>
        `  ${(atMinute / MINUTES_PER_EARTH_DAY).toFixed(1).padStart(6)}  ${labelOf(catalogue.structureTypes, structureTypeId)}`,
    ),
  ];
}

/** What became of the base's propellant, as lines of text. */
function formatPropellant({
  propellantUse,
  sales,
  structureTypesBuilt,
}: ReferenceTimeline): string[] {
  const sold = sales
    .flatMap((sale) => sale.sold)
    .filter(({ resourceId }) => resourceId === "propellant")
    .reduce((sum, { kilograms }) => sum + kilograms, 0);
  const {
    burnedKilograms,
    takeOffsBurning,
    takeOffs,
    mostBurnedKilograms,
    mostCarriedKilograms,
    highestKilograms,
    limitKilograms,
    minutesWaiting,
  } = propellantUse;
  const tank = structureTypesBuilt.find(
    ({ structureTypeId }) => structureTypeId === "propellant-tank",
  )?.atMinute;
  return [
    ...(tank === undefined
      ? []
      : [
          `A propellant tank was commissioned on Earth Day ${(tank / MINUTES_PER_EARTH_DAY).toFixed(1)}.`,
        ]),
    `Propellant: ${burnedKilograms.toFixed(0)} kg burned, on ${takeOffsBurning} of ${takeOffs} take-offs, the most on one ${mostBurnedKilograms.toFixed(0)} kg, for the most carried, ${mostCarriedKilograms.toFixed(0)} kg; ${sold.toFixed(0)} kg sold. It held at most ${highestKilograms.toFixed(0)} kg, against a limit by the end of ${limitKilograms} kg, and some Plant waited for tank space for ${(minutesWaiting / MINUTES_PER_EARTH_DAY).toFixed(0)} Earth Days.`,
  ];
}

/** The timeline as lines of text, for `npm run long-game`. */
export function formatLongGame(timeline: ReferenceTimeline): string[] {
  const day = (minute: number) =>
    (minute / MINUTES_PER_EARTH_DAY).toFixed(1).padStart(6);
  const { minutesUntilDoseLimit, endMinute } = timeline;
  const limitAt =
    minutesUntilDoseLimit === undefined
      ? undefined
      : endMinute + minutesUntilDoseLimit;
  return [
    ...formatTimeline(timeline, "Long-game play guide"),
    "",
    "Research Tasks, by the Earth Day each was completed:",
    ...timeline.researchTasksCompleted.map(
      ({ researchTaskId, atMinute }) =>
        `  ${day(atMinute)}  ${labelOf(catalogue.researchTasks, researchTaskId)}`,
    ),
    "",
    "Designs, by the Earth Day each was unlocked:",
    ...timeline.designsUnlocked.map(
      ({ designId, atMinute }) =>
        `  ${day(atMinute)}  ${labelOf(catalogue.designs, designId)}`,
    ),
    "",
    ...formatSpares(timeline),
    "",
    ...formatAct2(timeline),
    "",
    ...formatFunding(timeline),
    "",
    ...formatAct4Exports(timeline),
    ...formatPropellant(timeline),
    "",
    ...formatBuriedHabitat(timeline),
    "",
    ...formatGreenhouse(timeline, "greenhouse", "Greenhouse"),
    ...formatGreenhouse(timeline, "growing-hall", "growing hall"),
    ...formatLateBuying(timeline),
    "",
    limitAt === undefined
      ? "Forecast: the Radiation Dose isn't rising, so it never reaches the limit."
      : `Forecast: at the rate it was rising as the play guide ended, the Radiation Dose reaches the limit on Earth Day ${(limitAt / MINUTES_PER_EARTH_DAY).toFixed(0)}.`,
    ...designsNotUsedLines(timeline),
  ];
}

/** What it says of any Designs it never used. */
function designsNotUsedLines(timeline: ReferenceTimeline): string[] {
  const notUsed = designsNotUsed(timeline);
  return notUsed.length > 0
    ? [
        `The play guide says it uses these Designs, but built and sent for nothing of them: ${notUsed.join(", ")}.`,
      ]
    : [];
}

/** What the guide's Exports came to in each Act's stretch of game time, by Export. */
function exportsSoldBetween(
  timeline: ReferenceTimeline,
  fromEarthDay: number,
  toEarthDay: number,
): { kilograms: Map<string, number>; earned: number; trips: number } {
  const kilograms = new Map<string, number>();
  let earned = 0;
  let trips = 0;
  for (const sale of timeline.sales) {
    const earthDay = sale.atMinute / MINUTES_PER_EARTH_DAY;
    if (earthDay < fromEarthDay || earthDay >= toEarthDay) continue;
    earned += sale.earnedMillionDollars;
    trips += 1;
    for (const line of sale.sold) {
      kilograms.set(
        line.resourceId,
        (kilograms.get(line.resourceId) ?? 0) + line.kilograms,
      );
    }
  }
  return { kilograms, earned, trips };
}

/** The Funding every 100 Earth Days, and the lowest and highest in Act 2, as lines of text. */
function formatFunding(timeline: ReferenceTimeline): string[] {
  const at = (earthDay: number) =>
    timeline.looks.find(
      ({ atMinute }) => atMinute >= earthDay * MINUTES_PER_EARTH_DAY,
    )?.fundingMillionDollars;
  const curve: string[] = [];
  for (
    let earthDay = 100;
    earthDay <= LONG_GAME_END_EARTH_DAY;
    earthDay += 100
  ) {
    const funding = at(earthDay);
    if (funding !== undefined) {
      curve.push(`  ${String(earthDay).padStart(6)}  $${funding.toFixed(0)}M`);
    }
  }
  const inAct2 = timeline.looks.filter(({ atMinute }) => {
    const earthDay = atMinute / MINUTES_PER_EARTH_DAY;
    return earthDay >= ACT_2_EARTH_DAY && earthDay < ACT_2_END_EARTH_DAY;
  });
  const lowest = inAct2.reduce(
    (low, look) =>
      look.fundingMillionDollars < low.fundingMillionDollars ? look : low,
    inAct2[0] ?? { atMinute: 0, fundingMillionDollars: 0 },
  );
  const sold = exportsSoldBetween(
    timeline,
    ACT_2_EARTH_DAY,
    ACT_2_END_EARTH_DAY,
  );
  const rate = (name: string) => (sold.kilograms.get(name) ?? 0).toFixed(0);
  return [
    "Funding, every 100 Earth Days:",
    ...curve,
    `In Act 2 (Earth Days ${ACT_2_EARTH_DAY} to ${ACT_2_END_EARTH_DAY}) it was lowest at $${lowest.fundingMillionDollars.toFixed(0)}M on Earth Day ${(lowest.atMinute / MINUTES_PER_EARTH_DAY).toFixed(1)}. Exports earned $${sold.earned.toFixed(0)}M over ${sold.trips} trips: ${rate("circuit-boards")} kg of circuit boards and ${rate("metals")} kg of metals.`,
  ];
}

/** What Act 4's Exports came to, which the water for its precision optics limits. */
function formatAct4Exports(timeline: ReferenceTimeline): string[] {
  const sold = exportsSoldBetween(
    timeline,
    ACT_4_EARTH_DAY,
    LONG_GAME_END_EARTH_DAY,
  );
  const kilograms = [...sold.kilograms]
    .map(([resourceId, amount]) => `${amount.toFixed(0)} kg of ${resourceId}`)
    .join(", ");
  return [
    `In Act 4 (Earth Days ${ACT_4_EARTH_DAY} to ${LONG_GAME_END_EARTH_DAY}), Exports earned $${sold.earned.toFixed(0)}M over ${sold.trips} trips: ${kilograms}.`,
  ];
}

const ACT_2_STRUCTURE_TYPE_IDS: readonly string[] = [
  "workshop",
  "large-extraction-plant",
  "array-works",
  "concentrator-tower",
  "cold-trap-ice-line",
];

/** When each of the Structures Act 2 brings first came. */
function formatAct2(timeline: ReferenceTimeline): string[] {
  const dates = timeline.structureTypesBuilt
    .filter(({ structureTypeId }) =>
      ACT_2_STRUCTURE_TYPE_IDS.includes(structureTypeId),
    )
    .map(
      ({ structureTypeId, atMinute }) =>
        `  ${(atMinute / MINUTES_PER_EARTH_DAY).toFixed(1).padStart(6)}  ${labelOf(catalogue.structureTypes, structureTypeId)}`,
    );
  const missed = act2TargetsMissed(timeline);
  const laterMissed = laterActTargetsMissed(timeline);
  return [
    "Act 2's Structures, by the Earth Day the first of each was commissioned:",
    ...dates,
    ...(missed.length === 0
      ? ["Act 2's pacing targets were all met."]
      : missed.map((target) => `Act 2's pacing target missed: ${target}`)),
    ...(laterMissed.length === 0
      ? ["Act 3's and Act 4's pacing targets were all met."]
      : laterMissed.map(
          (target) => `Later Act's pacing target missed: ${target}`,
        )),
  ];
}

/** The dated pacing targets, in the words that say one was missed. */
const TARGET_WORDS = {
  workshopRunning: `a Workshop running by Earth Day ${act2Targets.workshopRunningBy}.`,
  sparesNeedNoLaunch: `spare Components needing no Launch by Earth Day ${act2Targets.sparesNeedNoLaunchBy}.`,
  metalsSold: `metals sold by Earth Day ${act2Targets.metalsSoldBy}.`,
  designsStillToBuy: `Designs still to buy at Earth Day ${act2Targets.designsStillToBuyAt}.`,
  propellantMade: `propellant made by Earth Day ${laterActTargets.propellantMadeBy}.`,
  returnMassTripled: `Return Mass tripled by Earth Day ${laterActTargets.returnMassTripledBy}.`,
  opticsSold: `precision optics sold by Earth Day ${laterActTargets.opticsSoldBy}.`,
  crewHabitat: `a Large-scale Crew Habitat commissioned by Earth Day ${laterActTargets.crewHabitatBy}.`,
  act2Research: `research lasting until about Earth Day ${act2Targets.researchLastsUntilAbout}`,
  act3Research: `Act 3's research lasting until about Earth Day ${laterActTargets.act3ResearchUntilAbout}`,
  act4Research: `Act 4's research lasting until about Earth Day ${laterActTargets.act4ResearchUntilAbout}`,
} as const;

/**
 * Gives up on the Campaign as soon as a dated pacing target can no longer be met,
 * as playing on to the end would take many minutes to say no more than that. It
 * only reads the snapshot, so the play goes as it would without it, and it gives
 * up only on what the end would fail: `act2TargetsMissed` and
 * `laterActTargetsMissed`, or, for an Act's research still unfinished past its
 * date and never finished, `checkEverythingResearched`. That spare Components
 * never run out, and what Launches' profit buys, have no date, so they wait for the end.
 */
export function giveUpOnMissedTargets(): (play: Play) => void {
  const byEarthDay = (earthDays: number) => earthDays * MINUTES_PER_EARTH_DAY;
  const milestones = [
    {
      milestoneId: "workshop-running",
      by: act2Targets.workshopRunningBy,
      words: TARGET_WORDS.workshopRunning,
    },
    {
      milestoneId: "spare-components-self-sufficient",
      by: act2Targets.sparesNeedNoLaunchBy,
      words: TARGET_WORDS.sparesNeedNoLaunch,
    },
    {
      milestoneId: "metals-sold",
      by: act2Targets.metalsSoldBy,
      words: TARGET_WORDS.metalsSold,
    },
    {
      milestoneId: "first-propellant",
      by: laterActTargets.propellantMadeBy,
      words: TARGET_WORDS.propellantMade,
    },
    {
      milestoneId: "return-mass-tripled",
      by: laterActTargets.returnMassTripledBy,
      words: TARGET_WORDS.returnMassTripled,
    },
    {
      milestoneId: "precision-optics-sold",
      by: laterActTargets.opticsSoldBy,
      words: TARGET_WORDS.opticsSold,
    },
    {
      milestoneId: "crew-habitat-commissioned",
      by: laterActTargets.crewHabitatBy,
      words: TARGET_WORDS.crewHabitat,
    },
  ];
  const research = [
    {
      act: 2,
      until: act2Targets.researchLastsUntilAbout,
      within: act2Targets.researchWithin,
      words: TARGET_WORDS.act2Research,
    },
    {
      act: 3,
      until: laterActTargets.act3ResearchUntilAbout,
      within: laterActTargets.researchWithin,
      words: TARGET_WORDS.act3Research,
    },
    {
      act: 4,
      until: laterActTargets.act4ResearchUntilAbout,
      within: laterActTargets.researchWithin,
      words: TARGET_WORDS.act4Research,
    },
  ].map((target) => ({
    ...target,
    taskIds: catalogueUpToAct(catalogue, target.act).researchTasks.map(
      ({ id }) => id,
    ),
  }));
  const act2DesignIds = catalogueUpToAct(catalogue, 2).designs.map(
    ({ id }) => id,
  );
  return ({ state }) => {
    const now = state.clock.elapsedMinutes;
    const { lander, launchManifest } = state;
    const missed = [
      ...milestones
        .filter(
          ({ milestoneId, by }) =>
            now > byEarthDay(by) &&
            !state.milestones.reachedIds.includes(milestoneId),
        )
        .map(({ words }) => words),
      ...(lander.state === "travelling-to-earth" &&
      (lander.legStartedAtMinute ?? 0) >
        byEarthDay(act2Targets.sparesNeedNoLaunchBy) &&
      launchManifest.items.some(
        ({ itemId }) => itemId === catalogue.maintenance.spareComponentId,
      )
        ? [TARGET_WORDS.sparesNeedNoLaunch]
        : []),
      // The timeline dates an unlocked Design by the next look after it.
      ...(now + LOOK_EVERY_MINUTES <=
        byEarthDay(act2Targets.designsStillToBuyAt) &&
      act2DesignIds.every((id) => state.unlockedDesignIds.includes(id))
        ? [TARGET_WORDS.designsStillToBuy]
        : []),
      ...research.flatMap(({ taskIds, until, within, words }) => {
        const done = taskIds.every((id) =>
          state.completedResearchTaskIds.includes(id),
        );
        if (done && now < byEarthDay(until - within)) {
          return [`${words} (it has ended already).`];
        }
        return !done && now > byEarthDay(until + within)
          ? [`${words} (it hasn't ended).`]
          : [];
      }),
    ];
    if (missed.length > 0) {
      throw new Error(
        `On Earth Day ${(now / MINUTES_PER_EARTH_DAY).toFixed(1)} a pacing target can no longer be met: ${[...new Set(missed)].join(" ")}`,
      );
    }
  };
}

/** Which of Act 2's pacing targets the guide missed, in words. */
export function act2TargetsMissed(timeline: ReferenceTimeline): string[] {
  const reachedOn = (milestoneId: string) => {
    const reached = timeline.milestones.find(
      (milestone) => milestone.milestoneId === milestoneId,
    );
    return reached === undefined
      ? Infinity
      : reached.atMinute / MINUTES_PER_EARTH_DAY;
  };
  const {
    workshopRunningBy,
    sparesNeedNoLaunchBy,
    designsStillToBuyAt,
    researchLastsUntilAbout,
    researchWithin,
    launchesToBuyEverything,
    metalsSoldBy,
  } = act2Targets;
  const lastSpares = Math.max(
    0,
    ...timeline.sparesShipped.map(({ atMinute }) => atMinute),
  );
  const upToAct2 = catalogueUpToAct(catalogue, 2);
  const lastResearch =
    Math.max(
      0,
      ...timeline.researchTasksCompleted
        .filter(({ researchTaskId }) =>
          upToAct2.researchTasks.some(({ id }) => id === researchTaskId),
        )
        .map(({ atMinute }) => atMinute),
    ) / MINUTES_PER_EARTH_DAY;
  const lastDesign =
    Math.max(
      0,
      ...timeline.designsUnlocked
        .filter(({ designId }) =>
          upToAct2.designs.some(({ id }) => id === designId),
        )
        .map(({ atMinute }) => atMinute),
    ) / MINUTES_PER_EARTH_DAY;
  const built = timeline.structureTypesBuilt.find(
    ({ structureTypeId }) => structureTypeId === "workshop",
  )?.atMinute;
  const fewestSpares = Math.min(
    Infinity,
    ...timeline.sparesInStock
      .filter(({ atMinute }) => built !== undefined && atMinute > built)
      .map(({ fewest }) => fewest),
  );
  const launches = launchesToBuyOneOfEverything();
  return [
    ...(reachedOn("workshop-running") <= workshopRunningBy
      ? []
      : [TARGET_WORDS.workshopRunning]),
    ...(reachedOn("spare-components-self-sufficient") <= sparesNeedNoLaunchBy &&
    lastSpares <= sparesNeedNoLaunchBy * MINUTES_PER_EARTH_DAY
      ? []
      : [TARGET_WORDS.sparesNeedNoLaunch]),
    ...(reachedOn("metals-sold") <= metalsSoldBy
      ? []
      : [TARGET_WORDS.metalsSold]),
    ...(lastDesign > designsStillToBuyAt
      ? []
      : [TARGET_WORDS.designsStillToBuy]),
    ...(Math.abs(lastResearch - researchLastsUntilAbout) <= researchWithin
      ? []
      : [
          `${TARGET_WORDS.act2Research} (it ended on ${lastResearch.toFixed(0)}).`,
        ]),
    ...(fewestSpares > 0 ? [] : ["spare Components never running out."]),
    ...(launches !== undefined && launches >= launchesToBuyEverything
      ? []
      : [
          `one of every Launch item taking at least ${launchesToBuyEverything} Launches' profit (it takes ${launches ?? "no number of"}).`,
        ]),
  ];
}

/** Which of Act 3's and Act 4's pacing targets the guide missed, in words. */
export function laterActTargetsMissed(timeline: ReferenceTimeline): string[] {
  const reachedOn = (milestoneId: string) => {
    const reached = timeline.milestones.find(
      (milestone) => milestone.milestoneId === milestoneId,
    );
    return reached === undefined
      ? Infinity
      : reached.atMinute / MINUTES_PER_EARTH_DAY;
  };
  const researchEnded = (act: number) =>
    Math.max(
      0,
      ...timeline.researchTasksCompleted
        .filter(({ researchTaskId }) =>
          catalogueUpToAct(catalogue, act).researchTasks.some(
            ({ id }) => id === researchTaskId,
          ),
        )
        .map(({ atMinute }) => atMinute),
    ) / MINUTES_PER_EARTH_DAY;
  const {
    propellantMadeBy,
    returnMassTripledBy,
    act3ResearchUntilAbout,
    act4ResearchUntilAbout,
    researchWithin,
    opticsSoldBy,
    crewHabitatBy,
  } = laterActTargets;
  const near = (earthDay: number, target: number) =>
    Math.abs(earthDay - target) <= researchWithin;
  return [
    ...(reachedOn("first-propellant") <= propellantMadeBy
      ? []
      : [TARGET_WORDS.propellantMade]),
    ...(reachedOn("return-mass-tripled") <= returnMassTripledBy
      ? []
      : [TARGET_WORDS.returnMassTripled]),
    ...(reachedOn("precision-optics-sold") <= opticsSoldBy
      ? []
      : [TARGET_WORDS.opticsSold]),
    ...(reachedOn("crew-habitat-commissioned") <= crewHabitatBy
      ? []
      : [TARGET_WORDS.crewHabitat]),
    ...(near(researchEnded(3), act3ResearchUntilAbout)
      ? []
      : [
          `${TARGET_WORDS.act3Research} (it ended on ${researchEnded(3).toFixed(0)}).`,
        ]),
    ...(near(researchEnded(4), act4ResearchUntilAbout)
      ? []
      : [
          `${TARGET_WORDS.act4Research} (it ended on ${researchEnded(4).toFixed(0)}).`,
        ]),
  ];
}

/** How many Launches' profit, of the Export that makes the most, one of every Launch item takes. */
function launchesToBuyOneOfEverything(): number | undefined {
  const { exports: sold } = exportEconomics(catalogueUpToAct(catalogue, 2));
  return [...sold].sort(
    (a, b) => b.profitMillionDollars - a.profitMillionDollars,
  )[0]?.launchesToBuyEverything;
}

/** Whether the Mission Director moved into a Buried Habitat by the Act's target. */
function movedInByTheTarget(timeline: ReferenceTimeline): boolean {
  return timeline.moves.some(
    ({ atMinute, structureTypeId }) =>
      structureTypeId === "buried-habitat" &&
      atMinute <=
        toGameMinutes({ earthDays: BURIED_HABITAT_MOVED_IN_BY_EARTH_DAY }),
  );
}

/**
 * Why the long game didn't go as it should, if it didn't. It should go to the
 * end with the Mission Director alive, having moved in by the Act's target and
 * met Act 2's. Alive at the end, their Radiation Dose's limit is still ahead.
 */
export function longGameFailures(timeline: ReferenceTimeline): string[] {
  return [
    ...(timeline.failure === undefined
      ? []
      : [`It gave up: ${timeline.failure}`]),
    ...(timeline.ended === undefined
      ? []
      : [`The Mission Director died: ${timeline.ended.cause.kind}.`]),
    ...designsNotUsedLines(timeline),
    ...(movedInByTheTarget(timeline)
      ? []
      : [
          `The Mission Director hadn't moved into a Buried Habitat by Earth Day ${BURIED_HABITAT_MOVED_IN_BY_EARTH_DAY}.`,
        ]),
    ...[...act2TargetsMissed(timeline), ...laterActTargetsMissed(timeline)].map(
      (target) => `Missed: ${target}`,
    ),
  ];
}

/** Whether the long game went as it should, so that the command can fail if it didn't. */
export function longGameSucceeded(timeline: ReferenceTimeline): boolean {
  return longGameFailures(timeline).length === 0;
}

/**
 * The play as Markdown, for the summary of a CI run: whether it passed and why
 * not at the top, where a reader of the run sees them, then the whole timeline.
 */
export function formatLongGameReport(
  timeline: ReferenceTimeline,
  minutes: number,
): string[] {
  const failures = longGameFailures(timeline);
  return [
    `## The long game ${failures.length === 0 ? "passed" : "failed"}`,
    "",
    ...failures.map((failure) => `- ${failure}`),
    ...(failures.length === 0 ? [] : [""]),
    `Played in ${minutes.toFixed(1)} minutes.`,
    "",
    "```text",
    ...formatLongGame(timeline),
    "```",
  ];
}
