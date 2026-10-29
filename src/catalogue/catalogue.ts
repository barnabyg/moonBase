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
      /** The smallest heap there is while any Regolith is in stock, so that a few kilograms still show. */
      readonly smallestRadiusMetres: number;
      /** How far outside the stockpile's footprint the foot of a full heap comes. */
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

export const catalogue: Catalogue = {
  version: 57,
  map: { widthMetres: 1000, depthMetres: 1000 },
  lander: {
    footprintRadiusMetres: 4,
    roundTripEarthDays: { toEarth: 3, turnaround: 4, toMoon: 3 },
    cargoHandlingHours: 1,
    // As long as carrying a Launch's cargo off it, the other way round.
    exportHandlingHours: 1,
    // About what the last crewed landing brought home in rock samples, and
    // a little less than a vacuum fabrication plant makes running through a
    // Lunation's Daylight, so that a base making more than one plant's
    // wafers, or keeping them back, runs up against it.
    returnMassKilograms: 100,
  },
  // A full stock of Regolith heaps up a little smaller than the stockpile's
  // mat: about 1.2 m in radius and 0.85 m high.
  stockpile: {
    footprintRadiusMetres: 1.5,
    regolithHeap: {
      bulkDensityKilogramsPerCubicMetre: 1500,
      slopeDegrees: 35,
      smallestRadiusMetres: 0.3,
      gapFromFootprintMetres: 0.1,
    },
  },
  landingSite: {
    landerPosition: { x: 0, y: 0 },
    // On the side the camera first looks from, clear of the ground beside
    // the Lander.
    stockpilePosition: { x: 9, y: -10 },
    robotPositions: [{ x: 6, y: -3 }],
    // Parked on the far side of the Lander from the stockpile, clear of a
    // Structure built right beside the Lander.
    roverPositions: [{ x: 0, y: 13 }],
    machines: [
      { machineTypeId: "excavator", position: { x: -11, y: -4.5 } },
      { machineTypeId: "regolith-printer", position: { x: -11, y: 4.5 } },
    ],
  },
  gameSpeeds: [
    { id: "paused", label: "Pause", gameMinutesPerRealSecond: 0 },
    { id: "1x", label: "1x", gameMinutesPerRealSecond: 6 },
    { id: "5x", label: "5x", gameMinutesPerRealSecond: 30 },
    { id: "20x", label: "20x", gameMinutesPerRealSecond: 120 },
  ],
  lunation: {
    daylightEarthDays: 20,
    nightEarthDays: 9.5,
    initialDaylightRemainingEarthDays: 8,
  },
  robot: {
    description:
      "A humanoid Robot that carries out every Work Order by itself: it fetches Components from the stockpile, drives the Machines into place, assembles and commissions Structures, lays power cable, carries out Maintenance and parks the Machines before Night.",
    walkingSpeedMetresPerHour: 12,
    workingGapMetres: 1,
    cableLayingSpeedMetresPerHour: 6,
    // About five weeks of steady work before it needs to repair itself.
    dustWearPercentPerHour: 0.1,
    // Falling slowly at first, so that a Robot low enough to need repair
    // still gets itself there in hours rather than days.
    performance: { thresholdPercent: 50, exponent: 0.5 },
    selfRepairThresholdPercent: 10,
    selfRepairHours: 3,
    // Enough to keep working, at well under full speed.
    makeshiftRepairPercent: 30,
    conditionFloorPercent: 1,
    // Down the Lander's ladder, one careful rung at a time.
    climbingDownHours: 0.25,
  },
  machineTypes: [
    {
      id: "excavator",
      label: "Excavator",
      description:
        "Grades the ground for every Construction's Site Preparation, digs the Regolith for the Structures the regolith printer prints, and digs Regolith into the base's stock when it has nothing else to do.",
      footprintRadiusMetres: 1.6,
      drivingSpeedMetresPerHour: 30,
      activationHours: 0.25,
      // Its tracks and bucket teeth take the worst of the Dust.
      dustWearPercentPerWorkingHour: 0.4,
      dustWearPercentPerDrivingHour: 0.2,
      // Enough to keep its hydraulics and batteries from freezing.
      heaterKilowatts: 0.2,
      coldWearPercentPerNightHour: 0.2,
    },
    {
      id: "regolith-printer",
      label: "Regolith printer",
      description:
        "Prints Structures made of Regolith layer by layer, such as shielding over a Habitat, from Regolith the excavator digs on site.",
      footprintRadiusMetres: 1.8,
      drivingSpeedMetresPerHour: 20,
      activationHours: 0.5,
      dustWearPercentPerWorkingHour: 0.3,
      dustWearPercentPerDrivingHour: 0.2,
      heaterKilowatts: 0.2,
      coldWearPercentPerNightHour: 0.2,
    },
  ],
  // Built to cover ground, so it drives far faster than the Machines and
  // wears down less for it.
  rover: {
    label: "Rover",
    description:
      "Carries a Robot off the map on Expeditions, which come back with water ice.",
    footprintRadiusMetres: 1.5,
    drivingSpeedMetresPerHour: 240,
    dustWearPercentPerDrivingHour: 0.1,
    heaterKilowatts: 0.2,
    coldWearPercentPerNightHour: 0.2,
  },
  // Three Earth Days away for enough ice to make more water than the
  // Mission Director drinks in a Lunation.
  expeditions: {
    awayEarthDays: 3,
    resourceId: "water-ice",
    kilograms: 200,
    unloadingHours: 1,
  },
  bulkResources: [
    { id: "regolith", label: "Regolith" },
    { id: "metals", label: "Metals" },
    { id: "silicon", label: "Silicon" },
    { id: "wafers", label: "Wafers" },
    { id: "circuit-boards", label: "Circuit boards" },
    { id: "water-ice", label: "Water ice" },
  ],
  // A full Return Mass of wafers sells for $150M, the Launch fee. A vacuum
  // fabrication plant, running through the Daylight, makes about that much
  // in a Lunation, so it earns back its $65M of Components, the $11M second
  // solar array it needs and the Launch that brought them in a Lunation or
  // two. But wafers alone pay for a Launch's flight and nothing it brings:
  // circuit boards are worth more for their mass.
  //
  // A full Return Mass of circuit boards sells for $300M, twice what one of
  // wafers does: the Launch fee and as much again in what it brings. A
  // circuit board plant makes 0.4 kg of them an hour, worth $1.2M, from
  // 0.25 kg of wafers that would sell for under $0.4M, so the wafers earn
  // over three times as much made into circuit boards, for the power and
  // time it takes.
  exports: [
    { resourceId: "wafers", priceMillionDollarsPerKilogram: 1.5 },
    { resourceId: "circuit-boards", priceMillionDollarsPerKilogram: 3 },
  ],
  // Digging from one level to the other is about a day's work, wearing the
  // excavator down by some 8 percentage points, and an extraction plant
  // takes some ten days of Daylight to use that much. Filling the stock
  // from empty takes about two.
  digging: {
    machineTypeId: "excavator",
    resourceId: "regolith",
    refillBelowKilograms: 1000,
    fullKilograms: 2000,
    kilogramsPerWorkingHour: 50,
  },
  componentTypes: [
    { id: "solar-panel", label: "Solar panel" },
    { id: "array-mast", label: "Array mast" },
    { id: "battery-module", label: "Battery module" },
    { id: "battery-cabinet", label: "Battery cabinet" },
    { id: "mast-pole", label: "Mast pole" },
    { id: "light-head", label: "Light head" },
    { id: "habitat-core", label: "Habitat core" },
    { id: "habitat-envelope", label: "Habitat envelope" },
    { id: "airlock", label: "Airlock" },
    { id: "pad-panel", label: "Pad panel" },
    { id: "pad-beacon", label: "Pad beacon" },
    { id: "spare-component", label: "Spare Component" },
    { id: "extraction-reactor", label: "Extraction reactor" },
    { id: "oxygen-separator", label: "Oxygen separator" },
    { id: "ice-melter", label: "Ice melter" },
    { id: "water-purifier", label: "Water purifier" },
    { id: "crystal-furnace", label: "Crystal furnace" },
    { id: "wafer-saw", label: "Wafer saw" },
    { id: "circuit-etcher", label: "Circuit etcher" },
    { id: "reflow-oven", label: "Reflow oven" },
    { id: "large-battery-module", label: "Large battery module" },
    { id: "large-battery-cabinet", label: "Large battery cabinet" },
    { id: "sealed-array-mast", label: "Sealed array mast" },
    { id: "screened-solar-panel", label: "Screened solar panel" },
    { id: "whipple-cabinet", label: "Whipple-shielded cabinet" },
    { id: "armoured-habitat-envelope", label: "Armoured habitat envelope" },
    { id: "thin-film-solar-panel", label: "Thin-film solar panel" },
    { id: "tall-mast-pole", label: "Tall mast pole" },
    { id: "prefabricated-array-pack", label: "Prefabricated array pack" },
    { id: "electrolyser-stack", label: "Electrolyser stack" },
    { id: "molten-regolith-cell", label: "Molten regolith cell" },
    { id: "board-assembly-line", label: "Board assembly line" },
    // Labelled a pad light because the Glossary avoids "floodlight", but
    // saves from version 32 on name it by this id, so the id stays.
    { id: "landing-floodlight", label: "Pad light" },
    { id: "water-wall-bladder", label: "Water-wall bladder" },
    { id: "bay-socket", label: "Bay socket" },
    { id: "telescope-optics", label: "Telescope optics" },
    { id: "telescope-mount", label: "Telescope mount" },
  ],
  structureTypes: [
    {
      id: "solar-array",
      label: "Solar array",
      designId: "solar-arrays",
      footprintRadiusMetres: 3,
      components: [
        { componentId: "solar-panel", count: 2 },
        { componentId: "array-mast", count: 1 },
      ],
      stageHours: {
        sitePreparation: 2,
        componentDelivery: 1,
        assembly: 3,
        commissioning: 1,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.25,
      // Its tracking drive and panel hinges grind on the Dust.
      dustWearPercentPerHour: 0.05,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      // The drive that keeps the panel turned to the sun.
      power: {
        generationKilowatts: 10,
        storageKilowattHours: 0,
        drawKilowatts: 0.05,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
    },
    // A solar array whose tracking drive and panel hinges are sealed in a
    // sealed array mast, so that Dust wears it down at 0.02 percentage
    // points an hour rather than 0.05. Otherwise it is a solar array.
    {
      id: "dust-sealed-solar-array",
      label: "Dust-sealed solar array",
      designId: "dust-sealed-solar-arrays",
      footprintRadiusMetres: 3,
      components: [
        { componentId: "solar-panel", count: 2 },
        { componentId: "sealed-array-mast", count: 1 },
      ],
      stageHours: {
        sitePreparation: 2,
        componentDelivery: 1,
        assembly: 3,
        commissioning: 1,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.25,
      dustWearPercentPerHour: 0.02,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      power: {
        generationKilowatts: 10,
        storageKilowattHours: 0,
        drawKilowatts: 0.05,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
    },
    // A dust-sealed solar array whose panels carry an electrodynamic dust
    // screen, which pushes Dust off the cells, so that its coating builds
    // up at a quarter of the rate: past the cleaning threshold in some four
    // Lunations' Daylight rather than one.
    {
      id: "dust-screened-solar-array",
      label: "Dust-screened solar array",
      designId: "electrodynamic-dust-screens",
      footprintRadiusMetres: 3,
      components: [
        { componentId: "screened-solar-panel", count: 2 },
        { componentId: "sealed-array-mast", count: 1 },
      ],
      stageHours: {
        sitePreparation: 2,
        componentDelivery: 1,
        assembly: 3,
        commissioning: 1,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.25,
      dustWearPercentPerHour: 0.02,
      hazardMultipliers: {
        dustCoating: 0.25,
        micrometeorites: 1,
        plumeEjecta: 1,
      },
      power: {
        generationKilowatts: 10,
        storageKilowattHours: 0,
        drawKilowatts: 0.05,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
    },
    // A solar array whose panels are thin-film cells on a light, flexible
    // backing, stretched wider and taller on the same mast, so that it
    // generates 15 kW rather than 10 from 150 kg shipped rather than 200:
    // twice as much for each kilogram, though more for each kW in money.
    {
      id: "thin-film-solar-array",
      label: "Thin-film solar array",
      designId: "thin-film-solar-cells",
      footprintRadiusMetres: 3,
      components: [
        { componentId: "thin-film-solar-panel", count: 2 },
        { componentId: "array-mast", count: 1 },
      ],
      stageHours: {
        sitePreparation: 2,
        componentDelivery: 1,
        assembly: 3,
        commissioning: 1,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.25,
      dustWearPercentPerHour: 0.05,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      power: {
        generationKilowatts: 15,
        storageKilowattHours: 0,
        drawKilowatts: 0.05,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
    },
    // A solar array put together and tested on Earth, its panel folded on
    // its mast on a skid, so that it stands on less grading, comes off the
    // stockpile as one Component and only has to be unfolded: 3 hours to
    // build rather than 7, and it fails Commissioning one time in ten rather
    // than one in four. It ships 230 kg for $14M, against 200 kg for $11M.
    {
      id: "prefabricated-solar-array",
      label: "Prefabricated solar array",
      designId: "prefabricated-solar-arrays",
      footprintRadiusMetres: 3,
      components: [{ componentId: "prefabricated-array-pack", count: 1 }],
      stageHours: {
        sitePreparation: 1,
        componentDelivery: 0.5,
        assembly: 1,
        commissioning: 0.5,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.1,
      dustWearPercentPerHour: 0.05,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      power: {
        generationKilowatts: 10,
        storageKilowattHours: 0,
        drawKilowatts: 0.05,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
    },
    {
      id: "battery-bank",
      label: "Battery bank",
      designId: "battery-banks",
      footprintRadiusMetres: 2,
      components: [
        { componentId: "battery-module", count: 3 },
        { componentId: "battery-cabinet", count: 1 },
      ],
      stageHours: {
        sitePreparation: 1,
        componentDelivery: 1,
        assembly: 2,
        commissioning: 1,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.2,
      dustWearPercentPerHour: 0.02,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      // A pack of modern cells, about what a small electric car carries. The
      // heaters that keep them warm enough to work take 16 kWh through a
      // Night, a twelfth of what it stores, so that a battery bank carries
      // most of it through one.
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 200,
        drawKilowatts: 0.07,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
    },
    // A battery bank in a Whipple-shielded cabinet: a thin bumper plate
    // standing clear of it shatters a Micrometeorite before it strikes, so
    // that each strike takes a quarter of the Condition off it. Otherwise
    // it is a battery bank.
    {
      id: "whipple-shielded-battery-bank",
      label: "Whipple-shielded battery bank",
      designId: "whipple-shielding",
      footprintRadiusMetres: 2,
      components: [
        { componentId: "battery-module", count: 3 },
        { componentId: "whipple-cabinet", count: 1 },
      ],
      stageHours: {
        sitePreparation: 1,
        componentDelivery: 1,
        assembly: 2,
        commissioning: 1,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.2,
      dustWearPercentPerHour: 0.02,
      hazardMultipliers: {
        dustCoating: 1,
        micrometeorites: 0.25,
        plumeEjecta: 1,
      },
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 200,
        drawKilowatts: 0.07,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
    },
    // Four times a battery bank's storage, in denser cells, so it ships
    // about half the mass and costs about half as much for each kWh. It
    // takes longer to build, and its heaters draw more, if less for each kWh.
    {
      id: "large-battery-bank",
      label: "Large battery bank",
      designId: "large-battery-banks",
      footprintRadiusMetres: 3,
      components: [
        { componentId: "large-battery-module", count: 4 },
        { componentId: "large-battery-cabinet", count: 1 },
      ],
      stageHours: {
        sitePreparation: 2,
        componentDelivery: 1.5,
        assembly: 4,
        commissioning: 1.5,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.2,
      dustWearPercentPerHour: 0.02,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      // The heaters that keep the cells warm enough to work: three times a
      // battery bank's, for four times the storage.
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 800,
        drawKilowatts: 0.2,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
    },
    {
      id: "light-mast",
      label: "Light mast",
      designId: "light-masts",
      footprintRadiusMetres: 0.8,
      components: [
        { componentId: "mast-pole", count: 1 },
        { componentId: "light-head", count: 1 },
      ],
      stageHours: {
        sitePreparation: 0.5,
        componentDelivery: 0.5,
        assembly: 1,
        commissioning: 0.5,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.1,
      dustWearPercentPerHour: 0.02,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      // Its light switches on by itself at Night, and draws nothing in Daylight.
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0.4,
      },
      lightRadiusMetres: 18,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
    },
    // A Light Mast on a pole twice as tall, with two light heads, lighting
    // a circle twice as wide: four times the ground for two and a half
    // times the power. Through a Night it draws 228 kWh, a little more than
    // a battery bank stores.
    {
      id: "tall-light-mast",
      label: "Tall Light Mast",
      designId: "tall-light-masts",
      footprintRadiusMetres: 1.2,
      components: [
        { componentId: "tall-mast-pole", count: 1 },
        { componentId: "light-head", count: 2 },
      ],
      stageHours: {
        sitePreparation: 1,
        componentDelivery: 0.5,
        assembly: 2,
        commissioning: 0.5,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.1,
      dustWearPercentPerHour: 0.02,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 1,
      },
      lightRadiusMetres: 36,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
    },
    // An optical telescope: a half-metre mirror in an open tube on a
    // fork mount, which observes the sky only at Night, when the sun is
    // down. Like a light, it is a Night load: its drives, cooled camera and
    // the heaters that keep its mirror from frosting draw 0.25 kW while it
    // observes, 57 kWh through a whole Night, over a quarter of a battery
    // bank and about half of what the starting battery banks have to spare
    // once the Habitat and the Machines' heaters have theirs; it switches
    // itself off before it would eat into that, and stands parked and
    // unpowered in Daylight. Aligning its optics makes Commissioning slow
    // and chancy.
    {
      id: "telescope",
      label: "Telescope",
      designId: "optical-telescopes",
      footprintRadiusMetres: 1.5,
      components: [
        { componentId: "telescope-optics", count: 1 },
        { componentId: "telescope-mount", count: 1 },
      ],
      stageHours: {
        sitePreparation: 1,
        componentDelivery: 0.5,
        assembly: 3,
        commissioning: 2,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.2,
      // Its drives and the mirror's cover grind on the Dust.
      dustWearPercentPerHour: 0.03,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0.25,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
      telescope: true,
    },
    {
      id: "habitat",
      label: "Inflatable Habitat",
      designId: "inflatable-habitat",
      footprintRadiusMetres: 4,
      components: [
        { componentId: "habitat-core", count: 1 },
        { componentId: "habitat-envelope", count: 1 },
        { componentId: "airlock", count: 1 },
      ],
      stageHours: {
        sitePreparation: 4,
        componentDelivery: 2,
        assembly: 8,
        commissioning: 3,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.2,
      dustWearPercentPerHour: 0.01,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      // Its life support, heaters and controls.
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 1.2,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: true,
      shieldsHabitat: false,
      landingPad: false,
    },
    // An inflatable Habitat whose envelope is layered like a Whipple
    // shield, so that a Micrometeorite strike and a blast of Plume Ejecta
    // each take a quarter of the Condition off it. Otherwise it is a
    // Habitat: the Mission Director can move in, and Regolith shielding
    // goes over it.
    {
      id: "hardened-habitat",
      label: "Hardened Habitat",
      designId: "hardened-habitat",
      footprintRadiusMetres: 4,
      components: [
        { componentId: "habitat-core", count: 1 },
        { componentId: "armoured-habitat-envelope", count: 1 },
        { componentId: "airlock", count: 1 },
      ],
      stageHours: {
        sitePreparation: 4,
        componentDelivery: 2,
        assembly: 8,
        commissioning: 3,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.2,
      dustWearPercentPerHour: 0.01,
      hazardMultipliers: {
        dustCoating: 1,
        micrometeorites: 0.25,
        plumeEjecta: 0.25,
      },
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 1.2,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: true,
      shieldsHabitat: false,
      landingPad: false,
    },
    {
      id: "regolith-shielding",
      label: "Regolith shielding",
      designId: "regolith-shielding",
      // The same as the Habitat's, so that the excavator, left beside the
      // Habitat after grading its site, isn't in the way.
      footprintRadiusMetres: 4,
      // The excavator digs the Regolith the printer prints it from, beside
      // the Habitat, as part of Site Preparation: 3 hours of grading, then
      // 6 of digging. No Components.
      components: [],
      stageHours: {
        sitePreparation: 9,
        componentDelivery: 0,
        assembly: 48,
        commissioning: 2,
      },
      stageMachines: {
        sitePreparation: "excavator",
        assembly: "regolith-printer",
      },
      commissioningFailureChance: 0.1,
      // Packed Regolith has nothing for Dust to wear.
      dustWearPercentPerHour: 0,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: true,
      landingPad: false,
    },
    // Regolith shielding whose every layer is fused by microwaves as the
    // regolith printer lays it, rather than left to settle under the next,
    // so that the printer lays it in 20 hours rather than 48: 31 hours in
    // all rather than 59, under an unshielded Habitat's Radiation Dose. The
    // excavator digs its Regolith just as long.
    {
      id: "sintered-regolith-shielding",
      label: "Sintered Regolith shielding",
      designId: "microwave-sintering",
      footprintRadiusMetres: 4,
      components: [],
      stageHours: {
        sitePreparation: 9,
        componentDelivery: 0,
        assembly: 20,
        commissioning: 2,
      },
      stageMachines: {
        sitePreparation: "excavator",
        assembly: "regolith-printer",
      },
      commissioningFailureChance: 0.1,
      dustWearPercentPerHour: 0,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: true,
      landingPad: false,
    },
    // Bladders of water laid over a Habitat's Regolith shielding: water is
    // rich in hydrogen, which stops the protons of the Sun and the cosmic
    // rays that get through Regolith better than Regolith does. The
    // bladders are shipped empty and filled from the base's water as they
    // go up, so a water wall is as much water as it is Components, and
    // making water matters beyond what the Mission Director drinks.
    {
      id: "water-wall",
      label: "Water wall",
      designId: "water-wall-shielding",
      // The same as the Habitat's and its shielding's, which it stands over.
      footprintRadiusMetres: 4,
      components: [{ componentId: "water-wall-bladder", count: 4 }],
      stageHours: {
        sitePreparation: 1,
        componentDelivery: 1,
        assembly: 6,
        commissioning: 1,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.1,
      // Nothing moves in it for Dust to wear.
      dustWearPercentPerHour: 0,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
      // About 12 Earth Days of what a water-processing plant makes, or most
      // of what an Expedition's water ice gives, on top of a fortnight's
      // drinking water kept back for the Mission Director.
      waterWall: { stockId: "water", kilograms: 300, reserveEarthDays: 14 },
    },
    {
      id: "landing-pad",
      label: "Landing pad",
      designId: "landing-pads",
      // Wide enough for the Lander to stand on with room round it, and for
      // its engine to blast nothing but the pad.
      footprintRadiusMetres: 7,
      // Interlocking panels laid on graded ground, and a beacon to guide
      // the Lander down.
      components: [
        { componentId: "pad-panel", count: 8 },
        { componentId: "pad-beacon", count: 1 },
      ],
      stageHours: {
        sitePreparation: 6,
        componentDelivery: 2,
        assembly: 8,
        commissioning: 1,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.1,
      dustWearPercentPerHour: 0.01,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      // The beacon runs off its own small battery.
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: true,
    },
    // A landing pad the regolith printer lays from Regolith, fusing it into
    // a hard slab as it goes, so that nothing has to be shipped from Earth
    // for it: the Lander comes down on its own radar, with no beacon. It
    // stands on the same ground as a landing pad shipped from Earth, graded
    // as long, and then the excavator digs the Regolith for 6 hours more.
    // It takes 49 hours to build rather than 17, most of them printing.
    {
      id: "sintered-landing-pad",
      label: "Sintered landing pad",
      designId: "regolith-sintering",
      footprintRadiusMetres: 7,
      components: [],
      stageHours: {
        sitePreparation: 12,
        componentDelivery: 0,
        assembly: 36,
        commissioning: 1,
      },
      stageMachines: {
        sitePreparation: "excavator",
        assembly: "regolith-printer",
      },
      commissioningFailureChance: 0.1,
      dustWearPercentPerHour: 0.01,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: true,
    },
    // A landing pad with a pad light on a short post at each quarter of its
    // edge, which switch on by themselves at Night, so that the Lander can
    // be seen landing and the Robot unloading it. They light 20 m round its
    // centre, a little wider than a Light Mast, for 0.45 kW: about what a
    // Light Mast draws for each square metre, 103 kWh through a Night. A
    // landing pad lands the Lander whether its lights have power or not.
    // It ships 1300 kg for $38M, against 1240 kg for $30M, and takes 2
    // hours longer to assemble.
    {
      id: "lit-landing-pad",
      label: "Lit landing pad",
      designId: "landing-pad-lights",
      footprintRadiusMetres: 7,
      components: [
        { componentId: "pad-panel", count: 8 },
        { componentId: "pad-beacon", count: 1 },
        { componentId: "landing-floodlight", count: 4 },
      ],
      stageHours: {
        sitePreparation: 6,
        componentDelivery: 2,
        assembly: 10,
        commissioning: 1,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.1,
      dustWearPercentPerHour: 0.01,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0.45,
      },
      lightRadiusMetres: 20,
      habitat: false,
      shieldsHabitat: false,
      landingPad: true,
    },
    // Graded, marked ground with four bays, each with a power socket on a
    // short post, so that idle Machines and the Rover stand together in one
    // tidy place and keep warm through the Night. Each bay holds the
    // largest Machine, the regolith printer, with a little room round it,
    // and two by two they fit a footprint not much wider than a Habitat's.
    // Four bays take both Machines and the Rover with one to spare. It is
    // about as cheap as anything on the base: its sockets ship 60 kg for
    // $4M, against a Light Mast's 40 kg for $3M, and it goes up in 4 hours
    // of work, half of them grading the ground.
    {
      id: "parking-area",
      label: "Parking area",
      designId: "parking-areas",
      footprintRadiusMetres: 5.5,
      components: [{ componentId: "bay-socket", count: 4 }],
      stageHours: {
        sitePreparation: 2,
        componentDelivery: 0.5,
        assembly: 1,
        commissioning: 0.5,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.1,
      dustWearPercentPerHour: 0.01,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      // Its sockets draw nothing but the heaters plugged in to them, but
      // they need a cable.
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0,
        cabled: true,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
      parking: {
        bayRadiusMetres: 2,
        bayOffsets: [
          { x: -2.25, y: 2.25 },
          { x: 2.25, y: 2.25 },
          { x: -2.25, y: -2.25 },
          { x: 2.25, y: -2.25 },
        ],
      },
    },
    {
      id: "extraction-plant",
      label: "Extraction plant",
      designId: "regolith-extraction",
      footprintRadiusMetres: 3,
      // A reactor that melts Regolith and splits it by electrolysis, and
      // the plant that draws the oxygen off.
      components: [
        { componentId: "extraction-reactor", count: 1 },
        { componentId: "oxygen-separator", count: 1 },
      ],
      stageHours: {
        sitePreparation: 3,
        componentDelivery: 1,
        assembly: 6,
        commissioning: 2,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.2,
      // Regolith is fed through it, so it wears faster than most.
      dustWearPercentPerHour: 0.05,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      // It draws power only while it runs (see its recipes).
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
      // Run for oxygen, a few percent of the Regolith comes out as oxygen,
      // about four times what the Mission Director breathes while it runs,
      // with a little metal and silicon; run for metals and silicon, it
      // reduces much more of it to them, and keeps little of the oxygen.
      // What is left is slag. It runs only in Daylight, 20 of a Lunation's
      // 29.5 Earth Days, so to make the 24.8 kg of oxygen the Mission
      // Director uses in a Lunation it has to run for oxygen for about 30%
      // of the Daylight (0.15 kg an hour for oxygen, 0.01 for metals and
      // silicon). In the rest it makes under 0.3 kg of silicon an hour,
      // averaged over the Daylight: less than the 0.35 kg a vacuum
      // fabrication plant takes. So one extraction plant can't keep the base
      // self-sufficient in oxygen and feed a vacuum fabrication plant too;
      // the player switches between the recipes, or imports a second one.
      recipes: [
        {
          id: "oxygen",
          label: "Oxygen",
          inputs: [
            {
              resource: { kind: "bulk-resource", resourceId: "regolith" },
              kilogramsPerHour: 4,
            },
          ],
          outputs: [
            {
              resource: { kind: "life-support", stockId: "oxygen" },
              kilogramsPerHour: 0.15,
            },
            {
              resource: { kind: "bulk-resource", resourceId: "metals" },
              kilogramsPerHour: 0.04,
            },
            {
              resource: { kind: "bulk-resource", resourceId: "silicon" },
              kilogramsPerHour: 0.02,
            },
          ],
          drawKilowatts: 4,
        },
        {
          id: "metals-and-silicon",
          label: "Metals and silicon",
          inputs: [
            {
              resource: { kind: "bulk-resource", resourceId: "regolith" },
              kilogramsPerHour: 4,
            },
          ],
          outputs: [
            {
              resource: { kind: "life-support", stockId: "oxygen" },
              kilogramsPerHour: 0.01,
            },
            {
              resource: { kind: "bulk-resource", resourceId: "metals" },
              kilogramsPerHour: 0.6,
            },
            {
              resource: { kind: "bulk-resource", resourceId: "silicon" },
              kilogramsPerHour: 0.4,
            },
          ],
          drawKilowatts: 4,
        },
      ],
    },
    // An extraction plant whose reactor is a big molten regolith cell,
    // which melts Regolith through and splits it by electrolysis, rather
    // than reducing what it can at the surface of each grain. It runs the
    // same recipes on 10 kg of Regolith an hour rather than 4, for 8 kW
    // rather than 4, so it makes more of everything for each kW: 0.4 kg of
    // oxygen an hour running for oxygen, enough for the Mission Director in
    // under a seventh of the Daylight, or 1.1 kg of silicon running for
    // metals and silicon, enough for an integrated fabrication plant or
    // three vacuum fabrication plants. With an oxygen separator it ships
    // 1200 kg for $95M, against 1000 kg for $75M: well under half as much
    // for each kilogram of silicon it makes an hour.
    {
      id: "large-extraction-plant",
      label: "Large extraction plant",
      designId: "molten-regolith-electrolysis",
      footprintRadiusMetres: 4,
      components: [
        { componentId: "molten-regolith-cell", count: 1 },
        { componentId: "oxygen-separator", count: 1 },
      ],
      stageHours: {
        sitePreparation: 4,
        componentDelivery: 1,
        assembly: 8,
        commissioning: 3,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.25,
      // More Regolith goes through it than through an extraction plant.
      dustWearPercentPerHour: 0.06,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      // It draws power only while it runs (see its recipes).
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
      recipes: [
        {
          id: "oxygen",
          label: "Oxygen",
          inputs: [
            {
              resource: { kind: "bulk-resource", resourceId: "regolith" },
              kilogramsPerHour: 10,
            },
          ],
          outputs: [
            {
              resource: { kind: "life-support", stockId: "oxygen" },
              kilogramsPerHour: 0.4,
            },
            {
              resource: { kind: "bulk-resource", resourceId: "metals" },
              kilogramsPerHour: 0.1,
            },
            {
              resource: { kind: "bulk-resource", resourceId: "silicon" },
              kilogramsPerHour: 0.05,
            },
          ],
          drawKilowatts: 8,
        },
        {
          id: "metals-and-silicon",
          label: "Metals and silicon",
          inputs: [
            {
              resource: { kind: "bulk-resource", resourceId: "regolith" },
              kilogramsPerHour: 10,
            },
          ],
          outputs: [
            {
              resource: { kind: "life-support", stockId: "oxygen" },
              kilogramsPerHour: 0.03,
            },
            {
              resource: { kind: "bulk-resource", resourceId: "metals" },
              kilogramsPerHour: 1.6,
            },
            {
              resource: { kind: "bulk-resource", resourceId: "silicon" },
              kilogramsPerHour: 1.1,
            },
          ],
          drawKilowatts: 8,
        },
      ],
    },
    {
      id: "water-processing-plant",
      label: "Water-processing plant",
      designId: "water-processing",
      footprintRadiusMetres: 2.5,
      // A heated tank that melts the ice, and a still that cleans the water.
      components: [
        { componentId: "ice-melter", count: 1 },
        { componentId: "water-purifier", count: 1 },
      ],
      stageHours: {
        sitePreparation: 2,
        componentDelivery: 1,
        assembly: 4,
        commissioning: 1,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.15,
      dustWearPercentPerHour: 0.03,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      // It draws power only while it runs (see its recipes).
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
      // Most of the ice comes out as water; the rest is the dust and grit
      // frozen in with it. Running, it makes six times what the Mission
      // Director drinks, so an Expedition's ice lasts over a week.
      recipes: [
        {
          id: "water",
          label: "Water",
          inputs: [
            {
              resource: { kind: "bulk-resource", resourceId: "water-ice" },
              kilogramsPerHour: 1,
            },
          ],
          outputs: [
            {
              resource: { kind: "life-support", stockId: "water" },
              kilogramsPerHour: 0.9,
            },
          ],
          drawKilowatts: 2,
        },
      ],
    },
    // A water-processing plant's ice melter feeding an electrolyser stack,
    // which splits the water into oxygen and hydrogen; the hydrogen is
    // vented. Water is eight-ninths oxygen by mass, so most of the ice comes
    // out as oxygen: 0.4 kg an hour, well over twice what an extraction
    // plant running for oxygen makes, for 5 kW rather than 4. Running for 62
    // hours, an eighth of a Lunation's Daylight, it makes the 24.8 kg of
    // oxygen the Mission Director uses in a Lunation from 31 kg of ice, a
    // sixth of what an Expedition brings back, and leaves the extraction
    // plant free to run for metals and silicon.
    {
      id: "electrolysis-plant",
      label: "Electrolysis plant",
      designId: "water-electrolysis",
      footprintRadiusMetres: 2.5,
      components: [
        { componentId: "ice-melter", count: 1 },
        { componentId: "electrolyser-stack", count: 1 },
      ],
      stageHours: {
        sitePreparation: 2,
        componentDelivery: 1,
        assembly: 5,
        commissioning: 1.5,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.2,
      dustWearPercentPerHour: 0.03,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      // It draws power only while it runs (see its recipes).
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
      recipes: [
        {
          id: "oxygen",
          label: "Oxygen",
          inputs: [
            {
              resource: { kind: "bulk-resource", resourceId: "water-ice" },
              kilogramsPerHour: 0.5,
            },
          ],
          outputs: [
            {
              resource: { kind: "life-support", stockId: "oxygen" },
              kilogramsPerHour: 0.4,
            },
          ],
          drawKilowatts: 5,
        },
      ],
    },
    {
      id: "vacuum-fabrication-plant",
      label: "Vacuum fabrication plant",
      designId: "vacuum-fabrication",
      footprintRadiusMetres: 2.5,
      // A furnace that grows silicon crystals in the Moon's vacuum, and a saw
      // that slices them into wafers.
      components: [
        { componentId: "crystal-furnace", count: 1 },
        { componentId: "wafer-saw", count: 1 },
      ],
      stageHours: {
        sitePreparation: 2,
        componentDelivery: 1,
        assembly: 5,
        commissioning: 2,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.2,
      // Dust in its saw and seals.
      dustWearPercentPerHour: 0.04,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      // It draws power only while it runs (see its recipes).
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
      // It takes in a little less silicon than an extraction plant makes
      // running for metals and silicon, so that, running together, the
      // silicon never quite runs out and it keeps up without stopping and
      // starting; the saw turns some of it to dust. Its furnace draws 6 kW: on its own, the starting solar array
      // can spare that beside the Habitat and a battery bank, but the two
      // Plants together draw 10 kW, all that array makes, so earning money
      // from wafers takes a second solar array.
      recipes: [
        {
          id: "wafers",
          label: "Wafers",
          inputs: [
            {
              resource: { kind: "bulk-resource", resourceId: "silicon" },
              kilogramsPerHour: 0.35,
            },
          ],
          outputs: [
            {
              resource: { kind: "bulk-resource", resourceId: "wafers" },
              kilogramsPerHour: 0.3,
            },
          ],
          drawKilowatts: 6,
        },
      ],
    },
    {
      id: "circuit-board-plant",
      label: "Circuit board plant",
      designId: "circuit-board-fabrication",
      footprintRadiusMetres: 2.5,
      // An etcher that lays circuits on metal-cored boards, and an oven
      // that solders the chips cut from the wafers onto them.
      components: [
        { componentId: "circuit-etcher", count: 1 },
        { componentId: "reflow-oven", count: 1 },
      ],
      stageHours: {
        sitePreparation: 2,
        componentDelivery: 1,
        assembly: 5,
        commissioning: 2,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.2,
      // Dust in its etcher and on the conveyor through its oven.
      dustWearPercentPerHour: 0.04,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      // It draws power only while it runs (see its recipes).
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
      // It takes in a little less in wafers than a vacuum fabrication plant
      // makes, so that, running together, it keeps up without the wafers
      // running out, and as much metals again, well within what an
      // extraction plant makes running for metals and silicon, for the
      // boards' cores and circuits; offcuts
      // and what is etched away make up the rest. Its oven draws 3 kW, so
      // the three Plants together, at 13 kW, still run on what two solar
      // arrays can spare beside the Habitat and a battery bank.
      recipes: [
        {
          id: "circuit-boards",
          label: "Circuit boards",
          inputs: [
            {
              resource: { kind: "bulk-resource", resourceId: "wafers" },
              kilogramsPerHour: 0.25,
            },
            {
              resource: { kind: "bulk-resource", resourceId: "metals" },
              kilogramsPerHour: 0.25,
            },
          ],
          outputs: [
            {
              resource: { kind: "bulk-resource", resourceId: "circuit-boards" },
              kilogramsPerHour: 0.4,
            },
          ],
          drawKilowatts: 3,
        },
      ],
    },
    // A crystal furnace feeding a board assembly line, which saws the
    // crystals into wafers and turns them straight into circuit boards, so
    // that the wafers never leave it. By default it makes 0.5 kg of circuit
    // boards an hour from 0.45 kg of silicon and 0.3 kg of metals, a
    // quarter more than a circuit board plant, for 9 kW, as much as a
    // vacuum fabrication plant and a circuit board plant draw together. It
    // can run for wafers alone instead: 0.6 kg an hour, twice a vacuum
    // fabrication plant's, for 8 kW. Either takes more silicon than an
    // extraction plant makes, so it needs a large extraction plant. It
    // ships 900 kg for $85M, against 1350 kg for $125M for the two Plants
    // it stands in for.
    {
      id: "integrated-fabrication-plant",
      label: "Integrated fabrication plant",
      designId: "integrated-fabrication",
      footprintRadiusMetres: 3,
      components: [
        { componentId: "crystal-furnace", count: 1 },
        { componentId: "board-assembly-line", count: 1 },
      ],
      stageHours: {
        sitePreparation: 2,
        componentDelivery: 1,
        assembly: 7,
        commissioning: 3,
      },
      stageMachines: { sitePreparation: "excavator" },
      commissioningFailureChance: 0.25,
      dustWearPercentPerHour: 0.04,
      hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
      // It draws power only while it runs (see its recipes).
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: false,
      landingPad: false,
      recipes: [
        {
          id: "circuit-boards",
          label: "Circuit boards",
          inputs: [
            {
              resource: { kind: "bulk-resource", resourceId: "silicon" },
              kilogramsPerHour: 0.45,
            },
            {
              resource: { kind: "bulk-resource", resourceId: "metals" },
              kilogramsPerHour: 0.3,
            },
          ],
          outputs: [
            {
              resource: { kind: "bulk-resource", resourceId: "circuit-boards" },
              kilogramsPerHour: 0.5,
            },
          ],
          drawKilowatts: 9,
        },
        {
          id: "wafers",
          label: "Wafers",
          inputs: [
            {
              resource: { kind: "bulk-resource", resourceId: "silicon" },
              kilogramsPerHour: 0.7,
            },
          ],
          outputs: [
            {
              resource: { kind: "bulk-resource", resourceId: "wafers" },
              kilogramsPerHour: 0.6,
            },
          ],
          drawKilowatts: 8,
        },
      ],
    },
  ],
  dismantlingLossShare: 0.2,
  startingStock: [
    { componentId: "solar-panel", count: 2 },
    { componentId: "array-mast", count: 1 },
    // Three battery banks, 600 kWh: enough to carry the Habitat, two solar
    // arrays, their own heaters and those of the Machines and the Rover,
    // about 480 kWh in all, through a Night, and two would not be. Nothing
    // that stores more can arrive in time for the Habitat's first Night:
    // the Milestones put the first Research Task, and so the Science for
    // Large battery banks, after the landing pad, whose Components need a
    // Launch, which can't leave until the Mission Director has moved in.
    { componentId: "battery-module", count: 9 },
    { componentId: "battery-cabinet", count: 3 },
    { componentId: "mast-pole", count: 4 },
    { componentId: "light-head", count: 4 },
    // The inflatable Habitat kit.
    { componentId: "habitat-core", count: 1 },
    { componentId: "habitat-envelope", count: 1 },
    { componentId: "airlock", count: 1 },
    // Enough to bring one Structure back from Broken.
    { componentId: "spare-component", count: 6 },
  ],
  // Enough for about 30 Earth Days at a person's daily use; the oxygen runs
  // out first.
  lifeSupportStocks: [
    {
      id: "oxygen",
      label: "Oxygen",
      startingKilograms: 25,
      usePerEarthDayKilograms: 0.84,
      warningEarthDaysLeft: [7, 3, 1],
    },
    {
      id: "water",
      label: "Water",
      startingKilograms: 108,
      usePerEarthDayKilograms: 3.5,
      warningEarthDaysLeft: [7, 3, 1],
    },
  ],
  // A whole Lunation, so that a Night when the Plants stand idle, or the
  // time between Expeditions, doesn't take self-sufficiency away.
  selfSufficiency: { windowLunations: 1, recordHours: 6 },
  habitatPowerWarningHoursLeft: [24, 6, 1],
  // As long as the first Habitat power warning, so that lights never bring
  // one: a Light Mast is only there to see by, and the Mission Director's
  // life shouldn't hang on leaving one unbuilt.
  nightReserveHours: 24,
  // The limit is a career limit for astronauts. Unshielded, the dose rate is
  // tuned well above the roughly 1.4 mSv an Earth Day measured on the lunar
  // surface, so that the limit comes in 20 Earth Days and shielding the
  // Habitat is urgent. Regolith shielding cuts it to a twentieth, so that
  // with Solar Particle Events the limit still comes in about nine
  // Lunations; a water wall over the shielding cuts it to a tenth of that
  // again, so that it comes only after many years and an open-ended
  // Campaign can go on.
  radiation: {
    doseRateMillisievertsPerEarthDay: {
      lander: 0,
      habitat: 30,
      shieldedHabitat: 1.5,
      waterWalledHabitat: 0.15,
    },
    doseLimitMillisieverts: 600,
    warningEarthDaysLeft: [7, 3, 1],
  },
  // Roughly one a Lunation, with a few hours' warning. One lasting an Earth
  // Day or so takes half the dose limit in an unshielded Habitat, a
  // fortieth in a shielded one and a four-hundredth in a water-walled one.
  solarParticleEvents: {
    earthDaysBetween: { min: 10, max: 30 },
    durationHours: { min: 6, max: 30 },
    warningHours: 4,
    doseRateMultiplier: 10,
  },
  // Enough for the Launches before the base earns: the first brings the
  // landing pad with oxygen, water and spare Components ($200M), the second
  // the export Plants and a second solar array ($301M), and the one after
  // the first sale of wafers, which sell for no more than the Launch fee, a
  // circuit board plant and a water-processing plant with what the base
  // needs besides (about $265M, the sale paying $150M of it). From then on
  // circuit boards pay for every Launch.
  programmeGrantMillionDollars: 650,
  // Each Launch carries two tonnes and costs a fixed fee for the flight, on
  // top of the price of what it brings. The Habitat kit is by far the
  // dearest, so the Funding runs out before the Payload Mass does if a
  // Launch brings two. A landing pad and supplies fill one Launch, and an
  // extraction plant, a vacuum fabrication plant and a second solar array
  // to power them (1950 kg) another.
  launch: {
    payloadMassLimitKilograms: 2000,
    feeMillionDollars: 150,
    items: [
      {
        id: "solar-panel",
        designId: "solar-arrays",
        brings: { kind: "component", componentId: "solar-panel" },
        massKilograms: 60,
        priceMillionDollars: 4,
      },
      {
        id: "array-mast",
        designId: "solar-arrays",
        brings: { kind: "component", componentId: "array-mast" },
        massKilograms: 80,
        priceMillionDollars: 3,
      },
      // Heavier and dearer than an array mast for its seals.
      {
        id: "sealed-array-mast",
        designId: "dust-sealed-solar-arrays",
        brings: { kind: "component", componentId: "sealed-array-mast" },
        massKilograms: 100,
        priceMillionDollars: 6,
      },
      // The electrodes woven through the cells add mass and price.
      {
        id: "screened-solar-panel",
        designId: "electrodynamic-dust-screens",
        brings: { kind: "component", componentId: "screened-solar-panel" },
        massKilograms: 70,
        priceMillionDollars: 8,
      },
      // A thin-film solar array's worth, with an array mast, comes to 150 kg.
      {
        id: "thin-film-solar-panel",
        designId: "thin-film-solar-cells",
        brings: { kind: "component", componentId: "thin-film-solar-panel" },
        massKilograms: 35,
        priceMillionDollars: 7,
      },
      // A whole solar array, folded on its mast on a skid.
      {
        id: "prefabricated-array-pack",
        designId: "prefabricated-solar-arrays",
        brings: { kind: "component", componentId: "prefabricated-array-pack" },
        massKilograms: 230,
        priceMillionDollars: 14,
      },
      {
        id: "battery-module",
        designId: "battery-banks",
        brings: { kind: "component", componentId: "battery-module" },
        massKilograms: 120,
        priceMillionDollars: 6,
      },
      {
        id: "battery-cabinet",
        designId: "battery-banks",
        brings: { kind: "component", componentId: "battery-cabinet" },
        massKilograms: 70,
        priceMillionDollars: 2,
      },
      // A battery cabinet with its bumper plate.
      {
        id: "whipple-cabinet",
        designId: "whipple-shielding",
        brings: { kind: "component", componentId: "whipple-cabinet" },
        massKilograms: 110,
        priceMillionDollars: 5,
      },
      // A large battery bank's worth comes to 840 kg.
      {
        id: "large-battery-module",
        designId: "large-battery-banks",
        brings: { kind: "component", componentId: "large-battery-module" },
        massKilograms: 170,
        priceMillionDollars: 10,
      },
      {
        id: "large-battery-cabinet",
        designId: "large-battery-banks",
        brings: { kind: "component", componentId: "large-battery-cabinet" },
        massKilograms: 160,
        priceMillionDollars: 5,
      },
      {
        id: "mast-pole",
        designId: "light-masts",
        brings: { kind: "component", componentId: "mast-pole" },
        massKilograms: 25,
        priceMillionDollars: 1,
      },
      {
        id: "light-head",
        designId: "light-masts",
        brings: { kind: "component", componentId: "light-head" },
        massKilograms: 15,
        priceMillionDollars: 2,
      },
      // With its two light heads, a tall Light Mast's worth comes to 100 kg.
      {
        id: "tall-mast-pole",
        designId: "tall-light-masts",
        brings: { kind: "component", componentId: "tall-mast-pole" },
        massKilograms: 70,
        priceMillionDollars: 3,
      },
      // A telescope's worth comes to 260 kg and $25M: about a battery
      // bank's mass, for a little more money.
      {
        id: "telescope-optics",
        designId: "optical-telescopes",
        brings: { kind: "component", componentId: "telescope-optics" },
        massKilograms: 140,
        priceMillionDollars: 18,
      },
      {
        id: "telescope-mount",
        designId: "optical-telescopes",
        brings: { kind: "component", componentId: "telescope-mount" },
        massKilograms: 120,
        priceMillionDollars: 7,
      },
      {
        id: "habitat-core",
        designId: "inflatable-habitat",
        brings: { kind: "component", componentId: "habitat-core" },
        massKilograms: 900,
        priceMillionDollars: 200,
      },
      {
        id: "habitat-envelope",
        designId: "inflatable-habitat",
        brings: { kind: "component", componentId: "habitat-envelope" },
        massKilograms: 350,
        priceMillionDollars: 80,
      },
      {
        id: "airlock",
        designId: "inflatable-habitat",
        brings: { kind: "component", componentId: "airlock" },
        massKilograms: 400,
        priceMillionDollars: 60,
      },
      // In place of the habitat envelope, a hardened Habitat's worth comes
      // to 1850 kg, still within one Launch.
      {
        id: "armoured-habitat-envelope",
        designId: "hardened-habitat",
        brings: { kind: "component", componentId: "armoured-habitat-envelope" },
        massKilograms: 550,
        priceMillionDollars: 120,
      },
      // A landing pad's worth comes to 1240 kg, leaving room on the same
      // Launch for a battery bank's modules.
      {
        id: "pad-panel",
        designId: "landing-pads",
        brings: { kind: "component", componentId: "pad-panel" },
        massKilograms: 150,
        priceMillionDollars: 3,
      },
      {
        id: "pad-beacon",
        designId: "landing-pads",
        brings: { kind: "component", componentId: "pad-beacon" },
        massKilograms: 40,
        priceMillionDollars: 6,
      },
      // Four of them, round a lit landing pad's edge, add 60 kg to a landing
      // pad's worth.
      {
        id: "landing-floodlight",
        designId: "landing-pad-lights",
        brings: { kind: "component", componentId: "landing-floodlight" },
        massKilograms: 15,
        priceMillionDollars: 2,
      },
      // A parking area's worth of four comes to 60 kg.
      {
        id: "bay-socket",
        designId: "parking-areas",
        brings: { kind: "component", componentId: "bay-socket" },
        massKilograms: 15,
        priceMillionDollars: 1,
      },
      {
        id: "spare-component",
        designId: "maintenance-spares",
        brings: { kind: "component", componentId: "spare-component" },
        massKilograms: 20,
        priceMillionDollars: 1,
      },
      // An extraction plant's worth comes to 1000 kg.
      {
        id: "extraction-reactor",
        designId: "regolith-extraction",
        brings: { kind: "component", componentId: "extraction-reactor" },
        massKilograms: 700,
        priceMillionDollars: 45,
      },
      {
        id: "oxygen-separator",
        designId: "regolith-extraction",
        brings: { kind: "component", componentId: "oxygen-separator" },
        massKilograms: 300,
        priceMillionDollars: 30,
      },
      // With an oxygen separator, a large extraction plant's worth comes to
      // 1200 kg.
      {
        id: "molten-regolith-cell",
        designId: "molten-regolith-electrolysis",
        brings: { kind: "component", componentId: "molten-regolith-cell" },
        massKilograms: 900,
        priceMillionDollars: 65,
      },
      // A water-processing plant's worth comes to 400 kg.
      {
        id: "ice-melter",
        designId: "water-processing",
        brings: { kind: "component", componentId: "ice-melter" },
        massKilograms: 250,
        priceMillionDollars: 15,
      },
      {
        id: "water-purifier",
        designId: "water-processing",
        brings: { kind: "component", componentId: "water-purifier" },
        massKilograms: 150,
        priceMillionDollars: 20,
      },
      // With an ice melter, an electrolysis plant's worth comes to 550 kg.
      {
        id: "electrolyser-stack",
        designId: "water-electrolysis",
        brings: { kind: "component", componentId: "electrolyser-stack" },
        massKilograms: 300,
        priceMillionDollars: 30,
      },
      // A vacuum fabrication plant's worth comes to 750 kg, leaving room on
      // the same Launch for a second solar array to power it.
      {
        id: "crystal-furnace",
        designId: "vacuum-fabrication",
        brings: { kind: "component", componentId: "crystal-furnace" },
        massKilograms: 500,
        priceMillionDollars: 40,
      },
      {
        id: "wafer-saw",
        designId: "vacuum-fabrication",
        brings: { kind: "component", componentId: "wafer-saw" },
        massKilograms: 250,
        priceMillionDollars: 25,
      },
      // A circuit board plant's worth comes to 600 kg.
      {
        id: "circuit-etcher",
        designId: "circuit-board-fabrication",
        brings: { kind: "component", componentId: "circuit-etcher" },
        massKilograms: 350,
        priceMillionDollars: 35,
      },
      {
        id: "reflow-oven",
        designId: "circuit-board-fabrication",
        brings: { kind: "component", componentId: "reflow-oven" },
        massKilograms: 250,
        priceMillionDollars: 25,
      },
      // With a crystal furnace, an integrated fabrication plant's worth
      // comes to 900 kg.
      {
        id: "board-assembly-line",
        designId: "integrated-fabrication",
        brings: { kind: "component", componentId: "board-assembly-line" },
        massKilograms: 400,
        priceMillionDollars: 45,
      },
      // In pressurised tanks, which make up the rest of the mass.
      {
        id: "oxygen",
        designId: "life-support-resupply",
        brings: { kind: "life-support", stockId: "oxygen", kilograms: 25 },
        massKilograms: 40,
        priceMillionDollars: 2,
      },
      {
        id: "water",
        designId: "life-support-resupply",
        brings: { kind: "life-support", stockId: "water", kilograms: 50 },
        massKilograms: 60,
        priceMillionDollars: 2,
      },
      // Oxygen shipped as a cold liquid in one large insulated tank, and
      // water in a large light tank: six times as much as a resupply tank
      // each, a third more oxygen and an eighth more water for each
      // kilogram shipped, at half the price for each kilogram.
      {
        id: "liquid-oxygen-tank",
        designId: "bulk-supply-tanks",
        brings: { kind: "life-support", stockId: "oxygen", kilograms: 150 },
        massKilograms: 180,
        priceMillionDollars: 6,
      },
      {
        id: "bulk-water-tank",
        designId: "bulk-supply-tanks",
        brings: { kind: "life-support", stockId: "water", kilograms: 300 },
        massKilograms: 320,
        priceMillionDollars: 6,
      },
      // Shipped empty and folded; a water wall's worth comes to 240 kg.
      {
        id: "water-wall-bladder",
        designId: "water-wall-shielding",
        brings: { kind: "component", componentId: "water-wall-bladder" },
        massKilograms: 60,
        priceMillionDollars: 5,
      },
      // A humanoid Robot built for the Moon, crated with its spares and
      // tools. With the Launch fee, one costs half the Programme Grant, so
      // a second Robot is a real choice against Components and supplies.
      {
        id: "robot",
        designId: "robots",
        brings: { kind: "robot" },
        massKilograms: 300,
        priceMillionDollars: 50,
      },
    ],
  },
  // From a few hours to two Lunations. The short ones pay more Science an
  // hour, but the player has to come back to start the next; the long ones
  // run unattended, through a Night, a round trip of the Lander or longer.
  // Some are offered only once the Design they study is unlocked. Run back to
  // back, they take about ten Lunations, so research carries on long after
  // the base is self-sufficient.
  researchTasks: [
    {
      id: "regolith-sample-analysis",
      label: "Regolith sample analysis",
      lengthHours: 6,
      science: 5,
    },
    {
      id: "ice-volatiles-assay",
      label: "Ice volatiles assay",
      lengthHours: 12,
      science: 8,
    },
    {
      id: "radiation-environment-survey",
      label: "Radiation environment survey",
      lengthHours: 24,
      science: 12,
    },
    {
      id: "robot-teamwork-trial",
      label: "Robot teamwork trial",
      lengthHours: 36,
      science: 16,
      requiresDesignId: "robots",
    },
    {
      id: "dust-levitation-study",
      label: "Dust levitation study",
      lengthHours: 48,
      science: 20,
    },
    {
      id: "sintered-block-testing",
      label: "Sintered block testing",
      lengthHours: 48,
      science: 20,
      requiresDesignId: "regolith-sintering",
    },
    {
      id: "dust-adhesion-trial",
      label: "Dust adhesion trial",
      lengthHours: 60,
      science: 25,
      requiresDesignId: "dust-sealed-solar-arrays",
    },
    {
      id: "cryogenic-boil-off-trial",
      label: "Cryogenic boil-off trial",
      lengthHours: 60,
      science: 25,
      requiresDesignId: "bulk-supply-tanks",
    },
    {
      id: "lander-turnaround-study",
      label: "Lander turnaround study",
      lengthHours: 60,
      science: 25,
    },
    {
      id: "seismic-monitoring",
      label: "Seismic monitoring",
      lengthHours: 72,
      science: 30,
    },
    {
      id: "plume-erosion-survey",
      label: "Plume erosion survey",
      lengthHours: 72,
      science: 30,
    },
    {
      id: "water-wall-dosimetry",
      label: "Water-wall dosimetry",
      lengthHours: 72,
      science: 30,
      requiresDesignId: "water-wall-shielding",
    },
    {
      id: "thin-film-cell-ageing-study",
      label: "Thin-film cell ageing study",
      lengthHours: 84,
      science: 35,
      requiresDesignId: "thin-film-solar-cells",
    },
    {
      id: "molten-regolith-assay",
      label: "Molten regolith assay",
      lengthHours: 90,
      science: 40,
      requiresDesignId: "molten-regolith-electrolysis",
    },
    {
      id: "electrolysis-yield-trial",
      label: "Electrolysis yield trial",
      lengthHours: 96,
      science: 45,
      requiresDesignId: "water-electrolysis",
    },
    {
      id: "night-surface-photometry",
      label: "Night surface photometry",
      lengthHours: 108,
      science: 48,
      requiresDesignId: "tall-light-masts",
    },
    {
      id: "hypervelocity-impact-testing",
      label: "Hypervelocity impact testing",
      lengthHours: 120,
      science: 50,
      requiresDesignId: "whipple-shielding",
    },
    {
      id: "thermal-cycling-survey",
      label: "Thermal cycling survey",
      lengthHours: 132,
      science: 52,
    },
    {
      id: "micrometeorite-flux-count",
      label: "Micrometeorite flux count",
      lengthHours: 144,
      science: 55,
    },
    {
      id: "low-frequency-radio-survey",
      label: "Low-frequency radio survey",
      lengthHours: 168,
      science: 60,
    },
    {
      id: "battery-cold-soak-cycling",
      label: "Battery cold-soak cycling",
      lengthHours: 192,
      science: 66,
      requiresDesignId: "large-battery-banks",
    },
    {
      id: "deployment-hinge-fatigue-study",
      label: "Deployment hinge fatigue study",
      lengthHours: 192,
      science: 66,
      requiresDesignId: "prefabricated-solar-arrays",
    },
    {
      id: "heat-flow-measurement",
      label: "Heat flow measurement",
      lengthHours: 240,
      science: 80,
    },
    {
      id: "night-landing-trials",
      label: "Night landing trials",
      lengthHours: 240,
      science: 80,
      requiresDesignId: "landing-pad-lights",
    },
    {
      id: "microwave-penetration-trial",
      label: "Microwave penetration trial",
      lengthHours: 288,
      science: 94,
      requiresDesignId: "microwave-sintering",
    },
    {
      id: "dust-screen-efficiency-trial",
      label: "Dust screen efficiency trial",
      lengthHours: 336,
      science: 108,
      requiresDesignId: "electrodynamic-dust-screens",
    },
    {
      id: "envelope-wear-audit",
      label: "Envelope wear audit",
      lengthHours: 432,
      science: 135,
      requiresDesignId: "hardened-habitat",
    },
    {
      id: "lunar-wafer-yield-survey",
      label: "Lunar wafer yield survey",
      lengthHours: 480,
      science: 148,
      requiresDesignId: "integrated-fabrication",
    },
    {
      id: "solar-wind-volatiles-survey",
      label: "Solar wind volatiles survey",
      lengthHours: 576,
      science: 172,
    },
    // A whole Lunation.
    {
      id: "lunar-laser-ranging",
      label: "Lunar laser ranging",
      lengthHours: 708,
      science: 205,
    },
    {
      id: "deep-regolith-core-study",
      label: "Deep regolith core study",
      lengthHours: 960,
      science: 270,
    },
    // Two Lunations.
    {
      id: "long-stay-health-study",
      label: "Long-stay health study",
      lengthHours: 1416,
      science: 380,
    },
  ],
  // A round takes two Earth Days of a telescope's observing at Night and
  // earns 6 Science, so one telescope earns some 28 Science a Lunation,
  // through its 228 hours of Night: about an eighth of what Research Tasks
  // run back to back pay in a Lunation. A second telescope doubles it, for
  // its price and its power through the Night. The telescope's Design
  // pays for itself in about two Lunations of observing.
  observingProgramme: {
    label: "Night-sky survey",
    lengthHours: 48,
    science: 6,
  },
  designCategories: [
    { id: "power", label: "Power" },
    { id: "construction", label: "Construction" },
    { id: "protection", label: "Protection" },
    { id: "life-support", label: "Life Support" },
    { id: "industry", label: "Industry" },
    { id: "mobility", label: "Mobility" },
  ],
  // Everything the base could have before the Tech Tree belongs to a
  // starting Design. The rest cost, between them, a little less Science than
  // the Research Tasks pay, many of which are offered only once a Design is
  // unlocked, so the research list grows with the tree. The cost rises with
  // depth: the first Designs past a starting one mostly take a few Earth
  // Days of research, those past them a Lunation or so each.
  designs: [
    {
      id: "solar-arrays",
      label: "Solar arrays",
      description:
        "Solar panels on a mast, which generate power in Daylight and nothing at Night.",
      category: "power",
      starting: true,
      scienceCost: 0,
      prerequisiteDesignIds: [],
    },
    {
      id: "battery-banks",
      label: "Battery banks",
      description:
        "Battery modules in a cabinet, which store power in Daylight to use at Night.",
      category: "power",
      starting: true,
      scienceCost: 0,
      prerequisiteDesignIds: [],
    },
    {
      id: "large-battery-banks",
      label: "Large battery banks",
      description:
        "Bigger battery banks, to carry more of the base through the Night.",
      category: "power",
      starting: false,
      scienceCost: 25,
      prerequisiteDesignIds: ["battery-banks"],
    },
    {
      id: "thin-film-solar-cells",
      label: "Thin-film solar cells",
      description:
        "Thin, light solar cells on a flexible backing, for a solar array that generates more for the mass it ships.",
      category: "power",
      starting: false,
      scienceCost: 150,
      prerequisiteDesignIds: ["solar-arrays", "vacuum-fabrication"],
    },
    {
      id: "tall-light-masts",
      label: "Tall Light Masts",
      description:
        "A taller Light Mast with two light heads, which lights a far wider circle at Night, drawing a little more than a battery bank stores.",
      category: "power",
      starting: false,
      scienceCost: 150,
      prerequisiteDesignIds: ["light-masts", "large-battery-banks"],
    },
    {
      id: "light-masts",
      label: "Light Masts",
      description:
        "Lights on a pole, which switch on by themselves at Night to light up the ground round them.",
      category: "construction",
      starting: true,
      scienceCost: 0,
      prerequisiteDesignIds: [],
    },
    {
      id: "maintenance-spares",
      label: "Maintenance spares",
      description:
        "Spare Components, which the Robot uses up restoring the Condition of what has worn down.",
      category: "construction",
      starting: true,
      scienceCost: 0,
      prerequisiteDesignIds: [],
    },
    {
      id: "prefabricated-solar-arrays",
      label: "Prefabricated solar arrays",
      description:
        "Solar arrays put together and tested on Earth, shipped folded on their mast, so that they go up in under half the hours.",
      category: "construction",
      starting: false,
      scienceCost: 20,
      prerequisiteDesignIds: ["solar-arrays"],
    },
    {
      id: "regolith-sintering",
      label: "Regolith sintering",
      description:
        "Fusing Regolith into a hard slab with heat as it is printed, so that the regolith printer can lay a landing pad with no Components from Earth, from Regolith the excavator digs on site.",
      category: "construction",
      starting: false,
      scienceCost: 40,
      prerequisiteDesignIds: ["regolith-shielding"],
    },
    {
      id: "microwave-sintering",
      label: "Microwave sintering",
      description:
        "Microwaves that fuse each layer of Regolith as the regolith printer lays it, so that it prints shielding over a Habitat in under half the hours.",
      category: "construction",
      starting: false,
      scienceCost: 200,
      prerequisiteDesignIds: ["regolith-sintering"],
    },
    {
      id: "regolith-shielding",
      label: "Regolith shielding",
      description:
        "A shell of Regolith, dug on site by the excavator and printed over a Habitat, which cuts the Radiation Dose inside.",
      category: "protection",
      starting: true,
      scienceCost: 0,
      prerequisiteDesignIds: [],
    },
    {
      id: "dust-sealed-solar-arrays",
      label: "Dust-sealed solar arrays",
      description:
        "Solar arrays with their tracking drive and hinges sealed against Dust, so that they wear down more slowly.",
      category: "protection",
      starting: false,
      scienceCost: 20,
      prerequisiteDesignIds: ["solar-arrays"],
    },
    {
      id: "electrodynamic-dust-screens",
      label: "Electrodynamic dust screens",
      description:
        "Electrodes woven through a dust-sealed solar array's panels, which push Dust off the cells, so that it coats them far more slowly.",
      category: "protection",
      starting: false,
      scienceCost: 200,
      prerequisiteDesignIds: ["dust-sealed-solar-arrays"],
    },
    {
      id: "whipple-shielding",
      label: "Whipple shielding",
      description:
        "A thin bumper plate standing clear of a battery bank's cabinet, which shatters a Micrometeorite before it strikes.",
      category: "protection",
      starting: false,
      scienceCost: 60,
      prerequisiteDesignIds: ["regolith-shielding", "battery-banks"],
    },
    {
      id: "water-wall-shielding",
      label: "Water-wall shielding",
      description:
        "Bladders of water laid over a Habitat's Regolith shielding, which stop much of the radiation that gets through Regolith.",
      category: "protection",
      starting: false,
      scienceCost: 40,
      prerequisiteDesignIds: ["regolith-shielding"],
    },
    {
      id: "hardened-habitat",
      label: "Hardened Habitat",
      description:
        "An inflatable Habitat with an envelope layered like a Whipple shield, which Micrometeorites and Plume Ejecta wear down far less.",
      category: "protection",
      starting: false,
      scienceCost: 320,
      prerequisiteDesignIds: ["whipple-shielding", "inflatable-habitat"],
    },
    {
      id: "inflatable-habitat",
      label: "Inflatable Habitat",
      description:
        "A Habitat kit with an airlock, which the Mission Director can live in once it is commissioned.",
      category: "life-support",
      starting: true,
      scienceCost: 0,
      prerequisiteDesignIds: [],
    },
    {
      id: "life-support-resupply",
      label: "Life support resupply",
      description: "Oxygen and water in pressurised tanks, shipped from Earth.",
      category: "life-support",
      starting: true,
      scienceCost: 0,
      prerequisiteDesignIds: [],
    },
    {
      id: "water-processing",
      label: "Water processing",
      description:
        "A Plant that melts water ice and purifies it into water for the Mission Director.",
      category: "life-support",
      starting: true,
      scienceCost: 0,
      prerequisiteDesignIds: [],
    },
    {
      id: "water-electrolysis",
      label: "Water electrolysis",
      description:
        "A Plant that melts water ice and splits the water into oxygen with power from the base, far faster than Regolith gives it up.",
      category: "life-support",
      starting: false,
      scienceCost: 60,
      prerequisiteDesignIds: ["water-processing"],
    },
    {
      id: "bulk-supply-tanks",
      label: "Bulk supply tanks",
      description:
        "Oxygen shipped as a cold liquid, and water, in large light tanks that bring far more for the mass they take up on a Launch, built on what Water electrolysis taught about storing oxygen.",
      category: "life-support",
      starting: false,
      scienceCost: 180,
      prerequisiteDesignIds: ["life-support-resupply", "water-electrolysis"],
    },
    {
      id: "regolith-extraction",
      label: "Regolith extraction",
      description:
        "A Plant that turns Regolith into oxygen, metals and silicon.",
      category: "industry",
      starting: true,
      scienceCost: 0,
      prerequisiteDesignIds: [],
    },
    {
      id: "vacuum-fabrication",
      label: "Vacuum fabrication",
      description:
        "A Plant that grows silicon crystals in the Moon's vacuum and saws them into wafers.",
      category: "industry",
      starting: true,
      scienceCost: 0,
      prerequisiteDesignIds: [],
    },
    {
      id: "circuit-board-fabrication",
      label: "Circuit board fabrication",
      description: "A Plant that etches wafers and metals into circuit boards.",
      category: "industry",
      starting: true,
      scienceCost: 0,
      prerequisiteDesignIds: [],
    },
    {
      id: "molten-regolith-electrolysis",
      label: "Molten regolith electrolysis",
      description:
        "A larger extraction plant that melts Regolith through and splits it by electrolysis, making more oxygen, metals and silicon for each kW.",
      category: "industry",
      starting: false,
      scienceCost: 120,
      prerequisiteDesignIds: ["regolith-extraction"],
    },
    {
      id: "integrated-fabrication",
      label: "Integrated fabrication",
      description:
        "A single Plant that grows wafers and turns them straight into circuit boards, fed with the silicon a large extraction plant makes.",
      category: "industry",
      starting: false,
      scienceCost: 340,
      prerequisiteDesignIds: [
        "molten-regolith-electrolysis",
        "circuit-board-fabrication",
      ],
    },
    // An Industry Design, as the Plants' are: a Structure that, once
    // commissioned, makes something by itself, here Science from the
    // Night sky. In the first rank, needing only battery banks to carry it
    // through the Night, and leading to nothing else: it adds Science, and
    // the base needs it for nothing.
    {
      id: "optical-telescopes",
      label: "Optical telescopes",
      description:
        "A telescope that observes the sky at Night for the base's standing observing programme, earning a little Science with every round it completes.",
      category: "industry",
      starting: false,
      scienceCost: 60,
      prerequisiteDesignIds: ["battery-banks"],
    },
    {
      id: "landing-pads",
      label: "Landing pads",
      description:
        "A paved pad with a beacon, where the Lander lands without blasting Plume Ejecta over the base.",
      category: "mobility",
      starting: true,
      scienceCost: 0,
      prerequisiteDesignIds: [],
    },
    // Only for tidiness, so it is there from the start.
    {
      id: "parking-areas",
      label: "Parking areas",
      description:
        "Graded, marked ground with bays, each with a power socket, where the Robot parks idle Machines and the Rover together to keep warm through the Night.",
      category: "mobility",
      starting: true,
      scienceCost: 0,
      prerequisiteDesignIds: [],
    },
    // Cheap, and needing nothing first, so that the first few Research
    // Tasks pay for a second Robot to share the work.
    {
      id: "robots",
      label: "Robots",
      description:
        "More of the humanoid Robots that carry out the Work Orders, shipped from Earth to share the work.",
      category: "mobility",
      starting: false,
      scienceCost: 20,
      prerequisiteDesignIds: [],
    },
    // Planned as a Rover with a cabin, but the base has the one Rover and
    // no rule for another, so this Mobility Design lights a landing pad
    // instead.
    {
      id: "landing-pad-lights",
      label: "Landing pad lights",
      description:
        "Lights round a landing pad's edge, which switch on by themselves at Night, so that the Lander can be seen landing and unloading.",
      category: "mobility",
      starting: false,
      scienceCost: 220,
      prerequisiteDesignIds: ["landing-pads", "tall-light-masts"],
    },
  ],
  // Reaching past everything that lands beside the Lander, so the base has
  // to grow away from it. Five take-offs and landings, two and a half round
  // trips, break anything left standing near it.
  plumeEjecta: { radiusMetres: 30, conditionLossPercent: 20 },
  // Two blasts of Plume Ejecta call for Maintenance. Bringing a Broken
  // Structure back to 100% takes five spare Components.
  maintenance: {
    thresholdPercent: 70,
    spareComponentId: "spare-component",
    conditionPercentPerSpareComponent: 20,
    loadingHours: 0.25,
    workHours: 2,
  },
  // Below half its Condition, a Structure's output falls in step with it.
  structurePerformance: { thresholdPercent: 50, exponent: 1 },
  // A clean array is coated past the threshold in under a Lunation's
  // Daylight, by then losing nearly a fifth of its output.
  dustCoating: {
    percentPerDaylightHour: 0.1,
    outputLossAtFullCoating: 0.6,
    cleaningThresholdPercent: 30,
    cleaningHours: 1,
  },
  // Below half its Condition, a Machine works and drives slower in step
  // with it.
  machinePerformance: { thresholdPercent: 50, exponent: 1 },
  // A Night unpowered takes nearly half a Machine's Condition. A bay up to
  // 25 m further off than the nearest powered Structure adds at most an
  // hour and a quarter to the regolith printer's drive, the slowest, and
  // about two hours to the Robot's walk back, so that both Machines and
  // the Rover are still parked in the lead time.
  cold: { plugInReachMetres: 3, parkingLeadHours: 6, bayDetourMetres: 25 },
  // A couple of strikes a Lunation, rarely enough on their own to break
  // anything at full Condition.
  micrometeorites: {
    earthDaysBetween: { min: 4, max: 20 },
    conditionLossPercent: { min: 5, max: 25 },
  },
  // As for oxygen and water. The starting stock lasts longer than the first
  // at the wear of ordinary work, but not with Machines in the cold.
  spareComponentWarningEarthDaysLeft: [7, 3, 1],
  milestones: [
    {
      id: "power-storage",
      label: "Power storage before the first Night",
      hint: "Build the battery banks from the starting stock beside a solar array, so the base has stored power when the first Night falls: the Habitat needs all of them to get through one.",
      condition: { kind: "power-storage-commissioned" },
    },
    {
      id: "moved-in",
      label: "Habitat commissioned, Mission Director moved in",
      hint: "Build the inflatable Habitat from the starting stock on the power network, and once every battery bank is commissioned and the status panel shows them fully charged, press Move in beside it in the Structures list.",
      condition: { kind: "mission-director-moved-in" },
    },
    {
      id: "lander-departs",
      label: "Lander departs",
      hint: "The Programme Grant pays for the Launches until Exports earn: put a landing pad's panels and beacon on the Launch manifest, with oxygen, water and spare Components, then Send the Lander from the status panel. Keep enough for the export Plants on the next.",
      condition: { kind: "lander-took-off" },
    },
    {
      id: "habitat-shielded",
      label: "Habitat shielded",
      hint: "Plan Regolith shielding over the Mission Director's Habitat: the excavator digs the Regolith and the Regolith printer prints it, cutting the Radiation Dose inside to a twentieth.",
      condition: { kind: "habitat-shielded" },
    },
    {
      id: "landing-pad",
      label: "Landing pad",
      hint: "Put the landing pad's pad panels and beacon on the Launch manifest, then build a landing pad clear of the base, so the Lander stops blasting Plume Ejecta over it.",
      condition: { kind: "landing-pad-commissioned" },
    },
    {
      id: "first-research-task",
      label: "First Research Task",
      hint: "Open Research Tasks in the top bar and start one: it runs by itself and pays Science, which unlocks Designs on the Tech Tree.",
      condition: { kind: "research-task-completed" },
    },
    {
      id: "first-export",
      label: "First Export",
      hint: "Ship an extraction plant, a vacuum fabrication plant and a second solar array to power them, to make wafers from Regolith. Switch the extraction plant to metals and silicon in the Base panel, as its oxygen recipe makes too little silicon, and ship oxygen until you switch it back. Load the wafers on the Launch manifest's Exports tab and send the Lander: they sell as it reaches Earth.",
      condition: { kind: "export-sold" },
    },
    {
      id: "oxygen-self-sufficient",
      label: "Oxygen self-sufficiency",
      hint: "Switch the extraction plant back to oxygen in the Base panel, and keep it making oxygen from Regolith until the base's Plants have made at least as much as the Mission Director breathes over a whole Lunation.",
      condition: { kind: "self-sufficient", stockId: "oxygen" },
    },
    {
      id: "water-self-sufficient",
      label: "Water self-sufficiency",
      hint: "Ship a water-processing plant and send Expeditions for water ice, until the base's Plants have made at least as much water as the Mission Director drinks over a whole Lunation.",
      condition: { kind: "self-sufficient", stockId: "water" },
    },
  ],
};
