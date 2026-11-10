import { catalogue } from "../catalogue";
import type { CampaignState } from "./campaign";
import { MINUTES_PER_EARTH_DAY } from "./clock";
import { structurePerformance } from "./condition";
import { findStructureType } from "./construction";
import { researchSpeedUp } from "./experiments-labs";
import { nightObservingRate } from "./observing";
import { readRadioArrays } from "./radio-arrays";
import { researchTaskMinutes } from "./research";
import type { Rounds } from "./rounds";

// How fast the base earns Science, as things stand. Science comes a round at a
// time: a Research Task's as it completes, and a round's of the observing
// programme, a survey or a Greenhouse's growing as that does. So a rate is
// each round's Science spread over the time the round takes at the pace it
// is worked now, which is what the base would earn an Earth Day if things
// went on as they are. What works only at Night counts for the Night's share
// of a Lunation, in Daylight too, so that the figure doesn't swing between
// the two. A round lost to a shortage earns nothing, which no rate foresees.

/** Where the base's Science comes from. */
export type ScienceSource =
  /** The Research Task running, sped up by automated experiments labs. */
  | "research-task"
  /** The observing programme its telescopes share, at Night. */
  | "observing-programme"
  /** The infrared telescopes' surveys, at Night. */
  | "infrared-survey"
  /** The radio telescope arrays' surveys. */
  | "radio-survey"
  /** The rounds of growing of its Greenhouses and growing halls. */
  | "growing";

/** How fast the base earns Science, as things stand. */
export interface ScienceForecast {
  /** The Science it earns an Earth Day, from every source. */
  readonly perEarthDay: number;
  /** What each source earns an Earth Day, every one of them, in this order. */
  readonly sources: readonly {
    readonly source: ScienceSource;
    readonly perEarthDay: number;
  }[];
}

/** Says how fast the base earns Science, as things stand, and where from. */
export function forecastScience(state: CampaignState): ScienceForecast {
  const sources = [
    { source: "research-task", perEarthDay: fromResearchTask(state) },
    {
      source: "observing-programme",
      perEarthDay:
        perEarthDayOf(catalogue.observingProgramme, nightObservingRate(state)) *
        nightShare(),
    },
    { source: "infrared-survey", perEarthDay: fromInfraredSurveys(state) },
    { source: "radio-survey", perEarthDay: fromRadioSurveys(state) },
    { source: "growing", perEarthDay: fromGrowing(state) },
  ] as const;
  return {
    perEarthDay: sources.reduce((sum, source) => sum + source.perEarthDay, 0),
    sources,
  };
}

/**
 * The Science an Earth Day that rounds earn while they are worked at a rate:
 * the share of a game-minute added to them each game-minute.
 */
function perEarthDayOf(rounds: Rounds, rate: number): number {
  return (rounds.science * rate * 24) / rounds.lengthHours;
}

/** The share of a Lunation that is Night. */
function nightShare(): number {
  const { daylightEarthDays, nightEarthDays } = catalogue.lunation;
  return nightEarthDays / (daylightEarthDays + nightEarthDays);
}

/** The Research Task running: its Science over its length, at the pace the labs set. */
function fromResearchTask(state: CampaignState): number {
  const running = state.researchTask;
  const task = catalogue.researchTasks.find(
    (candidate) => candidate.id === running?.researchTaskId,
  );
  if (task === undefined) return 0;
  return (
    (task.science * (1 + researchSpeedUp(state)) * MINUTES_PER_EARTH_DAY) /
    researchTaskMinutes(task)
  );
}

/**
 * The infrared telescopes' surveys. At Night one counts while it observes;
 * in Daylight, which only pauses it, it counts unless something else stops
 * it, as nothing says yet whether it will have its power and propellant.
 */
function fromInfraredSurveys(state: CampaignState): number {
  return (
    state.structures.reduce((sum, structure) => {
      const rounds = findStructureType(
        structure.structureTypeId,
      )?.observingRounds;
      const counts =
        structure.powered || structure.plantStop?.reason === "daylight";
      return rounds === undefined || !counts
        ? sum
        : sum + perEarthDayOf(rounds, structurePerformance(structure));
    }, 0) * nightShare()
  );
}

/** The radio telescope arrays' surveys, worked by day and at Night while nothing stops them. */
function fromRadioSurveys(state: CampaignState): number {
  const { daylightEarthDays, nightEarthDays } = catalogue.lunation;
  return readRadioArrays(state).reduce(
    (sum, array) =>
      array.working
        ? sum + array.sciencePerLunation / (daylightEarthDays + nightEarthDays)
        : sum,
    0,
  );
}

/** The Greenhouses' and growing halls' rounds, grown by day and at Night while they have water and power. */
function fromGrowing(state: CampaignState): number {
  return state.structures.reduce((sum, structure) => {
    const growing = findStructureType(structure.structureTypeId)?.growing;
    return growing === undefined || !structure.powered
      ? sum
      : sum + perEarthDayOf(growing, structurePerformance(structure));
  }, 0);
}
