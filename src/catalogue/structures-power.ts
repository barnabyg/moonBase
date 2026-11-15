import type { StructureType } from "./types";

// Power stores and concentrators. The solar arrays are in solar-arrays.ts.
// structures.ts lists them in catalogue order.

// A ring of mirrors on the ground throwing the sun onto one receiver on a
// tower, which makes as much as ten solar arrays. They would cost $110M and
// two Launches, or $250M dust-screened, against $2000M, so this isn't for
// saving money: ten arrays are ten cables, ten footprints, and ten visits a
// Lunation from a Robot with a Dust coating to clean, and between them they
// take over 15 spare Components a Lunation at a plain array's wear, against
// about 1 here. So it is what a base buys that has come to count its Robot's hours and its
// metals rather than its Funding: the other way to the same power is an array
// works, which spends the metals and silicon instead.
export const concentratorTower: StructureType = {
  id: "concentrator-tower",
  label: "Concentrator tower",
  designId: "concentrator-towers",
  listGroup: "power",
  footprintRadiusMetres: 5.5,
  components: [
    { componentId: "heliostat-panel", count: 6 },
    { componentId: "receiver-tower", count: 1 },
  ],
  dismantlingSpareComponents: 2,
  stageHours: {
    sitePreparation: 6,
    componentDelivery: 3,
    assembly: 14,
    commissioning: 3,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.2,
  dustWearPercentPerHour: 0.03,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  // The drives that keep the mirrors on the receiver.
  power: {
    generationKilowatts: 100,
    storageKilowattHours: 0,
    drawKilowatts: 0.2,
    nightDrawKilowatts: 0,
  },
  lightRadiusMetres: 0,
  habitat: false,
  shieldsHabitat: false,
  landingPad: false,
};

// The battery banks: two sizes, each in a plain cabinet or a Whipple-shielded
// one, whose thin bumper plate standing clear of it shatters a Micrometeorite
// before it strikes, so that each strike takes a quarter of the Condition off
// it. The player plans a battery bank or a large one, and chooses the cabinet
// in placing it. Both cabinets stay on sale, as the shield is a trade: more
// protection for more mass and money.

interface BatterySize {
  readonly large: boolean;
  readonly designId: string;
  readonly module: { readonly componentId: string; readonly count: number };
  readonly cabinetId: string;
  readonly shieldedCabinetId: string;
  readonly footprintRadiusMetres: number;
  readonly stageHours: StructureType["stageHours"];
  readonly power: StructureType["power"];
}

const SMALL: BatterySize = {
  large: false,
  designId: "battery-banks",
  module: { componentId: "battery-module", count: 3 },
  cabinetId: "battery-cabinet",
  shieldedCabinetId: "whipple-cabinet",
  footprintRadiusMetres: 2,
  stageHours: {
    sitePreparation: 1,
    componentDelivery: 1,
    assembly: 2,
    commissioning: 1,
  },
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
};

// Four times a battery bank's storage, in denser cells, so it ships
// about half the mass and costs about half as much for each kWh. It
// takes longer to build, and its heaters draw more, if less for each kWh.
const LARGE: BatterySize = {
  large: true,
  designId: "large-battery-banks",
  module: { componentId: "large-battery-module", count: 4 },
  cabinetId: "large-battery-cabinet",
  shieldedCabinetId: "large-whipple-cabinet",
  footprintRadiusMetres: 3,
  stageHours: {
    sitePreparation: 2,
    componentDelivery: 1.5,
    assembly: 4,
    commissioning: 1.5,
  },
  // The heaters that keep the cells warm enough to work: three times a
  // battery bank's, for four times the storage.
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 800,
    drawKilowatts: 0.2,
    nightDrawKilowatts: 0,
  },
};

const WHIPPLE_SHIELDING = "whipple-shielding";

function batteryBankType(size: BatterySize, shielded: boolean): StructureType {
  const name = `${size.large ? "large " : ""}battery bank`;
  return {
    id: `${shielded ? "whipple-shielded-" : ""}${name.replaceAll(" ", "-")}`,
    label: shielded
      ? `Whipple-shielded ${name}`
      : name.charAt(0).toUpperCase() + name.slice(1),
    designId: shielded ? WHIPPLE_SHIELDING : size.designId,
    ...(shielded && size.large ? { alsoNeedsDesignIds: [size.designId] } : {}),
    listGroup: "power",
    batteryBank: { large: size.large, shielded },
    footprintRadiusMetres: size.footprintRadiusMetres,
    components: [
      size.module,
      {
        componentId: shielded ? size.shieldedCabinetId : size.cabinetId,
        count: 1,
      },
    ],
    dismantlingSpareComponents: 1,
    stageHours: size.stageHours,
    stageMachines: { sitePreparation: "excavator" },
    commissioningFailureChance: 0.2,
    dustWearPercentPerHour: 0.02,
    hazardMultipliers: {
      dustCoating: 1,
      micrometeorites: shielded ? 0.25 : 1,
      plumeEjecta: 1,
    },
    power: size.power,
    lightRadiusMetres: 0,
    habitat: false,
    shieldsHabitat: false,
    landingPad: false,
  };
}

export const batteryBank = batteryBankType(SMALL, false);
export const whippleShieldedBatteryBank = batteryBankType(SMALL, true);
export const largeBatteryBank = batteryBankType(LARGE, false);
export const whippleShieldedLargeBatteryBank = batteryBankType(LARGE, true);

// A block of sintered Regolith, heated through by day, that gives the heat
// back through an exchanger by night: 6000 kWh, enough to run a circuit board
// chain's 13 kW through a whole Night and more, which makes half as many
// circuit boards again from the same Plants. Seven and a half large battery
// banks store as much for $340M, but take four Launches, $600M of fees, and
// with their 1.5 kW of heaters and all that wear ask for 5 more spare
// Components a Lunation, against this one's 0.3 kW and single Launch. So it is
// for a base that means to run its Plants at Night, and would rather pay once.
export const thermalStore: StructureType = {
  id: "thermal-store",
  label: "Thermal store",
  designId: "thermal-storage",
  listGroup: "power",
  footprintRadiusMetres: 4.5,
  components: [
    { componentId: "heat-store-core", count: 3 },
    { componentId: "thermal-exchanger", count: 1 },
  ],
  dismantlingSpareComponents: 2,
  stageHours: {
    sitePreparation: 6,
    componentDelivery: 3,
    assembly: 12,
    commissioning: 3,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.2,
  dustWearPercentPerHour: 0.01,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 6000,
    drawKilowatts: 0.3,
    nightDrawKilowatts: 0,
  },
  lightRadiusMetres: 0,
  habitat: false,
  shieldsHabitat: false,
  landingPad: false,
};
