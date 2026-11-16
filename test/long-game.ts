import {
  ACT_2_EARTH_DAY,
  type Play,
  playReferenceCampaign,
  type PlayStep,
  referenceSteps,
  type ReferenceTimeline,
} from "./reference-campaign";
import { toGameMinutes } from "./scenario";
import {
  moveIntoBuriedHabitat,
  shipBuriedHabitat,
} from "./long-game/buried-habitat";
import { ANTENNA_FIELD_SITES, buyInTurn } from "./long-game/purchases";
import {
  checkEverythingResearched,
  LAB_OXYGEN_KILOGRAMS,
  loadTheLander,
  OXYGEN_FOR_THE_LAB_KILOGRAMS,
  runArrayWorks,
  runDigger,
  runLargeExtractionPlant,
  runLateScience,
  runPropellantPlants,
  runWorkshops,
  shipASecondRobot,
  unlockEveryDesign,
  waterTheGreenhouse,
} from "./long-game/running";
import {
  BURIED_HABITAT_EARTH_DAY,
  GREENHOUSE_EARTH_DAY,
  ICE_HELD_KILOGRAMS,
  LONG_GAME_END_EARTH_DAY,
  LONGEST_PLAY_ON,
  OXYGEN_FOR_THE_CREW_HABITAT_KILOGRAMS,
  SPARES_HELD,
  TANKS_EARTH_DAY,
  WATER_FOR_THE_CISTERN_KILOGRAMS,
  WATER_FOR_THE_CREW_HABITAT_KILOGRAMS,
  WATER_FOR_THE_LAB_AT_NIGHT_KILOGRAMS,
  WATER_FOR_THE_NIGHT_KILOGRAMS,
  WATER_FOR_THE_NIGHT_WITH_A_HALL_KILOGRAMS,
  WATER_TO_SPARE_KILOGRAMS,
} from "./long-game/settings";
import { giveUpOnMissedTargets } from "./long-game/targets";

// The long-game play guide: plays on well past the end of the reference
// Campaign, through the simulation interface alone, with the same seed and
// every Hazard, real Solar Particle Events and all, as far as the Campaign's
// content is meant to last, so that the late game's balance can be seen. It takes minutes,
// so no test plays it: CI does, with `npm run long-game` (see
// docs/reference-campaign.md).
//
// A later Act adds its steps to `longGameSteps`, and whatever Designs they use
// to `designsTheLongGameUses`.

export {
  LONG_GAME_END_EARTH_DAY,
  designsTheLongGameUses,
  PURCHASE_STALL_EARTH_DAYS,
  act2Targets,
  laterActTargets,
} from "./long-game/settings";
export {
  type Purchase,
  type PurchaseWait,
  purchaseStallWatch,
  buyInTurn,
} from "./long-game/purchases";
export { designsNotUsed, formatLongGame } from "./long-game/format";
export {
  giveUpOnMissedTargets,
  act2TargetsMissed,
  laterActTargetsMissed,
} from "./long-game/targets";
export {
  longGameFailures,
  longGameSucceeded,
  formatLongGameReport,
} from "./long-game/report";

/** The long-game play guide: the reference Campaign, then each Act's steps in turn. */
export const longGameSteps: readonly PlayStep[] = [
  ...referenceSteps,
  {
    milestoneId: undefined,
    description: `Keep the base going as the reference Campaign's last step does, with a Research Task always running and the cheapest Design unlocked as soon as it can be, until Earth Day ${LONG_GAME_END_EARTH_DAY}. From Earth Day ${ACT_2_EARTH_DAY}, ship and build in turn, as the Science and Funding allow, a Workshop, a third solar array, a large extraction plant set to metals and silicon, a second Workshop, an array works that makes two more solar arrays, a concentrator tower and a cold-trap ice line. Once the Workshop runs stop bringing spare Components by Launch, switching them off while more than ${SPARES_HELD} are in stock, and fill what the circuit boards leave of each Return Mass with metals, or with propellant once it has more than it means to burn. As their Designs are unlocked, ship and build a propellant plant, a propellant tank, a large propellant plant, a bucket-wheel digger, a Regolith bin, an optics works and a grinding line, running the digger only at Night, and load the optics and circuit boards first, burning propellant to lift all there are. Once, make up a tripled Return Mass with metals. From Earth Day ${BURIED_HABITAT_EARTH_DAY}, send for a Buried Habitat over several Launches, build it early in a Daylight, move the Mission Director in as soon as it has power, and dismantle the old Habitat, with its water wall and shielding, before Night falls. From Earth Day ${GREENHOUSE_EARTH_DAY}, ship a second Robot, then ship and build a large battery bank, two more water-processing plants, a Greenhouse and a third Workshop, and once it stands keep the Rover going for water ice while under ${ICE_HELD_KILOGRAMS} kg is in stock, and switch the optics off below ${WATER_FOR_THE_NIGHT_KILOGRAMS} kg of water, on again above ${WATER_TO_SPARE_KILOGRAMS} kg. Once Automated experiments is unlocked, ship and build a large battery bank and an automated experiments lab west of the landing site, holding the optics back a further ${WATER_FOR_THE_LAB_AT_NIGHT_KILOGRAMS} kg of water while it runs and setting the large extraction plant to oxygen below ${OXYGEN_FOR_THE_LAB_KILOGRAMS.low} kg of oxygen, back above ${OXYGEN_FOR_THE_LAB_KILOGRAMS.high} kg, then a large battery bank and an infrared telescope far to the north-west, away from the lights, two more large battery banks, and a radio telescope array far to the north, away from the Plants, with ${ANTENNA_FIELD_SITES.length} antenna fields round it once it is commissioned. From Earth Day ${TANKS_EARTH_DAY}, ship and build a water tank and an oxygen tank. Once Growing halls is unlocked, ship and build a fourth Workshop, a large battery bank, three more water-processing plants, four more cold-trap ice lines and a growing hall, holding its optics back below ${WATER_FOR_THE_NIGHT_WITH_A_HALL_KILOGRAMS} kg of water. Once Large-scale Crew Habitats is unlocked, ship and build two more water tanks and a second oxygen tank, set the large extraction plant to oxygen until there is ${OXYGEN_FOR_THE_CREW_HABITAT_KILOGRAMS} kg, then ship and build a Large-scale Crew Habitat over as many Launches as the Funding allows, holding the optics back once it is planned until there is ${WATER_FOR_THE_CREW_HABITAT_KILOGRAMS} kg of water to stock it. Once Vault cistern is unlocked, with nothing left for Science to buy, switch the Greenhouse, growing hall and infrared telescope off, ship and build a second water tank and a vault cistern round the Buried Habitat, holding the optics back until there is ${WATER_FOR_THE_CISTERN_KILOGRAMS} kg of water to fill it, then let them have what is over. Switch the lab off below ${LAB_OXYGEN_KILOGRAMS.off} kg of oxygen, on again above ${LAB_OXYGEN_KILOGRAMS.on} kg, and off for good once every Research Task is completed.`,
    play(play) {
      keepTheBaseGoing(play);
      playOnUntil(play, LONG_GAME_END_EARTH_DAY);
      checkEverythingResearched(play);
    },
  },
];

/**
 * Has the long-game play guide's last step keep the base going, as its
 * description says, for as long as the Campaign is then played.
 */
export function keepTheBaseGoing(play: Play): void {
  play.keepUp(unlockEveryDesign);
  play.keepUp(buyInTurn());
  play.keepUp(runWorkshops);
  play.keepUp(runLargeExtractionPlant);
  play.keepUp(runArrayWorks);
  play.keepUp(loadTheLander);
  play.keepUp(runPropellantPlants);
  play.keepUp(runDigger);
  play.keepUp(shipBuriedHabitat);
  play.keepUp(moveIntoBuriedHabitat);
  play.keepUp(shipASecondRobot);
  play.keepUp(waterTheGreenhouse);
  play.keepUp(runLateScience);
  // Last, to see what the others have just done.
  play.keepUp(giveUpOnMissedTargets());
}

/** Lets the Campaign run until the Earth Day given. */
export function playOnUntil(play: Play, earthDay: number): void {
  const end = toGameMinutes({ earthDays: earthDay });
  play.waitUntil(
    `Earth Day ${earthDay}`,
    (state) => state.clock.elapsedMinutes >= end,
    LONGEST_PLAY_ON,
  );
}

/** Plays the long-game play guide, as far as it goes. */
export function playLongGame(
  steps: readonly PlayStep[] = longGameSteps,
  onProgress?: (earthDay: number) => void,
  earthDaysBetweenReports?: number,
): ReferenceTimeline {
  return playReferenceCampaign(steps, onProgress, earthDaysBetweenReports);
}
