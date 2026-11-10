import { catalogue, type LifeSupportStock } from "../catalogue";
import type {
  Forecasts,
  LifeSupportForecast,
  LifeSupportSnapshot,
  Snapshot,
  StructureSnapshot,
} from "../simulation";

// When each of the status panel's lines shows as a warning: from its first
// warning on, by the data catalogue's thresholds. The panel's lines and the
// needs-attention list at its top both ask here, so that they can't disagree.

/** The Habitat the Mission Director lives in, if they have moved into one. */
export function homeHabitat(
  snapshot: Pick<Snapshot, "missionDirector" | "structures">,
): StructureSnapshot | undefined {
  const { missionDirector } = snapshot;
  return missionDirector.residence === "habitat"
    ? snapshot.structures.find(
        (structure) => structure.id === missionDirector.habitatId,
      )
    : undefined;
}

/**
 * Whether the Habitat the Mission Director lives in has lost its power, or
 * is forecast to within the first warning's time.
 */
export function warnsOfHabitatPower(
  snapshot: Pick<Snapshot, "missionDirector" | "structures">,
  forecast: Forecasts["habitatPower"],
): boolean {
  const warnFrom = Math.max(...catalogue.habitatPowerWarningHoursLeft) * 60;
  return (
    homeHabitat(snapshot)?.powered === false ||
    (forecast?.minutesUntilPowerLost ?? Infinity) <= warnFrom
  );
}

/**
 * Whether a life support stock has run out, or is forecast to within the
 * first warning's time.
 */
export function warnsOfLifeSupport(
  type: Pick<LifeSupportStock, "warningEarthDaysLeft">,
  stock: Pick<LifeSupportSnapshot, "kilograms">,
  forecast: Pick<LifeSupportForecast, "minutesUntilEmpty"> | undefined,
): boolean {
  const warnFrom = Math.max(...type.warningEarthDaysLeft) * 24 * 60;
  return (
    stock.kilograms === 0 ||
    (forecast?.minutesUntilEmpty ?? Infinity) <= warnFrom
  );
}

/**
 * Whether the Mission Director's Radiation Dose has reached the limit, or
 * is forecast to within the first warning's time.
 */
export function warnsOfRadiationDose(
  doseMillisieverts: number,
  forecast: Forecasts["radiationDose"],
): boolean {
  const warnFrom =
    Math.max(...catalogue.radiation.warningEarthDaysLeft) * 24 * 60;
  return (
    doseMillisieverts >= catalogue.radiation.doseLimitMillisieverts ||
    (forecast.minutesUntilLimit ?? Infinity) <= warnFrom
  );
}

/** Whether the spare Components are forecast to run out within the first warning's time. */
export function warnsOfSpareComponents(
  forecast: Forecasts["spareComponents"],
): boolean {
  const warnFrom =
    Math.max(...catalogue.spareComponentWarningEarthDaysLeft) * 24 * 60;
  return (forecast.minutesUntilEmpty ?? Infinity) <= warnFrom;
}
