import type { Catalogue } from "./types";

// What the base keeps and uses up: bulk resources, Exports, Components, its
// starting stock, and what the Mission Director needs to stay alive.

export const bulkResources: Catalogue["bulkResources"] = [
  { id: "regolith", label: "Regolith" },
  { id: "metals", label: "Metals" },
  { id: "silicon", label: "Silicon" },
  { id: "wafers", label: "Wafers" },
  { id: "circuit-boards", label: "Circuit boards" },
  { id: "water-ice", label: "Water ice" },
];

// About as long as an Expedition takes to bring more water ice. Regolith
// never shows it while the excavator is free, as digging starts well before.
export const bulkResourceWarningEarthDaysLeft: Catalogue["bulkResourceWarningEarthDaysLeft"] = 3;

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
export const exports: Catalogue["exports"] = [
  { resourceId: "wafers", priceMillionDollarsPerKilogram: 1.5 },
  { resourceId: "circuit-boards", priceMillionDollarsPerKilogram: 3 },
];

// Digging from one level to the other is about a day's work, wearing the
// excavator down by some 8 percentage points, and an extraction plant
// takes some ten days of Daylight to use that much. Filling the stock
// from empty takes about two.
export const digging: Catalogue["digging"] = {
  machineTypeId: "excavator",
  resourceId: "regolith",
  refillBelowKilograms: 1000,
  fullKilograms: 2000,
  kilogramsPerWorkingHour: 50,
};

export const componentTypes: Catalogue["componentTypes"] = [
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
  { id: "machine-tool", label: "Machine tool" },
  { id: "casting-furnace", label: "Casting furnace" },
  // Labelled a pad light because the Glossary avoids "floodlight", but
  // saves from version 32 on name it by this id, so the id stays.
  { id: "landing-floodlight", label: "Pad light" },
  { id: "vault-section", label: "Vault section" },
  { id: "deep-life-support-core", label: "Deep life support core" },
  { id: "water-wall-bladder", label: "Water-wall bladder" },
  { id: "bay-socket", label: "Bay socket" },
  { id: "telescope-optics", label: "Telescope optics" },
  { id: "telescope-mount", label: "Telescope mount" },
];

export const startingStock: Catalogue["startingStock"] = [
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
];

// Enough for about 30 Earth Days at a person's daily use; the oxygen runs
// out first.
export const lifeSupportStocks: Catalogue["lifeSupportStocks"] = [
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
];

// A whole Lunation, so that a Night when the Plants stand idle, or the
// time between Expeditions, doesn't take self-sufficiency away.
export const selfSufficiency: Catalogue["selfSufficiency"] = {
  windowLunations: 1,
  recordHours: 6,
};
