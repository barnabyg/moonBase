import type { Catalogue } from "./types";

// The Programme Grant, and what a Launch can bring and costs.

// Enough for the Launches before the base earns: the first brings the
// landing pad with oxygen, water and spare Components ($200M), the second
// the export Plants and a second solar array ($301M), and the one after
// the first sale of wafers, which sell for no more than the Launch fee, a
// circuit board plant and a water-processing plant with what the base
// needs besides (about $265M, the sale paying $150M of it). From then on
// circuit boards pay for every Launch.
export const programmeGrantMillionDollars: Catalogue["programmeGrantMillionDollars"] = 650;

// Each Launch carries two tonnes and costs a fixed fee for the flight, on
// top of the price of what it brings. The Habitat kit is by far the
// dearest, so the Funding runs out before the Payload Mass does if a
// Launch brings two. A landing pad and supplies fill one Launch, and an
// extraction plant, a vacuum fabrication plant and a second solar array
// to power them (1950 kg) another.
export const launch: Catalogue["launch"] = {
  payloadMassLimitKilograms: 2000,
  feeMillionDollars: 150,
  items: [
    {
      id: "solar-panel",
      designId: "solar-arrays",
      brings: { kind: "component", componentId: "solar-panel" },
      massKilograms: 60,
      priceMillionDollars: 4,
    },
    {
      id: "array-mast",
      designId: "solar-arrays",
      brings: { kind: "component", componentId: "array-mast" },
      massKilograms: 80,
      priceMillionDollars: 3,
    },
    // Heavier and dearer than an array mast for its seals.
    {
      id: "sealed-array-mast",
      designId: "dust-sealed-solar-arrays",
      brings: { kind: "component", componentId: "sealed-array-mast" },
      massKilograms: 100,
      priceMillionDollars: 6,
    },
    // The electrodes woven through the cells add mass and price.
    {
      id: "screened-solar-panel",
      designId: "electrodynamic-dust-screens",
      brings: { kind: "component", componentId: "screened-solar-panel" },
      massKilograms: 70,
      priceMillionDollars: 8,
    },
    // A thin-film solar array's worth, with an array mast, comes to 150 kg.
    {
      id: "thin-film-solar-panel",
      designId: "thin-film-solar-cells",
      brings: { kind: "component", componentId: "thin-film-solar-panel" },
      massKilograms: 35,
      priceMillionDollars: 7,
    },
    // A whole solar array, folded on its mast on a skid.
    {
      id: "prefabricated-array-pack",
      designId: "prefabricated-solar-arrays",
      brings: { kind: "component", componentId: "prefabricated-array-pack" },
      massKilograms: 230,
      priceMillionDollars: 14,
    },
    {
      id: "battery-module",
      designId: "battery-banks",
      brings: { kind: "component", componentId: "battery-module" },
      massKilograms: 120,
      priceMillionDollars: 6,
    },
    {
      id: "battery-cabinet",
      designId: "battery-banks",
      brings: { kind: "component", componentId: "battery-cabinet" },
      massKilograms: 70,
      priceMillionDollars: 2,
    },
    // A battery cabinet with its bumper plate.
    {
      id: "whipple-cabinet",
      designId: "whipple-shielding",
      brings: { kind: "component", componentId: "whipple-cabinet" },
      massKilograms: 110,
      priceMillionDollars: 5,
    },
    // A large battery bank's worth comes to 840 kg.
    {
      id: "large-battery-module",
      designId: "large-battery-banks",
      brings: { kind: "component", componentId: "large-battery-module" },
      massKilograms: 170,
      priceMillionDollars: 10,
    },
    {
      id: "large-battery-cabinet",
      designId: "large-battery-banks",
      brings: { kind: "component", componentId: "large-battery-cabinet" },
      massKilograms: 160,
      priceMillionDollars: 5,
    },
    {
      id: "mast-pole",
      designId: "light-masts",
      brings: { kind: "component", componentId: "mast-pole" },
      massKilograms: 25,
      priceMillionDollars: 1,
    },
    {
      id: "light-head",
      designId: "light-masts",
      brings: { kind: "component", componentId: "light-head" },
      massKilograms: 15,
      priceMillionDollars: 2,
    },
    // With its two light heads, a tall Light Mast's worth comes to 100 kg.
    {
      id: "tall-mast-pole",
      designId: "tall-light-masts",
      brings: { kind: "component", componentId: "tall-mast-pole" },
      massKilograms: 70,
      priceMillionDollars: 3,
    },
    // A telescope's worth comes to 260 kg and $25M: about a battery
    // bank's mass, for a little more money.
    {
      id: "telescope-optics",
      designId: "optical-telescopes",
      brings: { kind: "component", componentId: "telescope-optics" },
      massKilograms: 140,
      priceMillionDollars: 18,
    },
    {
      id: "telescope-mount",
      designId: "optical-telescopes",
      brings: { kind: "component", componentId: "telescope-mount" },
      massKilograms: 120,
      priceMillionDollars: 7,
    },
    {
      id: "habitat-core",
      designId: "inflatable-habitat",
      brings: { kind: "component", componentId: "habitat-core" },
      massKilograms: 900,
      priceMillionDollars: 200,
    },
    {
      id: "habitat-envelope",
      designId: "inflatable-habitat",
      brings: { kind: "component", componentId: "habitat-envelope" },
      massKilograms: 350,
      priceMillionDollars: 80,
    },
    {
      id: "airlock",
      designId: "inflatable-habitat",
      brings: { kind: "component", componentId: "airlock" },
      massKilograms: 400,
      priceMillionDollars: 60,
    },
    // In place of the habitat envelope, a hardened Habitat's worth comes
    // to 1850 kg, still within one Launch.
    {
      id: "armoured-habitat-envelope",
      designId: "hardened-habitat",
      brings: { kind: "component", componentId: "armoured-habitat-envelope" },
      massKilograms: 550,
      priceMillionDollars: 120,
    },
    // A landing pad's worth comes to 1240 kg, leaving room on the same
    // Launch for a battery bank's modules.
    {
      id: "pad-panel",
      designId: "landing-pads",
      brings: { kind: "component", componentId: "pad-panel" },
      massKilograms: 150,
      priceMillionDollars: 3,
    },
    {
      id: "pad-beacon",
      designId: "landing-pads",
      brings: { kind: "component", componentId: "pad-beacon" },
      massKilograms: 40,
      priceMillionDollars: 6,
    },
    // Four of them, round a lit landing pad's edge, add 60 kg to a landing
    // pad's worth.
    {
      id: "landing-floodlight",
      designId: "landing-pad-lights",
      brings: { kind: "component", componentId: "landing-floodlight" },
      massKilograms: 15,
      priceMillionDollars: 2,
    },
    // A parking area's worth of four comes to 60 kg.
    {
      id: "bay-socket",
      designId: "parking-areas",
      brings: { kind: "component", componentId: "bay-socket" },
      massKilograms: 15,
      priceMillionDollars: 1,
    },
    {
      id: "spare-component",
      designId: "maintenance-spares",
      brings: { kind: "component", componentId: "spare-component" },
      massKilograms: 20,
      priceMillionDollars: 1,
    },
    // An extraction plant's worth comes to 1000 kg.
    {
      id: "extraction-reactor",
      designId: "regolith-extraction",
      brings: { kind: "component", componentId: "extraction-reactor" },
      massKilograms: 700,
      priceMillionDollars: 45,
    },
    {
      id: "oxygen-separator",
      designId: "regolith-extraction",
      brings: { kind: "component", componentId: "oxygen-separator" },
      massKilograms: 300,
      priceMillionDollars: 30,
    },
    // With an oxygen separator, a large extraction plant's worth comes to
    // 1200 kg.
    {
      id: "molten-regolith-cell",
      designId: "molten-regolith-electrolysis",
      brings: { kind: "component", componentId: "molten-regolith-cell" },
      massKilograms: 900,
      priceMillionDollars: 65,
    },
    // A water-processing plant's worth comes to 400 kg.
    {
      id: "ice-melter",
      designId: "water-processing",
      brings: { kind: "component", componentId: "ice-melter" },
      massKilograms: 250,
      priceMillionDollars: 15,
    },
    {
      id: "water-purifier",
      designId: "water-processing",
      brings: { kind: "component", componentId: "water-purifier" },
      massKilograms: 150,
      priceMillionDollars: 20,
    },
    // With an ice melter, an electrolysis plant's worth comes to 550 kg.
    {
      id: "electrolyser-stack",
      designId: "water-electrolysis",
      brings: { kind: "component", componentId: "electrolyser-stack" },
      massKilograms: 300,
      priceMillionDollars: 30,
    },
    // A vacuum fabrication plant's worth comes to 750 kg, leaving room on
    // the same Launch for a second solar array to power it.
    {
      id: "crystal-furnace",
      designId: "vacuum-fabrication",
      brings: { kind: "component", componentId: "crystal-furnace" },
      massKilograms: 500,
      priceMillionDollars: 40,
    },
    {
      id: "wafer-saw",
      designId: "vacuum-fabrication",
      brings: { kind: "component", componentId: "wafer-saw" },
      massKilograms: 250,
      priceMillionDollars: 25,
    },
    // A circuit board plant's worth comes to 600 kg.
    {
      id: "circuit-etcher",
      designId: "circuit-board-fabrication",
      brings: { kind: "component", componentId: "circuit-etcher" },
      massKilograms: 350,
      priceMillionDollars: 35,
    },
    {
      id: "reflow-oven",
      designId: "circuit-board-fabrication",
      brings: { kind: "component", componentId: "reflow-oven" },
      massKilograms: 250,
      priceMillionDollars: 25,
    },
    // With a crystal furnace, an integrated fabrication plant's worth
    // comes to 900 kg.
    {
      id: "board-assembly-line",
      designId: "integrated-fabrication",
      brings: { kind: "component", componentId: "board-assembly-line" },
      massKilograms: 400,
      priceMillionDollars: 45,
    },
    // Act 3's and Act 4's. A propellant plant's worth comes to 1400 kg and $1200M,
    // a large one's to 1900 kg and $1700M, an optics works' to 1100 kg and $1200M
    // and a grinding line's to 1500 kg and $1600M.
    {
      id: "oxygen-liquefier",
      designId: "propellant-production",
      brings: { kind: "component", componentId: "oxygen-liquefier" },
      massKilograms: 400,
      priceMillionDollars: 300,
    },
    {
      id: "cryogenic-tank",
      designId: "propellant-production",
      brings: { kind: "component", componentId: "cryogenic-tank" },
      massKilograms: 300,
      priceMillionDollars: 300,
    },
    {
      id: "propellant-reactor",
      designId: "large-propellant-production",
      brings: { kind: "component", componentId: "propellant-reactor" },
      massKilograms: 500,
      priceMillionDollars: 500,
    },
    {
      id: "optical-grinder",
      designId: "precision-optics",
      brings: { kind: "component", componentId: "optical-grinder" },
      massKilograms: 400,
      priceMillionDollars: 400,
    },
    {
      id: "metrology-bench",
      designId: "precision-optics",
      brings: { kind: "component", componentId: "metrology-bench" },
      massKilograms: 300,
      priceMillionDollars: 400,
    },
    // A Workshop's worth comes to 600 kg, as much as 30 spare Components, which
    // the long-game base uses in about two Lunations, and $1000M. It is Act 2's
    // first big purchase, and by the spares alone it would never pay: what it
    // saves is the Launch that brings them, as a Launch that brings nothing pays
    // no fee, so about $170M a Lunation, back in six Lunations.
    {
      id: "machine-tool",
      designId: "parts-machining",
      brings: { kind: "component", componentId: "machine-tool" },
      massKilograms: 350,
      priceMillionDollars: 500,
    },
    {
      id: "casting-furnace",
      designId: "parts-machining",
      brings: { kind: "component", componentId: "casting-furnace" },
      massKilograms: 250,
      priceMillionDollars: 500,
    },
    // Act 2's dear choices: see "The long Campaign's Acts" in
    // docs/reference-campaign.md. Everything the reference Campaign buys has to
    // stay as cheap as it is, so a base's Funding can only come to matter in what
    // it buys later. None costs more than a vault section, the most a Launch can
    // carry on the Programme Grant alone.
    //
    // A concentrator tower's worth comes to 1900 kg and $2000M.
    {
      id: "heliostat-panel",
      designId: "concentrator-towers",
      brings: { kind: "component", componentId: "heliostat-panel" },
      massKilograms: 200,
      priceMillionDollars: 250,
    },
    {
      id: "receiver-tower",
      designId: "concentrator-towers",
      brings: { kind: "component", componentId: "receiver-tower" },
      massKilograms: 700,
      priceMillionDollars: 500,
    },
    // With a casting furnace, an array works' worth comes to 950 kg and $1500M.
    {
      id: "panel-line",
      designId: "array-fabrication",
      brings: { kind: "component", componentId: "panel-line" },
      massKilograms: 350,
      priceMillionDollars: 500,
    },
    // A thermal store's worth comes to 2000 kg and $2000M.
    {
      id: "heat-store-core",
      designId: "thermal-storage",
      brings: { kind: "component", componentId: "heat-store-core" },
      massKilograms: 600,
      priceMillionDollars: 500,
    },
    {
      id: "thermal-exchanger",
      designId: "thermal-storage",
      brings: { kind: "component", componentId: "thermal-exchanger" },
      massKilograms: 200,
      priceMillionDollars: 500,
    },
    // A cold-trap ice line's worth comes to 2000 kg and $3000M.
    {
      id: "cold-trap-head",
      designId: "cold-trap-mining",
      brings: { kind: "component", componentId: "cold-trap-head" },
      massKilograms: 800,
      priceMillionDollars: 500,
    },
    {
      id: "ice-haul-line",
      designId: "cold-trap-mining",
      brings: { kind: "component", componentId: "ice-haul-line" },
      massKilograms: 240,
      priceMillionDollars: 500,
    },
    // In pressurised tanks, which make up the rest of the mass.
    {
      id: "oxygen",
      designId: "life-support-resupply",
      brings: { kind: "life-support", stockId: "oxygen", kilograms: 25 },
      massKilograms: 40,
      priceMillionDollars: 2,
    },
    {
      id: "water",
      designId: "life-support-resupply",
      brings: { kind: "life-support", stockId: "water", kilograms: 50 },
      massKilograms: 60,
      priceMillionDollars: 2,
    },
    // Oxygen shipped as a cold liquid in one large insulated tank, and
    // water in a large light tank: six times as much as a resupply tank
    // each, a third more oxygen and an eighth more water for each
    // kilogram shipped, at half the price for each kilogram.
    {
      id: "liquid-oxygen-tank",
      designId: "bulk-supply-tanks",
      brings: { kind: "life-support", stockId: "oxygen", kilograms: 150 },
      massKilograms: 180,
      priceMillionDollars: 6,
    },
    {
      id: "bulk-water-tank",
      designId: "bulk-supply-tanks",
      brings: { kind: "life-support", stockId: "water", kilograms: 300 },
      massKilograms: 320,
      priceMillionDollars: 6,
    },
    // Shipped empty and folded; a water wall's worth comes to 240 kg.
    {
      id: "water-wall-bladder",
      designId: "water-wall-shielding",
      brings: { kind: "component", componentId: "water-wall-bladder" },
      massKilograms: 60,
      priceMillionDollars: 5,
    },
    // With the airlock, a Buried Habitat's worth comes to 5300 kg, three
    // Launches' Payload Mass, and $4510M: see the Buried Habitat in
    // structures.ts for why. A section costs what no other Launch item does,
    // the most that a Launch can carry on the Programme Grant alone.
    {
      id: "vault-section",
      designId: "buried-habitat",
      brings: { kind: "component", componentId: "vault-section" },
      massKilograms: 500,
      priceMillionDollars: 500,
    },
    {
      id: "deep-life-support-core",
      designId: "buried-habitat",
      brings: { kind: "component", componentId: "deep-life-support-core" },
      massKilograms: 900,
      priceMillionDollars: 450,
    },
    // A humanoid Robot built for the Moon, crated with its spares and
    // tools. With the Launch fee, one costs half the Programme Grant, so
    // a second Robot is a real choice against Components and supplies.
    {
      id: "robot",
      designId: "robots",
      brings: { kind: "robot" },
      massKilograms: 300,
      priceMillionDollars: 50,
    },
  ],
};
