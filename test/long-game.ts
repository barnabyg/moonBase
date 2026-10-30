import { catalogue } from "../src/catalogue";
import {
  formatTimeline,
  playReferenceCampaign,
  referenceSteps,
  succeed,
  type Play,
  type PlayStep,
  type ReferenceTimeline,
} from "./reference-campaign";
import { labelOf } from "./pacing-report";
import { toGameMinutes } from "./scenario";

// The long-game play guide: plays on well past the end of the reference
// Campaign, through the simulation interface alone, with the same seed and
// every Hazard, so that the late game's balance can be seen. It takes minutes,
// so no test plays it: `npm run long-game` does, on demand (see
// docs/reference-campaign.md).
//
// A later Act adds its steps to `longGameSteps`, and whatever Designs they use
// to `designsTheLongGameUses`.

/**
 * The Earth Day the long-game play guide ends: into the last Act, a little
 * before the Radiation Dose reaches its limit behind a water wall. It moves out
 * as later Acts give the Mission Director a way to live past that.
 */
export const LONG_GAME_END_EARTH_DAY = 1650;

/** The most the last step waits for the Campaign to get there, as it does nothing else. */
const LONGEST_PLAY_ON = { earthDays: LONG_GAME_END_EARTH_DAY };

/**
 * The Designs whose Structures or Launch items the long-game play guide
 * builds or sends for. It checks this as it ends; the data catalogue's
 * consistency rules read it, as they can't play the game to find out.
 */
export const designsTheLongGameUses: readonly string[] = [
  "solar-arrays",
  "battery-banks",
  "inflatable-habitat",
  "regolith-shielding",
  "water-wall-shielding",
  "landing-pads",
  "regolith-extraction",
  "vacuum-fabrication",
  "circuit-board-fabrication",
  "water-processing",
  "life-support-resupply",
  "maintenance-spares",
];

/** Unlocks the cheapest Design it can, once the Science is there. */
function unlockEveryDesign(play: Play): void {
  const { state } = play;
  const next = catalogue.designs
    .filter(
      (design) =>
        !state.unlockedDesignIds.includes(design.id) &&
        design.scienceCost <= state.science &&
        design.prerequisiteDesignIds.every((id) =>
          state.unlockedDesignIds.includes(id),
        ),
    )
    .sort((a, b) => a.scienceCost - b.scienceCost)[0];
  if (next === undefined) return;
  succeed(play.campaign.unlockDesign(next.id), `Unlocking ${next.label}`);
}

/** Gives up on the Campaign if the guide has left any research undone. */
function checkEverythingResearched(play: Play): void {
  const { state } = play;
  const tasksLeft = catalogue.researchTasks.filter(
    (task) => !state.completedResearchTaskIds.includes(task.id),
  );
  if (tasksLeft.length > 0) {
    throw new Error(
      `Research Tasks not completed: ${tasksLeft.map((task) => task.label).join(", ")}.`,
    );
  }
  const designsLeft = catalogue.designs.filter(
    (design) => !state.unlockedDesignIds.includes(design.id),
  );
  if (designsLeft.length > 0) {
    throw new Error(
      `Designs not unlocked: ${designsLeft.map((design) => design.label).join(", ")}.`,
    );
  }
}

/** The long-game play guide: the reference Campaign, then each Act's steps in turn. */
export const longGameSteps: readonly PlayStep[] = [
  ...referenceSteps,
  {
    milestoneId: undefined,
    description: `Keep the base going as the reference Campaign's last step does, with a Research Task always running and the cheapest Design unlocked as soon as it can be, until Earth Day ${LONG_GAME_END_EARTH_DAY}.`,
    play(play) {
      play.keepUp(unlockEveryDesign);
      const end = toGameMinutes({ earthDays: LONG_GAME_END_EARTH_DAY });
      play.waitUntil(
        `Earth Day ${LONG_GAME_END_EARTH_DAY}`,
        (state) => state.clock.elapsedMinutes >= end,
        LONGEST_PLAY_ON,
      );
      checkEverythingResearched(play);
    },
  },
];

/** Plays the long-game play guide, as far as it goes. */
export function playLongGame(
  steps: readonly PlayStep[] = longGameSteps,
): ReferenceTimeline {
  return playReferenceCampaign(steps);
}

const MINUTES_PER_EARTH_DAY = toGameMinutes({ earthDays: 1 });

/** The Designs the long-game play guide says it uses, but built nothing of and sent for nothing of. */
export function designsNotUsed(timeline: ReferenceTimeline): string[] {
  const used = new Set([
    ...timeline.structureTypesBuilt.flatMap(
      ({ structureTypeId }) =>
        catalogue.structureTypes.find((type) => type.id === structureTypeId)
          ?.designId ?? [],
    ),
    ...timeline.launchItemsManifested.flatMap(
      (itemId) =>
        catalogue.launch.items.find((item) => item.id === itemId)?.designId ??
        [],
    ),
  ]);
  return designsTheLongGameUses.filter((designId) => !used.has(designId));
}

/** The timeline as lines of text, for `npm run long-game`. */
export function formatLongGame(timeline: ReferenceTimeline): string[] {
  const day = (minute: number) =>
    (minute / MINUTES_PER_EARTH_DAY).toFixed(1).padStart(6);
  const { minutesUntilDoseLimit, endMinute } = timeline;
  const limitAt =
    minutesUntilDoseLimit === undefined
      ? undefined
      : endMinute + minutesUntilDoseLimit;
  const notUsed = designsNotUsed(timeline);
  return [
    ...formatTimeline(timeline, "Long-game play guide"),
    "",
    "Research Tasks, by the Earth Day each was completed:",
    ...timeline.researchTasksCompleted.map(
      ({ researchTaskId, atMinute }) =>
        `  ${day(atMinute)}  ${labelOf(catalogue.researchTasks, researchTaskId)}`,
    ),
    "",
    "Designs, by the Earth Day each was unlocked:",
    ...timeline.designsUnlocked.map(
      ({ designId, atMinute }) =>
        `  ${day(atMinute)}  ${labelOf(catalogue.designs, designId)}`,
    ),
    "",
    limitAt === undefined
      ? "Forecast: the Radiation Dose isn't rising, so it never reaches the limit."
      : `Forecast: at the rate it was rising as the play guide ended, the Radiation Dose reaches the limit on Earth Day ${(limitAt / MINUTES_PER_EARTH_DAY).toFixed(0)}.`,
    ...(notUsed.length > 0
      ? [
          `The play guide says it uses these Designs, but built and sent for nothing of them: ${notUsed.join(", ")}.`,
        ]
      : []),
  ];
}

/** Whether the long game went as it should, so that the command can fail if it didn't. */
export function longGameSucceeded(timeline: ReferenceTimeline): boolean {
  return (
    timeline.failure === undefined && designsNotUsed(timeline).length === 0
  );
}
