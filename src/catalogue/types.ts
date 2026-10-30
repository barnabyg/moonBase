/**
 * The data catalogue: all game content and tuning numbers live here, so that
 * balancing never needs a code change. Distances are in metres and positions
 * are on the ground plane, with the origin at the centre of the base map, x
 * pointing east and y pointing north.
 */
export interface Catalogue {
  /** Bumped whenever the shape or meaning of the catalogue changes. */
  readonly version: number;
  readonly map: MapSize;
  readonly lander: {
    /** Radius of the ground the landed Lander stands on. */
    readonly footprintRadiusMetres: number;
    /**
     * How long each leg of the Lander's round trip takes: flying to Earth,
     * turnaround there, and flying back to land at the base. Each must come
     * to a whole number of game-minutes.
     */
    readonly roundTripEarthDays: {
      readonly toEarth: number;
      readonly turnaround: number;
      readonly toMoon: number;
    };
    /**
     * The Robot's working time to carry the Lander's cargo off it when it
     * lands on a landing pad, in game-hours: split evenly between loading
     * at the Lander and unloading at the stockpile. Walking comes on top.
     */
    readonly cargoHandlingHours: number;
    /**
     * The Robot's working time to carry the Exports to load from the
     * stockpile to the Lander when it stands on a landing pad, in
     * game-hours: split evenly between loading at the stockpile and putting
     * them aboard the Lander. Walking comes on top.
     */
    readonly exportHandlingHours: number;
    /**
     * The most mass of Exports the Lander can carry off the Moon each time
     * it leaves. It is fixed for now: making propellant at the base, which
     * will raise it, isn't in the game yet.
     */
    readonly returnMassKilograms: number;
  };
  /**
   * The base's stock of Components, kept on the ground beside the landing
   * site. It belongs to the base, not the Lander, and stays when the Lander
   * leaves.
   */
  readonly stockpile: {
    /** Radius of the ground the stockpile stands on; Structures may not be placed over it. */
    readonly footprintRadiusMetres: number;
    /**
     * The heap the excavator tips the base's Regolith onto, outside the
     * stockpile's footprint: a cone of loose Regolith that grows and shrinks
     * with the stock.
     */
    readonly regolithHeap: {
      /** How much loose, dug Regolith weighs, in kilograms a cubic metre. */
      readonly bulkDensityKilogramsPerCubicMetre: number;
      /** The slope it settles at when tipped: its angle of repose. */
      readonly slopeDegrees: number;
      /**
       * How many times wider and higher it is drawn than a cone of that
       * density would be, so that a full stock shows larger than the mat.
       * What digs and stands beside it keeps clear of the size it is drawn at,
       * but how much the base digs and stockpiles doesn't change.
       */
      readonly drawnLargerBy: number;
      /** The smallest heap there is while any Regolith is in stock, so that a few kilograms still show. */
      readonly smallestRadiusMetres: number;
      /** How far outside the stockpile's footprint the foot of a full heap comes. */
      readonly gapFromFootprintMetres: number;
    };
    /**
     * The insulated containers beside the stockpile that show the base's
     * water ice. They only show it: the stock itself has no limit.
     */
    readonly iceStore: {
      /** How many containers there are, which is as much ice as it can show. */
      readonly containers: number;
      readonly kilogramsPerContainer: number;
      /** The smallest level a container with any ice shows, so that a little ice still shows. */
      readonly smallestLevel: number;
      /** Radius of the ground the containers stand on. */
      readonly radiusMetres: number;
      /** How far outside the stockpile's footprint that ground comes. */
      readonly gapFromFootprintMetres: number;
    };
  };
  /**
   * Where the Lander has touched down, and the base's stockpile, Robots,
   * Rovers and Machines stand, when a Campaign begins.
   */
  readonly landingSite: {
    readonly landerPosition: GroundPosition;
    readonly stockpilePosition: GroundPosition;
    readonly robotPositions: readonly GroundPosition[];
    readonly roverPositions: readonly GroundPosition[];
    readonly machines: readonly {
      readonly machineTypeId: string;
      readonly position: GroundPosition;
    }[];
  };
  /** The game speeds the player can choose between, in the order they are offered. */
  readonly gameSpeeds: readonly GameSpeed[];
  readonly lunation: LunationSchedule;
  readonly robot: {
    /** A sentence on what a Robot does, for the Guide screen. */
    readonly description: string;
    /** How far a Robot walks in a game-hour. */
    readonly walkingSpeedMetresPerHour: number;
    /** How far outside a footprint, or beside the stockpile, a Robot stands to work. */
    readonly workingGapMetres: number;
    /** How much power cable a Robot lays in a game-hour, walking along as it pays it out. */
    readonly cableLayingSpeedMetresPerHour: number;
    /**
     * How much Condition Dust wears off a Robot for each game-hour it does
     * anything but stand idle, in percentage points.
     */
    readonly dustWearPercentPerHour: number;
    /** How fast a Robot walks and works as its Condition falls. */
    readonly performance: PerformanceCurve;
    /**
     * Below this Condition, in percent, a Robot stops what it is doing to
     * repair itself where the Mission Director lives.
     */
    readonly selfRepairThresholdPercent: number;
    /**
     * The Robot's working time to repair itself, in game-hours, once it is
     * there with any spare Components. Must come to a whole number of
     * game-minutes.
     */
    readonly selfRepairHours: number;
    /**
     * The Condition, in percent, a makeshift repair brings a Robot back to
     * when there are too few spare Components for a full one.
     */
    readonly makeshiftRepairPercent: number;
    /** A Robot's Condition never falls below this, in percent, so that it is never Broken. */
    readonly conditionFloorPercent: number;
    /**
     * How long a Robot a Launch brings takes to climb down from the Lander
     * once it has landed, before it walks to the stockpile, in game-hours.
     * Must come to a whole number of game-minutes.
     */
    readonly climbingDownHours: number;
  };
  readonly machineTypes: readonly MachineType[];
  readonly rover: RoverType;
  readonly expeditions: ExpeditionRules;
  /**
   * The bulk resources the base keeps a stock of at the stockpile, measured
   * in kilograms, in the order the status panel shows them.
   */
  readonly bulkResources: readonly BulkResource[];
  /**
   * The bulk resources the base can sell off the Moon for Funding, in the
   * order the Launch manifest screen shows them.
   */
  readonly exports: readonly Export[];
  readonly digging: DiggingRules;
  readonly componentTypes: readonly ComponentType[];
  /** The Structures that can be planned, in the order the build menu offers them. */
  readonly structureTypes: readonly StructureType[];
  /**
   * The share, from 0 to 1, of a dismantled Structure's Components that are
   * damaged beyond reuse, rounded to the nearest whole Component.
   */
  readonly dismantlingLossShare: number;
  /** The Components in the base's stock, which the Lander brought, when a Campaign begins. */
  readonly startingStock: readonly ComponentCount[];
  /**
   * What the Mission Director needs to stay alive, in the order the status
   * panel shows them. Running out of any of them kills the Mission Director
   * at once.
   */
  readonly lifeSupportStocks: readonly LifeSupportStock[];
  readonly selfSufficiency: SelfSufficiencyRules;
  /**
   * A warning comes as the time until the Habitat the Mission Director lives
   * in loses power falls to each of these many game-hours, largest first.
   * Each must come to a whole number of game-minutes. The Habitat is supplied
   * before anything else on its power network, and losing its power kills
   * the Mission Director at once.
   */
  readonly habitatPowerWarningHoursLeft: readonly number[];
  /**
   * A light switches itself off, and a Plant stands idle, at Night once its
   * power network's stored energy, less what it draws, would no longer
   * carry everything else on the network through the rest of the Night and
   * this many game-hours more, so that neither ever leaves anything else
   * without power. Must come to a whole number of game-minutes, and be more
   * than 0.
   */
  readonly nightReserveHours: number;
  readonly radiation: RadiationRules;
  readonly solarParticleEvents: SolarParticleEventRules;
  /**
   * The fixed lump of Funding the Mission Director starts the Campaign with,
   * the only money there is until Exports earn more.
   */
  readonly programmeGrantMillionDollars: number;
  readonly launch: LaunchRules;
  /**
   * The Research Tasks the base can carry out to earn Science, in the order
   * the Research Tasks screen lists them. Each can be completed only once.
   */
  readonly researchTasks: readonly ResearchTask[];
  /**
   * The standing Research Task the base's telescopes work on together, a
   * round at a time, for as long as the base has one.
   */
  readonly observingProgramme: ObservingProgramme;
  /** The categories of the Tech Tree, in the order the Tech Tree screen shows them. */
  readonly designCategories: readonly {
    readonly id: DesignCategory;
    readonly label: string;
  }[];
  /**
   * The Tech Tree: every Design, in the order the Tech Tree screen lists
   * them within their category. The starting ones are unlocked when a
   * Campaign begins; the rest are unlocked with Science.
   */
  readonly designs: readonly Design[];
  readonly plumeEjecta: PlumeEjectaRules;
  readonly maintenance: MaintenanceRules;
  /**
   * How well a solar array generates, a battery bank stores and a Light
   * Mast lights as its Condition falls. Other Structures either work or
   * are Broken.
   */
  readonly structurePerformance: PerformanceCurve;
  readonly dustCoating: DustCoatingRules;
  /**
   * How fast a Machine works and drives as its Condition falls; once it is
   * Broken, it stops.
   */
  readonly machinePerformance: PerformanceCurve;
  readonly cold: ColdRules;
  readonly micrometeorites: MicrometeoriteRules;
  /**
   * A warning comes as the time until the base's spare Components run out,
   * at the current rate of wear, falls to each of these many Earth Days,
   * largest first. Each must come to a whole number of game-minutes.
   */
  readonly spareComponentWarningEarthDaysLeft: readonly number[];
  /**
   * The status panel marks a falling bulk resource as needing attention once
   * it will run out within this many Earth Days. It only changes what the
   * panel shows: no notification comes, and nothing in the game depends on it.
   */
  readonly bulkResourceWarningEarthDaysLeft: number;
  /**
   * The Milestones, in the order the status panel offers them.
   * They are guidance only: they carry no rewards and never end the
   * Campaign.
   */
  readonly milestones: readonly Milestone[];
}

/**
 * A named achievement that marks progress through the Campaign. It is
 * reached the first time its condition holds, whatever the order, and stays
 * reached even if the condition later stops holding.
 */
export interface Milestone {
  readonly id: string;
  readonly label: string;
  /** One line telling a new player what to do next to reach it. */
  readonly hint: string;
  readonly condition: MilestoneCondition;
}

/**
 * What reaches a Milestone. Some conditions are read from the state as it
 * stands; others are moments the state doesn't keep afterwards, noticed as
 * they happen.
 */
export type MilestoneCondition =
  /** A Structure that stores power, such as a battery bank, is commissioned. */
  | { readonly kind: "power-storage-commissioned" }
  /** The Mission Director has moved into a Habitat. */
  | { readonly kind: "mission-director-moved-in" }
  /** The Lander takes off for Earth. */
  | { readonly kind: "lander-took-off" }
  /** The Habitat the Mission Director lives in is shielded. */
  | { readonly kind: "habitat-shielded" }
  /** A landing pad is commissioned. */
  | { readonly kind: "landing-pad-commissioned" }
  /** A Research Task has been completed. */
  | { readonly kind: "research-task-completed" }
  /** Exports are sold, as the Lander reaches Earth with some aboard. */
  | { readonly kind: "export-sold" }
  /**
   * The base is self-sufficient in a life support stock, as the status
   * panel judges it.
   */
  | { readonly kind: "self-sufficient"; readonly stockId: string };

/**
 * Micrometeorite strikes, which the Campaign's seeded generator schedules
 * at random, one at a time, each hitting one commissioned Structure,
 * Machine or Robot without warning.
 */
export interface MicrometeoriteRules {
  /**
   * The time from the start of the Campaign, or from one strike, to the
   * next, drawn evenly between these, to the game-minute.
   */
  readonly earthDaysBetween: { readonly min: number; readonly max: number };
  /**
   * The Condition a strike takes off what it hits, in percentage points,
   * drawn evenly between these; a Structure loses its type's share of it.
   */
  readonly conditionLossPercent: { readonly min: number; readonly max: number };
}

/**
 * Dust settling on solar arrays, which cuts their output until the Robot
 * cleans it off as Maintenance.
 */
export interface DustCoatingRules {
  /**
   * How much a solar array's coating builds up in each game-hour of
   * Daylight, in percentage points, before its type's share of it.
   */
  readonly percentPerDaylightHour: number;
  /**
   * The share of a solar array's output a full coating takes away, from 0
   * to 1; a partial coating takes away its share of that.
   */
  readonly outputLossAtFullCoating: number;
  /** A Maintenance Work Order is raised once the coating passes this, in percent. */
  readonly cleaningThresholdPercent: number;
  /**
   * The Robot's working time to clean it, in game-hours, on top of any
   * restoring of Condition on the same visit. It uses no spare Components.
   */
  readonly cleaningHours: number;
}

/**
 * How well something works as its Condition falls: fully at or above the
 * threshold, and below it at its Condition's share of the threshold raised
 * to the exponent, down to nothing once it is Broken.
 */
export interface PerformanceCurve {
  /** In percent of Condition. */
  readonly thresholdPercent: number;
  /** 1 falls in a straight line; more falls faster at first, less slower. */
  readonly exponent: number;
}

/**
 * Maintenance: the Work Orders that restore the Condition of what has worn
 * down, using up spare Components. Each must come to a whole number of
 * game-minutes.
 */
export interface MaintenanceRules {
  /**
   * A Maintenance Work Order is raised for a commissioned Structure or a
   * Machine once its Condition falls below this, in percent, as it always
   * is once Broken.
   */
  readonly thresholdPercent: number;
  /** The Component that Maintenance uses up. */
  readonly spareComponentId: string;
  /**
   * How much Condition each spare Component restores, in percentage points.
   * Maintenance uses one for each of these, or part of one, that the
   * Condition has fallen from 100% as the Robot loads them.
   */
  readonly conditionPercentPerSpareComponent: number;
  /** The Robot's working time to load the spare Components at the stockpile, in game-hours. */
  readonly loadingHours: number;
  /**
   * The Robot's working time at what it maintains, in game-hours, after
   * which its Condition is back to 100%. Walking comes on top.
   */
  readonly workHours: number;
}

/**
 * The dust and rock a landing or departing Lander blasts out over the
 * ground, which wears down the Condition of every Structure near it.
 */
export interface PlumeEjectaRules {
  /**
   * How far from the Lander's centre it reaches. A Structure with any of its
   * footprint inside is worn down.
   */
  readonly radiusMetres: number;
  /**
   * How much Condition each Structure within reach loses at every take-off
   * and landing, in percentage points of the 100% it starts with, before
   * its type's share of it.
   */
  readonly conditionLossPercent: number;
}

/** What a Launch of the Lander from Earth can bring, and what it costs. */
export interface LaunchRules {
  /** The most mass one Launch can carry. */
  readonly payloadMassLimitKilograms: number;
  /** What every Launch costs on top of the price of what it brings. */
  readonly feeMillionDollars: number;
  /** Everything a Launch can bring, in the order the Launch manifest screen lists it. */
  readonly items: readonly LaunchItem[];
}

/** Something a Launch can bring from Earth, as many times over as the player chooses. */
export interface LaunchItem {
  readonly id: string;
  /** The Design it belongs to. */
  readonly designId: string;
  /**
   * What one of it brings: a Component, a set amount of oxygen or water, or
   * a Robot, which climbs down from the Lander as it lands and joins the
   * others at work. A Robot isn't a Component, so it never joins the base's
   * stock.
   */
  readonly brings:
    | { readonly kind: "component"; readonly componentId: string }
    | {
        readonly kind: "life-support";
        readonly stockId: string;
        readonly kilograms: number;
      }
    | { readonly kind: "robot" };
  /** Its mass, packing and any tank included, which counts towards the Payload Mass. */
  readonly massKilograms: number;
  readonly priceMillionDollars: number;
}

/**
 * A piece of scientific work carried out at the base, which earns Science
 * once it is complete. It needs no Robot, power or Components, only game
 * time.
 */
export interface ResearchTask {
  readonly id: string;
  readonly label: string;
  /** How long it runs. Must come to a whole number of game-minutes. */
  readonly lengthHours: number;
  /** The Science it earns when it is complete, a whole amount. */
  readonly science: number;
  /**
   * The Design that must be unlocked before it is offered, if any; without
   * one, it is available from the start.
   */
  readonly requiresDesignId?: string;
}

/**
 * A standing Research Task: an observing programme that the base's
 * telescopes carry out at Night, a round at a time. Each round earns its
 * Science as it is completed, and the next starts straight after, so,
 * unlike any other Research Task, it is never completed for good and runs
 * alongside the one the player has started. A telescope observes only
 * while it is commissioned, powered and not Broken, and only at Night;
 * each one observing adds its performance's share of a game-minute to the
 * round every game-minute, so two at full performance get through a round
 * twice as fast.
 */
export interface ObservingProgramme {
  readonly label: string;
  /**
   * How long one telescope at full performance takes to observe a round, in
   * game-hours of Night. Must come to a whole number of game-minutes.
   */
  readonly lengthHours: number;
  /** The Science each round earns as it is completed, a whole amount. */
  readonly science: number;
}

/** The six categories the Tech Tree's Designs fall into. */
export type DesignCategory =
  | "power"
  | "construction"
  | "protection"
  | "life-support"
  | "industry"
  | "mobility";

/**
 * A Design in the Tech Tree: permission to have the Structure types and
 * Launch items that name it, unlocked with Science once the Designs it
 * needs first are.
 * Unlocking one never creates anything on the base.
 */
export interface Design {
  readonly id: string;
  readonly label: string;
  /** A sentence on what it is, for the Tech Tree screen. */
  readonly description: string;
  readonly category: DesignCategory;
  /**
   * Whether it is unlocked when a Campaign begins, as everything in the game
   * before the Tech Tree was. A starting Design needs nothing first and costs
   * nothing.
   */
  readonly starting: boolean;
  /** The Science it takes to unlock, a whole amount. */
  readonly scienceCost: number;
  /** The Designs that must be unlocked before it can be. */
  readonly prerequisiteDesignIds: readonly string[];
}

/**
 * Solar Particle Events, which the Campaign's seeded generator schedules at
 * random, one at a time. Every length must come to a whole number of
 * game-minutes.
 */
export interface SolarParticleEventRules {
  /**
   * The time from the start of the Campaign, or from the end of one event,
   * to the start of the next, drawn evenly between these, to the
   * game-minute. The shortest must be longer than the warning.
   */
  readonly earthDaysBetween: { readonly min: number; readonly max: number };
  /** How long an event lasts, drawn evenly between these, to the game-minute. */
  readonly durationHours: { readonly min: number; readonly max: number };
  /** How long before an event starts its warning comes. */
  readonly warningHours: number;
  /** How many times the usual dose rate where the Mission Director lives an event gives them. */
  readonly doseRateMultiplier: number;
}

/**
 * The Radiation Dose the Mission Director absorbs. It builds up at a rate
 * that depends on where they live, and reaching the limit kills them at once.
 */
export interface RadiationRules {
  /** The dose rate where the Mission Director lives. */
  readonly doseRateMillisievertsPerEarthDay: {
    /** Aboard the Lander, which keeps them safe: zero. */
    readonly lander: number;
    /** In a Habitat with no shielding over it. */
    readonly habitat: number;
    /** In a Habitat with commissioned Regolith shielding over it. */
    readonly shieldedHabitat: number;
    /**
     * In a Habitat with a commissioned water wall over its commissioned
     * Regolith shielding, none of them Broken.
     */
    readonly waterWalledHabitat: number;
  };
  readonly doseLimitMillisieverts: number;
  /**
   * A warning comes as the time until the dose reaches the limit, at the
   * rate it is rising, falls to each of these many Earth Days, largest
   * first. Each must come to a whole number of game-minutes.
   */
  readonly warningEarthDaysLeft: readonly number[];
}

/**
 * A stock the Mission Director uses up every Earth Day while they live in a
 * Habitat. The Lander keeps them safe indefinitely, so nothing is used while
 * they live aboard it.
 */
export interface LifeSupportStock {
  readonly id: string;
  readonly label: string;
  /** How much there is when a Campaign begins. */
  readonly startingKilograms: number;
  /** How much the Mission Director uses in an Earth Day, spread evenly over it. */
  readonly usePerEarthDayKilograms: number;
  /**
   * A warning comes as the stock falls to each of these many Earth Days of
   * use left, largest first. Each must come to a whole number of game-minutes.
   */
  readonly warningEarthDaysLeft: readonly number[];
}

/**
 * When the base counts as self-sufficient in a life support stock: once,
 * over a trailing window, its Plants have made at least as much of it as
 * the Mission Director has used.
 */
export interface SelfSufficiencyRules {
  /** How many Lunations the window covers. */
  readonly windowLunations: number;
  /**
   * How long each record of what was made and used covers, in game-hours.
   * The window must come to a whole number of them, and the rule is
   * checked as each one ends.
   */
  readonly recordHours: number;
}

/** A point on the base map's ground plane, in metres from the map's centre (x east, y north). */
export interface GroundPosition {
  readonly x: number;
  readonly y: number;
}

export interface MapSize {
  readonly widthMetres: number;
  readonly depthMetres: number;
}

/**
 * The fixed schedule of every Lunation: Daylight, then Night, repeating. A new
 * Campaign starts part-way through Daylight. Each length must come to a whole
 * number of game-minutes.
 */
export interface LunationSchedule {
  readonly daylightEarthDays: number;
  readonly nightEarthDays: number;
  /** How much of the first Daylight is left when a Campaign begins. */
  readonly initialDaylightRemainingEarthDays: number;
}

/**
 * Automated equipment that a Robot drives into position and activates, and
 * which then carries out its process by itself.
 */
export interface MachineType {
  readonly id: string;
  readonly label: string;
  /** A sentence on what it does, for the Guide screen. */
  readonly description: string;
  /** Radius of the ground the Machine stands on; Structures may not be placed over it. */
  readonly footprintRadiusMetres: number;
  /** How far the Machine goes in a game-hour while a Robot drives it. */
  readonly drivingSpeedMetresPerHour: number;
  /** The Robot's working time to set the Machine going once it is in position, in game-hours. */
  readonly activationHours: number;
  /**
   * How much Condition Dust wears off it for each game-hour it works by
   * itself, on a stage of Construction or digging, in percentage points.
   */
  readonly dustWearPercentPerWorkingHour: number;
  /**
   * How much Condition Dust wears off it for each game-hour a Robot drives
   * it, in percentage points.
   */
  readonly dustWearPercentPerDrivingHour: number;
  /** The power its heater draws at Night while it is plugged in. */
  readonly heaterKilowatts: number;
  /**
   * How much Condition the cold wears off it for each game-hour of Night it
   * goes unpowered, in percentage points, on top of any Dust wear.
   */
  readonly coldWearPercentPerNightHour: number;
}

/**
 * The Rover, which a Robot drives, mainly to go on Expeditions. Like a
 * Machine, it wears down, feels the cold of Night unless it is plugged in,
 * and is maintained with spare Components; unlike one, it carries out no
 * process by itself.
 */
export interface RoverType {
  readonly label: string;
  /** A sentence on what it does, for the Guide screen. */
  readonly description: string;
  /** Radius of the ground it stands on; Structures may not be placed over it. */
  readonly footprintRadiusMetres: number;
  /** How far it goes in a game-hour while a Robot drives it, at full performance. */
  readonly drivingSpeedMetresPerHour: number;
  /**
   * How much Condition Dust wears off it for each game-hour a Robot drives
   * it, in percentage points.
   */
  readonly dustWearPercentPerDrivingHour: number;
  /** The power its heater draws at Night while it is plugged in. */
  readonly heaterKilowatts: number;
  /**
   * How much Condition the cold wears off it for each game-hour of Night it
   * goes unpowered, in percentage points, on top of any Dust wear.
   */
  readonly coldWearPercentPerNightHour: number;
}

/**
 * Expeditions: the Robot drives the Rover off the map and comes back some
 * time later with water ice. The Rover wears down by Dust at its rate for
 * each game-hour it is driven, there and back as on the map.
 */
export interface ExpeditionRules {
  /**
   * How long the Robot and the Rover are away, from driving off the map to
   * driving back onto it. Must come to a whole number of game-minutes.
   */
  readonly awayEarthDays: number;
  /** The bulk resource an Expedition brings back. */
  readonly resourceId: string;
  /** How much of it an Expedition brings back. */
  readonly kilograms: number;
  /**
   * The Robot's working time to unload it at the stockpile, in game-hours.
   * Must come to a whole number of game-minutes.
   */
  readonly unloadingHours: number;
}

/** A bulk resource, such as Regolith, that the base keeps a stock of in kilograms. */
export interface BulkResource {
  readonly id: string;
  readonly label: string;
}

/**
 * A bulk resource the base can sell as an Export: loaded onto the Lander
 * within its Return Mass, and sold at a fixed price when it reaches Earth.
 */
export interface Export {
  readonly resourceId: string;
  readonly priceMillionDollarsPerKilogram: number;
}

/**
 * Digging: whenever no Construction needs it, a Machine digs a bulk
 * resource from the ground beside the stockpile. It starts once the base's
 * stock of it falls below one level and digs on until the stock is full,
 * at a higher one, so that a Plant drawing the stock down doesn't have a
 * Robot set it digging again for every few kilograms.
 */
export interface DiggingRules {
  /** The type of Machine that digs. */
  readonly machineTypeId: string;
  /** The bulk resource it digs. */
  readonly resourceId: string;
  /** Digging starts once the base has less than this. */
  readonly refillBelowKilograms: number;
  /** Once started, digging carries on until the base has this much. */
  readonly fullKilograms: number;
  /** How much it digs in a game-hour at full performance; less as its Condition falls. */
  readonly kilogramsPerWorkingHour: number;
}

/**
 * The cold of Night, which wears down Machines left without power, and how
 * the Robot parks them where they can plug in.
 */
export interface ColdRules {
  /**
   * How far a Machine's footprint may stand from the footprint of a
   * commissioned Structure on a network with a power source, one that
   * isn't Broken, and still be plugged in to it.
   */
  readonly plugInReachMetres: number;
  /**
   * How many game-hours before Night falls the Robot starts parking idle
   * Machines that aren't plugged in. Must come to a whole number of
   * game-minutes.
   */
  readonly parkingLeadHours: number;
  /**
   * How much further than the nearest powered Structure a free bay of a
   * parking area may be from a Machine or Rover for the Robot to park it
   * there instead, so that the drive and the walk back still fit in the
   * lead time before Night.
   */
  readonly bayDetourMetres: number;
}

export interface ComponentType {
  readonly id: string;
  readonly label: string;
}

export interface ComponentCount {
  readonly componentId: string;
  readonly count: number;
}

export interface StructureType {
  readonly id: string;
  readonly label: string;
  /** The Design it belongs to. */
  readonly designId: string;
  /** Radius of the ground the Structure stands on; no two footprints may overlap. */
  readonly footprintRadiusMetres: number;
  /**
   * The Components one Structure is assembled from. A Structure made from
   * Regolith alone has none, and so has no Component delivery.
   */
  readonly components: readonly ComponentCount[];
  /**
   * The working time for each stage of Construction, in game-hours, whether
   * a Machine or the Robot does the work. Walking, driving and activating
   * come on top. Component delivery is split evenly between loading at the
   * stockpile and unloading at the site, and is 0 for a Structure with no
   * Components.
   */
  readonly stageHours: {
    readonly sitePreparation: number;
    readonly componentDelivery: number;
    readonly assembly: number;
    readonly commissioning: number;
  };
  /**
   * The Machine types that carry out stages of Construction by themselves,
   * once a Robot has driven one into position and activated it. A Machine
   * always grades the ground for Site Preparation, and may carry out
   * Assembly, such as printing a Structure from Regolith; without one,
   * Assembly is the Robot's own work, as Component delivery and
   * Commissioning always are.
   */
  readonly stageMachines: {
    readonly sitePreparation: string;
    readonly assembly?: string;
  };
  /** The chance, from 0 to 1, that a Commissioning attempt fails and has to be retried. */
  readonly commissioningFailureChance: number;
  /**
   * How much Condition Dust wears off it for each game-hour it operates, in
   * percentage points; it may be 0. It operates while it is commissioned,
   * isn't Broken and, if it has anything to do with power, has power.
   */
  readonly dustWearPercentPerHour: number;
  /**
   * How much of the Hazards that the data catalogue's rules set the same
   * for every Structure it takes, as a share from 0 to 1 of what the rules
   * say: 1 takes the full amount, as most Structures do, and a hardened
   * Structure from a Protection Design takes less.
   */
  readonly hazardMultipliers: {
    /** Of the Dust coating that builds up on a solar array in Daylight. */
    readonly dustCoating: number;
    /** Of the Condition each Micrometeorite strike takes off it. */
    readonly micrometeorites: number;
    /** Of the Condition each blast of Plume Ejecta takes off it. */
    readonly plumeEjecta: number;
  };
  /** What the commissioned Structure does on the power network. */
  readonly power: {
    /** The power it generates in Daylight; nothing generates at Night. */
    readonly generationKilowatts: number;
    /** The energy it can store. */
    readonly storageKilowattHours: number;
    /** The power it draws all the time, for its own controls and heaters. */
    readonly drawKilowatts: number;
    /**
     * The extra power it draws at Night only, while it is on, if it is a
     * Night load: a light, while it shines, or a telescope, while it
     * observes. A Night load is supplied after the Machines' and Rovers'
     * heaters, and switches itself off to save power once its network's
     * battery banks hold only enough for everything else through the rest
     * of the Night and the reserve after it (see `nightReserveHours`).
     */
    readonly nightDrawKilowatts: number;
    /**
     * Whether the Robot lays it a power cable though it generates, stores
     * and draws nothing itself, as for a parking area's bay sockets, which
     * supply the heaters plugged in to them. Anything that generates,
     * stores or draws power is cabled anyway.
     */
    readonly cabled?: boolean;
  };
  /**
   * How far round it a light that switches on by itself at Night lights the
   * ground, or 0 if it has no light. The light only changes what the player
   * can see; darkness never stops work.
   */
  readonly lightRadiusMetres: number;
  /** Whether it is a Habitat, which the Mission Director can move into once it is commissioned. */
  readonly habitat: boolean;
  /**
   * Whether it is Regolith shielding, built over a commissioned Habitat that
   * isn't shielded yet, and standing centred on it. It is the only Structure
   * allowed to overlap another. Once it is commissioned, the Habitat is
   * shielded.
   */
  readonly shieldsHabitat: boolean;
  /**
   * Whether it is a landing pad. Once one is commissioned, the Lander lands
   * on it, and takes off from it, without blasting Plume Ejecta, and the
   * Robot carries its cargo from it to the stockpile.
   */
  readonly landingPad: boolean;
  /**
   * The recipes it can run if it is a Plant: a Structure that turns
   * resources into products once it is commissioned. It runs one at a
   * time. The first is the default, which it runs once it is commissioned;
   * the player can choose another, which it runs from the next game-minute.
   */
  readonly recipes?: readonly PlantRecipe[];
  /**
   * If it is a water wall: built over a commissioned Habitat with
   * commissioned Regolith shielding over it, standing centred on them and
   * the only other Structure allowed to overlap them, and filled with water
   * as its Assembly starts. Once it is commissioned, neither of them
   * Broken, the Habitat is water-walled.
   */
  readonly waterWall?: WaterWallRules;
  /**
   * If it is a parking area: the bays on it where the Robot parks Machines
   * and Rovers, each with a power socket.
   */
  readonly parking?: ParkingBays;
  /**
   * Whether it is a telescope, which works on the observing programme at
   * Night while it is commissioned, powered and not Broken (see
   * `ObservingProgramme`). Leaving it out is the same as false.
   */
  readonly telescope?: boolean;
}

/**
 * The bays of a parking area, each with a power socket. While the parking
 * area is commissioned, isn't Broken and is on a network with a power
 * source, a Machine or Rover in a bay is plugged in; once the network can
 * also keep heaters on through the Night ahead, park Work Orders send
 * Machines and Rovers to a free bay rather than beside the nearest powered
 * Structure. Its power has `cabled` set, so that the Robot lays it a
 * cable, though its sockets draw nothing but the heaters plugged in to
 * them.
 */
export interface ParkingBays {
  /**
   * How far from its centre a bay holds what is parked in it: at least the
   * largest Machine or Rover footprint, and inside the parking area's
   * footprint.
   */
  readonly bayRadiusMetres: number;
  /**
   * Where the centre of each bay is, from the parking area's centre, in
   * the order the Robot fills them when they are equally near. No two
   * bays overlap.
   */
  readonly bayOffsets: readonly GroundPosition[];
}

/**
 * How a water wall is filled: with water from a life support stock, taken
 * as its Assembly starts, and only while what is left still leaves the
 * Mission Director a reserve of it. The water stays in the wall: neither
 * cancelling nor dismantling gives it back.
 */
export interface WaterWallRules {
  /** The life support stock the water comes from. */
  readonly stockId: string;
  /** How much it takes to fill. */
  readonly kilograms: number;
  /**
   * How many Earth Days of the Mission Director's use of the stock must be
   * left once it is filled; its Construction waits until there is.
   */
  readonly reserveEarthDays: number;
}

/**
 * What a Plant takes in and puts out for each game-hour it runs at full
 * performance, and the power it draws while it runs. It works in batches of
 * a game-hour of the recipe: it starts one only with an hour's worth of
 * every input in stock, which it takes as it starts, and the outputs come
 * as it finishes. It runs only while it isn't Broken and has power; on its
 * network it is supplied last, only from power that nothing else uses and
 * no battery bank can store, so it never takes power from anything else,
 * and a batch it has started waits through the Night for the next Daylight.
 */
export interface PlantRecipe {
  /** Unique among its Plant's recipes. */
  readonly id: string;
  /** How the player sees it, for example "Metals and silicon". */
  readonly label: string;
  readonly inputs: readonly ResourceFlow[];
  readonly outputs: readonly ResourceFlow[];
  readonly drawKilowatts: number;
}

/** A Plant's use or making of a resource, in kilograms for each game-hour it runs. */
export interface ResourceFlow {
  readonly resource: ResourceRef;
  readonly kilogramsPerHour: number;
}

/** A bulk resource, or a life support stock such as oxygen. */
export type ResourceRef =
  | { readonly kind: "bulk-resource"; readonly resourceId: string }
  | { readonly kind: "life-support"; readonly stockId: string };

export interface GameSpeed {
  readonly id: string;
  readonly label: string;
  readonly gameMinutesPerRealSecond: number;
}
