// The long-game play guide's pacing targets, and which it missed.
import { catalogue } from "../../src/catalogue";
import {
  LOOK_EVERY_MINUTES,
  type Play,
  type ReferenceTimeline,
} from "../reference-campaign";
import { catalogueUpToAct, exportEconomics } from "../pacing-report";
import {
  act2Targets,
  laterActTargets,
  MINUTES_PER_EARTH_DAY,
} from "./settings";

/** The dated pacing targets, in the words that say one was missed. */
const TARGET_WORDS = {
  workshopRunning: `a Workshop running by Earth Day ${act2Targets.workshopRunningBy}.`,
  sparesNeedNoLaunch: `spare Components needing no Launch by Earth Day ${act2Targets.sparesNeedNoLaunchBy}.`,
  metalsSold: `metals sold by Earth Day ${act2Targets.metalsSoldBy}.`,
  designsStillToBuy: `Designs still to buy at Earth Day ${act2Targets.designsStillToBuyAt}.`,
  propellantMade: `propellant made by Earth Day ${laterActTargets.propellantMadeBy}.`,
  returnMassTripled: `Return Mass tripled by Earth Day ${laterActTargets.returnMassTripledBy}.`,
  opticsSold: `precision optics sold by Earth Day ${laterActTargets.opticsSoldBy}.`,
  crewHabitat: `a Large-scale Crew Habitat commissioned by Earth Day ${laterActTargets.crewHabitatBy}.`,
  act2Research: `research lasting until about Earth Day ${act2Targets.researchLastsUntilAbout}`,
  act3Research: `Act 3's research lasting until about Earth Day ${laterActTargets.act3ResearchUntilAbout}`,
  act4Research: `Act 4's research lasting until about Earth Day ${laterActTargets.act4ResearchUntilAbout}`,
} as const;

/**
 * Gives up on the Campaign as soon as a dated pacing target can no longer be met,
 * as playing on to the end would take many minutes to say no more than that. It
 * only reads the snapshot, so the play goes as it would without it, and it gives
 * up only on what the end would fail: `act2TargetsMissed` and
 * `laterActTargetsMissed`, or, for an Act's research still unfinished past its
 * date and never finished, `checkEverythingResearched`. That spare Components
 * never run out, and what Launches' profit buys, have no date, so they wait for the end.
 */
export function giveUpOnMissedTargets(): (play: Play) => void {
  const byEarthDay = (earthDays: number) => earthDays * MINUTES_PER_EARTH_DAY;
  const milestones = [
    {
      milestoneId: "workshop-running",
      by: act2Targets.workshopRunningBy,
      words: TARGET_WORDS.workshopRunning,
    },
    {
      milestoneId: "spare-components-self-sufficient",
      by: act2Targets.sparesNeedNoLaunchBy,
      words: TARGET_WORDS.sparesNeedNoLaunch,
    },
    {
      milestoneId: "metals-sold",
      by: act2Targets.metalsSoldBy,
      words: TARGET_WORDS.metalsSold,
    },
    {
      milestoneId: "first-propellant",
      by: laterActTargets.propellantMadeBy,
      words: TARGET_WORDS.propellantMade,
    },
    {
      milestoneId: "return-mass-tripled",
      by: laterActTargets.returnMassTripledBy,
      words: TARGET_WORDS.returnMassTripled,
    },
    {
      milestoneId: "precision-optics-sold",
      by: laterActTargets.opticsSoldBy,
      words: TARGET_WORDS.opticsSold,
    },
    {
      milestoneId: "crew-habitat-commissioned",
      by: laterActTargets.crewHabitatBy,
      words: TARGET_WORDS.crewHabitat,
    },
  ];
  const research = [
    {
      act: 2,
      until: act2Targets.researchLastsUntilAbout,
      within: act2Targets.researchWithin,
      words: TARGET_WORDS.act2Research,
    },
    {
      act: 3,
      until: laterActTargets.act3ResearchUntilAbout,
      within: laterActTargets.researchWithin,
      words: TARGET_WORDS.act3Research,
    },
    {
      act: 4,
      until: laterActTargets.act4ResearchUntilAbout,
      within: laterActTargets.act4ResearchWithin,
      words: TARGET_WORDS.act4Research,
    },
  ].map((target) => ({
    ...target,
    taskIds: catalogueUpToAct(catalogue, target.act).researchTasks.map(
      ({ id }) => id,
    ),
  }));
  const act2DesignIds = catalogueUpToAct(catalogue, 2).designs.map(
    ({ id }) => id,
  );
  return ({ state }) => {
    const now = state.clock.elapsedMinutes;
    const { lander, launchManifest } = state;
    const missed = [
      ...milestones
        .filter(
          ({ milestoneId, by }) =>
            now > byEarthDay(by) &&
            !state.milestones.reachedIds.includes(milestoneId),
        )
        .map(({ words }) => words),
      ...(lander.state === "travelling-to-earth" &&
      (lander.legStartedAtMinute ?? 0) >
        byEarthDay(act2Targets.sparesNeedNoLaunchBy) &&
      launchManifest.items.some(
        ({ itemId }) => itemId === catalogue.maintenance.spareComponentId,
      )
        ? [TARGET_WORDS.sparesNeedNoLaunch]
        : []),
      // The timeline dates an unlocked Design by the next look after it.
      ...(now + LOOK_EVERY_MINUTES <=
        byEarthDay(act2Targets.designsStillToBuyAt) &&
      act2DesignIds.every((id) => state.unlockedDesignIds.includes(id))
        ? [TARGET_WORDS.designsStillToBuy]
        : []),
      ...research.flatMap(({ taskIds, until, within, words }) => {
        const done = taskIds.every((id) =>
          state.completedResearchTaskIds.includes(id),
        );
        if (done && now < byEarthDay(until - within)) {
          return [`${words} (it has ended already).`];
        }
        return !done && now > byEarthDay(until + within)
          ? [`${words} (it hasn't ended).`]
          : [];
      }),
    ];
    if (missed.length > 0) {
      throw new Error(
        `On Earth Day ${(now / MINUTES_PER_EARTH_DAY).toFixed(1)} a pacing target can no longer be met: ${[...new Set(missed)].join(" ")}`,
      );
    }
  };
}

/** Which of Act 2's pacing targets the guide missed, in words. */
export function act2TargetsMissed(timeline: ReferenceTimeline): string[] {
  const reachedOn = (milestoneId: string) => {
    const reached = timeline.milestones.find(
      (milestone) => milestone.milestoneId === milestoneId,
    );
    return reached === undefined
      ? Infinity
      : reached.atMinute / MINUTES_PER_EARTH_DAY;
  };
  const {
    workshopRunningBy,
    sparesNeedNoLaunchBy,
    designsStillToBuyAt,
    researchLastsUntilAbout,
    researchWithin,
    launchesToBuyEverything,
    metalsSoldBy,
  } = act2Targets;
  const lastSpares = Math.max(
    0,
    ...timeline.sparesShipped.map(({ atMinute }) => atMinute),
  );
  const upToAct2 = catalogueUpToAct(catalogue, 2);
  const lastResearch =
    Math.max(
      0,
      ...timeline.researchTasksCompleted
        .filter(({ researchTaskId }) =>
          upToAct2.researchTasks.some(({ id }) => id === researchTaskId),
        )
        .map(({ atMinute }) => atMinute),
    ) / MINUTES_PER_EARTH_DAY;
  const lastDesign =
    Math.max(
      0,
      ...timeline.designsUnlocked
        .filter(({ designId }) =>
          upToAct2.designs.some(({ id }) => id === designId),
        )
        .map(({ atMinute }) => atMinute),
    ) / MINUTES_PER_EARTH_DAY;
  const built = timeline.structureTypesBuilt.find(
    ({ structureTypeId }) => structureTypeId === "workshop",
  )?.atMinute;
  const fewestSpares = Math.min(
    Infinity,
    ...timeline.sparesInStock
      .filter(({ atMinute }) => built !== undefined && atMinute > built)
      .map(({ fewest }) => fewest),
  );
  const launches = launchesToBuyOneOfEverything();
  return [
    ...(reachedOn("workshop-running") <= workshopRunningBy
      ? []
      : [TARGET_WORDS.workshopRunning]),
    ...(reachedOn("spare-components-self-sufficient") <= sparesNeedNoLaunchBy &&
    lastSpares <= sparesNeedNoLaunchBy * MINUTES_PER_EARTH_DAY
      ? []
      : [TARGET_WORDS.sparesNeedNoLaunch]),
    ...(reachedOn("metals-sold") <= metalsSoldBy
      ? []
      : [TARGET_WORDS.metalsSold]),
    ...(lastDesign > designsStillToBuyAt
      ? []
      : [TARGET_WORDS.designsStillToBuy]),
    ...(Math.abs(lastResearch - researchLastsUntilAbout) <= researchWithin
      ? []
      : [
          `${TARGET_WORDS.act2Research} (it ended on ${lastResearch.toFixed(0)}).`,
        ]),
    ...(fewestSpares > 0 ? [] : ["spare Components never running out."]),
    ...(launches !== undefined && launches >= launchesToBuyEverything
      ? []
      : [
          `one of every Launch item taking at least ${launchesToBuyEverything} Launches' profit (it takes ${launches ?? "no number of"}).`,
        ]),
  ];
}

/** Which of Act 3's and Act 4's pacing targets the guide missed, in words. */
export function laterActTargetsMissed(timeline: ReferenceTimeline): string[] {
  const reachedOn = (milestoneId: string) => {
    const reached = timeline.milestones.find(
      (milestone) => milestone.milestoneId === milestoneId,
    );
    return reached === undefined
      ? Infinity
      : reached.atMinute / MINUTES_PER_EARTH_DAY;
  };
  const researchEnded = (act: number) =>
    Math.max(
      0,
      ...timeline.researchTasksCompleted
        .filter(({ researchTaskId }) =>
          catalogueUpToAct(catalogue, act).researchTasks.some(
            ({ id }) => id === researchTaskId,
          ),
        )
        .map(({ atMinute }) => atMinute),
    ) / MINUTES_PER_EARTH_DAY;
  const {
    propellantMadeBy,
    returnMassTripledBy,
    act3ResearchUntilAbout,
    act4ResearchUntilAbout,
    researchWithin,
    act4ResearchWithin,
    opticsSoldBy,
    crewHabitatBy,
  } = laterActTargets;
  const near = (
    earthDay: number,
    target: number,
    within: number = researchWithin,
  ) => Math.abs(earthDay - target) <= within;
  return [
    ...(reachedOn("first-propellant") <= propellantMadeBy
      ? []
      : [TARGET_WORDS.propellantMade]),
    ...(reachedOn("return-mass-tripled") <= returnMassTripledBy
      ? []
      : [TARGET_WORDS.returnMassTripled]),
    ...(reachedOn("precision-optics-sold") <= opticsSoldBy
      ? []
      : [TARGET_WORDS.opticsSold]),
    ...(reachedOn("crew-habitat-commissioned") <= crewHabitatBy
      ? []
      : [TARGET_WORDS.crewHabitat]),
    ...(near(researchEnded(3), act3ResearchUntilAbout)
      ? []
      : [
          `${TARGET_WORDS.act3Research} (it ended on ${researchEnded(3).toFixed(0)}).`,
        ]),
    ...(near(researchEnded(4), act4ResearchUntilAbout, act4ResearchWithin)
      ? []
      : [
          `${TARGET_WORDS.act4Research} (it ended on ${researchEnded(4).toFixed(0)}).`,
        ]),
  ];
}

/** How many Launches' profit, of the Export that makes the most, one of every Launch item takes. */
function launchesToBuyOneOfEverything(): number | undefined {
  const { exports: sold } = exportEconomics(catalogueUpToAct(catalogue, 2));
  return [...sold].sort(
    (a, b) => b.profitMillionDollars - a.profitMillionDollars,
  )[0]?.launchesToBuyEverything;
}
