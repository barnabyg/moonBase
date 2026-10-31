import {
  map,
  lander,
  stockpile,
  landingSite,
  gameSpeeds,
  lunation,
} from "./site";
import { robot, machineTypes, rover, expeditions } from "./workers";
import {
  bulkResources,
  bulkResourceWarningEarthDaysLeft,
  exports,
  digging,
  componentTypes,
  startingStock,
  lifeSupportStocks,
  selfSufficiency,
} from "./resources";
import { structureTypes, dismantlingLossShare } from "./structures";
import { programmeGrantMillionDollars, launch } from "./launch";
import {
  researchTasks,
  observingProgramme,
  designCategories,
  designs,
} from "./research";
import {
  habitatPowerWarningHoursLeft,
  nightReserveHours,
  radiation,
  solarParticleEvents,
  plumeEjecta,
  maintenance,
  structurePerformance,
  dustCoating,
  machinePerformance,
  cold,
  micrometeorites,
  spareComponentWarningEarthDaysLeft,
} from "./hazards";
import { acts, milestones } from "./milestones";
import type { Catalogue } from "./types";

/**
 * The whole data catalogue, put together from its domains' files in this
 * directory, with its types in `types.ts`.
 */
export const catalogue: Catalogue = {
  version: 65,
  map,
  lander,
  stockpile,
  landingSite,
  gameSpeeds,
  lunation,
  robot,
  machineTypes,
  rover,
  expeditions,
  bulkResources,
  exports,
  digging,
  componentTypes,
  structureTypes,
  dismantlingLossShare,
  startingStock,
  lifeSupportStocks,
  selfSufficiency,
  habitatPowerWarningHoursLeft,
  nightReserveHours,
  radiation,
  solarParticleEvents,
  programmeGrantMillionDollars,
  launch,
  researchTasks,
  observingProgramme,
  designCategories,
  designs,
  plumeEjecta,
  maintenance,
  structurePerformance,
  dustCoating,
  machinePerformance,
  cold,
  micrometeorites,
  spareComponentWarningEarthDaysLeft,
  bulkResourceWarningEarthDaysLeft,
  acts,
  milestones,
};
