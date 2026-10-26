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
  };
  /** Where the Lander has touched down, and its Robots and Machines stand, when a Campaign begins. */
  readonly landingSite: {
    readonly landerPosition: GroundPosition;
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
    /** How far outside a footprint, or beside the Lander, a Robot stands to work. */
    readonly workingGapMetres: number;
    /** How much power cable a Robot lays in a game-hour, walking along as it pays it out. */
    readonly cableLayingSpeedMetresPerHour: number;
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
  /** The Components in the Lander's cargo stock when a Campaign begins. */
  readonly startingCargo: readonly ComponentCount[];
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
   * Lander and unloading at the site, and is 0 for a Structure with no
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
}

export interface GameSpeed {
  readonly id: string;
  readonly label: string;
  readonly gameMinutesPerRealSecond: number;
}

export const catalogue: Catalogue = {
  version: 10,
  map: { widthMetres: 1000, depthMetres: 1000 },
  lander: { footprintRadiusMetres: 4 },
  landingSite: {
    landerPosition: { x: 0, y: 0 },
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
  },
  machineTypes: [
    {
      id: "excavator",
      label: "Excavator",
      footprintRadiusMetres: 1.6,
      drivingSpeedMetresPerHour: 30,
      activationHours: 0.25,
    },
    {
      id: "regolith-printer",
      label: "Regolith printer",
      footprintRadiusMetres: 1.8,
      drivingSpeedMetresPerHour: 20,
      activationHours: 0.5,
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
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0,
      },
      lightRadiusMetres: 0,
      habitat: false,
      shieldsHabitat: true,
    },
  ],
  dismantlingLossShare: 0.2,
  startingCargo: [
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
  // Roughly monthly, with a few hours' warning. An event of a day or so
  // takes half the dose limit in an unshielded Habitat, but a twentieth in
  // a shielded one.
  solarParticleEvents: {
    earthDaysBetween: { min: 10, max: 30 },
    durationHours: { min: 6, max: 30 },
    warningHours: 4,
    doseRateMultiplier: 10,
  },
};
