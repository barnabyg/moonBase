import type { Catalogue } from "./types";

// The Acts, and their Milestones.

export const acts: Catalogue["acts"] = [
  {
    id: "act-1",
    label: "Act 1",
    asks: "Keep the Mission Director alive, make a first sale to Earth, and have the base make its own oxygen and water.",
  },
  {
    id: "act-2",
    label: "Act 2: Independence",
    asks: "Stop relying on Earth: make your own spare Components and sell metals as well as circuit boards, and choose what Funding buys, as it no longer buys everything.",
  },
];

export const milestones: Catalogue["milestones"] = [
  {
    id: "power-storage",
    actId: "act-1",
    label: "Power storage before the first Night",
    hint: "Build the battery banks from the starting stock beside a solar array, so the base has stored power when the first Night falls: the Habitat needs all of them to get through one.",
    condition: { kind: "power-storage-commissioned" },
  },
  {
    id: "moved-in",
    actId: "act-1",
    label: "Habitat commissioned, Mission Director moved in",
    hint: "Build the inflatable Habitat from the starting stock on the power network, and once every battery bank is commissioned and the status panel shows them fully charged, press Move in beside it in the Structures list.",
    condition: { kind: "mission-director-moved-in" },
  },
  {
    id: "lander-departs",
    actId: "act-1",
    label: "Lander departs",
    hint: "The Programme Grant pays for the Launches until Exports earn: put a landing pad's panels and beacon on the Launch manifest, with oxygen, water and spare Components, then Send the Lander from the status panel. Keep enough for the export Plants on the next.",
    condition: { kind: "lander-took-off" },
  },
  {
    id: "habitat-shielded",
    actId: "act-1",
    label: "Habitat shielded",
    hint: "Plan Regolith shielding over the Mission Director's Habitat: the excavator digs the Regolith and the Regolith printer prints it, cutting the Radiation Dose inside to a twentieth.",
    condition: { kind: "habitat-shielded" },
  },
  {
    id: "landing-pad",
    actId: "act-1",
    label: "Landing pad",
    hint: "Put the landing pad's pad panels and beacon on the Launch manifest, then build a landing pad clear of the base, so the Lander stops blasting Plume Ejecta over it.",
    condition: { kind: "landing-pad-commissioned" },
  },
  {
    id: "first-research-task",
    actId: "act-1",
    label: "First Research Task",
    hint: "Open Research Tasks in the top bar and start one: it runs by itself and pays Science, which unlocks Designs on the Tech Tree.",
    condition: { kind: "research-task-completed" },
  },
  {
    id: "first-export",
    actId: "act-1",
    label: "First Export",
    hint: "Ship an extraction plant, a vacuum fabrication plant and a second solar array to power them, to make wafers from Regolith. Switch the extraction plant to metals and silicon in the Base panel, as its oxygen recipe makes too little silicon, and ship oxygen until you switch it back. Load the wafers on the Launch manifest's Exports tab and send the Lander: they sell as it reaches Earth.",
    condition: { kind: "export-sold" },
  },
  {
    id: "oxygen-self-sufficient",
    actId: "act-1",
    label: "Oxygen self-sufficiency",
    hint: "Switch the extraction plant back to oxygen in the Base panel, and keep it making oxygen from Regolith until the base's Plants have made at least as much as the Mission Director breathes over a whole Lunation.",
    condition: { kind: "self-sufficient", stockId: "oxygen" },
  },
  {
    id: "water-self-sufficient",
    actId: "act-1",
    label: "Water self-sufficiency",
    hint: "Ship a water-processing plant and send Expeditions for water ice, until the base's Plants have made at least as much water as the Mission Director drinks over a whole Lunation.",
    condition: { kind: "self-sufficient", stockId: "water" },
  },
  {
    id: "workshop-running",
    actId: "act-2",
    label: "Workshop running",
    hint: "Unlock Molten regolith electrolysis, then Parts machining, on the Tech Tree. Put a machine tool and a casting furnace on the Launch manifest, saving up for them if you have to, and build a Workshop on the power network: it makes a spare Component every Earth Day from metals, so keep some metals in stock.",
    condition: { kind: "component-being-made", componentId: "spare-component" },
  },
  {
    id: "spare-components-self-sufficient",
    actId: "act-2",
    label: "Self-sufficiency in spare Components",
    hint: "Keep the Workshop running until it has made at least as many spare Components as repairs have used over a whole Lunation: the status panel shows how it is going beside Self-sufficient. If it stands idle, it is short of metals or of power: a Plant runs only on power nothing else needs, so build another solar array. Then no Launch has to bring them, and a Launch that brings nothing pays no fee.",
    condition: { kind: "self-sufficient-in-spare-components" },
  },
  {
    id: "metals-sold",
    actId: "act-2",
    label: "Metals sold",
    hint: "Metals sell for less than circuit boards, so use them to fill what the circuit boards leave of the Return Mass: on the Launch manifest's Exports tab, load all the circuit boards there are, then metals, keeping enough for the Workshop. To have metals to spare, ship a second extraction plant, or a large one, and set it to metals and silicon.",
    condition: { kind: "export-sold", resourceId: "metals" },
  },
];
