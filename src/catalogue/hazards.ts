import type { Catalogue } from "./types";

// What wears the base down or threatens the Mission Director, and the warnings
// that come before it does.

export const habitatPowerWarningHoursLeft: Catalogue["habitatPowerWarningHoursLeft"] =
  [24, 6, 1];

// As long as the first Habitat power warning, so that lights never bring
// one: a Light Mast is only there to see by, and the Mission Director's
// life shouldn't hang on leaving one unbuilt.
export const nightReserveHours: Catalogue["nightReserveHours"] = 24;

// The limit is a career limit for astronauts. Unshielded, the dose rate is
// tuned well above the roughly 1.4 mSv an Earth Day measured on the lunar
// surface, so that the limit comes in 20 Earth Days and shielding the
// Habitat is urgent. Regolith shielding cuts it to a twentieth, so that
// with Solar Particle Events the limit still comes in about nine
// Lunations; a water wall over the shielding cuts it to a tenth of that
// again, so that it comes only after many years (docs/balancing.md has the
// dates). A Buried Habitat cuts it to a tenth of that again, the
// last of the Campaign's cuts: Act 4 opens at about 530 mSv and asks the
// player to move in by Earth Day 1,600 at about 570, leaving 30 mSv for
// 1,400 Earth Days, at most 0.02 mSv an Earth Day with Solar Particle Events
// counted. They multiply a dose rate by 1.31 on average, measured over the
// 1,400 Earth Days of the long game (each lasts 18 hours on average at 10
// times the rate, 20 Earth Days apart, which works out at 1.33), so that
// 0.015 comes to 0.0196.
export const radiation: Catalogue["radiation"] = {
  doseRateMillisievertsPerEarthDay: {
    lander: 0,
    habitat: 30,
    shieldedHabitat: 1.5,
    waterWalledHabitat: 0.15,
    buriedHabitat: 0.015,
  },
  doseLimitMillisieverts: 600,
  warningEarthDaysLeft: [7, 3, 1],
};

// Roughly one a Lunation, with a few hours' warning. One lasting an Earth
// Day or so takes half the dose limit in an unshielded Habitat, a
// fortieth in a shielded one, a four-hundredth in a water-walled one and a
// four-thousandth in a Buried one.
export const solarParticleEvents: Catalogue["solarParticleEvents"] = {
  earthDaysBetween: { min: 10, max: 30 },
  durationHours: { min: 6, max: 30 },
  warningHours: 4,
  doseRateMultiplier: 10,
};

// Reaching past everything that lands beside the Lander, so the base has
// to grow away from it. Five take-offs and landings, two and a half round
// trips, break anything left standing near it.
export const plumeEjecta: Catalogue["plumeEjecta"] = {
  radiusMetres: 30,
  conditionLossPercent: 20,
};

// Two blasts of Plume Ejecta call for Maintenance. Bringing a Broken
// Structure back to 100% takes five spare Components.
export const maintenance: Catalogue["maintenance"] = {
  thresholdPercent: 70,
  spareComponentId: "spare-component",
  conditionPercentPerSpareComponent: 20,
  loadingHours: 0.25,
  workHours: 2,
};

// Below half its Condition, a Structure's output falls in step with it.
export const structurePerformance: Catalogue["structurePerformance"] = {
  thresholdPercent: 50,
  exponent: 1,
};

// A clean array is coated past the threshold in under a Lunation's
// Daylight, by then losing nearly a fifth of its output.
export const dustCoating: Catalogue["dustCoating"] = {
  percentPerDaylightHour: 0.1,
  outputLossAtFullCoating: 0.6,
  cleaningThresholdPercent: 30,
  cleaningHours: 1,
};

// Below half its Condition, a Machine works and drives slower in step
// with it.
export const machinePerformance: Catalogue["machinePerformance"] = {
  thresholdPercent: 50,
  exponent: 1,
};

// A Night unpowered takes nearly half a Machine's Condition. A bay up to
// 25 m further off than the nearest powered Structure adds at most an
// hour and a quarter to the regolith printer's drive, the slowest, and
// about two hours to the Robot's walk back, so that both Machines and
// the Rover are still parked in the lead time.
export const cold: Catalogue["cold"] = {
  plugInReachMetres: 3,
  parkingLeadHours: 6,
  bayDetourMetres: 25,
};

// A couple of strikes a Lunation, rarely enough on their own to break
// anything at full Condition.
export const micrometeorites: Catalogue["micrometeorites"] = {
  earthDaysBetween: { min: 4, max: 20 },
  conditionLossPercent: { min: 5, max: 25 },
};

// As for oxygen and water. The starting stock lasts longer than the first
// at the wear of ordinary work, but not with Machines in the cold.
export const spareComponentWarningEarthDaysLeft: Catalogue["spareComponentWarningEarthDaysLeft"] =
  [7, 3, 1];
