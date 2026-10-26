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
  /** The Machine that grades a Construction's ground during Site Preparation. */
  readonly sitePreparationMachineTypeId: string;
  readonly componentTypes: readonly ComponentType[];
  /** The Structures that can be planned, in the order the build menu offers them. */
  readonly structureTypes: readonly StructureType[];
  /** The Components in the Lander's cargo stock when a Campaign begins. */
  readonly startingCargo: readonly ComponentCount[];
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
  /** The Components one Structure is assembled from. */
  readonly components: readonly ComponentCount[];
  /**
   * The working time for each stage of Construction, in game-hours. Site
   * Preparation is done by a Machine once a Robot has positioned and
   * activated it; the other stages are the Robot's own work. Walking, driving
   * and activating come on top. Component delivery is split evenly between
   * loading at the Lander and unloading at the site.
   */
  readonly stageHours: {
    readonly sitePreparation: number;
    readonly componentDelivery: number;
    readonly assembly: number;
    readonly commissioning: number;
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
  };
}

export interface GameSpeed {
  readonly id: string;
  readonly label: string;
  readonly gameMinutesPerRealSecond: number;
}

export const catalogue: Catalogue = {
  version: 2,
  map: { widthMetres: 1000, depthMetres: 1000 },
  lander: { footprintRadiusMetres: 4 },
  landingSite: {
    landerPosition: { x: 0, y: 0 },
    robotPositions: [{ x: 6, y: -3 }],
    machines: [{ machineTypeId: "excavator", position: { x: -11, y: -4.5 } }],
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
  ],
  sitePreparationMachineTypeId: "excavator",
  componentTypes: [
    { id: "solar-panel", label: "Solar panel" },
    { id: "array-mast", label: "Array mast" },
    { id: "battery-module", label: "Battery module" },
    { id: "battery-cabinet", label: "Battery cabinet" },
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
      commissioningFailureChance: 0.25,
      // The drive that keeps the panel turned to the sun.
      power: {
        generationKilowatts: 10,
        storageKilowattHours: 0,
        drawKilowatts: 0.05,
      },
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
      commissioningFailureChance: 0.2,
      // The heaters that keep the cells warm enough to work.
      power: {
        generationKilowatts: 0,
        storageKilowattHours: 60,
        drawKilowatts: 0.25,
      },
    },
  ],
  startingCargo: [
    { componentId: "solar-panel", count: 2 },
    { componentId: "array-mast", count: 1 },
    { componentId: "battery-module", count: 3 },
    { componentId: "battery-cabinet", count: 1 },
  ],
};
