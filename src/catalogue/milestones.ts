import type { Catalogue } from "./types";

// The Milestones.

export const milestones: Catalogue["milestones"] = [
  {
    id: "power-storage",
    label: "Power storage before the first Night",
    hint: "Build the battery banks from the starting stock beside a solar array, so the base has stored power when the first Night falls: the Habitat needs all of them to get through one.",
    condition: { kind: "power-storage-commissioned" },
  },
  {
    id: "moved-in",
    label: "Habitat commissioned, Mission Director moved in",
    hint: "Build the inflatable Habitat from the starting stock on the power network, and once every battery bank is commissioned and the status panel shows them fully charged, press Move in beside it in the Structures list.",
    condition: { kind: "mission-director-moved-in" },
  },
  {
    id: "lander-departs",
    label: "Lander departs",
    hint: "The Programme Grant pays for the Launches until Exports earn: put a landing pad's panels and beacon on the Launch manifest, with oxygen, water and spare Components, then Send the Lander from the status panel. Keep enough for the export Plants on the next.",
    condition: { kind: "lander-took-off" },
  },
  {
    id: "habitat-shielded",
    label: "Habitat shielded",
    hint: "Plan Regolith shielding over the Mission Director's Habitat: the excavator digs the Regolith and the Regolith printer prints it, cutting the Radiation Dose inside to a twentieth.",
    condition: { kind: "habitat-shielded" },
  },
  {
    id: "landing-pad",
    label: "Landing pad",
    hint: "Put the landing pad's pad panels and beacon on the Launch manifest, then build a landing pad clear of the base, so the Lander stops blasting Plume Ejecta over it.",
    condition: { kind: "landing-pad-commissioned" },
  },
  {
    id: "first-research-task",
    label: "First Research Task",
    hint: "Open Research Tasks in the top bar and start one: it runs by itself and pays Science, which unlocks Designs on the Tech Tree.",
    condition: { kind: "research-task-completed" },
  },
  {
    id: "first-export",
    label: "First Export",
    hint: "Ship an extraction plant, a vacuum fabrication plant and a second solar array to power them, to make wafers from Regolith. Switch the extraction plant to metals and silicon in the Base panel, as its oxygen recipe makes too little silicon, and ship oxygen until you switch it back. Load the wafers on the Launch manifest's Exports tab and send the Lander: they sell as it reaches Earth.",
    condition: { kind: "export-sold" },
  },
  {
    id: "oxygen-self-sufficient",
    label: "Oxygen self-sufficiency",
    hint: "Switch the extraction plant back to oxygen in the Base panel, and keep it making oxygen from Regolith until the base's Plants have made at least as much as the Mission Director breathes over a whole Lunation.",
    condition: { kind: "self-sufficient", stockId: "oxygen" },
  },
  {
    id: "water-self-sufficient",
    label: "Water self-sufficiency",
    hint: "Ship a water-processing plant and send Expeditions for water ice, until the base's Plants have made at least as much water as the Mission Director drinks over a whole Lunation.",
    condition: { kind: "self-sufficient", stockId: "water" },
  },
];
