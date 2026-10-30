import type { Catalogue } from "./types";

// The ground the base stands on, the Lander that serves it, and the Lunations
// and game speeds it all runs by.

export const map: Catalogue["map"] = { widthMetres: 1000, depthMetres: 1000 };

export const lander: Catalogue["lander"] = {
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
};

// A full stock of Regolith really makes a cone about 1.2 m in radius and
// 0.85 m high, a little smaller than the stockpile's mat. It is drawn about
// a third larger, about 1.6 m in radius and 1.1 m high, to look bigger.
export const stockpile: Catalogue["stockpile"] = {
  footprintRadiusMetres: 1.5,
  regolithHeap: {
    bulkDensityKilogramsPerCubicMetre: 1500,
    slopeDegrees: 35,
    drawnLargerBy: 1.3,
    smallestRadiusMetres: 0.3,
    gapFromFootprintMetres: 0.1,
  },
  // A container for each Expedition's ice, which is about the 0.22 m³ one
  // of these holds, and enough to show the stock of several Expeditions.
  iceStore: {
    containers: 7,
    kilogramsPerContainer: 200,
    smallestLevel: 0.1,
    radiusMetres: 1.2,
    gapFromFootprintMetres: 0.3,
  },
};

export const landingSite: Catalogue["landingSite"] = {
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
};

export const gameSpeeds: Catalogue["gameSpeeds"] = [
  { id: "paused", label: "Pause", gameMinutesPerRealSecond: 0 },
  { id: "1x", label: "1x", gameMinutesPerRealSecond: 6 },
  { id: "5x", label: "5x", gameMinutesPerRealSecond: 30 },
  { id: "20x", label: "20x", gameMinutesPerRealSecond: 120 },
];

export const lunation: Catalogue["lunation"] = {
  daylightEarthDays: 20,
  nightEarthDays: 9.5,
  initialDaylightRemainingEarthDays: 8,
};
