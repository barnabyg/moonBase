import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  habitatDoseRate,
  loadCampaign,
  type Campaign,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import {
  buriedHabitatBase,
  buriedHabitatSites,
  freshSaveWith,
} from "./try-scenarios";
import { changed, type SavedState } from "./worn";

// Oxygen and water last, so that a test can live in a Habitat for as long as
// it runs, and nothing but the wear of ordinary work breaks anything or leaves
// a Machine in the cold. Power, the Radiation Dose and Solar Particle Events
// are all real.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { safeHabitat } = await import("./safe-habitat");
  const { withoutCold } = await import("./without-cold");
  const { withoutDigging } = await import("./without-digging");
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  return {
    ...actual,
    catalogue: safeHabitat(
      withoutMicrometeorites(withoutCold(withoutDigging(actual.catalogue))),
      ["life-support"],
    ),
  };
});

const rates = catalogue.radiation.doseRateMillisievertsPerEarthDay;
const { doseLimitMillisieverts } = catalogue.radiation;
const EARTH_DAY = 24 * 60;

function typeOf(id: string) {
  const type = catalogue.structureTypes.find(
    (candidate) => candidate.id === id,
  );
  if (type === undefined) throw new Error(`expected ${id}`);
  return type;
}
const buried = typeOf("buried-habitat");

/** What a save holds beyond what the shared stand-in lets a test change. */
type EditedState = Omit<SavedState, "structures"> & {
  radiationDoseMillisieverts: number;
  structures: (SavedState["structures"][number] & {
    powered: boolean;
    structureTypeId: string;
  })[];
};

function edited(
  campaign: Campaign,
  edit: (state: EditedState) => void,
): Campaign {
  return changed(campaign, (state) => {
    edit(state as unknown as EditedState);
  });
}

function runUntil(
  campaign: Campaign,
  done: (state: Snapshot) => boolean,
  limitHours = 40 * 24,
): void {
  for (let hours = 0; !done(campaign.snapshot()); hours++) {
    if (hours > limitHours) throw new Error("It never happened.");
    if (campaign.snapshot().ended !== undefined) {
      throw new Error("The Mission Director died first.");
    }
    campaign.advance(60);
  }
}

function plan(
  campaign: Campaign,
  structureTypeId: string,
  position: GroundPosition,
): string {
  const result = campaign.planConstruction({ structureTypeId, position });
  if (!result.ok) throw new Error(result.message);
  return result.constructionId;
}

const sites = {
  homeHabitat: buriedHabitatSites.waterWalledHabitat,
  spareHabitat: buriedHabitatSites.bareHabitat,
  buriedHabitat: buriedHabitatSites.buriedHabitat,
} as const;

/**
 * The saved text of the base the try scenario starts from, with a water-walled
 * Habitat, a bare Habitat and a Buried Habitat to live in. Built once, and
 * loaded afresh for each test.
 */
let baseText: string | undefined;
function base(): Campaign {
  baseText ??= buriedHabitatBase().save();
  const loaded = loadCampaign(baseText);
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.campaign;
}

function structureAt(state: Snapshot, site: GroundPosition): StructureSnapshot {
  const found = state.structures.find(
    (structure) =>
      structure.position.x === site.x &&
      structure.position.y === site.y &&
      catalogue.structureTypes.find(
        (type) => type.id === structure.structureTypeId,
      )?.habitat === true,
  );
  if (found === undefined) throw new Error("expected a Habitat there");
  return found;
}

/** Moves the Mission Director to the Habitat on a site, failing the test if refused. */
function moveTo(campaign: Campaign, site: GroundPosition): string {
  const { id } = structureAt(campaign.snapshot(), site);
  const result = campaign.moveMissionDirectorIn(id);
  if (!result.ok) throw new Error(result.message);
  return id;
}

/** Skips on until a Solar Particle Event is under way. */
function untilSolarParticleEvent(campaign: Campaign): void {
  runUntil(
    campaign,
    (state) => state.solarParticleEvent?.state === "under-way",
    60 * 24,
  );
}

function ratePerDay(campaign: Campaign): number {
  return campaign.forecasts().radiationDose.millisievertsPerEarthDay;
}

describe("the Buried Habitat's place in the data catalogue", () => {
  const design = catalogue.designs.find(({ id }) => id === buried.designId);

  it("is a Habitat, with a Design of its own in Protection that needs Water-wall shielding first", () => {
    expect(buried.habitat).toBe(true);
    expect(buried.buried).toBe(true);
    expect(design).toMatchObject({
      category: "protection",
      starting: false,
      prerequisiteDesignIds: ["water-wall-shielding"],
    });
  });

  it("takes more than one Launch's Payload Mass, and costs more than the most a Launch can carry of anything else", () => {
    let mass = 0;
    let price = 0;
    for (const { componentId, count } of buried.components) {
      const item = catalogue.launch.items.find(
        ({ brings }) =>
          brings.kind === "component" && brings.componentId === componentId,
      );
      mass += (item?.massKilograms ?? Infinity) * count;
      price += (item?.priceMillionDollars ?? Infinity) * count;
    }

    expect(mass).toBeGreaterThan(
      2 * catalogue.launch.payloadMassLimitKilograms,
    );
    expect(price).toBeGreaterThan(catalogue.programmeGrantMillionDollars);
  });

  it("has by far the longest Site Preparation of anything, digging it in", () => {
    const others = catalogue.structureTypes.filter(
      ({ id }) => id !== buried.id,
    );
    expect(buried.stageHours.sitePreparation).toBeGreaterThanOrEqual(
      5 * Math.max(...others.map((type) => type.stageHours.sitePreparation)),
    );
    expect(buried.stageMachines.sitePreparation).toBe("excavator");
  });

  it("cuts the dose rate to at most 0.02 mSv an Earth Day, counting the Solar Particle Events that multiply it on average", () => {
    const { earthDaysBetween, durationHours, doseRateMultiplier } =
      catalogue.solarParticleEvents;
    const quiet = (earthDaysBetween.min + earthDaysBetween.max) / 2;
    const during = (durationHours.min + durationHours.max) / 2 / 24;
    const averageMultiplier =
      (quiet + during * doseRateMultiplier) / (quiet + during);

    expect(rates.buriedHabitat * averageMultiplier).toBeLessThanOrEqual(0.02);
    expect(rates.buriedHabitat).toBeLessThan(rates.waterWalledHabitat);
  });

  it("is paid for by Research Tasks, so that the whole Tech Tree stays payable with Science to spare when the last Design unlocked has its own task left to run", () => {
    const paid = catalogue.researchTasks.reduce(
      (sum, task) => sum + task.science,
      0,
    );
    const cost = catalogue.designs.reduce(
      (sum, each) => sum + each.scienceCost,
      0,
    );
    const lastOwnTask = catalogue.researchTasks
      .filter((task) => task.requiresDesignId === "integrated-fabrication")
      .reduce((sum, task) => sum + task.science, 0);

    expect(paid - lastOwnTask).toBeGreaterThanOrEqual(cost);
    expect(
      catalogue.researchTasks.some(
        (task) =>
          task.requiresDesignId === "water-wall-shielding" &&
          task.science >= (design?.scienceCost ?? Infinity) &&
          task.lengthHours >= 40 * 24,
      ),
    ).toBe(true);
  });
});

describe("planning a Buried Habitat", () => {
  it("is refused until its Design is unlocked, naming the Design", () => {
    const loaded = loadCampaign(freshSaveWith(() => undefined));
    if (!loaded.ok) throw new Error(loaded.message);

    expect(
      loaded.campaign.planConstruction({
        structureTypeId: buried.id,
        position: sites.buriedHabitat,
      }),
    ).toMatchObject({
      ok: false,
      reason: "design-locked",
      message: expect.stringContaining("Buried Habitat") as string,
    });
  });

  it("stands on its own ground and has the excavator dig it in for the whole of its Site Preparation", () => {
    const loaded = loadCampaign(
      freshSaveWith((state) => {
        state.unlockedDesignIds.push("water-wall-shielding", buried.designId);
      }),
    );
    if (!loaded.ok) throw new Error(loaded.message);
    const { campaign } = loaded;

    plan(campaign, buried.id, sites.buriedHabitat);
    campaign.advance((buried.stageHours.sitePreparation / 2) * 60);

    expect(campaign.snapshot().constructions[0]?.stage).toBe(
      "site-preparation",
    );
  });

  it("refuses Regolith shielding over it, saying it needs none", () => {
    const campaign = base();

    expect(
      campaign.checkPlacement({
        structureTypeId: "regolith-shielding",
        position: sites.buriedHabitat,
      }),
    ).toEqual({
      ok: false,
      reason: "habitat-buried",
      message:
        "A Buried Habitat is already under the Regolith, and needs no shielding over it.",
    });
  });

  it("refuses a water wall over it, saying it needs none", () => {
    const campaign = base();

    expect(
      campaign.checkPlacement({
        structureTypeId: "water-wall",
        position: sites.buriedHabitat,
      }),
    ).toEqual({
      ok: false,
      reason: "habitat-buried",
      message:
        "A Buried Habitat is already under the Regolith, and needs no water wall over it.",
    });
  });
});

describe("the Radiation Dose in a Buried Habitat", () => {
  it("rises at the Buried Habitat's own rate, which the forecast follows to the limit, and what was already taken stays", () => {
    const campaign = edited(base(), (state) => {
      state.radiationDoseMillisieverts = 570;
    });
    moveTo(campaign, sites.buriedHabitat);

    expect(campaign.snapshot().radiationDoseMillisieverts).toBe(570);
    expect(ratePerDay(campaign)).toBe(rates.buriedHabitat);
    expect(
      (campaign.forecasts().radiationDose.minutesUntilLimit ?? 0) / EARTH_DAY,
    ).toBeCloseTo((doseLimitMillisieverts - 570) / rates.buriedHabitat, 2);

    campaign.advance(EARTH_DAY / 4);

    expect(campaign.snapshot().radiationDoseMillisieverts).toBeGreaterThan(570);
  });

  it("is multiplied by a Solar Particle Event as usual, and the pop-up's rate agrees", () => {
    const campaign = base();
    moveTo(campaign, sites.buriedHabitat);

    untilSolarParticleEvent(campaign);

    const { doseRateMultiplier } = catalogue.solarParticleEvents;
    expect(ratePerDay(campaign)).toBeCloseTo(
      rates.buriedHabitat * doseRateMultiplier,
      10,
    );
    const home = structureAt(campaign.snapshot(), sites.buriedHabitat);
    expect(habitatDoseRate(home, doseRateMultiplier)).toBe(
      ratePerDay(campaign),
    );
  });

  it("rises by about 0.02 mSv an Earth Day over a couple of Lunations, Solar Particle Events and all", () => {
    const campaign = base();
    moveTo(campaign, sites.buriedHabitat);
    const earthDays = 60;

    campaign.advance(earthDays * EARTH_DAY);

    const state = campaign.snapshot();
    expect(state.ended).toBeUndefined();
    // As few Solar Particle Events as this can run a little over the average.
    expect(state.radiationDoseMillisieverts / earthDays).toBeLessThan(0.025);
    expect(state.radiationDoseMillisieverts).toBeGreaterThan(
      earthDays * rates.buriedHabitat,
    );
  });

  it("gives a warning as the limit nears, as any Habitat does", () => {
    const campaign = edited(base(), (state) => {
      state.radiationDoseMillisieverts =
        doseLimitMillisieverts - rates.buriedHabitat * 7.01;
    });
    moveTo(campaign, sites.buriedHabitat);

    const events = campaign.advance(EARTH_DAY);

    expect(events.map(({ kind }) => kind)).toContain("radiation-dose-warning");
  });

  it("counts as shielded and buried in the snapshot, and has no Regolith shielding or water wall to dismantle", () => {
    const home = structureAt(base().snapshot(), sites.buriedHabitat);

    expect(home).toMatchObject({
      shielded: true,
      waterWalled: false,
      buried: true,
    });
  });

  it("loses its protection once Broken, like any other shielding", () => {
    const campaign = edited(base(), (state) => {
      const home = state.structures.find(
        ({ structureTypeId }) => structureTypeId === buried.id,
      );
      if (home !== undefined) home.conditionPercent = 0;
    });
    const home = structureAt(campaign.snapshot(), sites.buriedHabitat);

    expect(home).toMatchObject({
      shielded: false,
      waterWalled: false,
      buried: false,
    });
    expect(habitatDoseRate(home, 1)).toBe(rates.habitat);
  });

  it("kills the Mission Director if it Breaks while they live in it, as any Habitat does", () => {
    const moved = base();
    const homeId = moveTo(moved, sites.buriedHabitat);
    const campaign = edited(moved, (state) => {
      const home = state.structures.find(({ id }) => id === homeId);
      if (home !== undefined) home.conditionPercent = 0;
    });

    campaign.advance(1);

    expect(campaign.snapshot().ended?.cause).toEqual({
      kind: "habitat-power-failed",
      habitatId: homeId,
    });
  });
});

describe("what shielding earlier is worth", () => {
  /** The Earth Days a Campaign's dose rate takes to reach the limit, with Solar Particle Events on average. */
  function earthDaysToLimit(rate: number, startingDose: number): number {
    const { earthDaysBetween, durationHours, doseRateMultiplier } =
      catalogue.solarParticleEvents;
    const quiet = (earthDaysBetween.min + earthDaysBetween.max) / 2;
    const during = (durationHours.min + durationHours.max) / 2 / 24;
    const average =
      (rate * (quiet + during * doseRateMultiplier)) / (quiet + during);
    return (doseLimitMillisieverts - startingDose) / average;
  }

  /** The dollars that a whole Buried Habitat comes to, with the Launch fees to bring it. */
  function buriedHabitatCost(): number {
    const { items, feeMillionDollars, payloadMassLimitKilograms } =
      catalogue.launch;
    const lines = buried.components.map(({ componentId, count }) => {
      const item = items.find(
        ({ brings }) =>
          brings.kind === "component" && brings.componentId === componentId,
      );
      return {
        mass: (item?.massKilograms ?? 0) * count,
        price: (item?.priceMillionDollars ?? 0) * count,
      };
    });
    const mass = lines.reduce((sum, line) => sum + line.mass, 0);
    const price = lines.reduce((sum, line) => sum + line.price, 0);
    return (
      price + Math.ceil(mass / payloadMassLimitKilograms) * feeMillionDollars
    );
  }

  it("a base that skipped the water wall reaches the limit long before it can afford a Buried Habitat, where one behind a water wall has years to save up", () => {
    // As in the reference Campaign: the Habitat stands unshielded for three
    // Earth Days, and the first circuit boards sell around Earth Day 80.
    const dosedBeforeShielding = 3 * rates.habitat;
    const firstSaleEarthDay = 80;
    const circuitBoards = catalogue.exports.find(
      ({ resourceId }) => resourceId === "circuit-boards",
    );
    const earned =
      (circuitBoards?.priceMillionDollarsPerKilogram ?? 0) *
      catalogue.lander.returnMassKilograms;
    // A full Return Mass of circuit boards every 15.4 Earth Days, as the
    // pacing report works it out, with nothing bought, not even a Launch fee.
    const dollarsAnEarthDay = earned / 15.4;
    const canAffordOn =
      firstSaleEarthDay + buriedHabitatCost() / dollarsAnEarthDay;

    const limitWithoutWall = earthDaysToLimit(
      rates.shieldedHabitat,
      dosedBeforeShielding,
    );
    const limitBehindWall = earthDaysToLimit(
      rates.waterWalledHabitat,
      dosedBeforeShielding,
    );

    expect(limitWithoutWall).toBeLessThan(canAffordOn - 30);
    expect(limitBehindWall).toBeGreaterThan(canAffordOn + 365);
  });

  it("the same Buried Habitat doesn't save a Mission Director who arrives with the dose too high", () => {
    const campaign = edited(base(), (state) => {
      state.radiationDoseMillisieverts = 599.9;
    });
    moveTo(campaign, sites.buriedHabitat);

    expect(
      (campaign.forecasts().radiationDose.minutesUntilLimit ?? Infinity) /
        EARTH_DAY,
    ).toBeLessThan(10);
  });
});

describe("a base with no Buried Habitat", () => {
  it("reaches the limit behind its water wall when it always did, with real Solar Particle Events", () => {
    const left = 3;
    const campaign = edited(base(), (state) => {
      state.radiationDoseMillisieverts = doseLimitMillisieverts - left;
    });
    moveTo(campaign, sites.homeHabitat);
    expect(ratePerDay(campaign)).toBe(rates.waterWalledHabitat);
    const start = campaign.snapshot().clock.elapsedMinutes;

    runUntil(campaign, (state) => state.ended !== undefined, 30 * 24);

    const state = campaign.snapshot();
    expect(state.ended?.cause).toEqual({ kind: "radiation-dose-limit" });
    const earthDays = (state.clock.elapsedMinutes - start) / EARTH_DAY;
    // The usual rate alone is the longest it can take, and the Solar Particle
    // Events can't take more than half of that off.
    expect(earthDays).toBeLessThanOrEqual(left / rates.waterWalledHabitat);
    expect(earthDays).toBeGreaterThan((left / rates.waterWalledHabitat) * 0.5);
  });
});

describe("moving from one Habitat to another", () => {
  it("moves the Mission Director at once to another commissioned, powered Habitat, starting from when they moved", () => {
    const campaign = base();
    moveTo(campaign, sites.homeHabitat);
    campaign.advance(60);
    const before = campaign.snapshot();

    const result = campaign.moveMissionDirectorIn(
      structureAt(before, sites.buriedHabitat).id,
    );

    expect(result).toEqual({ ok: true });
    const after = campaign.snapshot();
    expect(after.clock).toEqual(before.clock);
    expect(after.missionDirector).toEqual({
      residence: "habitat",
      habitatId: structureAt(before, sites.buriedHabitat).id,
      movedInAtMinute: before.clock.elapsedMinutes,
    });
    expect(after.radiationDoseMillisieverts).toBe(
      before.radiationDoseMillisieverts,
    );
  });

  it("is refused into the Habitat they already live in", () => {
    const campaign = base();
    const homeId = moveTo(campaign, sites.homeHabitat);

    expect(campaign.moveMissionDirectorIn(homeId)).toEqual({
      ok: false,
      reason: "already-moved-in",
      message: "The Mission Director already lives in this Habitat.",
    });
  });

  it("is refused into one with no power, one that is Broken, one to be dismantled, or anything but a Habitat, keeping them where they are", () => {
    const campaign = base();
    const homeId = moveTo(campaign, sites.homeHabitat);
    const spareId = structureAt(campaign.snapshot(), sites.spareHabitat).id;
    const buriedId = structureAt(campaign.snapshot(), sites.buriedHabitat).id;
    const arrayId =
      campaign
        .snapshot()
        .structures.find(
          ({ structureTypeId }) => structureTypeId === "solar-array",
        )?.id ?? "";
    const worn = edited(campaign, (state) => {
      for (const structure of state.structures) {
        if (structure.id === spareId) structure.powered = false;
        if (structure.id === buriedId) structure.conditionPercent = 0;
      }
    });

    expect(worn.moveMissionDirectorIn(spareId)).toMatchObject({
      ok: false,
      reason: "no-power",
    });
    expect(worn.moveMissionDirectorIn(buriedId)).toMatchObject({
      ok: false,
      reason: "broken",
    });
    expect(worn.moveMissionDirectorIn(arrayId)).toMatchObject({
      ok: false,
      reason: "not-a-habitat",
    });
    expect(campaign.dismantleStructure(buriedId)).toEqual({ ok: true });
    expect(campaign.moveMissionDirectorIn(buriedId)).toMatchObject({
      ok: false,
      reason: "being-dismantled",
    });
    expect(worn.snapshot().missionDirector).toMatchObject({
      habitatId: homeId,
    });
  });

  it("is refused into one still under Construction", () => {
    const loaded = loadCampaign(
      freshSaveWith((state) => {
        state.unlockedDesignIds.push("water-wall-shielding", buried.designId);
      }),
    );
    if (!loaded.ok) throw new Error(loaded.message);
    const id = plan(loaded.campaign, buried.id, sites.buriedHabitat);

    expect(loaded.campaign.moveMissionDirectorIn(id)).toMatchObject({
      ok: false,
      reason: "not-commissioned",
    });
  });

  it("has the forecast of Habitat power follow them, and only the Habitat they live in kills them by losing power", () => {
    const campaign = base();
    moveTo(campaign, sites.homeHabitat);
    const buriedId = moveTo(campaign, sites.buriedHabitat);
    const oldId = structureAt(campaign.snapshot(), sites.homeHabitat).id;
    expect(campaign.forecasts().habitatPower?.habitatId).toBe(buriedId);

    const oldFailed = edited(campaign, (state) => {
      const old = state.structures.find(({ id }) => id === oldId);
      if (old !== undefined) old.conditionPercent = 0;
    });
    oldFailed.advance(5);
    expect(oldFailed.snapshot().ended).toBeUndefined();

    const homeFailed = edited(campaign, (state) => {
      const home = state.structures.find(({ id }) => id === buriedId);
      if (home !== undefined) home.conditionPercent = 0;
    });
    homeFailed.advance(5);
    expect(homeFailed.snapshot().ended?.cause).toEqual({
      kind: "habitat-power-failed",
      habitatId: buriedId,
    });
  });

  it("frees the old Habitat to be dismantled, shielding first, and guards the new one instead", () => {
    const campaign = base();
    const oldId = moveTo(campaign, sites.homeHabitat);
    const dismantle = (id: string) => campaign.dismantleStructure(id);
    const state = campaign.snapshot();
    const wallId =
      state.structures.find(
        ({ structureTypeId }) => structureTypeId === "water-wall",
      )?.id ?? "";
    const shieldingId =
      state.structures.find(
        ({ structureTypeId }) => structureTypeId === "regolith-shielding",
      )?.id ?? "";
    const newId = structureAt(state, sites.buriedHabitat).id;

    expect(dismantle(oldId)).toEqual({
      ok: false,
      message:
        "The Mission Director lives in it. Move them to another Habitat first.",
    });
    expect(campaign.moveMissionDirectorIn(newId)).toEqual({ ok: true });
    expect(dismantle(newId)).toMatchObject({ ok: false });
    expect(dismantle(oldId)).toEqual({
      ok: false,
      message:
        "Its Regolith shielding is over it, and must be dismantled first.",
    });
    expect(dismantle(shieldingId)).toMatchObject({ ok: false });
    expect(dismantle(wallId)).toEqual({ ok: true });
    runUntil(campaign, (now) => now.dismantlings.length === 0);
    expect(dismantle(shieldingId)).toEqual({ ok: true });
    runUntil(campaign, (now) => now.dismantlings.length === 0);
    expect(dismantle(oldId)).toEqual({ ok: true });
    runUntil(campaign, (now) => now.dismantlings.length === 0);

    const after = campaign.snapshot();
    expect(after.structures.some(({ id }) => id === oldId)).toBe(false);
    expect(after.ended).toBeUndefined();
    // Even with the Buried Habitat's cable coming by way of the old Habitat.
    expect(structureAt(after, sites.buriedHabitat).powered).toBe(true);
    expect(after.missionDirector).toMatchObject({ habitatId: newId });
    expect(ratePerDay(campaign)).toBeGreaterThanOrEqual(rates.buriedHabitat);
  });

  it("counts a Buried Habitat they live in as the Habitat shielded Milestone, and keeps it reached if they then move out", () => {
    const campaign = base();
    expect(campaign.snapshot().milestones.reachedIds).not.toContain(
      "habitat-shielded",
    );
    moveTo(campaign, sites.buriedHabitat);
    campaign.advance(1);
    expect(campaign.snapshot().milestones.reachedIds).toContain(
      "habitat-shielded",
    );

    moveTo(campaign, sites.spareHabitat);
    campaign.advance(1);

    expect(campaign.snapshot().milestones.reachedIds).toContain(
      "habitat-shielded",
    );
  });

  it("is allowed into an unshielded ordinary Habitat, where the dose rate shows it and the forecast warns at once", () => {
    const start = edited(base(), (state) => {
      state.radiationDoseMillisieverts = 590;
    });
    moveTo(start, sites.homeHabitat);
    start.advance(1);
    const walledRate = ratePerDay(start);

    moveTo(start, sites.spareHabitat);

    expect(ratePerDay(start)).toBeGreaterThan(walledRate);
    expect(ratePerDay(start)).toBe(rates.habitat);
    const forecast = start.forecasts().radiationDose;
    expect((forecast.minutesUntilLimit ?? Infinity) / EARTH_DAY).toBeLessThan(
      1,
    );
    const events = start.advance(1);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "radiation-dose-warning" }),
    );
  });

  it("has the Robot repair itself by the Habitat they now live in", () => {
    const campaign = base();
    moveTo(campaign, sites.homeHabitat);
    const buriedId = moveTo(campaign, sites.buriedHabitat);
    expect(campaign.snapshot().missionDirector).toMatchObject({
      habitatId: buriedId,
    });
    const worn = edited(campaign, (state) => {
      for (const robot of state.robots) robot.conditionPercent = 5;
    });

    // It goes to where they live to repair itself.
    let closest = Infinity;
    runUntil(
      worn,
      (state) => {
        const [robot] = state.robots;
        if (robot?.selfRepair !== undefined) {
          expect(robot.selfRepair.home).toBe("habitat");
          closest = Math.min(
            closest,
            Math.hypot(
              robot.position.x - sites.buriedHabitat.x,
              robot.position.y - sites.buriedHabitat.y,
            ),
          );
        }
        return closest < buried.footprintRadiusMetres + 2;
      },
      20 * 24,
    );
  });

  it("carries on from a save, with the home, dose and rate as they were", () => {
    const campaign = base();
    moveTo(campaign, sites.homeHabitat);
    const buriedId = moveTo(campaign, sites.buriedHabitat);
    campaign.advance(EARTH_DAY);
    const before = campaign.snapshot();

    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    const after = loaded.campaign.snapshot();
    expect(after.missionDirector).toEqual(before.missionDirector);
    expect(after.missionDirector).toMatchObject({ habitatId: buriedId });
    expect(after.radiationDoseMillisieverts).toBe(
      before.radiationDoseMillisieverts,
    );
    expect(ratePerDay(loaded.campaign)).toBe(ratePerDay(campaign));
  });
});

describe("older saves", () => {
  // A sample save from before there was a Buried Habitat: an hour into the
  // Assembly of a water wall over the Mission Director's Habitat.
  const sample = readFileSync(
    new URL("saves/version-34.moonbase", import.meta.url),
    "utf8",
  );
  let saved: { state: { radiationDoseMillisieverts: number } };

  beforeAll(() => {
    saved = JSON.parse(sample) as typeof saved;
  });

  function load(text: string): Campaign {
    const loaded = loadCampaign(text);
    if (!loaded.ok) throw new Error(loaded.message);
    return loaded.campaign;
  }

  it("keep their Radiation Dose exactly, through loading and saving again, and their dose rate as it was", () => {
    const campaign = load(sample);

    expect(campaign.snapshot().radiationDoseMillisieverts).toBe(
      saved.state.radiationDoseMillisieverts,
    );
    expect(ratePerDay(campaign)).toBe(rates.shieldedHabitat);

    const again = load(campaign.save());

    expect(again.snapshot().radiationDoseMillisieverts).toBe(
      saved.state.radiationDoseMillisieverts,
    );
    expect(ratePerDay(again)).toBe(rates.shieldedHabitat);
  });

  it("go on to the water wall's rate as they always did, none of it changed", () => {
    const campaign = load(sample);

    runUntil(campaign, (state) => state.constructions.length === 0, 24);

    expect(ratePerDay(campaign)).toBe(rates.waterWalledHabitat);
    expect(rates).toMatchObject({
      lander: 0,
      habitat: 30,
      shieldedHabitat: 1.5,
      waterWalledHabitat: 0.15,
    });
  });
});
