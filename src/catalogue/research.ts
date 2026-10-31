import type { Catalogue } from "./types";

// The Research Tasks, the observing programme and the Tech Tree's Designs.

// From a few hours to two Lunations. The short ones pay more Science an
// hour, but the player has to come back to start the next; the long ones
// run unattended, through a Night, a round trip of the Lander or longer.
// Some are offered only once the Design they study is unlocked. Run back to
// back, they take about thirteen Lunations, so research carries on long
// after the base is self-sufficient.
export const researchTasks: Catalogue["researchTasks"] = [
  {
    id: "regolith-sample-analysis",
    label: "Regolith sample analysis",
    lengthHours: 6,
    science: 5,
  },
  {
    id: "ice-volatiles-assay",
    label: "Ice volatiles assay",
    lengthHours: 12,
    science: 8,
  },
  {
    id: "radiation-environment-survey",
    label: "Radiation environment survey",
    lengthHours: 24,
    science: 12,
  },
  {
    id: "robot-teamwork-trial",
    label: "Robot teamwork trial",
    lengthHours: 36,
    science: 16,
    requiresDesignId: "robots",
  },
  {
    id: "dust-levitation-study",
    label: "Dust levitation study",
    lengthHours: 48,
    science: 20,
  },
  {
    id: "sintered-block-testing",
    label: "Sintered block testing",
    lengthHours: 48,
    science: 20,
    requiresDesignId: "regolith-sintering",
  },
  {
    id: "dust-adhesion-trial",
    label: "Dust adhesion trial",
    lengthHours: 60,
    science: 25,
    requiresDesignId: "dust-sealed-solar-arrays",
  },
  {
    id: "cryogenic-boil-off-trial",
    label: "Cryogenic boil-off trial",
    lengthHours: 60,
    science: 25,
    requiresDesignId: "bulk-supply-tanks",
  },
  {
    id: "lander-turnaround-study",
    label: "Lander turnaround study",
    lengthHours: 60,
    science: 25,
  },
  {
    id: "seismic-monitoring",
    label: "Seismic monitoring",
    lengthHours: 72,
    science: 30,
  },
  {
    id: "plume-erosion-survey",
    label: "Plume erosion survey",
    lengthHours: 72,
    science: 30,
  },
  {
    id: "water-wall-dosimetry",
    label: "Water-wall dosimetry",
    lengthHours: 72,
    science: 30,
    requiresDesignId: "water-wall-shielding",
  },
  {
    id: "thin-film-cell-ageing-study",
    label: "Thin-film cell ageing study",
    lengthHours: 84,
    science: 35,
    requiresDesignId: "thin-film-solar-cells",
  },
  {
    id: "molten-regolith-assay",
    label: "Molten regolith assay",
    lengthHours: 90,
    science: 40,
    requiresDesignId: "molten-regolith-electrolysis",
  },
  {
    id: "electrolysis-yield-trial",
    label: "Electrolysis yield trial",
    lengthHours: 96,
    science: 45,
    requiresDesignId: "water-electrolysis",
  },
  {
    id: "night-surface-photometry",
    label: "Night surface photometry",
    lengthHours: 108,
    science: 48,
    requiresDesignId: "tall-light-masts",
  },
  {
    id: "hypervelocity-impact-testing",
    label: "Hypervelocity impact testing",
    lengthHours: 120,
    science: 50,
    requiresDesignId: "whipple-shielding",
  },
  {
    id: "thermal-cycling-survey",
    label: "Thermal cycling survey",
    lengthHours: 132,
    science: 52,
  },
  {
    id: "micrometeorite-flux-count",
    label: "Micrometeorite flux count",
    lengthHours: 144,
    science: 55,
  },
  {
    id: "low-frequency-radio-survey",
    label: "Low-frequency radio survey",
    lengthHours: 168,
    science: 60,
  },
  {
    id: "battery-cold-soak-cycling",
    label: "Battery cold-soak cycling",
    lengthHours: 192,
    science: 66,
    requiresDesignId: "large-battery-banks",
  },
  {
    id: "deployment-hinge-fatigue-study",
    label: "Deployment hinge fatigue study",
    lengthHours: 192,
    science: 66,
    requiresDesignId: "prefabricated-solar-arrays",
  },
  {
    id: "heat-flow-measurement",
    label: "Heat flow measurement",
    lengthHours: 240,
    science: 80,
  },
  {
    id: "night-landing-trials",
    label: "Night landing trials",
    lengthHours: 240,
    science: 80,
    requiresDesignId: "landing-pad-lights",
  },
  {
    id: "microwave-penetration-trial",
    label: "Microwave penetration trial",
    lengthHours: 288,
    science: 94,
    requiresDesignId: "microwave-sintering",
  },
  // Pays for most of Parts machining, as the Tech Tree is otherwise left a
  // few dozen Science short. Offered only once it is unlocked, and at the rate
  // of the other long tasks.
  {
    id: "machined-part-wear-trial",
    label: "Machined part wear trial",
    lengthHours: 336,
    science: 108,
    requiresDesignId: "parts-machining",
  },
  {
    id: "dust-screen-efficiency-trial",
    label: "Dust screen efficiency trial",
    lengthHours: 336,
    science: 108,
    requiresDesignId: "electrodynamic-dust-screens",
  },
  {
    id: "envelope-wear-audit",
    label: "Envelope wear audit",
    lengthHours: 432,
    science: 135,
    requiresDesignId: "hardened-habitat",
  },
  {
    id: "lunar-wafer-yield-survey",
    label: "Lunar wafer yield survey",
    lengthHours: 480,
    science: 148,
    requiresDesignId: "integrated-fabrication",
  },
  {
    id: "solar-wind-volatiles-survey",
    label: "Solar wind volatiles survey",
    lengthHours: 576,
    science: 172,
  },
  // A whole Lunation.
  {
    id: "lunar-laser-ranging",
    label: "Lunar laser ranging",
    lengthHours: 708,
    science: 205,
  },
  {
    id: "deep-regolith-core-study",
    label: "Deep regolith core study",
    lengthHours: 960,
    science: 270,
  },
  // Two Lunations.
  {
    id: "buried-vault-dose-survey",
    label: "Buried vault dose survey",
    // Pays for the Buried Habitat's Design, so that the whole Tech Tree stays
    // payable with the same margin as before it.
    lengthHours: 1440,
    science: 400,
    requiresDesignId: "water-wall-shielding",
  },
  {
    id: "long-stay-health-study",
    label: "Long-stay health study",
    lengthHours: 1416,
    science: 380,
  },
];

// A round takes two Earth Days of a telescope's observing at Night and
// earns 6 Science, so one telescope earns some 28 Science a Lunation,
// through its 228 hours of Night: about an eighth of what Research Tasks
// run back to back pay in a Lunation. A second telescope doubles it, for
// its price and its power through the Night. The telescope's Design
// pays for itself in about two Lunations of observing.
export const observingProgramme: Catalogue["observingProgramme"] = {
  label: "Night-sky survey",
  lengthHours: 48,
  science: 6,
};

export const designCategories: Catalogue["designCategories"] = [
  { id: "power", label: "Power" },
  { id: "construction", label: "Construction" },
  { id: "protection", label: "Protection" },
  { id: "life-support", label: "Life Support" },
  { id: "industry", label: "Industry" },
  { id: "mobility", label: "Mobility" },
];

// Everything the base could have before the Tech Tree belongs to a
// starting Design. The rest cost, between them, a little less Science than
// the Research Tasks pay, many of which are offered only once a Design is
// unlocked, so the research list grows with the tree. The cost rises with
// depth: the first Designs past a starting one mostly take a few Earth
// Days of research, those past them a Lunation or so each.
export const designs: Catalogue["designs"] = [
  {
    id: "solar-arrays",
    label: "Solar arrays",
    description:
      "Solar panels on a mast, which generate power in Daylight and nothing at Night.",
    category: "power",
    starting: true,
    scienceCost: 0,
    prerequisiteDesignIds: [],
  },
  {
    id: "battery-banks",
    label: "Battery banks",
    description:
      "Battery modules in a cabinet, which store power in Daylight to use at Night.",
    category: "power",
    starting: true,
    scienceCost: 0,
    prerequisiteDesignIds: [],
  },
  {
    id: "large-battery-banks",
    label: "Large battery banks",
    description:
      "Bigger battery banks, to carry more of the base through the Night.",
    category: "power",
    starting: false,
    scienceCost: 25,
    prerequisiteDesignIds: ["battery-banks"],
  },
  {
    id: "thin-film-solar-cells",
    label: "Thin-film solar cells",
    description:
      "Thin, light solar cells on a flexible backing, for a solar array that generates more for the mass it ships.",
    category: "power",
    starting: false,
    scienceCost: 150,
    prerequisiteDesignIds: ["solar-arrays", "vacuum-fabrication"],
  },
  {
    id: "tall-light-masts",
    label: "Tall Light Masts",
    description:
      "A taller Light Mast with two light heads, which lights a far wider circle at Night, drawing a little more than a battery bank stores.",
    category: "power",
    starting: false,
    scienceCost: 150,
    prerequisiteDesignIds: ["light-masts", "large-battery-banks"],
  },
  {
    id: "light-masts",
    label: "Light Masts",
    description:
      "Lights on a pole, which switch on by themselves at Night to light up the ground round them.",
    category: "construction",
    starting: true,
    scienceCost: 0,
    prerequisiteDesignIds: [],
  },
  {
    id: "maintenance-spares",
    label: "Maintenance spares",
    description:
      "Spare Components, which the Robot uses up restoring the Condition of what has worn down.",
    category: "construction",
    starting: true,
    scienceCost: 0,
    prerequisiteDesignIds: [],
  },
  {
    id: "prefabricated-solar-arrays",
    label: "Prefabricated solar arrays",
    description:
      "Solar arrays put together and tested on Earth, shipped folded on their mast, so that they go up in under half the hours.",
    category: "construction",
    starting: false,
    scienceCost: 20,
    prerequisiteDesignIds: ["solar-arrays"],
  },
  {
    id: "regolith-sintering",
    label: "Regolith sintering",
    description:
      "Fusing Regolith into a hard slab with heat as it is printed, so that the regolith printer can lay a landing pad with no Components from Earth, from Regolith the excavator digs on site.",
    category: "construction",
    starting: false,
    scienceCost: 40,
    prerequisiteDesignIds: ["regolith-shielding"],
  },
  {
    id: "microwave-sintering",
    label: "Microwave sintering",
    description:
      "Microwaves that fuse each layer of Regolith as the regolith printer lays it, so that it prints shielding over a Habitat in under half the hours.",
    category: "construction",
    starting: false,
    scienceCost: 200,
    prerequisiteDesignIds: ["regolith-sintering"],
  },
  {
    id: "regolith-shielding",
    label: "Regolith shielding",
    description:
      "A shell of Regolith, dug on site by the excavator and printed over a Habitat, which cuts the Radiation Dose inside.",
    category: "protection",
    starting: true,
    scienceCost: 0,
    prerequisiteDesignIds: [],
  },
  {
    id: "dust-sealed-solar-arrays",
    label: "Dust-sealed solar arrays",
    description:
      "Solar arrays with their tracking drive and hinges sealed against Dust, so that they wear down more slowly.",
    category: "protection",
    starting: false,
    scienceCost: 20,
    prerequisiteDesignIds: ["solar-arrays"],
  },
  {
    id: "electrodynamic-dust-screens",
    label: "Electrodynamic dust screens",
    description:
      "Electrodes woven through a dust-sealed solar array's panels, which push Dust off the cells, so that it coats them far more slowly.",
    category: "protection",
    starting: false,
    scienceCost: 200,
    prerequisiteDesignIds: ["dust-sealed-solar-arrays"],
  },
  {
    id: "whipple-shielding",
    label: "Whipple shielding",
    description:
      "A thin bumper plate standing clear of a battery bank's cabinet, which shatters a Micrometeorite before it strikes.",
    category: "protection",
    starting: false,
    scienceCost: 60,
    prerequisiteDesignIds: ["regolith-shielding", "battery-banks"],
  },
  // The dearest Design of all, past the water wall, as the end of what can
  // be done about the Radiation Dose. Its Science comes from a Research Task
  // of its own, the Buried vault dose survey.
  {
    id: "buried-habitat",
    label: "Buried Habitat",
    description:
      "A pressure vault sunk in a trench and heaped over with metres of Regolith, which cuts the Radiation Dose inside to a tenth of a water wall's.",
    category: "protection",
    starting: false,
    scienceCost: 400,
    prerequisiteDesignIds: ["water-wall-shielding"],
  },
  {
    id: "water-wall-shielding",
    label: "Water-wall shielding",
    description:
      "Bladders of water laid over a Habitat's Regolith shielding, which stop much of the radiation that gets through Regolith.",
    category: "protection",
    starting: false,
    scienceCost: 40,
    prerequisiteDesignIds: ["regolith-shielding"],
  },
  {
    id: "hardened-habitat",
    label: "Hardened Habitat",
    description:
      "An inflatable Habitat with an envelope layered like a Whipple shield, which Micrometeorites and Plume Ejecta wear down far less.",
    category: "protection",
    starting: false,
    scienceCost: 320,
    prerequisiteDesignIds: ["whipple-shielding", "inflatable-habitat"],
  },
  {
    id: "inflatable-habitat",
    label: "Inflatable Habitat",
    description:
      "A Habitat kit with an airlock, which the Mission Director can live in once it is commissioned.",
    category: "life-support",
    starting: true,
    scienceCost: 0,
    prerequisiteDesignIds: [],
  },
  {
    id: "life-support-resupply",
    label: "Life support resupply",
    description: "Oxygen and water in pressurised tanks, shipped from Earth.",
    category: "life-support",
    starting: true,
    scienceCost: 0,
    prerequisiteDesignIds: [],
  },
  {
    id: "water-processing",
    label: "Water processing",
    description:
      "A Plant that melts water ice and purifies it into water for the Mission Director.",
    category: "life-support",
    starting: true,
    scienceCost: 0,
    prerequisiteDesignIds: [],
  },
  {
    id: "water-electrolysis",
    label: "Water electrolysis",
    description:
      "A Plant that melts water ice and splits the water into oxygen with power from the base, far faster than Regolith gives it up.",
    category: "life-support",
    starting: false,
    scienceCost: 60,
    prerequisiteDesignIds: ["water-processing"],
  },
  {
    id: "bulk-supply-tanks",
    label: "Bulk supply tanks",
    description:
      "Oxygen shipped as a cold liquid, and water, in large light tanks that bring far more for the mass they take up on a Launch, built on what Water electrolysis taught about storing oxygen.",
    category: "life-support",
    starting: false,
    scienceCost: 180,
    prerequisiteDesignIds: ["life-support-resupply", "water-electrolysis"],
  },
  {
    id: "regolith-extraction",
    label: "Regolith extraction",
    description: "A Plant that turns Regolith into oxygen, metals and silicon.",
    category: "industry",
    starting: true,
    scienceCost: 0,
    prerequisiteDesignIds: [],
  },
  {
    id: "vacuum-fabrication",
    label: "Vacuum fabrication",
    description:
      "A Plant that grows silicon crystals in the Moon's vacuum and saws them into wafers.",
    category: "industry",
    starting: true,
    scienceCost: 0,
    prerequisiteDesignIds: [],
  },
  {
    id: "circuit-board-fabrication",
    label: "Circuit board fabrication",
    description: "A Plant that etches wafers and metals into circuit boards.",
    category: "industry",
    starting: true,
    scienceCost: 0,
    prerequisiteDesignIds: [],
  },
  {
    id: "molten-regolith-electrolysis",
    label: "Molten regolith electrolysis",
    description:
      "A larger extraction plant that melts Regolith through and splits it by electrolysis, making more oxygen, metals and silicon for each kW.",
    category: "industry",
    starting: false,
    scienceCost: 120,
    prerequisiteDesignIds: ["regolith-extraction"],
  },
  {
    id: "integrated-fabrication",
    label: "Integrated fabrication",
    description:
      "A single Plant that grows wafers and turns them straight into circuit boards, fed with the silicon a large extraction plant makes.",
    category: "industry",
    starting: false,
    scienceCost: 340,
    prerequisiteDesignIds: [
      "molten-regolith-electrolysis",
      "circuit-board-fabrication",
    ],
  },
  // Act 2's Mechanic: the Workshop, so that a growing base can stop spending
  // Payload Mass on spare Components. Casting metal parts follows on from
  // melting Regolith, so it is past Molten regolith electrolysis, in the
  // second rank, at the low end of what that rank costs, as a base that has
  // come this far already feels the pull of spares on every Launch.
  {
    id: "parts-machining",
    label: "Parts machining",
    description:
      "Casting and machining worn parts back into spare Components at the base, from metals the base makes, so that they no longer need a Launch.",
    category: "industry",
    starting: false,
    scienceCost: 150,
    prerequisiteDesignIds: ["molten-regolith-electrolysis"],
  },
  // An Industry Design, as the Plants' are: a Structure that, once
  // commissioned, makes something by itself, here Science from the
  // Night sky. In the first rank, needing only battery banks to carry it
  // through the Night, and leading to nothing else: it adds Science, and
  // the base needs it for nothing.
  {
    id: "optical-telescopes",
    label: "Optical telescopes",
    description:
      "A telescope that observes the sky at Night for the base's standing observing programme, earning a little Science with every round it completes.",
    category: "industry",
    starting: false,
    scienceCost: 60,
    prerequisiteDesignIds: ["battery-banks"],
  },
  {
    id: "landing-pads",
    label: "Landing pads",
    description:
      "A paved pad with a beacon, where the Lander lands without blasting Plume Ejecta over the base.",
    category: "mobility",
    starting: true,
    scienceCost: 0,
    prerequisiteDesignIds: [],
  },
  // Only for tidiness, so it is there from the start.
  {
    id: "parking-areas",
    label: "Parking areas",
    description:
      "Graded, marked ground with bays, each with a power socket, where the Robot parks idle Machines and the Rover together to keep warm through the Night.",
    category: "mobility",
    starting: true,
    scienceCost: 0,
    prerequisiteDesignIds: [],
  },
  // Cheap, and needing nothing first, so that the first few Research
  // Tasks pay for a second Robot to share the work.
  {
    id: "robots",
    label: "Robots",
    description:
      "More of the humanoid Robots that carry out the Work Orders, shipped from Earth to share the work.",
    category: "mobility",
    starting: false,
    scienceCost: 20,
    prerequisiteDesignIds: [],
  },
  // Planned as a Rover with a cabin, but the base has the one Rover and
  // no rule for another, so this Mobility Design lights a landing pad
  // instead.
  {
    id: "landing-pad-lights",
    label: "Landing pad lights",
    description:
      "Lights round a landing pad's edge, which switch on by themselves at Night, so that the Lander can be seen landing and unloading.",
    category: "mobility",
    starting: false,
    scienceCost: 220,
    prerequisiteDesignIds: ["landing-pads", "tall-light-masts"],
  },
];
