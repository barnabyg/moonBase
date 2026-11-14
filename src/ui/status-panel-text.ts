import { catalogue } from "../catalogue";
import type {
  ExpeditionSnapshot,
  ExportLine,
  ExportLoadingSnapshot,
  HabitatPowerForecast,
  LanderLeg,
  LanderSnapshot,
  LifeSupportForecast,
  LifeSupportSnapshot,
  MissionDirectorResidence,
  RadiationDoseForecast,
  SelfSufficiencySnapshot,
  Snapshot,
  SolarParticleEventSnapshot,
  SpareComponentsForecast,
  StructureSnapshot,
} from "../simulation";
import { formatShortDuration, millisieverts, plural } from "./format";
import {
  componentsInWords,
  formatExportLines,
  stockLabel,
  structureLabel,
} from "./labels";
import type { Stat } from "./stat";

// The status panel's figures in words for the Mission Director, the Lander,
// life support and the base's stocks, and the summaries beside their folded
// sections' titles. The other sections' words are in the status-panel-*-text
// files beside this one.

/**
 * The game-minutes left until a moment, none once it has passed, or none if
 * there is no moment to wait for.
 */
export function minutesUntil(
  atMinute: number | undefined,
  elapsedMinutes: number,
): number {
  return Math.max((atMinute ?? elapsedMinutes) - elapsedMinutes, 0);
}

/**
 * Says where the Mission Director lives and, in a Habitat, whether it has
 * power and when it will lose it, on one line, for example "in the Buried
 * Habitat" and "powered", "power fails in 1d 16h" or "power failed". Aboard
 * the Lander, which needs none from the base, it is just "aboard the Lander".
 */
export function formatResidence(
  missionDirector: MissionDirectorResidence,
  structures: readonly Pick<
    StructureSnapshot,
    "id" | "structureTypeId" | "powered"
  >[],
  forecast: Pick<HabitatPowerForecast, "minutesUntilPowerLost"> | undefined,
): Stat {
  if (missionDirector.residence === "lander") {
    return { value: "aboard the Lander" };
  }
  const { habitatId } = missionDirector;
  const habitat = structures.find((structure) => structure.id === habitatId);
  const value = `in the ${structureLabel(habitat?.structureTypeId ?? "habitat")}`;
  if (habitat?.powered !== true) return { value, note: "power failed" };
  return {
    value,
    note:
      forecast?.minutesUntilPowerLost === undefined
        ? "powered"
        : `power fails in ${formatShortDuration(forecast.minutesUntilPowerLost)}`,
  };
}

/**
 * Says what state the Lander is in, any Exports aboard and, while it is
 * away, when it next arrives or leaves, for example "landed on the landing
 * pad with 40 kg of wafers aboard" and "free to fly", or "travelling to
 * Earth with 40 kg of wafers" and "arrives in 2d 23h". On its way back it
 * says when it lands, not where, which the map shows.
 */
export function formatLander(
  lander: LanderSnapshot,
  elapsedMinutes: number,
  exportsAboard: readonly ExportLine[],
  exportLoading?: ExportLoadingSnapshot,
): Stat {
  const onPad = lander.landingPadId === undefined ? "" : " on the landing pad";
  const aboard =
    exportsAboard.length === 0
      ? ""
      : ` with ${formatExportLines(exportsAboard)} aboard`;
  switch (lander.state) {
    case "landed-occupied":
      return { value: "landed", note: "Mission Director aboard" };
    case "landed-free":
      if (lander.cargo.length > 0) {
        return {
          value: `landed${onPad}${aboard}`,
          note: "cargo waiting for the Robot to unload it",
        };
      }
      return {
        value: `landed${onPad}${aboard}`,
        note:
          exportLoading === undefined
            ? "free to fly"
            : `waiting for the Robot to load ${formatExportLines(exportLoading.exports)}`,
      };
    default: {
      const words = landerLegWords[lander.state];
      // Exports go aboard only to be sold on Earth.
      const carrying =
        lander.state === "travelling-to-earth" && exportsAboard.length > 0
          ? ` with ${formatExportLines(exportsAboard)}`
          : "";
      return {
        value: `${words.doing}${carrying}`,
        note: `${words.next} in ${formatShortDuration(minutesUntil(lander.legEndsAtMinute, elapsedMinutes))}`,
      };
    }
  }
}

/**
 * What the Lander does on each leg of its round trip and at the end of it,
 * in full for its status line, for example "travelling to Earth" and
 * "arrives", and for a folded section's title, which doesn't say what it
 * is doing now, for example "at Earth".
 */
const landerLegWords: Readonly<
  Record<
    LanderLeg,
    {
      readonly doing: string;
      readonly next: string;
      readonly nextInShort: string;
    }
  >
> = {
  "travelling-to-earth": {
    doing: "travelling to Earth",
    next: "arrives",
    nextInShort: "at Earth",
  },
  turnaround: {
    doing: "in turnaround on Earth",
    next: "leaves",
    nextInShort: "leaves Earth",
  },
  "travelling-to-moon": {
    doing: "travelling to the Moon",
    next: "lands",
    nextInShort: "lands",
  },
};

/**
 * Sums up the Lander and any Expedition under way for their folded
 * section, with when each next arrives or leaves, for example "landed" or
 * "lands in 2d · Rover back in 5h".
 */
export function summariseTravel(
  lander: LanderSnapshot,
  expedition: ExpeditionSnapshot | undefined,
  elapsedMinutes: number,
): string {
  const left = (atMinute: number | undefined): string =>
    formatShortDuration(minutesUntil(atMinute, elapsedMinutes), true);
  const where =
    lander.state === "landed-occupied" || lander.state === "landed-free"
      ? "landed"
      : `${landerLegWords[lander.state].nextInShort} in ${left(lander.legEndsAtMinute)}`;
  if (expedition === undefined) return where;
  return expedition.stage === "away"
    ? `${where} · Rover back in ${left(expedition.returnsAtMinute)}`
    : `${where} · Rover on Expedition`;
}

/**
 * Says how much of a life support stock is left and when it will run out,
 * for example "24.2 kg" and "lasts 28d 19h", or how fast it is rising while
 * the base's Plants make more than is used, for example "rising 2.8 kg a
 * day", and when it will run out even so, if the Plants standing idle at
 * Night leave it too little to last the Night, with the reason kept for
 * hovering over the line. The amount is shown against what
 * the base can hold, for example "399.5 of 400 kg", and while the Plants are
 * holding it there the line says so, whatever else it might have said.
 */
export function formatLifeSupport(
  stock: LifeSupportSnapshot,
  forecast: LifeSupportForecast | undefined,
  missionDirector: MissionDirectorResidence,
): Stat {
  const value = `${stock.kilograms.toFixed(1)} of ${stock.limitKilograms} kg`;
  if (forecast?.holdingFull === true) {
    return { value, note: "holding full" };
  }
  if ((forecast?.kilogramsPerEarthDay ?? 0) > 0) {
    const rising = `rising ${(forecast?.kilogramsPerEarthDay ?? 0).toFixed(1)} kg a day`;
    // Rising now, but not enough to last the Night ahead.
    return forecast?.minutesUntilEmpty === undefined
      ? { value, note: rising }
      : {
          value,
          note: `${rising}, lasts ${formatShortDuration(forecast.minutesUntilEmpty)}`,
          explanation:
            "It is rising now, but lasts only that long: the Plants that make it may stand idle at Night.",
        };
  }
  if (stock.kilograms === 0) return { value, note: "ran out" };
  if (forecast?.minutesUntilEmpty !== undefined) {
    return {
      value,
      note: `lasts ${formatShortDuration(forecast.minutesUntilEmpty)}`,
    };
  }
  return missionDirector.residence === "lander"
    ? { value, note: "safe aboard the Lander" }
    : { value };
}

/**
 * Says whether the base is self-sufficient in a life support stock, for
 * example "yes", with the share of the Mission Director's use the base
 * made over the window, for example "140%", and the whole story to show on
 * demand.
 */
export function formatSelfSufficiency(
  selfSufficiency: SelfSufficiencySnapshot,
  missionDirector: MissionDirectorResidence,
): {
  readonly value: string;
  readonly share: string | undefined;
  readonly explanation: string;
} {
  if (missionDirector.residence === "lander") {
    return {
      value: "no",
      share: undefined,
      explanation: "Nothing is used aboard the Lander.",
    };
  }
  const window = selfSufficiencyWindow();
  const share =
    selfSufficiency.coveredShare === undefined
      ? undefined
      : `${Math.round(selfSufficiency.coveredShare * 100)}%`;
  const made =
    share === undefined
      ? "Nothing used"
      : `${share} of the Mission Director's use made at the base`;
  if (!selfSufficiency.windowComplete) {
    return {
      value: "not yet",
      share,
      explanation: `${made} so far. It is judged once a whole Lunation has been recorded.`,
    };
  }
  return {
    value: selfSufficiency.selfSufficient ? "yes" : "no",
    share,
    explanation: `${made} over ${window}.`,
  };
}

/** The window self-sufficiency is judged over, in words, for example "the last Lunation". */
export function selfSufficiencyWindow(): string {
  const { windowLunations } = catalogue.selfSufficiency;
  return windowLunations === 1
    ? "the last Lunation"
    : `the last ${windowLunations} Lunations`;
}

/** The chemical formulas of the life support stocks, short enough for a section's title. */
const stockFormulas: Readonly<Record<string, string>> = {
  oxygen: "O₂",
  water: "H₂O",
};

/**
 * Sums up how the Mission Director is keeping for their folded section:
 * how long each life support stock lasts, for example "O₂ 29d · H₂O 5d",
 * or that they are safe aboard the Lander, where none is used.
 */
export function summariseMissionDirector(
  missionDirector: MissionDirectorResidence,
  stocks: readonly LifeSupportSnapshot[],
  forecasts: readonly LifeSupportForecast[],
): string {
  if (missionDirector.residence === "lander") return "aboard the Lander";
  return stocks
    .map((stock) => {
      const forecast = forecasts.find(
        (candidate) => candidate.stockId === stock.stockId,
      );
      const name = stockFormulas[stock.stockId] ?? stockLabel(stock.stockId);
      return `${name} ${summariseLifeSupport(stock, forecast)}`;
    })
    .join(" · ");
}

/** How long a life support stock lasts, or that it is rising or has run out. */
function summariseLifeSupport(
  stock: LifeSupportSnapshot,
  forecast: LifeSupportForecast | undefined,
): string {
  if (forecast?.holdingFull === true) return "full";
  const rising = (forecast?.kilogramsPerEarthDay ?? 0) > 0;
  if (stock.kilograms === 0 && !rising) return "ran out";
  // Falling, or rising now but not enough to last the Night ahead.
  if (forecast?.minutesUntilEmpty !== undefined) {
    return formatShortDuration(forecast.minutesUntilEmpty, true);
  }
  return rising ? "rising" : `${stock.kilograms.toFixed(1)} kg`;
}

/**
 * Says how many spare Components the base has and how long they will last
 * at the current rate of wear, for example "6 in stock" and "last 9d 4h", or,
 * while the base's Plants make more than is used, how fast they are rising,
 * and when they will run out even so, if the Plants standing idle at Night
 * leave too few to last it, with the reason kept for hovering over the line.
 */
export function formatSpareComponents(forecast: SpareComponentsForecast): Stat {
  const pending =
    forecast.forPendingRepairs === 0
      ? ""
      : `, ${forecast.forPendingRepairs} needed for repairs waiting`;
  const value = `${forecast.inStock} in stock${pending}`;
  const net = forecast.madePerEarthDay - forecast.perEarthDay;
  if (net > 0) {
    const rising = `rising ${net.toFixed(1)} a day`;
    if (forecast.minutesUntilEmpty === undefined) {
      return { value, note: rising };
    }
    return forecast.minutesUntilEmpty === 0
      ? {
          value,
          note: `${rising}, but too few for the wear until a batch finishes`,
        }
      : {
          value,
          note: `${rising}, last ${formatShortDuration(forecast.minutesUntilEmpty)}`,
          explanation:
            "They are rising now, but last only that long: the Plants that make them may stand idle at Night.",
        };
  }
  if (forecast.minutesUntilEmpty === undefined) {
    return {
      value,
      note:
        forecast.perEarthDay === 0
          ? "nothing wearing down"
          : "enough until Daylight",
    };
  }
  return {
    value,
    note:
      forecast.minutesUntilEmpty === 0
        ? "too few for the wear"
        : `last ${formatShortDuration(forecast.minutesUntilEmpty)}`,
  };
}

/**
 * Sums up the base's stock for its folded section: how many spare
 * Components it has and how long they last, which is what keeps it running,
 * for example "6 spares, last 9d".
 */
export function summariseStock(spares: SpareComponentsForecast): string {
  const count = plural(spares.inStock, "spare");
  if (spares.madePerEarthDay > spares.perEarthDay) return `${count}, rising`;
  return spares.minutesUntilEmpty === undefined
    ? count
    : spares.minutesUntilEmpty === 0
      ? `${count}, too few`
      : `${count}, last ${formatShortDuration(spares.minutesUntilEmpty, true)}`;
}

/**
 * Says how much radiation the Mission Director has absorbed against the
 * limit, and how fast it is rising, for example "64.0 / 600 mSv" and "+30.0
 * a day, limit in 17d 21h".
 */
export function formatRadiationDose(
  doseMillisieverts: number,
  forecast: RadiationDoseForecast,
  missionDirector: MissionDirectorResidence,
): Stat {
  const limit = catalogue.radiation.doseLimitMillisieverts;
  const value = `${doseMillisieverts.toFixed(1)} / ${millisieverts(limit, 0)}`;
  if (doseMillisieverts >= limit) return { value, note: "limit reached" };
  if (forecast.minutesUntilLimit !== undefined) {
    return {
      value,
      // Fine enough to show what a Buried Habitat cuts it to.
      note: `+${forecast.millisievertsPerEarthDay.toFixed(forecast.millisievertsPerEarthDay < 0.1 ? 3 : 1)} a day, limit in ${formatShortDuration(forecast.minutesUntilLimit)}`,
    };
  }
  return missionDirector.residence === "lander"
    ? { value, note: "none aboard the Lander" }
    : { value };
}

/**
 * Says when a Solar Particle Event the Mission Director knows of starts or
 * ends, and how much it multiplies their dose rate, for example "starts in
 * 4h, lasts 18h" and "10× the dose rate".
 */
export function formatSolarParticleEvent(
  event: SolarParticleEventSnapshot,
  elapsedMinutes: number,
): Stat {
  const note = `${event.doseRateMultiplier}× the dose rate`;
  return event.state === "coming"
    ? {
        value: `starts in ${formatShortDuration(event.startsAtMinute - elapsedMinutes)}, lasts ${formatShortDuration(event.endsAtMinute - event.startsAtMinute)}`,
        note,
      }
    : {
        value: `under way, ends in ${formatShortDuration(event.endsAtMinute - elapsedMinutes)}`,
        note,
      };
}

/**
 * Lists the Components in the base's stock, each with how many there are and
 * its name in the plural where there are several, for example 2 "solar
 * panels" and 1 "array mast", in catalogue order, leaving out those there are
 * none of.
 */
export function listStock(
  stockpile: Snapshot["stockpile"],
): { readonly count: number; readonly name: string }[] {
  return stockpile.components
    .filter((stock) => stock.count > 0)
    .map(({ componentId, count }) => ({
      count,
      name: componentsInWords(componentId, count),
    }));
}
