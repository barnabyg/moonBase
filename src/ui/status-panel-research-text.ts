import { catalogue, type Design } from "../catalogue";
import type {
  ExperimentsLabShortage,
  InfraredStop,
  InfraredTelescopeSnapshot,
  RadioArrayStop,
  RadioArraySnapshot,
  ObservingProgrammeSnapshot,
  ResearchTaskSnapshot,
  ScienceForecast,
  ScienceSource,
  Snapshot,
} from "../simulation";
import {
  formatScience,
  formatShortDuration,
  listInWords,
  plural,
} from "./format";
import {
  inSentence,
  researchTaskLabel,
  resourceRefLabel,
  structureLabel,
} from "./labels";
import type { Stat } from "./stat";

// The status panel's words for research, Science and observing, and the
// summary beside the folded research section's title.

/**
 * Says which Research Task is running and how long it has left, for the
 * status panel, for example "Seismic monitoring" and "2d 5h left", or "1d 3h
 * left at ×2" while automated experiments labs speed it up, or that none is.
 */
export function formatResearchTask(
  running: ResearchTaskSnapshot | undefined,
): Stat {
  return running === undefined
    ? { value: "none running" }
    : {
        value: researchTaskLabel(running.researchTaskId),
        note: `${formatShortDuration(running.minutesLeftAtRate)} left${running.rate > 1 ? ` at ${formatResearchRate(running.rate)}` : ""}`,
      };
}

/** What an automated experiments lab lacks, in a few words. */
function labShortage(shortOf: ExperimentsLabShortage): string {
  switch (shortOf.reason) {
    case "power":
      return "short of power";
    case "supply":
      return `short of ${inSentence(resourceRefLabel(shortOf.resource))}`;
    case "broken":
      return "Broken";
    case "switched-off":
      return "switched off";
  }
}

/**
 * Says what the base's automated experiments labs are doing for the Research Task
 * running, for the Research Tasks screen, for example "2 automated experiments
 * labs speeding it up and 1 short of oxygen", or undefined if it has none.
 */
export function formatExperimentsLabs(
  snapshot: Pick<Snapshot, "experimentsLabs" | "researchTask">,
): string | undefined {
  const { labs, speedingUp, short } = snapshot.experimentsLabs;
  if (labs === 0) return undefined;
  const name = inSentence(structureLabel("experiments-lab"));
  const count = (n: number) => `${String(n)} ${n === 1 ? name : `${name}s`}`;
  if (snapshot.researchTask === undefined) {
    return `${count(labs)} standing idle until a Research Task runs`;
  }
  const reasons = new Map<string, number>();
  for (const { shortOf } of short) {
    const reason = labShortage(shortOf);
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  const parts = [
    ...(speedingUp > 0 ? [[speedingUp, "speeding it up"] as const] : []),
    ...[...reasons].map(([reason, n]) => [n, reason] as const),
  ];
  return listInWords(
    parts.map(([n, what], index) =>
      index === 0 ? `${count(n)} ${what}` : `${String(n)} ${what}`,
    ),
  );
}

/**
 * How fast the Research Task running advances, as automated experiments labs
 * speed it up, for example "×2" or "×2.5".
 */
export function formatResearchRate(rate: number): string {
  return `×${String(Math.round(rate * 10) / 10)}`;
}

/**
 * Says what is queued behind the Research Task running, in the order they will
 * start, for the status panel, for example "1. Seismic monitoring, 2. Ice
 * volatiles assay", or that none is. With none queued, it also says when the
 * base's Science would unlock a Design, by name if there is one and how many
 * otherwise, for example "Science for 3 Designs", as unspent Science is easy
 * to overlook.
 */
export function formatResearchQueue(
  queue: readonly string[],
  toUnlock: readonly Pick<Design, "label">[] = [],
): Stat {
  if (queue.length > 0) {
    return {
      value: queue
        .map((id, index) => `${index + 1}. ${researchTaskLabel(id)}`)
        .join(", "),
    };
  }
  const [only] = toUnlock;
  if (only === undefined) return { value: "none" };
  return {
    value: "none",
    note: `Science for ${toUnlock.length === 1 ? only.label : `${toUnlock.length} Designs`}`,
  };
}

/** A rate of Science an Earth Day, to the hundredth below a tenth, which the slow sources earn. */
function sciencePerEarthDay(perEarthDay: number): string {
  return perEarthDay.toFixed(perEarthDay < 0.1 ? 2 : 1);
}

/** The sources of Science that work only at Night, which the forecast averages over a Lunation. */
const NIGHT_ONLY: readonly ScienceSource[] = [
  "observing-programme",
  "infrared-survey",
];

/** Names where Science comes from, the way a sentence would. */
function scienceSourceLabel(source: ScienceSource): string {
  switch (source) {
    case "research-task":
      return "the Research Task running";
    case "observing-programme":
      return inSentence(catalogue.observingProgramme.label);
    case "infrared-survey":
      return inSentence(infraredSurveyLabel());
    case "radio-survey":
      return inSentence(radioSurveyLabel());
    case "growing":
      return "growing";
  }
}

/**
 * Says how much Science the base earns an Earth Day as things stand, for
 * example "+3.0 a day", as the panel's other rates are worded, or that none
 * is being earned, with where it comes from kept for hovering over the line. Science comes a round at a time, so
 * this is what the rounds under way would earn spread over the time they
 * take (see `ScienceForecast`).
 */
export function formatScienceRate(forecast: ScienceForecast): Stat {
  const earning = forecast.sources.filter((source) => source.perEarthDay > 0);
  if (earning.length === 0) {
    return {
      value: "none being earned",
      explanation:
        "A Research Task, a telescope or a Greenhouse earns Science.",
    };
  }
  return {
    value: `+${sciencePerEarthDay(forecast.perEarthDay)} a day`,
    explanation: `As things stand: ${listInWords(
      earning.map(
        ({ source, perEarthDay }) =>
          `${scienceSourceLabel(source)} ${sciencePerEarthDay(perEarthDay)}`,
      ),
    )} Science an Earth Day.${
      earning.some(({ source }) => NIGHT_ONLY.includes(source))
        ? " What works only at Night is averaged over a Lunation."
        : ""
    }`,
  };
}

/**
 * Says how the observing programme is going, for the status panel's
 * Research section: the standing Research Task the base's telescopes work
 * on at Night, with how long its round has left while they observe, for
 * example "Night-sky survey" and "observing, 1d 4h left", or why none
 * does. Undefined while the base has no telescope.
 */
export function formatObservingProgramme(
  programme: ObservingProgrammeSnapshot,
): Stat | undefined {
  if (programme.telescopes === 0) return undefined;
  const value = catalogue.observingProgramme.label;
  if (programme.minutesLeft !== undefined) {
    const who =
      programme.observing === 1
        ? "observing"
        : `${programme.observing} telescopes observing`;
    return {
      value,
      note: `${who}, ${formatShortDuration(programme.minutesLeft)} left`,
    };
  }
  switch (programme.stoppedFor) {
    case "broken":
      return {
        value,
        note: `${programme.telescopes === 1 ? "telescope" : "telescopes"} Broken`,
      };
    case "no-power":
      return { value, note: "no power to observe" };
    case "daylight":
    case undefined:
      return { value, note: "waits for Night" };
  }
}

/** The name of the infrared telescopes' survey. */
function infraredSurveyLabel(): string {
  return (
    catalogue.structureTypes.find((type) => type.observingRounds !== undefined)
      ?.observingRounds?.label ?? "Infrared survey"
  );
}

/** The name of the radio telescope arrays' survey. */
function radioSurveyLabel(): string {
  return (
    catalogue.structureTypes.find((type) => type.radioArray !== undefined)
      ?.radioArray?.label ?? "Radio survey"
  );
}

/** Why an infrared telescope isn't observing, in a few words. */
const INFRARED_STOPS: Record<InfraredStop, string> = {
  daylight: "waits for Night",
  light: "a lit Structure within its dark radius",
  propellant: "short of propellant",
  power: "no power to observe",
  "switched-off": "switched off",
  broken: "Broken",
};

/**
 * Says how the base's infrared telescopes are getting on with their survey, for
 * example "2 infrared telescopes observing, 1d 4h left" with the least time left
 * of any round, or why the first of them isn't observing, for example "a lit
 * Structure within its dark radius"; undefined while the base has none.
 */
export function formatInfraredSurvey(
  telescopes: readonly InfraredTelescopeSnapshot[],
): Stat | undefined {
  const [first] = telescopes;
  if (first === undefined) return undefined;
  const value = infraredSurveyLabel();
  const observing = telescopes.filter((telescope) => telescope.observing);
  if (observing.length > 0) {
    const left = Math.min(
      ...observing.map(({ minutesLeft }) => minutesLeft ?? Infinity),
    );
    return {
      value,
      note: `${plural(observing.length, "infrared telescope")} observing, ${formatShortDuration(left)} left`,
    };
  }
  const stopped = telescopes.find(
    ({ stoppedFor }) => stoppedFor !== "daylight",
  );
  return {
    value,
    note: INFRARED_STOPS[(stopped ?? first).stoppedFor ?? "daylight"],
  };
}

/** Why a radio telescope array isn't working, in a few words. */
const RADIO_STOPS: Record<RadioArrayStop, string> = {
  plant: "a Plant within its quiet radius",
  power: "no power to work",
  broken: "Broken",
};

/**
 * Says how the base's radio telescope arrays are getting on with their survey,
 * for example "2 radio telescope arrays working, 14h left" with the least time
 * left of any round, or why the first of them isn't working, for example "a
 * Plant within its quiet radius"; undefined while the base has none.
 */
export function formatRadioSurvey(
  arrays: readonly RadioArraySnapshot[],
): Stat | undefined {
  const [first] = arrays;
  if (first === undefined) return undefined;
  const value = radioSurveyLabel();
  const working = arrays.filter((array) => array.working);
  if (working.length > 0) {
    const left = Math.min(
      ...working.map(({ minutesLeft }) => minutesLeft ?? Infinity),
    );
    return {
      value,
      note: `${plural(working.length, "radio telescope array")} working, ${formatShortDuration(left)} left`,
    };
  }
  return { value, note: RADIO_STOPS[first.stoppedFor ?? "power"] };
}

/**
 * Explains the observing programme, for hovering over its line in the
 * status panel: what it is, what a round takes and pays, and how far the
 * round under way has got.
 */
export function explainObservingProgramme(
  programme: ObservingProgrammeSnapshot,
): string {
  const { lengthHours, science } = catalogue.observingProgramme;
  return `The standing Research Task the base's telescopes work on at Night, beside the one running: each round, ${lengthHours} hours of a telescope's observing, pays ${formatScience(science)}. This round is ${Math.floor(programme.progress * 100)}% done.`;
}

/**
 * Sums up Research for its folded section: the Research Task running and
 * how far it has got, for example "Seismic monitoring · 45%", or that none
 * is, then, once the base has a telescope, how far the observing
 * programme's round has got, for example "Night-sky survey · 20%".
 */
export function summariseResearch(
  running: ResearchTaskSnapshot | undefined,
  programme: ObservingProgrammeSnapshot,
): string {
  const task =
    running === undefined
      ? "none running"
      : `${researchTaskLabel(running.researchTaskId)} · ${Math.floor(running.progress * 100)}%`;
  return programme.telescopes === 0
    ? task
    : `${task}, ${catalogue.observingProgramme.label} · ${Math.floor(programme.progress * 100)}%`;
}
