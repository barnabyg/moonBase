// The Structures that can be planned.
//
// Dismantling a Structure gives back spare Components rather than what it was
// built from, more for a larger or more complex one, as its Assembly hours
// measure: 1 under 8 hours, 2 up to 19, 3 up to 39, 4 up to 99, and 6 from
// 100. One made from Regolith alone gives back none, or printing shielding
// from free Regolith would make spares, which is the Workshop's job. None
// costs less on a Launch than the spares it gives back.
//
// Each Structure type is in the structures-*.ts file of its listGroup
// (Industry's in two), and is listed below in catalogue order, the order the
// Base panel lists each group in. A new one goes in both, as the catalogue
// tests check.

import { solarArrayTypes } from "./solar-arrays";
import {
  concentratorTower,
  batteryBank,
  whippleShieldedBatteryBank,
  largeBatteryBank,
  thermalStore,
} from "./structures-power";
import { lightMast, tallLightMast } from "./structures-lights";
import { telescope } from "./structures-science";
import {
  habitat,
  hardenedHabitat,
  regolithShielding,
  sinteredRegolithShielding,
  waterWall,
  vaultCistern,
  buriedHabitat,
  crewHabitat,
} from "./structures-habitats";
import {
  landingPad,
  sinteredLandingPad,
  litLandingPad,
  parkingArea,
} from "./structures-landing-and-parking";
import {
  extractionPlant,
  largeExtractionPlant,
  propellantPlant,
  largePropellantPlant,
} from "./structures-industry-refining";
import {
  waterProcessingPlant,
  electrolysisPlant,
  greenhouse,
  growingHall,
  coldTrapIceLine,
} from "./structures-life-support";
import {
  vacuumFabricationPlant,
  circuitBoardPlant,
  integratedFabricationPlant,
  opticsWorks,
  grindingLine,
  arrayWorks,
  workshop,
} from "./structures-industry-fabrication";
import { propellantTank, waterTank, oxygenTank } from "./structures-tanks";
import type { Catalogue } from "./types";

export const structureTypes: Catalogue["structureTypes"] = [
  ...solarArrayTypes,
  concentratorTower,
  batteryBank,
  whippleShieldedBatteryBank,
  largeBatteryBank,
  lightMast,
  tallLightMast,
  telescope,
  habitat,
  hardenedHabitat,
  regolithShielding,
  sinteredRegolithShielding,
  waterWall,
  vaultCistern,
  buriedHabitat,
  crewHabitat,
  landingPad,
  sinteredLandingPad,
  litLandingPad,
  parkingArea,
  extractionPlant,
  largeExtractionPlant,
  waterProcessingPlant,
  electrolysisPlant,
  vacuumFabricationPlant,
  circuitBoardPlant,
  integratedFabricationPlant,
  propellantPlant,
  largePropellantPlant,
  propellantTank,
  greenhouse,
  growingHall,
  opticsWorks,
  grindingLine,
  thermalStore,
  waterTank,
  oxygenTank,
  coldTrapIceLine,
  arrayWorks,
  workshop,
];

export const structureListGroups: Catalogue["structureListGroups"] = [
  { id: "habitats", label: "Habitats" },
  { id: "power", label: "Power" },
  { id: "lights", label: "Lights" },
  { id: "landing-and-parking", label: "Landing and parking" },
  { id: "life-support", label: "Life support" },
  { id: "industry", label: "Industry" },
  { id: "tanks", label: "Tanks" },
  { id: "science", label: "Science" },
];
