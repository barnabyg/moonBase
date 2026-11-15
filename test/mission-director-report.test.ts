import { describe, expect, it } from "vitest";
import type { Forecasts, Snapshot } from "../src/simulation";
import { writeMissionDirectorReport } from "../src/ui/mission-director-report-text";
import { loadSample } from "./sample-saves";
import { scenario } from "./scenario";

// What the Mission Director's Report says they are pleased and concerned about.

const DAY = 24 * 60;

/**
 * A base with two solar arrays (structure-1 and structure-4), an extraction
 * plant running (structure-2) and a vacuum fabrication plant waiting for
 * silicon (structure-3). The Mission Director still lives aboard the Lander.
 */
const sample = loadSample("version-35.moonbase");
const base = sample.snapshot();
const calm = sample.forecasts();

/** The base with the Mission Director living in structure-1 as a Habitat of the given kind. */
function livingIn(
  kind: { shielded?: boolean; waterWalled?: boolean; buried?: boolean },
  changes: Partial<Snapshot> = {},
): Snapshot {
  return {
    ...base,
    missionDirector: {
      residence: "habitat",
      habitatId: "structure-1",
      movedInAtMinute: 0,
    },
    lifeSupport: base.lifeSupport.map((stock) => ({ ...stock, inUse: true })),
    structures: base.structures.map((structure) =>
      structure.id === "structure-1"
        ? {
            ...structure,
            powered: true,
            shielded: kind.shielded ?? false,
            waterWalled: kind.waterWalled ?? false,
            buried: kind.buried ?? false,
          }
        : structure,
    ),
    ...changes,
  };
}

/** Forecasts in which nothing runs out and no Science is earned. */
function forecastsWith(changes: Partial<Forecasts> = {}): Forecasts {
  return {
    ...calm,
    habitatPower: {
      habitatId: "structure-1",
      minutesUntilPowerLost: undefined,
    },
    lifeSupport: calm.lifeSupport.map((forecast) => ({
      ...forecast,
      kilogramsPerEarthDay: 0,
      minutesUntilEmpty: undefined,
      holdingFull: false,
    })),
    spareComponents: {
      ...calm.spareComponents,
      inStock: 10,
      forPendingRepairs: 0,
      perEarthDay: 0.1,
      madePerEarthDay: 0,
      minutesUntilEmpty: 100 * DAY,
    },
    ...changes,
  };
}

describe("the Mission Director's Report", () => {
  it("at the landing, is pleased to be safe aboard the Lander and concerned that it can't fly", () => {
    const start = scenario();
    const report = writeMissionDirectorReport(
      start.campaign.snapshot(),
      start.campaign.forecasts(),
    );
    expect(report.pleased).toContain(
      "Aboard the Lander I'm safe from radiation, and want for nothing.",
    );
    expect(report.concerned).toEqual([
      "The Lander can't fly while I live aboard it, so nothing more comes from Earth until I move into a Habitat.",
      "The base earns no Science. Start a Research Task to earn some.",
    ]);
  });

  it("in an unshielded Habitat, is concerned about radiation, a poor supply of oxygen and too few spare Components", () => {
    const forecasts = forecastsWith({
      radiationDose: {
        millisievertsPerEarthDay: 30,
        minutesUntilLimit: 20 * DAY,
      },
      lifeSupport: calm.lifeSupport.map((forecast) => ({
        ...forecast,
        kilogramsPerEarthDay: forecast.stockId === "oxygen" ? -0.84 : 0,
        minutesUntilEmpty: forecast.stockId === "oxygen" ? 12 * DAY : undefined,
        holdingFull: false,
      })),
      spareComponents: {
        ...calm.spareComponents,
        inStock: 2,
        forPendingRepairs: 0,
        perEarthDay: 0.2,
        madePerEarthDay: 0,
        minutesUntilEmpty: 10 * DAY,
      },
    });
    const report = writeMissionDirectorReport(livingIn({}), forecasts);
    expect(report.concerned).toEqual(
      expect.arrayContaining([
        "My Habitat has no shielding, so I take 30.00 mSv of radiation an Earth Day. Shield it with Regolith.",
        "The supply of oxygen is poor: what I have lasts 12 Earth Days.",
        "There aren't enough spare Components: they last 10 Earth Days at the rate things wear.",
      ]),
    );
    expect(report.pleased).toContain(
      "My Habitat's power will last through the Night.",
    );
  });

  it("says by the status panel's warning levels when something runs out soon", () => {
    const forecasts = forecastsWith({
      radiationDose: {
        millisievertsPerEarthDay: 30,
        minutesUntilLimit: 2 * DAY,
      },
      habitatPower: { habitatId: "structure-1", minutesUntilPowerLost: 5 * 60 },
      lifeSupport: calm.lifeSupport.map((forecast) => ({
        ...forecast,
        kilogramsPerEarthDay: -1,
        minutesUntilEmpty: 3 * DAY,
        holdingFull: false,
      })),
    });
    const report = writeMissionDirectorReport(livingIn({}), forecasts);
    expect(report.concerned).toEqual(
      expect.arrayContaining([
        "My Radiation Dose reaches the limit in 2 Earth Days. I need better protection now.",
        "My Habitat's power runs out in 5 hours. Build more battery banks on its network.",
        "My oxygen runs out in 3 Earth Days. Order more on the Launch manifest, or make it at the base.",
        "My water runs out in 3 Earth Days. Order more on the Launch manifest, or make it at the base.",
      ]),
    );
    expect(report.pleased).not.toContain(
      "My Habitat's power will last through the Night.",
    );
  });

  it("in a protected, self-sufficient base, is pleased by its shelter, stocks and spare Components", () => {
    const snapshot = livingIn(
      { shielded: true },
      {
        radiationDoseMillisieverts: 12,
        selfSufficiency: base.selfSufficiency.map((each) => ({
          ...each,
          selfSufficient: true,
        })),
      },
    );
    const forecasts = forecastsWith({
      radiationDose: {
        millisievertsPerEarthDay: 1.5,
        minutesUntilLimit: 400 * DAY,
      },
      spareComponents: {
        ...calm.spareComponents,
        inStock: 5,
        forPendingRepairs: 0,
        perEarthDay: 0.2,
        madePerEarthDay: 0.3,
        minutesUntilEmpty: undefined,
      },
      science: { perEarthDay: 2.5, sources: [] },
    });
    const report = writeMissionDirectorReport(snapshot, forecasts);
    expect(report.pleased).toEqual(
      expect.arrayContaining([
        "The Regolith shielding over my Habitat keeps out most of the radiation.",
        "I've taken only 12 mSv of my 600 mSv Radiation Dose limit.",
        "The base makes all the oxygen I use.",
        "The base makes all the water I use.",
        "The base makes spare Components as fast as things wear out.",
        "The base earns 2.5 Science an Earth Day.",
      ]),
    );
    expect(report.concerned).not.toContain(
      "The base earns no Science. Start a Research Task to earn some.",
    );
  });

  it("is better pleased the better their Habitat keeps out radiation", () => {
    const pleasedIn = (kind: Parameters<typeof livingIn>[0]) =>
      writeMissionDirectorReport(livingIn(kind), forecastsWith()).pleased;
    expect(pleasedIn({ shielded: true, waterWalled: true })).toContain(
      "The water wall over my Habitat keeps out most of what the shielding lets through, though not enough to stay here for good.",
    );
    expect(pleasedIn({ shielded: true, buried: true })).toContain(
      "My Buried Habitat keeps out almost all the radiation: I could live here for years.",
    );
  });

  it("is concerned by a high Radiation Dose, a Solar Particle Event, little Funding and what waits for repair", () => {
    const snapshot = livingIn(
      { shielded: true },
      {
        radiationDoseMillisieverts: 400,
        fundingMillionDollars: 20,
        solarParticleEvent: {
          state: "coming",
          startsAtMinute: base.clock.elapsedMinutes + 3 * 60,
          endsAtMinute: base.clock.elapsedMinutes + 15 * 60,
          doseRateMultiplier: 10,
        },
        structures: livingIn({ shielded: true }).structures.map((structure) =>
          structure.id === "structure-4"
            ? { ...structure, conditionPercent: 0 }
            : structure,
        ),
      },
    );
    const report = writeMissionDirectorReport(
      snapshot,
      forecastsWith({
        radiationDose: {
          millisievertsPerEarthDay: 1.5,
          minutesUntilLimit: 100 * DAY,
        },
      }),
    );
    expect(report.concerned).toEqual(
      expect.arrayContaining([
        "A Solar Particle Event starts in 3 hours, at 10× the usual dose rate.",
        "I've taken 400 mSv of my 600 mSv Radiation Dose limit, and it never falls.",
        "With $20M of Funding we can't pay for another Launch ($150M). Sell Exports to earn more.",
        "Solar array is Broken.",
        "Vacuum fabrication plant is waiting for Silicon.",
      ]),
    );
  });

  it("says nothing once the Campaign has ended", () => {
    expect(
      writeMissionDirectorReport(
        {
          ...base,
          ended: { atMinute: 0, cause: { kind: "radiation-dose-limit" } },
        },
        calm,
      ),
    ).toEqual({ pleased: [], concerned: [] });
  });
});
