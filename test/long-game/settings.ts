// The long-game play guide's settings: the Earth Days it works to, the stock it
// keeps and the sites it builds on. It imports nothing of the guide's own, so
// that the other modules can read these as they load.
import { toGameMinutes } from "../scenario";

/**
 * The Earth Day the long-game play guide ends: the end of the last Act, the
 * length the Campaign's content is meant to last, which a Buried Habitat lets
 * the Mission Director live to.
 */
export const LONG_GAME_END_EARTH_DAY = 3000;

/** The most the last step waits for the Campaign to get there, as it does nothing else. */
export const LONGEST_PLAY_ON = { earthDays: LONG_GAME_END_EARTH_DAY };

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
  "continuous-excavation",
  "precision-optics",
  "optics-grinding-line",
  "growing-halls",
  "vault-cistern",
  "crew-habitats",
  "automated-experiments",
  "infrared-astronomy",
  "radio-astronomy",
];

/**
 * How long one purchase may wait for its Funding, Components or site, or stand
 * planned, before the guide gives up. A purchase waited at most 22 Earth Days as
 * the guide played, up to Earth Day 2,400, and past that
 * docs/balancing-history.md has a vault cistern commissioned 40 after its
 * Design. Waiting for Science doesn't count.
 */
export const PURCHASE_STALL_EARTH_DAYS = 300;

/** The Earth Day Act 2 is meant to last until. */
export const ACT_2_END_EARTH_DAY = 900;

/** The Earth Day Act 4 opens. */
export const ACT_4_EARTH_DAY = 1400;

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
  /**
   * With the late science built and supplied (ADR-0009): the automated
   * experiments lab speeds up the Research Tasks, and a base that builds none
   * still finishes on about Earth Day 3,000, as the pacing report shows.
   */
  act4ResearchUntilAbout: 2300,
  researchWithin: 50,
  /** Act 4's is the player's to shorten, so it may be two Lunations either way. */
  act4ResearchWithin: 60,
  opticsSoldBy: 2000,
  /** What the Campaign builds towards, its last Milestone, by the end of its content. */
  crewHabitatBy: LONG_GAME_END_EARTH_DAY,
} as const;

/** What the guide keeps in stock: it switches the Workshop off above this many, and back on below it. */
export const SPARES_HELD = 40;

/** The Earth Day the guide sends for storage tanks: once it is selling precision optics. */
export const TANKS_EARTH_DAY = 1750;

/**
 * The Earth Day the guide turns to its Greenhouse and the water it drinks: once
 * the Mission Director has moved into a Buried Habitat, which Funding goes to first.
 */
export const GREENHOUSE_EARTH_DAY = 1600;

/** The water ice the guide wants in stock for its Plants, below which the Rover goes for more. */
export const ICE_HELD_KILOGRAMS = 600;

/**
 * The water below which the guide holds its optics back, so that a Greenhouse has
 * a Night's water at dusk: 228 kg for it, 33 kg for the Mission Director and their
 * reserve of 49 kg, with a little over.
 */
export const WATER_FOR_THE_NIGHT_KILOGRAMS = 320;

/** The water above which it lets them run again. */
export const WATER_TO_SPARE_KILOGRAMS = 360;

/**
 * With a growing hall as well, what it takes through a Night comes on top: 456 kg,
 * with a little over.
 */
export const WATER_FOR_THE_NIGHT_WITH_A_HALL_KILOGRAMS = 800;

/**
 * With an automated experiments lab running as well, what it takes through a
 * Night comes on top of either: 114 kg, with a little over.
 */
export const WATER_FOR_THE_LAB_AT_NIGHT_KILOGRAMS = 120;

/** What the guide lets the water rise to before filling a vault cistern: its 2,000 kg, the reserve and a little over. */
export const WATER_FOR_THE_CISTERN_KILOGRAMS = 2200;

/**
 * What the guide lets the water rise to before a Large-scale Crew Habitat is stocked,
 * once it is planned: its 2,500 kg, the reserve and a little over.
 */
export const WATER_FOR_THE_CREW_HABITAT_KILOGRAMS = 2700;

/**
 * The oxygen the guide has its large extraction plant make, in place of metals and
 * silicon, once it has the tanks to hold what a Large-scale Crew Habitat is stocked
 * with: its 600 kg, the reserve and a little over.
 */
export const OXYGEN_FOR_THE_CREW_HABITAT_KILOGRAMS = 630;

/** Where the guide builds a Large-scale Crew Habitat, south of the rest of the base. */
export const CREW_HABITAT_SITE = { x: 80, y: -116 } as const;

/**
 * The Earth Day the guide sends for a Buried Habitat, in good time to move in by
 * Act 3's target of Earth Day 1,000: three Launches at a trip every 15 Earth
 * Days or so, then about 9 Earth Days to build it in the Daylight after the
 * last. Behind a water wall the limit comes around Earth Day 1,100 (#338).
 */
export const BURIED_HABITAT_EARTH_DAY = 880;

/** The latest Earth Day the guide should be moved in by, Act 3's target. */
export const BURIED_HABITAT_MOVED_IN_BY_EARTH_DAY = 1000;

/** Where a Buried Habitat stands: north of the old Habitat. */
export const BURIED_HABITAT_SITE = { x: 46, y: 8 } as const;

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
export const DAYLIGHT_TO_BUILD_AND_MOVE = { earthDays: 16 };

export const MINUTES_PER_EARTH_DAY = toGameMinutes({ earthDays: 1 });
