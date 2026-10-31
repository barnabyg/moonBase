import * as THREE from "three";
import { catalogue } from "../catalogue";
// In the order they were first written, so that the materials they make at load
// keep their ids, which the renderer sorts by when it draws.
import {
  createSolarArrayModel,
  SOLAR_ARRAY,
  SOLAR_ARRAY_SHAPES,
} from "./solar-array-model";
export { createPlumeModel, type PlumeModel } from "./plume-model";
import {
  createLightMastModel,
  LIGHT_MAST,
  TALL_LIGHT_MAST,
} from "./light-mast-model";
import { createTelescopeModel } from "./telescope-model";
import {
  createBuriedHabitatModel,
  createHabitatModel,
  createRegolithShieldingModel,
  createWaterWallModel,
  HABITAT,
  HARDENED_HABITAT,
  REGOLITH_SHIELDING,
  SINTERED_REGOLITH_SHIELDING,
} from "./habitat-models";
export { BURIED_HABITAT_HATCH_OUT, HABITAT_HATCH_OUT } from "./habitat-models";
import {
  BATTERY_BANK,
  createBatteryBankModel,
  LARGE_BATTERY_BANK,
  THERMAL_STORE,
  WHIPPLE_SHIELDED_BATTERY_BANK,
} from "./battery-bank-models";
import { createConcentratorTowerModel } from "./concentrator-tower-model";
import {
  createLandingPadModel,
  createParkingAreaModel,
  createSinteredLandingPadModel,
  LANDING_PAD,
  LIT_LANDING_PAD,
} from "./landing-pad-models";
export { printingAt } from "./landing-pad-models";
export {
  createCrateModel,
  createIceStoreModel,
  createStockpileModel,
} from "./stockpile-models";
export {
  createRoverModel,
  MACHINE_SEAT_HEIGHT,
  type RoverModel,
} from "./rover-model";
import { createPlantModel, PLANT_SHAPES } from "./plant-models";

// Low-poly models built in code, with physically based materials (ADR-0004).
// Sizes are in metres, and each model stands on the ground at its origin.
// Each kind has a file of its own; createStructureModel is the way to a
// Structure's model.

/** The parts of a Structure the Construction views animate, whatever its type. */
export interface StructureModel {
  readonly group: THREE.Group;
  /** From 0, nothing assembled, to 1, complete. */
  setAssembled(fraction: number): void;
  /** Turns any sun-tracking part to face the given direction (radians, as for Object3D.rotation.y). */
  setFacing(angle: number): void;
  /** The light on the base: off, amber while Commissioning, green once commissioned and powered. */
  setStatusLight(state: "off" | "testing" | "on"): void;
  /** Shows how full any storage is, from 0 to 1. */
  setCharge(fraction: number): void;
  /** Switches any light on or off. */
  setLit(on: boolean): void;
  /**
   * Shows a Plant at work, or a telescope observing, or either standing
   * still; nothing for anything else.
   */
  setRunning?(running: boolean, realSeconds: number): void;
  /** Shows that the Mission Director lives in a Habitat; nothing for anything else. */
  setOccupied?(occupied: boolean): void;
  /** How high above the ground any light it has shines from. */
  readonly lightHeight?: number;
}

/**
 * The model for a type of Structure from the data catalogue. Given the
 * ground's material, what is made of the ground's own Regolith is drawn in
 * it; a preview of it, with no need to match, goes without.
 */
export function createStructureModel(
  structureTypeId: string,
  groundMaterial?: THREE.Material,
): StructureModel {
  if (structureTypeId === "battery-bank") {
    return createBatteryBankModel(BATTERY_BANK);
  }
  if (structureTypeId === "large-battery-bank") {
    return createBatteryBankModel(LARGE_BATTERY_BANK);
  }
  if (structureTypeId === "light-mast") return createLightMastModel(LIGHT_MAST);
  if (structureTypeId === "tall-light-mast") {
    return createLightMastModel(TALL_LIGHT_MAST);
  }
  if (structureTypeId === "concentrator-tower") {
    return createConcentratorTowerModel();
  }
  if (structureTypeId === "thermal-store") {
    return createBatteryBankModel(THERMAL_STORE);
  }
  if (structureTypeId === "whipple-shielded-battery-bank") {
    return createBatteryBankModel(WHIPPLE_SHIELDED_BATTERY_BANK);
  }
  if (structureTypeId === "habitat") return createHabitatModel(HABITAT);
  if (structureTypeId === "hardened-habitat") {
    return createHabitatModel(HARDENED_HABITAT);
  }
  if (structureTypeId === "regolith-shielding") {
    return createRegolithShieldingModel(REGOLITH_SHIELDING, groundMaterial);
  }
  if (structureTypeId === "sintered-regolith-shielding") {
    return createRegolithShieldingModel(
      SINTERED_REGOLITH_SHIELDING,
      groundMaterial,
    );
  }
  if (structureTypeId === "water-wall") return createWaterWallModel();
  if (structureTypeId === "buried-habitat") {
    return createBuriedHabitatModel(groundMaterial);
  }
  if (structureTypeId === "landing-pad") {
    return createLandingPadModel(LANDING_PAD);
  }
  if (structureTypeId === "lit-landing-pad") {
    return createLandingPadModel(LIT_LANDING_PAD);
  }
  if (structureTypeId === "sintered-landing-pad") {
    return createSinteredLandingPadModel();
  }
  if (structureTypeId === "telescope") return createTelescopeModel();
  const type = catalogue.structureTypes.find(
    (candidate) => candidate.id === structureTypeId,
  );
  if (type?.parking !== undefined) {
    return createParkingAreaModel(type.footprintRadiusMetres, type.parking);
  }
  const plant = PLANT_SHAPES[structureTypeId];
  if (plant !== undefined) return createPlantModel(plant);
  const array = createSolarArrayModel(
    SOLAR_ARRAY_SHAPES[structureTypeId] ?? SOLAR_ARRAY,
  );
  return {
    group: array.group,
    setAssembled: (fraction) => {
      array.setUnfolded(fraction);
    },
    setFacing: (angle) => {
      array.setFacing(angle);
    },
    setStatusLight: (state) => {
      array.setStatusLight(state);
    },
    setCharge: () => undefined,
    setLit: () => undefined,
  };
}
