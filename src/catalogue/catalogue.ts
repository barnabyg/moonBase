/**
 * The data catalogue: all game content and tuning numbers live here, so that
 * balancing never needs a code change. Distances are in metres and positions
 * are on the ground plane, with the origin at the centre of the base map, x
 * pointing east and y pointing north.
 */
export interface Catalogue {
  /** Bumped whenever the shape or meaning of the catalogue changes. */
  readonly version: number;
  readonly map: {
    readonly widthMetres: number;
    readonly depthMetres: number;
  };
  readonly lander: {
    /** Radius of the ground the landed Lander stands on. */
    readonly footprintRadiusMetres: number;
  };
  readonly startingScenario: {
    readonly landerPosition: CataloguePosition;
    readonly robotPositions: readonly CataloguePosition[];
  };
  /** The game speeds the player can choose between, in the order they are offered. */
  readonly gameSpeeds: readonly GameSpeed[];
}

export interface CataloguePosition {
  readonly x: number;
  readonly y: number;
}

export interface GameSpeed {
  readonly id: string;
  readonly label: string;
  readonly gameMinutesPerRealSecond: number;
}

export const catalogue: Catalogue = {
  version: 1,
  map: { widthMetres: 1000, depthMetres: 1000 },
  lander: { footprintRadiusMetres: 4 },
  startingScenario: {
    landerPosition: { x: 0, y: 0 },
    robotPositions: [{ x: 6, y: -3 }],
  },
  gameSpeeds: [
    { id: "paused", label: "Pause", gameMinutesPerRealSecond: 0 },
    { id: "1x", label: "1x", gameMinutesPerRealSecond: 6 },
    { id: "5x", label: "5x", gameMinutesPerRealSecond: 30 },
    { id: "20x", label: "20x", gameMinutesPerRealSecond: 120 },
  ],
};
