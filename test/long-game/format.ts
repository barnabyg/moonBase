// The long-game play guide's timeline, as lines of text for `npm run long-game`.
import { catalogue } from "../../src/catalogue";
import {
  ACT_2_EARTH_DAY,
  formatTimeline,
  type ReferenceTimeline,
} from "../reference-campaign";
import { labelOf } from "../pacing-report";
import { manifestLinesOf } from "./buried-habitat";
import {
  ACT_2_END_EARTH_DAY,
  ACT_4_EARTH_DAY,
  designsTheLongGameUses,
  LONG_GAME_END_EARTH_DAY,
  MINUTES_PER_EARTH_DAY,
} from "./settings";
import { act2TargetsMissed, laterActTargetsMissed } from "./targets";

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

/** When a Greenhouse or a growing hall was commissioned, what it earned and what rounds it lost, as lines of text. */
function formatGreenhouse(
  timeline: ReferenceTimeline,
  structureTypeId: string,
  label: string,
): string[] {
  const built = timeline.structureTypesBuilt.find(
    (structure) => structure.structureTypeId === structureTypeId,
  )?.atMinute;
  if (built === undefined) return [`No ${label} was commissioned.`];
  const rounds = timeline.scienceRounds.filter(
    (round) => round.structureTypeId === structureTypeId,
  );
  const earned = rounds.filter(({ lostFor }) => lostFor === undefined);
  const lost = (reason: string) =>
    rounds.filter(({ lostFor }) => lostFor === reason).length;
  const science = earned.reduce((total, round) => total + round.science, 0);
  const years = (timeline.endMinute - built) / MINUTES_PER_EARTH_DAY;
  const lunations =
    years /
    (catalogue.lunation.daylightEarthDays + catalogue.lunation.nightEarthDays);
  return [
    `A ${label} was commissioned on Earth Day ${(built / MINUTES_PER_EARTH_DAY).toFixed(1)}. It earned ${science} Science in ${earned.length} rounds, ${(science / lunations).toFixed(0)} a Lunation, and lost ${lost("water")} rounds for want of water, ${lost("power")} for want of power and ${lost("switched-off")} by being switched off.`,
  ];
}

/** Why a telescope's rounds were lost, in words, by the reasons the events give. */
const ROUND_LOST_FOR: Readonly<Record<string, string>> = {
  propellant: "for want of propellant",
  power: "for want of power",
  light: "to a light within its dark radius",
  plant: "to a Plant within its quiet radius",
  "switched-off": "by being switched off",
};

/**
 * What the late science did (ADR-0009): when the automated experiments lab came
 * and how long it sped up the Research Task running, what each telescope earned
 * and what rounds it lost, and when research ended, as lines of text.
 */
function formatLateScience(timeline: ReferenceTimeline): string[] {
  const builtOn = (structureTypeId: string) =>
    timeline.structureTypesBuilt.find(
      (structure) => structure.structureTypeId === structureTypeId,
    )?.atMinute;
  const lab = builtOn("experiments-lab");
  const speedUp =
    catalogue.structureTypes.find(({ id }) => id === "experiments-lab")
      ?.speedsResearch?.addedMinutesPerMinute ?? 0;
  const telescope = (structureTypeId: string, label: string): string => {
    const built = builtOn(structureTypeId);
    if (built === undefined) return `No ${label} was commissioned.`;
    const rounds = timeline.scienceRounds.filter(
      (round) => round.structureTypeId === structureTypeId,
    );
    const earned = rounds.filter(({ lostFor }) => lostFor === undefined);
    const science = earned.reduce((total, round) => total + round.science, 0);
    const lunations =
      (timeline.endMinute - built) /
      MINUTES_PER_EARTH_DAY /
      (catalogue.lunation.daylightEarthDays +
        catalogue.lunation.nightEarthDays);
    const losses = new Map<string, number>();
    for (const { lostFor } of rounds) {
      if (lostFor !== undefined) {
        losses.set(lostFor, (losses.get(lostFor) ?? 0) + 1);
      }
    }
    const lost =
      losses.size === 0
        ? "lost no rounds"
        : `lost ${[...losses]
            .map(
              ([reason, count]) =>
                `${count} ${ROUND_LOST_FOR[reason] ?? `to ${reason}`}`,
            )
            .join(", ")}`;
    const article = /^[aeiou]/i.test(label) ? "An" : "A";
    return `${article} ${label} was commissioned on Earth Day ${(built / MINUTES_PER_EARTH_DAY).toFixed(1)}. It earned ${science} Science in ${earned.length} rounds, ${(science / lunations).toFixed(0)} a Lunation, and ${lost}.`;
  };
  const field = builtOn("antenna-field");
  const researchEnded =
    Math.max(
      0,
      ...timeline.researchTasksCompleted.map(({ atMinute }) => atMinute),
    ) / MINUTES_PER_EARTH_DAY;
  return [
    lab === undefined
      ? "No automated experiments lab was commissioned."
      : `An automated experiments lab was commissioned on Earth Day ${(lab / MINUTES_PER_EARTH_DAY).toFixed(1)}. Labs sped up the Research Task running for ${timeline.labHoursSpeedingUp.toFixed(0)} hours, saving about ${((timeline.labHoursSpeedingUp * speedUp) / 24).toFixed(0)} Earth Days of research.`,
    telescope("infrared-telescope", "infrared telescope"),
    telescope("radio-telescope-array", "radio telescope array"),
    ...(field === undefined
      ? []
      : [
          `Its first antenna field was commissioned on Earth Day ${(field / MINUTES_PER_EARTH_DAY).toFixed(1)}.`,
        ]),
    `The last Research Task was completed on Earth Day ${researchEnded.toFixed(1)}.`,
  ];
}

/** What the Greenhouse chain had the guide buy, and when, as lines of text. */
function formatLateBuying(timeline: ReferenceTimeline): string[] {
  const hall = timeline.designsUnlocked.find(
    ({ designId }) => designId === "growing-halls",
  )?.atMinute;
  if (hall === undefined) return [];
  const bought = timeline.structureTypesBuilt.filter(
    ({ atMinute }) => atMinute >= hall,
  );
  const fundingAt = (minute: number) =>
    timeline.looks.find(({ atMinute }) => atMinute >= minute)
      ?.fundingMillionDollars ?? 0;
  const held = (minute: number) => `$${fundingAt(minute).toFixed(0)}M`;
  return [
    `Growing halls was unlocked on Earth Day ${(hall / MINUTES_PER_EARTH_DAY).toFixed(1)}, with ${held(hall)} in hand. The first of each commissioned since:`,
    ...bought.map(
      ({ structureTypeId, atMinute }) =>
        `  ${(atMinute / MINUTES_PER_EARTH_DAY).toFixed(1).padStart(6)}  ${labelOf(catalogue.structureTypes, structureTypeId)}`,
    ),
  ];
}

/** What became of the base's propellant, as lines of text. */
function formatPropellant({
  propellantUse,
  sales,
  structureTypesBuilt,
}: ReferenceTimeline): string[] {
  const sold = sales
    .flatMap((sale) => sale.sold)
    .filter(({ resourceId }) => resourceId === "propellant")
    .reduce((sum, { kilograms }) => sum + kilograms, 0);
  const {
    burnedKilograms,
    takeOffsBurning,
    takeOffs,
    mostBurnedKilograms,
    mostCarriedKilograms,
    highestKilograms,
    limitKilograms,
    minutesWaiting,
  } = propellantUse;
  const tank = structureTypesBuilt.find(
    ({ structureTypeId }) => structureTypeId === "propellant-tank",
  )?.atMinute;
  return [
    ...(tank === undefined
      ? []
      : [
          `A propellant tank was commissioned on Earth Day ${(tank / MINUTES_PER_EARTH_DAY).toFixed(1)}.`,
        ]),
    `Propellant: ${burnedKilograms.toFixed(0)} kg burned, on ${takeOffsBurning} of ${takeOffs} take-offs, the most on one ${mostBurnedKilograms.toFixed(0)} kg, for the most carried, ${mostCarriedKilograms.toFixed(0)} kg; ${sold.toFixed(0)} kg sold. It held at most ${highestKilograms.toFixed(0)} kg, against a limit by the end of ${limitKilograms} kg, and some Plant waited for tank space for ${(minutesWaiting / MINUTES_PER_EARTH_DAY).toFixed(0)} Earth Days.`,
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
    ...formatAct2(timeline),
    "",
    ...formatFunding(timeline),
    "",
    ...formatAct4Exports(timeline),
    ...formatPropellant(timeline),
    "",
    ...formatBuriedHabitat(timeline),
    "",
    ...formatGreenhouse(timeline, "greenhouse", "Greenhouse"),
    ...formatGreenhouse(timeline, "growing-hall", "growing hall"),
    ...formatLateBuying(timeline),
    "",
    ...formatLateScience(timeline),
    "",
    limitAt === undefined
      ? "Forecast: the Radiation Dose isn't rising, so it never reaches the limit."
      : `Forecast: at the rate it was rising as the play guide ended, the Radiation Dose reaches the limit on Earth Day ${(limitAt / MINUTES_PER_EARTH_DAY).toFixed(0)}.`,
    ...designsNotUsedLines(timeline),
  ];
}

/** What it says of any Designs it never used. */
export function designsNotUsedLines(timeline: ReferenceTimeline): string[] {
  const notUsed = designsNotUsed(timeline);
  return notUsed.length > 0
    ? [
        `The play guide says it uses these Designs, but built and sent for nothing of them: ${notUsed.join(", ")}.`,
      ]
    : [];
}

/** What the guide's Exports came to in each Act's stretch of game time, by Export. */
function exportsSoldBetween(
  timeline: ReferenceTimeline,
  fromEarthDay: number,
  toEarthDay: number,
): { kilograms: Map<string, number>; earned: number; trips: number } {
  const kilograms = new Map<string, number>();
  let earned = 0;
  let trips = 0;
  for (const sale of timeline.sales) {
    const earthDay = sale.atMinute / MINUTES_PER_EARTH_DAY;
    if (earthDay < fromEarthDay || earthDay >= toEarthDay) continue;
    earned += sale.earnedMillionDollars;
    trips += 1;
    for (const line of sale.sold) {
      kilograms.set(
        line.resourceId,
        (kilograms.get(line.resourceId) ?? 0) + line.kilograms,
      );
    }
  }
  return { kilograms, earned, trips };
}

/** The Funding every 100 Earth Days, and the lowest and highest in Act 2, as lines of text. */
function formatFunding(timeline: ReferenceTimeline): string[] {
  const at = (earthDay: number) =>
    timeline.looks.find(
      ({ atMinute }) => atMinute >= earthDay * MINUTES_PER_EARTH_DAY,
    )?.fundingMillionDollars;
  const curve: string[] = [];
  for (
    let earthDay = 100;
    earthDay <= LONG_GAME_END_EARTH_DAY;
    earthDay += 100
  ) {
    const funding = at(earthDay);
    if (funding !== undefined) {
      curve.push(`  ${String(earthDay).padStart(6)}  $${funding.toFixed(0)}M`);
    }
  }
  const inAct2 = timeline.looks.filter(({ atMinute }) => {
    const earthDay = atMinute / MINUTES_PER_EARTH_DAY;
    return earthDay >= ACT_2_EARTH_DAY && earthDay < ACT_2_END_EARTH_DAY;
  });
  const lowest = inAct2.reduce(
    (low, look) =>
      look.fundingMillionDollars < low.fundingMillionDollars ? look : low,
    inAct2[0] ?? { atMinute: 0, fundingMillionDollars: 0 },
  );
  const sold = exportsSoldBetween(
    timeline,
    ACT_2_EARTH_DAY,
    ACT_2_END_EARTH_DAY,
  );
  const rate = (name: string) => (sold.kilograms.get(name) ?? 0).toFixed(0);
  return [
    "Funding, every 100 Earth Days:",
    ...curve,
    `In Act 2 (Earth Days ${ACT_2_EARTH_DAY} to ${ACT_2_END_EARTH_DAY}) it was lowest at $${lowest.fundingMillionDollars.toFixed(0)}M on Earth Day ${(lowest.atMinute / MINUTES_PER_EARTH_DAY).toFixed(1)}. Exports earned $${sold.earned.toFixed(0)}M over ${sold.trips} trips: ${rate("circuit-boards")} kg of circuit boards and ${rate("metals")} kg of metals.`,
  ];
}

/** What Act 4's Exports came to, which the water for its precision optics limits. */
function formatAct4Exports(timeline: ReferenceTimeline): string[] {
  const sold = exportsSoldBetween(
    timeline,
    ACT_4_EARTH_DAY,
    LONG_GAME_END_EARTH_DAY,
  );
  const kilograms = [...sold.kilograms]
    .map(([resourceId, amount]) => `${amount.toFixed(0)} kg of ${resourceId}`)
    .join(", ");
  return [
    `In Act 4 (Earth Days ${ACT_4_EARTH_DAY} to ${LONG_GAME_END_EARTH_DAY}), Exports earned $${sold.earned.toFixed(0)}M over ${sold.trips} trips: ${kilograms}.`,
  ];
}

const ACT_2_STRUCTURE_TYPE_IDS: readonly string[] = [
  "workshop",
  "large-extraction-plant",
  "array-works",
  "concentrator-tower",
  "cold-trap-ice-line",
];

/** When each of the Structures Act 2 brings first came. */
function formatAct2(timeline: ReferenceTimeline): string[] {
  const dates = timeline.structureTypesBuilt
    .filter(({ structureTypeId }) =>
      ACT_2_STRUCTURE_TYPE_IDS.includes(structureTypeId),
    )
    .map(
      ({ structureTypeId, atMinute }) =>
        `  ${(atMinute / MINUTES_PER_EARTH_DAY).toFixed(1).padStart(6)}  ${labelOf(catalogue.structureTypes, structureTypeId)}`,
    );
  const missed = act2TargetsMissed(timeline);
  const laterMissed = laterActTargetsMissed(timeline);
  return [
    "Act 2's Structures, by the Earth Day the first of each was commissioned:",
    ...dates,
    ...(missed.length === 0
      ? ["Act 2's pacing targets were all met."]
      : missed.map((target) => `Act 2's pacing target missed: ${target}`)),
    ...(laterMissed.length === 0
      ? ["Act 3's and Act 4's pacing targets were all met."]
      : laterMissed.map(
          (target) => `Later Act's pacing target missed: ${target}`,
        )),
  ];
}
