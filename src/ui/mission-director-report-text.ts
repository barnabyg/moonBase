import { catalogue } from "../catalogue";
import type { Forecasts, Snapshot } from "../simulation";
import { listAttention } from "./attention-text";
import {
  formatDuration,
  formatFunding,
  formatMillisieverts,
  formatScience,
  plural,
} from "./format";
import { inSentence, stockLabel } from "./labels";
import {
  homeHabitat,
  warnsOfHabitatPower,
  warnsOfLifeSupport,
  warnsOfRadiationDose,
  warnsOfSpareComponents,
} from "./status-warnings";

// The Mission Director's Report, in their own words: what pleases them about
// the base as things stand, and what concerns them. It only reads what the
// status panel shows, by the same warning thresholds, so that the two never
// disagree.

export interface MissionDirectorReport {
  readonly pleased: readonly string[];
  readonly concerned: readonly string[];
}

/** How far off a stock running out still concerns the Mission Director, short of a warning. */
const CONCERN_EARTH_DAYS = 30;
const CONCERN_MINUTES = CONCERN_EARTH_DAYS * 24 * 60;

/** The share of the dose limit taken, from which the Radiation Dose concerns them. */
const DOSE_CONCERN_SHARE = 0.5;
/** The share of the dose limit taken, up to which it pleases them. */
const DOSE_PLEASED_SHARE = 0.1;

/** What the Mission Director is pleased and concerned about, as things stand. */
export function writeMissionDirectorReport(
  snapshot: Snapshot,
  forecasts: Forecasts,
): MissionDirectorReport {
  const pleased: string[] = [];
  const concerned: string[] = [];
  if (snapshot.ended !== undefined) return { pleased, concerned };

  shelter(snapshot, forecasts, pleased, concerned);
  habitatPower(snapshot, forecasts, pleased, concerned);
  lifeSupport(snapshot, forecasts, pleased, concerned);
  spareComponents(forecasts, pleased, concerned);
  repairs(snapshot, forecasts, concerned);
  progress(snapshot, forecasts, pleased, concerned);
  return { pleased, concerned };
}

/** Where they live, what it keeps out, and the Radiation Dose taken. */
function shelter(
  snapshot: Snapshot,
  forecasts: Forecasts,
  pleased: string[],
  concerned: string[],
): void {
  const { solarParticleEvent: event } = snapshot;
  if (event !== undefined) {
    const elapsed = snapshot.clock.elapsedMinutes;
    concerned.push(
      event.state === "coming"
        ? `A Solar Particle Event starts in ${formatDuration(event.startsAtMinute - elapsed)}, at ${event.doseRateMultiplier}× the usual dose rate.`
        : `A Solar Particle Event is under way, at ${event.doseRateMultiplier}× the usual dose rate, for ${formatDuration(event.endsAtMinute - elapsed)} more.`,
    );
  }

  if (snapshot.missionDirector.residence === "lander") {
    pleased.push(
      "Aboard the Lander I'm safe from radiation, and want for nothing.",
    );
    concerned.push(
      "The Lander can't fly while I live aboard it, so nothing more comes from Earth until I move into a Habitat.",
    );
    return;
  }

  const habitat = homeHabitat(snapshot);
  const rate = forecasts.radiationDose.millisievertsPerEarthDay;
  if (habitat?.buried === true) {
    pleased.push(
      "My Buried Habitat keeps out almost all the radiation: I could live here for years.",
    );
  } else if (habitat?.waterWalled === true) {
    pleased.push(
      "The water wall over my Habitat keeps out nearly all the radiation.",
    );
  } else if (habitat?.shielded === true) {
    pleased.push(
      "The Regolith shielding over my Habitat keeps out most of the radiation.",
    );
  } else {
    concerned.push(
      `My Habitat has no shielding, so I take ${formatMillisieverts(rate)} mSv of radiation an Earth Day. Shield it with Regolith.`,
    );
  }

  const dose = snapshot.radiationDoseMillisieverts;
  const limit = catalogue.radiation.doseLimitMillisieverts;
  const minutesUntilLimit = forecasts.radiationDose.minutesUntilLimit;
  if (warnsOfRadiationDose(dose, forecasts.radiationDose)) {
    concerned.push(
      `My Radiation Dose reaches the limit in ${formatDuration(minutesUntilLimit ?? 0)}. I need better protection now.`,
    );
  } else if (dose >= limit * DOSE_CONCERN_SHARE) {
    concerned.push(
      `I've taken ${Math.round(dose)} mSv of my ${limit} mSv Radiation Dose limit, and it never falls.`,
    );
  } else if (dose <= limit * DOSE_PLEASED_SHARE) {
    pleased.push(
      `I've taken only ${Math.round(dose)} mSv of my ${limit} mSv Radiation Dose limit.`,
    );
  }
}

/** Whether the Habitat they live in will keep its power. */
function habitatPower(
  snapshot: Snapshot,
  forecasts: Forecasts,
  pleased: string[],
  concerned: string[],
): void {
  const habitat = homeHabitat(snapshot);
  if (habitat === undefined) return;
  if (warnsOfHabitatPower(snapshot, forecasts.habitatPower)) {
    const minutes = forecasts.habitatPower?.minutesUntilPowerLost;
    concerned.push(
      habitat.powered && minutes !== undefined
        ? `My Habitat's power runs out in ${formatDuration(minutes)}. Build more battery banks on its network.`
        : "My Habitat has lost its power.",
    );
  } else if (forecasts.habitatPower?.minutesUntilPowerLost === undefined) {
    pleased.push("My Habitat's power will last through the Night.");
  }
}

/** Each life support stock: running out, falling, made by the base, or rising. */
function lifeSupport(
  snapshot: Snapshot,
  forecasts: Forecasts,
  pleased: string[],
  concerned: string[],
): void {
  for (const type of catalogue.lifeSupportStocks) {
    const stock = snapshot.lifeSupport.find(
      ({ stockId }) => stockId === type.id,
    );
    if (stock === undefined || !stock.inUse) continue;
    const forecast = forecasts.lifeSupport.find(
      ({ stockId }) => stockId === type.id,
    );
    const sufficiency = snapshot.selfSufficiency.find(
      ({ stockId }) => stockId === type.id,
    );
    const name = inSentence(stockLabel(type.id));
    const minutes = forecast?.minutesUntilEmpty;
    if (warnsOfLifeSupport(type, stock, forecast)) {
      concerned.push(
        stock.kilograms === 0 || minutes === undefined
          ? `I have no ${name} left.`
          : `My ${name} runs out in ${formatDuration(minutes)}. Order more on the Launch manifest, or make it at the base.`,
      );
    } else if (sufficiency?.selfSufficient === true) {
      pleased.push(`The base makes all the ${name} I use.`);
    } else if (minutes !== undefined && minutes <= CONCERN_MINUTES) {
      concerned.push(
        `The supply of ${name} is poor: what I have lasts ${formatDuration(minutes)}.`,
      );
    } else if (
      forecast !== undefined &&
      (forecast.holdingFull || forecast.kilogramsPerEarthDay > 0)
    ) {
      pleased.push(
        forecast.holdingFull
          ? `The base keeps my ${name} topped up.`
          : `My ${name} is rising.`,
      );
    }
  }
}

/** Whether the base has spare Components enough for the wear it takes. */
function spareComponents(
  forecasts: Forecasts,
  pleased: string[],
  concerned: string[],
): void {
  const forecast = forecasts.spareComponents;
  const minutes = forecast.minutesUntilEmpty;
  if (warnsOfSpareComponents(forecast)) {
    concerned.push(
      `The spare Components run out in ${formatDuration(minutes ?? 0)}, and then nothing can be repaired.`,
    );
  } else if (forecast.inStock < forecast.forPendingRepairs) {
    concerned.push(
      `There aren't enough spare Components for the repairs already waiting: ${forecast.inStock} in stock for ${forecast.forPendingRepairs}.`,
    );
  } else if (minutes !== undefined && minutes <= CONCERN_MINUTES) {
    concerned.push(
      `There aren't enough spare Components: they last ${formatDuration(minutes)} at the rate things wear.`,
    );
  } else if (
    forecast.perEarthDay > 0 &&
    forecast.madePerEarthDay >= forecast.perEarthDay
  ) {
    pleased.push("The base makes spare Components as fast as things wear out.");
  } else if (forecast.inStock > 0) {
    pleased.push(
      `${plural(forecast.inStock, "spare Component")} in stock, enough for at least ${CONCERN_EARTH_DAYS} Earth Days.`,
    );
  }
}

/** What is Broken, worn, or waiting, as the needs-attention list names it. */
function repairs(
  snapshot: Snapshot,
  forecasts: Forecasts,
  concerned: string[],
): void {
  const kept = new Set([
    "broken",
    "low-condition",
    "constructions-waiting",
    "plants-waiting",
  ]);
  for (const { id, text } of listAttention(snapshot, forecasts)) {
    if (kept.has(id)) concerned.push(`${text}.`);
  }
}

/** Funding, Science and the Milestones reached. */
function progress(
  snapshot: Snapshot,
  forecasts: Forecasts,
  pleased: string[],
  concerned: string[],
): void {
  const fee = catalogue.launch.feeMillionDollars;
  if (snapshot.fundingMillionDollars < fee) {
    concerned.push(
      `With ${formatFunding(snapshot.fundingMillionDollars)} of Funding we can't pay for another Launch (${formatFunding(fee)}). Sell Exports to earn more.`,
    );
  }

  const science = forecasts.science.perEarthDay;
  if (science > 0) {
    pleased.push(
      `The base earns ${formatScience(Math.round(science * 10) / 10)} an Earth Day.`,
    );
  } else {
    concerned.push(
      "The base earns no Science. Start a Research Task to earn some.",
    );
  }

  const reached = snapshot.milestones.reachedIds.length;
  if (reached > 0) {
    pleased.push(
      `We've reached ${reached} of ${catalogue.milestones.length} Milestones.`,
    );
  }
}
