// Whether the long game went as it should, and its report for a CI run.
import type { ReferenceTimeline } from "../reference-campaign";
import { toGameMinutes } from "../scenario";
import { designsNotUsedLines, formatLongGame } from "./format";
import { BURIED_HABITAT_MOVED_IN_BY_EARTH_DAY } from "./settings";
import { act2TargetsMissed, laterActTargetsMissed } from "./targets";

/** Whether the Mission Director moved into a Buried Habitat by the Act's target. */
function movedInByTheTarget(timeline: ReferenceTimeline): boolean {
  return timeline.moves.some(
    ({ atMinute, structureTypeId }) =>
      structureTypeId === "buried-habitat" &&
      atMinute <=
        toGameMinutes({ earthDays: BURIED_HABITAT_MOVED_IN_BY_EARTH_DAY }),
  );
}

/**
 * Why the long game didn't go as it should, if it didn't. It should go to the
 * end with the Mission Director alive, having moved in by the Act's target and
 * met Act 2's. Alive at the end, their Radiation Dose's limit is still ahead.
 */
export function longGameFailures(timeline: ReferenceTimeline): string[] {
  return [
    ...(timeline.failure === undefined
      ? []
      : [`It gave up: ${timeline.failure}`]),
    ...(timeline.ended === undefined
      ? []
      : [`The Mission Director died: ${timeline.ended.cause.kind}.`]),
    ...designsNotUsedLines(timeline),
    ...(movedInByTheTarget(timeline)
      ? []
      : [
          `The Mission Director hadn't moved into a Buried Habitat by Earth Day ${BURIED_HABITAT_MOVED_IN_BY_EARTH_DAY}.`,
        ]),
    ...[...act2TargetsMissed(timeline), ...laterActTargetsMissed(timeline)].map(
      (target) => `Missed: ${target}`,
    ),
  ];
}

/** Whether the long game went as it should, so that the command can fail if it didn't. */
export function longGameSucceeded(timeline: ReferenceTimeline): boolean {
  return longGameFailures(timeline).length === 0;
}

/**
 * The play as Markdown, for the summary of a CI run: whether it passed and why
 * not at the top, where a reader of the run sees them, then the whole timeline.
 */
export function formatLongGameReport(
  timeline: ReferenceTimeline,
  minutes: number,
): string[] {
  const failures = longGameFailures(timeline);
  return [
    `## The long game ${failures.length === 0 ? "passed" : "failed"}`,
    "",
    ...failures.map((failure) => `- ${failure}`),
    ...(failures.length === 0 ? [] : [""]),
    `Played in ${minutes.toFixed(1)} minutes.`,
    "",
    "```text",
    ...formatLongGame(timeline),
    "```",
  ];
}
