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
  };
  /**
   * The base's stock of Components, kept on the ground beside the landing
   * site. It belongs to the base, not the Lander, and stays when the Lander
   * leaves.
   */
  readonly stockpile: {
    /** Radius of the ground the stockpile stands on; Structures may not be placed over it. */
    readonly footprintRadiusMetres: number;
  };
  /**
   * Where the Lander has touched down, and the base's stockpile, Robots and
   * Machines stand, when a Campaign begins.
   */
  readonly landingSite: {
    readonly landerPosition: GroundPosition;
    readonly stockpilePosition: GroundPosition;
    readonly robotPositions: readonly GroundPosition[];
    readonly machines: readonly {
      readonly machineTypeId: string;
      readonly position: GroundPosition;
    }[];
  };
  /** The game speeds the player can choose between, in the order they are offered. */
  readonly gameSpeeds: readonly GameSpeed[];
  readonly lunation: LunationSchedule;
  readonly robot: {
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
  };
  readonly machineTypes: readonly MachineType[];
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
  /**
   * A warning comes as the time until the Habitat the Mission Director lives
   * in loses power falls to each of these many game-hours, largest first.
   * Each must come to a whole number of game-minutes. The Habitat is supplied
   * before anything else on its power network, and losing its power kills
   * the Mission Director at once.
   */
  readonly habitatPowerWarningHoursLeft: readonly number[];
  readonly radiation: RadiationRules;
  readonly solarParticleEvents: SolarParticleEventRules;
  /**
   * The fixed lump of Funding the Mission Director starts the Campaign with,
   * the only money there is until Exports earn more.
   */
  readonly programmeGrantMillionDollars: number;
  readonly launch: LaunchRules;
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
}

/**
 * Dust settling on solar arrays, which cuts their output until the Robot
 * cleans it off as Maintenance.
 */
export interface DustCoatingRules {
  /** How much a solar array's coating builds up in each game-hour of Daylight, in percentage points. */
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
   * and landing, in percentage points of the 100% it starts with.
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
  /** What one of it brings: a Component, or a set amount of oxygen or water. */
  readonly brings:
    | { readonly kind: "component"; readonly componentId: string }
    | {
        readonly kind: "life-support";
        readonly stockId: string;
        readonly kilograms: number;
      };
  /** Its mass, packing and any tank included, which counts towards the Payload Mass. */
  readonly massKilograms: number;
  readonly priceMillionDollars: number;
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
  /** Radius of the ground the Machine stands on; Structures may not be placed over it. */
  readonly footprintRadiusMetres: number;
  /** How far the Machine goes in a game-hour while a Robot drives it. */
  readonly drivingSpeedMetresPerHour: number;
  /** The Robot's working time to set the Machine going once it is in position, in game-hours. */
  readonly activationHours: number;
  /**
   * How much Condition Dust wears off it for each game-hour it works by
   * itself on a stage of Construction, in percentage points.
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
  /** What the commissioned Structure does on the power network. */
  readonly power: {
    /** The power it generates in Daylight; nothing generates at Night. */
    readonly generationKilowatts: number;
    /** The energy it can store. */
    readonly storageKilowattHours: number;
    /** The power it draws all the time, for its own controls and heaters. */
    readonly drawKilowatts: number;
    /** The extra power it draws at Night only, while its light is on. */
    readonly nightDrawKilowatts: number;
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
}

export interface GameSpeed {
  readonly id: string;
  readonly label: string;
  readonly gameMinutesPerRealSecond: number;
}

export const catalogue: Catalogue = {
  version: 21,
  map: { widthMetres: 1000, depthMetres: 1000 },
  lander: {
    footprintRadiusMetres: 4,
    roundTripEarthDays: { toEarth: 3, turnaround: 4, toMoon: 3 },
    cargoHandlingHours: 1,
  },
  stockpile: { footprintRadiusMetres: 1.5 },
  landingSite: {
    landerPosition: { x: 0, y: 0 },
    // On the side the camera first looks from, clear of the ground beside
    // the Lander.
    stockpilePosition: { x: 9, y: -10 },
    robotPositions: [{ x: 6, y: -3 }],
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
  },
  machineTypes: [
    {
      id: "excavator",
      label: "Excavator",
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
      footprintRadiusMetres: 1.8,
      drivingSpeedMetresPerHour: 20,
      activationHours: 0.5,
      dustWearPercentPerWorkingHour: 0.3,
      dustWearPercentPerDrivingHour: 0.2,
      heaterKilowatts: 0.2,
      coldWearPercentPerNightHour: 0.2,
    },
  ],
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
  ],
  structureTypes: [
    {
      id: "solar-array",
      label: "Solar array",
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
    {
      id: "battery-bank",
      label: "Battery bank",
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
      // The heaters that keep the cells warm enough to work.
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 60,
        drawKilowatts: 0.25,
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
    {
      id: "habitat",
      label: "Inflatable Habitat",
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
    {
      id: "regolith-shielding",
      label: "Regolith shielding",
      // The same as the Habitat's, so that the excavator, left beside the
      // Habitat after grading its site, isn't in the way.
      footprintRadiusMetres: 4,
      // The printer takes its Regolith straight from the ground.
      components: [],
      stageHours: {
        sitePreparation: 3,
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
    {
      id: "landing-pad",
      label: "Landing pad",
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
  ],
  dismantlingLossShare: 0.2,
  startingStock: [
    { componentId: "solar-panel", count: 2 },
    { componentId: "array-mast", count: 1 },
    { componentId: "battery-module", count: 3 },
    { componentId: "battery-cabinet", count: 1 },
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
  habitatPowerWarningHoursLeft: [24, 6, 1],
  // The limit is a career limit for astronauts. Unshielded, the dose rate is
  // tuned well above the roughly 1.4 mSv an Earth Day measured on the lunar
  // surface, so that the limit comes in 20 Earth Days and shielding the
  // Habitat is urgent. Shielding cuts it to a tenth.
  radiation: {
    doseRateMillisievertsPerEarthDay: {
      lander: 0,
      habitat: 30,
      shieldedHabitat: 3,
    },
    doseLimitMillisieverts: 600,
    warningEarthDaysLeft: [7, 3, 1],
  },
  // Roughly one a Lunation, with a few hours' warning. One lasting an Earth
  // Day or so takes half the dose limit in an unshielded Habitat, but a
  // twentieth in a shielded one.
  solarParticleEvents: {
    earthDaysBetween: { min: 10, max: 30 },
    durationHours: { min: 6, max: 30 },
    warningHours: 4,
    doseRateMultiplier: 10,
  },
  // Enough for one well-filled Launch, so the first one has to count.
  // Exports earn more later.
  programmeGrantMillionDollars: 400,
  // Each Launch carries two tonnes and costs a fixed fee for the flight, on
  // top of the price of what it brings. The Habitat kit is by far the
  // dearest, so the Funding runs out before the Payload Mass does if a
  // Launch brings two.
  launch: {
    payloadMassLimitKilograms: 2000,
    feeMillionDollars: 150,
    items: [
      {
        id: "solar-panel",
        brings: { kind: "component", componentId: "solar-panel" },
        massKilograms: 60,
        priceMillionDollars: 4,
      },
      {
        id: "array-mast",
        brings: { kind: "component", componentId: "array-mast" },
        massKilograms: 80,
        priceMillionDollars: 3,
      },
      {
        id: "battery-module",
        brings: { kind: "component", componentId: "battery-module" },
        massKilograms: 120,
        priceMillionDollars: 6,
      },
      {
        id: "battery-cabinet",
        brings: { kind: "component", componentId: "battery-cabinet" },
        massKilograms: 70,
        priceMillionDollars: 2,
      },
      {
        id: "mast-pole",
        brings: { kind: "component", componentId: "mast-pole" },
        massKilograms: 25,
        priceMillionDollars: 1,
      },
      {
        id: "light-head",
        brings: { kind: "component", componentId: "light-head" },
        massKilograms: 15,
        priceMillionDollars: 2,
      },
      {
        id: "habitat-core",
        brings: { kind: "component", componentId: "habitat-core" },
        massKilograms: 900,
        priceMillionDollars: 200,
      },
      {
        id: "habitat-envelope",
        brings: { kind: "component", componentId: "habitat-envelope" },
        massKilograms: 350,
        priceMillionDollars: 80,
      },
      {
        id: "airlock",
        brings: { kind: "component", componentId: "airlock" },
        massKilograms: 400,
        priceMillionDollars: 60,
      },
      // A landing pad's worth comes to 1240 kg, leaving room on the same
      // Launch for a battery bank's modules.
      {
        id: "pad-panel",
        brings: { kind: "component", componentId: "pad-panel" },
        massKilograms: 150,
        priceMillionDollars: 3,
      },
      {
        id: "pad-beacon",
        brings: { kind: "component", componentId: "pad-beacon" },
        massKilograms: 40,
        priceMillionDollars: 6,
      },
      {
        id: "spare-component",
        brings: { kind: "component", componentId: "spare-component" },
        massKilograms: 20,
        priceMillionDollars: 1,
      },
      // In pressurised tanks, which make up the rest of the mass.
      {
        id: "oxygen",
        brings: { kind: "life-support", stockId: "oxygen", kilograms: 25 },
        massKilograms: 40,
        priceMillionDollars: 2,
      },
      {
        id: "water",
        brings: { kind: "life-support", stockId: "water", kilograms: 50 },
        massKilograms: 60,
        priceMillionDollars: 2,
      },
    ],
  },
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
  // A Night unpowered takes nearly half a Machine's Condition.
  cold: { plugInReachMetres: 3, parkingLeadHours: 6 },
};
