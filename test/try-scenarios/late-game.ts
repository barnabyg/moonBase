import { catalogue } from "../../src/catalogue";
import { loadCampaign } from "../../src/simulation";
import { toGameMinutes } from "../scenario";
import {
  addComponents,
  freshSaveWith,
  saveWith,
  stockOf,
} from "./save-editing";
import type { TryScenario } from "./try-scenario";
import { findStructureType } from "../../src/simulation/construction";

/** Where `lateGameSave` puts what it builds. */
const LATE_GAME_SITES = [
  ["solar-array", { x: 40, y: 25 }],
  ["solar-array", { x: 40, y: 13 }],
  ["solar-array", { x: 40, y: 1 }],
  ["large-battery-bank", { x: 40, y: 37 }],
  ["large-battery-bank", { x: 52, y: 37 }],
  ["large-battery-bank", { x: 64, y: 37 }],
  ["water-tank", { x: 52, y: 25 }],
  ["water-processing-plant", { x: 64, y: 25 }],
  ["water-processing-plant", { x: 74, y: 25 }],
  ["greenhouse", { x: 62, y: 12 }],
  ["buried-habitat", { x: -18, y: 8 }],
] as const;

/** The Science in `lateGameSave`: all that a vault cistern costs. */
export const LATE_GAME_SCIENCE =
  catalogue.designs.find(({ id }) => id === "vault-cistern")?.scienceCost ?? 0;

/**
 * Late in a Campaign, with the Mission Director in a Buried Habitat at the dose a
 * long Campaign has by then: a Greenhouse growing, a water tank nearly full, Growing
 * halls unlocked, the Science for a Vault cistern, and in stock what a growing hall,
 * a second water tank and a vault cistern are built from. It plays only as far as
 * the Robot's building takes, on a save edited to have what it needs.
 */
function lateGameSave(): string {
  const componentsOf = (id: string) => findStructureType(id)?.components ?? [];
  const loaded = loadCampaign(
    freshSaveWith((state) => {
      for (const design of catalogue.designs) {
        if (
          design.id !== "vault-cistern" &&
          !state.unlockedDesignIds.includes(design.id)
        ) {
          state.unlockedDesignIds.push(design.id);
        }
      }
      addComponents(state, [
        ...LATE_GAME_SITES.flatMap(([id]) => componentsOf(id)),
        { componentId: catalogue.maintenance.spareComponentId, count: 60 },
      ]);
      for (const stock of state.lifeSupport) stock.kilograms = 400;
    }),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  const { campaign } = loaded;
  for (const [structureTypeId, position] of LATE_GAME_SITES) {
    const planned = campaign.planConstruction({ structureTypeId, position });
    if (!planned.ok) throw new Error(planned.message);
  }
  for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
    if (hours > 40 * 24) throw new Error("The base was never finished.");
    campaign.advance(60);
  }
  const home = campaign
    .snapshot()
    .structures.find(
      ({ structureTypeId }) => structureTypeId === "buried-habitat",
    );
  for (let hours = 0; home !== undefined; hours++) {
    if (hours > 40 * 24) throw new Error("The Buried Habitat never had power.");
    const now = campaign.snapshot().structures.find(({ id }) => id === home.id);
    if (now?.powered === true) break;
    campaign.advance(60);
  }
  const moved = campaign.moveMissionDirectorIn(home?.id ?? "");
  if (!moved.ok) throw new Error(moved.message);
  for (let hours = 0; ; hours++) {
    const { part, minutesRemaining } = campaign.snapshot().lunation;
    if (
      part === "daylight" &&
      minutesRemaining > toGameMinutes({ earthDays: 15 })
    ) {
      break;
    }
    if (hours > 40 * 24) throw new Error("Daylight never came.");
    campaign.advance(60);
  }
  return saveWith(campaign, (state) => {
    state.science = LATE_GAME_SCIENCE;
    state.fundingMillionDollars = 20000;
    state.radiationDoseMillisieverts = 570;
    addComponents(state, [
      ...componentsOf("growing-hall"),
      ...componentsOf("vault-cistern"),
      ...componentsOf("water-tank"),
    ]);
    stockOf(state, "water-ice", 1500);
    for (const stock of state.lifeSupport) {
      if (stock.stockId === "water") stock.kilograms = 1300;
    }
  });
}

export const lateGameScenarios: readonly TryScenario[] = [
  {
    id: "late-game",
    title:
      "Late in a Campaign, with the Mission Director in a Buried Habitat at 570 mSv, a Greenhouse growing, a water tank nearly full, Growing halls unlocked, the Science for a Vault cistern, $20,000M, and in stock what a growing hall, a second water tank and a vault cistern are built from",
    steps: [
      'Pause the game. The status panel\'s Radiation says about "570.0 / 600 mSv" and a limit some 2,000 Earth Days off. Open the Tech Tree: under Life Support, Growing halls is unlocked and says what a growing hall earns, drinks and draws; under Protection, Vault cistern costs all the Science you have and says what it does. Press its Unlock button: Science falls to none.',
      "Open the Guide: Keeping the Mission Director alive and Science and technologies say what these are for. Both have cards under Structures. The Launch manifest has their parts, dear ones, under Life Support and Protection.",
      "In the build menu, pick Vault cistern and move it over the Buried Habitat's low mound: click to place it there. Anywhere else it says it can only be built round a commissioned Buried Habitat. Set the game to 5x. Its Work panel line soon says it is waiting for more water, and that the base can hold only 1400 kg, so build another water tank.",
      "Pick Water tank in the build menu and place it. Once it is commissioned, Water reads against a limit of 2400 kg, and the vault cistern's line no longer speaks of what the base can hold.",
      'Pick Growing hall and place it on clear ground. Once it is commissioned, click it: a long glazed vault with light pipes along its ridge. The Base panel says "growing", and on hovering over that "using 2 kg of water an hour, for 100 Science a round". Its round takes 10 Earth Days, longer than a Night, so a Night short of water loses a whole one. Now choose: with both it and the Greenhouse growing, Water hardly rises.',
      'Press "Switch off" beside the Growing hall and the Greenhouse: within the hour notifications say their rounds were given up. Set the game to 20x: the Water-processing plants bring Water up, and once it passes about 2,050 kg the cistern takes 2,000 kg of it all at once, as its Assembly starts.',
      "Once it is commissioned, click the mound: the Buried Habitat's pop-up says Shielding buried under the Regolith and a vault cistern, and Dose rate 0.003 mSv a day. The status panel's Radiation limit moves thousands of Earth Days off.",
    ],
    save: lateGameSave,
  },
];
