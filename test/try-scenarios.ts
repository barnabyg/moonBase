import { baseScenarios } from "./try-scenarios/base";
import { campaignScenarios } from "./try-scenarios/campaign";
import { crowdedScenarios } from "./try-scenarios/crowded";
import { decorationsScenarios } from "./try-scenarios/decorations";
import { lateGameScenarios } from "./try-scenarios/late-game";
import { scienceScenarios } from "./try-scenarios/science";
import { storesScenarios } from "./try-scenarios/stores";
import type { TryScenario } from "./try-scenarios/try-scenario";

// What `npm run try` can start the game in, so that a change can be tried by
// hand without playing up to it (see docs/trying-things.md). A scenario may
// play the Campaign through the simulation interface, or edit the save's text
// to get there faster: this is a way to look at something, not a test of the
// game's balance.
//
// Each group of scenarios, with what it builds, is in its own file under
// try-scenarios/, and save-editing.ts has what they share for editing a save.

export type { TryScenario } from "./try-scenarios/try-scenario";
export {
  freshSaveWith,
  type EditableSaveState,
} from "./try-scenarios/save-editing";
export {
  act2SaveFrom,
  act3SaveFrom,
  CREW_HABITAT_SITE,
  crewHabitatSave,
  referenceStepsKeepingAct1sEnd,
} from "./try-scenarios/campaign";
export {
  buriedHabitatBase,
  buriedHabitatSites,
  SPLIT_NETWORK_SITES,
  splitNetworkSave,
} from "./try-scenarios/base";
export {
  fullStoreSave,
  opticsBaseSave,
  propellantTanksSave,
  regolithDiggerSave,
  storageTanksSave,
} from "./try-scenarios/stores";
export { decorationsSave } from "./try-scenarios/decorations";
export {
  EXPERIMENTS_LAB_TASK,
  experimentsLabSave,
  greenhouseSave,
  INFRARED_TELESCOPE_SITES,
  infraredTelescopeSave,
  observingSitesSave,
  RADIO_TELESCOPE_ARRAY_SITES,
  radioTelescopeArraySave,
} from "./try-scenarios/science";
export { LATE_GAME_SCIENCE } from "./try-scenarios/late-game";

export const tryScenarios: readonly TryScenario[] = [
  ...campaignScenarios,
  ...baseScenarios,
  ...storesScenarios,
  ...decorationsScenarios,
  ...scienceScenarios,
  ...lateGameScenarios,
  ...crowdedScenarios,
];
