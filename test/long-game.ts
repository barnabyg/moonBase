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
import type { ManifestLine, Snapshot } from "../src/simulation";

// The long-game play guide: plays on well past the end of the reference
// Campaign, through the simulation interface alone, with the same seed and
// every Hazard, real Solar Particle Events and all, as far as the Campaign's
// content is meant to last, so that the late game's balance can be seen. It takes minutes,
// so no test plays it: `npm run long-game` does, on demand (see
// docs/reference-campaign.md).
//
// A later Act adds its steps to `longGameSteps`, and whatever Designs they use
// to `designsTheLongGameUses`.

/**
 * The Earth Day the long-game play guide ends: the end of the last Act, the
 * length the Campaign's content is meant to last, which a Buried Habitat lets
 * the Mission Director live to.
 */
export const LONG_GAME_END_EARTH_DAY = 3000;

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
  "parts-machining",
  "buried-habitat",
];

/** The Earth Day Act 2 opens, when the guide turns to making its own spare Components. */
const ACT_2_EARTH_DAY = 350;

/** Where the Workshop stands: at the east end of the row of Plants. */
const WORKSHOP_SITE = { x: 66, y: -33 } as const;

/** What the guide keeps in stock: it switches the Workshop off above this many, and back on below it. */
const SPARES_HELD = 40;

/**
 * The Earth Day the guide sends for a Buried Habitat, in good time to move in by
 * the Act's target of Earth Day 1,600: three Launches at a trip every 15 Earth
 * Days or so, then about 9 Earth Days to build it in the Daylight after the last.
 */
const BURIED_HABITAT_EARTH_DAY = 1530;

/** The latest Earth Day the guide should be moved in by, the Act's target. */
const BURIED_HABITAT_MOVED_IN_BY_EARTH_DAY = 1600;

/** Where a Buried Habitat stands: north of the old Habitat. */
const BURIED_HABITAT_SITE = { x: 46, y: 8 } as const;

/**
 * The Earth Days of Daylight the guide wants left as it plans a Buried Habitat:
 * about 9 to build it and 3 to dismantle the old Habitat, as this base's battery
 * banks can't carry both through a Night, and with both drawing power by day the
 * Workshop, last in line for it, makes too few spare Components.
 */
const DAYLIGHT_TO_BUILD_AND_MOVE = { earthDays: 12 };

/** The Components a type of Structure takes, as Launch manifest lines. */
function manifestLinesOf(structureTypeId: string): readonly ManifestLine[] {
  return (
    catalogue.structureTypes.find(({ id }) => id === structureTypeId)
      ?.components ?? []
  ).map(({ componentId, count }) => ({ itemId: componentId, count }));
}

/** What of these Launch manifest lines the base lacks in its stock. */
function missingFromStock(
  state: Snapshot,
  lines: readonly ManifestLine[],
): ManifestLine[] {
  return lines.flatMap(({ itemId, count }) => {
    const inStock =
      state.stockpile.components.find((stock) => stock.componentId === itemId)
        ?.count ?? 0;
    return count > inStock ? [{ itemId, count: count - inStock }] : [];
  });
}

/**
 * Sends for what a Buried Habitat needs, as much on each Launch as its Payload
 * Mass leaves room for beside the supplies already on the manifest, and plans
 * it early in a Daylight once it has all come.
 */
function shipBuriedHabitat(play: Play): void {
  const { state } = play;
  const buried = "buried-habitat";
  if (
    state.clock.elapsedMinutes <
      toGameMinutes({ earthDays: BURIED_HABITAT_EARTH_DAY }) ||
    !state.unlockedDesignIds.includes(buried) ||
    [...state.constructions, ...state.structures].some(
      ({ structureTypeId }) => structureTypeId === buried,
    )
  ) {
    return;
  }
  const missing = missingFromStock(state, manifestLinesOf(buried));
  if (missing.length === 0) {
    if (
      state.lunation.part === "daylight" &&
      state.lunation.minutesRemaining >=
        toGameMinutes(DAYLIGHT_TO_BUILD_AND_MOVE)
    ) {
      play.plan(buried, BURIED_HABITAT_SITE);
    }
    return;
  }
  // The manifest can change until the Lander leaves Earth, and the trip before
  // has been unloaded, so all the base lacks has yet to be sent for.
  if (state.lander.state !== "travelling-to-earth") return;
  const massOf = (itemId: string) =>
    catalogue.launch.items.find(({ id }) => id === itemId)?.massKilograms ?? 0;
  const manifest = new Map(
    state.launchManifest.items.map(({ itemId, count }) => [itemId, count]),
  );
  let room = catalogue.launch.payloadMassLimitKilograms;
  for (const [itemId, count] of manifest) room -= massOf(itemId) * count;
  let added = false;
  for (const { itemId, count } of missing) {
    const already = manifest.get(itemId) ?? 0;
    const more = Math.min(count - already, Math.floor(room / massOf(itemId)));
    if (more <= 0) continue;
    room -= more * massOf(itemId);
    manifest.set(itemId, already + more);
    added = true;
  }
  if (added) {
    succeed(
      play.campaign.setLaunchManifest(
        [...manifest].map(([itemId, count]) => ({ itemId, count })),
      ),
      "Putting the Buried Habitat on the Launch manifest",
    );
  }
}

/**
 * Moves the Mission Director into a Buried Habitat as soon as it stands and has
 * power, then dismantles the old Habitat and what is over it, one by one.
 */
function moveIntoBuriedHabitat(play: Play): void {
  const { state } = play;
  const buried = state.structures.find(
    (structure) => structure.structureTypeId === "buried-habitat",
  );
  if (buried?.powered !== true) return;
  const { missionDirector } = state;
  if (
    missionDirector.residence !== "habitat" ||
    missionDirector.habitatId !== buried.id
  ) {
    succeed(
      play.campaign.moveMissionDirectorIn(buried.id),
      "Moving the Mission Director into the Buried Habitat",
    );
    return;
  }
  if (state.dismantlings.length > 0) return;
  for (const structureTypeId of [
    "water-wall",
    "regolith-shielding",
    "habitat",
  ]) {
    const next = state.structures.find(
      (structure) => structure.structureTypeId === structureTypeId,
    );
    if (next !== undefined) {
      succeed(
        play.campaign.dismantleStructure(next.id),
        `Dismantling the old ${structureTypeId}`,
      );
      return;
    }
  }
}

/** Sees to the Workshop's Components coming, and builds it once they have. */
function shipWorkshop(play: Play): void {
  const { state } = play;
  const workshop = catalogue.structureTypes.find(({ id }) => id === "workshop");
  if (
    workshop === undefined ||
    state.clock.elapsedMinutes <
      toGameMinutes({ earthDays: ACT_2_EARTH_DAY }) ||
    !state.unlockedDesignIds.includes(workshop.designId) ||
    [...state.constructions, ...state.structures].some(
      (structure) => structure.structureTypeId === workshop.id,
    )
  ) {
    return;
  }
  const missing = workshop.components.filter(
    ({ componentId, count }) =>
      (state.stockpile.components.find(
        (stock) => stock.componentId === componentId,
      )?.count ?? 0) < count,
  );
  if (missing.length === 0) {
    play.plan(workshop.id, WORKSHOP_SITE);
    return;
  }
  // Once the Lander is away and the guide has set its manifest, these go on
  // it, as they can until it leaves Earth.
  if (state.lander.state !== "travelling-to-earth") return;
  const manifest = state.launchManifest.items;
  if (
    missing.every(({ componentId }) =>
      manifest.some(({ itemId }) => itemId === componentId),
    )
  ) {
    return;
  }
  succeed(
    play.campaign.setLaunchManifest([
      ...manifest.filter(
        ({ itemId }) =>
          !missing.some(({ componentId }) => componentId === itemId),
      ),
      ...missing.map(({ componentId, count }) => ({
        itemId: componentId,
        count,
      })),
    ]),
    "Putting the Workshop on the Launch manifest",
  );
}

/**
 * Runs the Workshop only as far as the spare Components need it, so that it
 * doesn't spend metals on more than the base will use for a long time.
 */
function runWorkshop(play: Play): void {
  const { state } = play;
  const workshop = state.structures.find(
    (structure) => structure.structureTypeId === "workshop",
  );
  if (workshop === undefined) return;
  const spares =
    state.stockpile.components.find(
      (stock) => stock.componentId === catalogue.maintenance.spareComponentId,
    )?.count ?? 0;
  const setting =
    spares > SPARES_HELD ? "off" : spares < SPARES_HELD ? "on" : undefined;
  if (setting === undefined || (setting === "off") === workshop.switchedOff) {
    return;
  }
  succeed(
    play.campaign.switchPlant(workshop.id, setting),
    "Switching the Workshop",
  );
}

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
    description: `Keep the base going as the reference Campaign's last step does, with a Research Task always running and the cheapest Design unlocked as soon as it can be, until Earth Day ${LONG_GAME_END_EARTH_DAY}. From Earth Day ${ACT_2_EARTH_DAY}, ship and build a Workshop east of the other Plants, and once it runs stop bringing spare Components by Launch, switching it off while more than ${SPARES_HELD} are in stock. From Earth Day ${BURIED_HABITAT_EARTH_DAY}, send for a Buried Habitat over several Launches, build it early in a Daylight, move the Mission Director in as soon as it has power, and dismantle the old Habitat, with its water wall and shielding, before Night falls.`,
    play(play) {
      play.keepUp(unlockEveryDesign);
      play.keepUp(shipWorkshop);
      play.keepUp(runWorkshop);
      play.keepUp(shipBuriedHabitat);
      play.keepUp(moveIntoBuriedHabitat);
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

/**
 * What a Workshop did for the spare Components: when it was commissioned, how
 * many were in stock Lunation by Lunation, and what Launches brought before and
 * after it, as lines of text.
 */
function formatSpares(timeline: ReferenceTimeline): string[] {
  const day = (minute: number) => (minute / MINUTES_PER_EARTH_DAY).toFixed(0);
  const built = timeline.structureTypesBuilt.find(
    ({ structureTypeId }) => structureTypeId === "workshop",
  )?.atMinute;
  const shipped = (
    from: number,
    to: number,
  ): { launches: number; spares: number } => {
    const trips = timeline.sparesShipped.filter(
      ({ atMinute }) => atMinute >= from && atMinute < to,
    );
    return {
      launches: trips.length,
      spares: trips.reduce((total, { count }) => total + count, 0),
    };
  };
  const before = shipped(0, built ?? Infinity);
  const after = shipped(built ?? Infinity, Infinity);
  const since = timeline.sparesInStock.filter(
    ({ atMinute }) => built !== undefined && atMinute > built,
  );
  return [
    "Spare Components, Lunation by Lunation: Earth Day, then in stock (the fewest since the last line):",
    ...timeline.sparesInStock.map(
      ({ atMinute, inStock, fewest }) =>
        `  ${day(atMinute).padStart(6)}  ${inStock} (${fewest})`,
    ),
    built === undefined
      ? "No Workshop was commissioned."
      : `A Workshop was commissioned on Earth Day ${(built / MINUTES_PER_EARTH_DAY).toFixed(1)}. After it the stock was never below ${Math.min(...since.map(({ fewest }) => fewest))}.`,
    `Launches bringing spare Components: ${before.launches}, with ${before.spares}, before a Workshop; ${after.launches}, with ${after.spares}, after it.`,
  ];
}

/**
 * How the Buried Habitat came about, what the Radiation Dose stood at each
 * step, and how fast it rose behind the water wall and after, Solar Particle
 * Events and all, as lines of text.
 */
function formatBuriedHabitat(timeline: ReferenceTimeline): string[] {
  const day = (minute: number) => (minute / MINUTES_PER_EARTH_DAY).toFixed(1);
  const lookAt = (minute: number) =>
    timeline.looks.find(({ atMinute }) => atMinute >= minute) ??
    timeline.looks.at(-1);
  const dose = (minute: number) =>
    `${(lookAt(minute)?.radiationDoseMillisieverts ?? 0).toFixed(1)} mSv`;
  const rate = (from: number, to: number) =>
    (((lookAt(to)?.radiationDoseMillisieverts ?? 0) -
      (lookAt(from)?.radiationDoseMillisieverts ?? 0)) /
      (to - from)) *
    MINUTES_PER_EARTH_DAY;
  const kit = manifestLinesOf("buried-habitat").map(({ itemId }) => itemId);
  const launches = timeline.launchManifests.filter(({ items }) =>
    items.some(({ itemId }) => kit.includes(itemId) && itemId !== "airlock"),
  );
  const built = timeline.structureTypesBuilt.find(
    ({ structureTypeId }) => structureTypeId === "buried-habitat",
  )?.atMinute;
  const moved = timeline.moves.find(
    ({ structureTypeId }) => structureTypeId === "buried-habitat",
  )?.atMinute;
  const rates = catalogue.radiation.doseRateMillisievertsPerEarthDay;
  const { waterWallAtMinute, endMinute } = timeline;
  const firstSent = launches[0]?.atMinute;
  return [
    "The Buried Habitat, and the Radiation Dose at each step:",
    ...launches.map(
      ({ atMinute, items }) =>
        `  Earth Day ${day(atMinute)}, at ${dose(atMinute)}: the Lander left for Earth to bring ${items
          .filter(({ itemId }) => kit.includes(itemId))
          .map(({ itemId, count }) => `${count} ${itemId}`)
          .join(", ")}.`,
    ),
    ...(firstSent === undefined
      ? ["  It was never sent for."]
      : [
          `  Funding as it was first sent for: $${(lookAt(firstSent)?.fundingMillionDollars ?? 0).toFixed(0)}M.`,
        ]),
    built === undefined
      ? "  It was never commissioned."
      : `  Earth Day ${day(built)}, at ${dose(built)}: commissioned.`,
    ...(moved === undefined
      ? ["  The Mission Director never moved in."]
      : [
          `  Earth Day ${day(moved)}, at ${dose(moved)}: the Mission Director moved in.`,
          `  Earth Day ${day(endMinute)}, at ${dose(endMinute)}: the end, the Radiation Dose having risen ${rate(moved, endMinute).toFixed(4)} mSv an Earth Day since they moved in (${(rate(moved, endMinute) / rates.buriedHabitat).toFixed(2)} times the usual rate, for Solar Particle Events).`,
        ]),
    ...(waterWallAtMinute === undefined
      ? []
      : [
          `  Behind the water wall it rose ${rate(waterWallAtMinute, moved ?? endMinute).toFixed(3)} mSv an Earth Day (${(rate(waterWallAtMinute, moved ?? endMinute) / rates.waterWalledHabitat).toFixed(2)} times the usual rate).`,
        ]),
  ];
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
    ...formatSpares(timeline),
    "",
    ...formatBuriedHabitat(timeline),
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
 * Whether the long game went as it should, so that the command can fail if it
 * didn't: to the end with the Mission Director alive, having moved in by the
 * Act's target. Alive at the end, their Radiation Dose's limit is still ahead.
 */
export function longGameSucceeded(timeline: ReferenceTimeline): boolean {
  return (
    timeline.failure === undefined &&
    timeline.ended === undefined &&
    designsNotUsed(timeline).length === 0 &&
    movedInByTheTarget(timeline)
  );
}
