import { beforeAll, describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { loadCampaign, lunationMinutes } from "../src/simulation";
import { researchEndsOnEarthDay } from "./pacing-report";
import {
  playReferenceCampaign,
  type ReferenceTimeline,
} from "./reference-campaign";
import { toGameMinutes } from "./scenario";
import {
  act2SaveFrom,
  act3SaveFrom,
  referenceStepsKeepingAct1sEnd,
} from "./try-scenarios";

// The reference Campaign plays some 170 Earth Days a game-minute at a time,
// which takes about 20 s on a developer machine, and CI runs Vitest about
// 2.5 times slower, so about 50 s there (see docs/verification.md,
// "Timeouts"). This limit is six times that, so that it stops only a
// Campaign that hangs; it is set here rather than raised for the whole
// suite.
const timeoutMs = 300_000;

const earthDays = (earthDays: number) => toGameMinutes({ earthDays });
const { lunation } = lunationMinutes(catalogue.lunation);

describe("the reference Campaign", () => {
  let timeline: ReferenceTimeline;
  // The act-2 try scenario's save, made from this play as Act 1 ends, so that
  // npm test plays Act 1 once (see try-scenarios.test.ts).
  let act2: string | undefined;
  beforeAll(() => {
    let act1sEnd: string | undefined;
    timeline = playReferenceCampaign(
      referenceStepsKeepingAct1sEnd((save) => {
        act1sEnd = save;
      }),
    );
    if (act1sEnd !== undefined) act2 = act2SaveFrom(act1sEnd);
  }, timeoutMs);

  it("records what the long game's timeline shows: Research Tasks, Designs and Structures", () => {
    expect(
      timeline.designsUnlocked.map((unlocked) => unlocked.designId),
    ).toEqual(["water-wall-shielding"]);
    expect(timeline.researchTasksCompleted.length).toBeGreaterThan(0);
    expect(timeline.launchItemsManifested).toContain("spare-component");
    expect(
      timeline.structureTypesBuilt.map((built) => built.structureTypeId),
    ).toContain("habitat");
    expect(timeline.minutesUntilDoseLimit).toBeGreaterThan(0);
  });

  it("starts its first Research Task by the Earth Day the research rule allows for", () => {
    const [first] = timeline.researchTasksCompleted;
    const length =
      catalogue.researchTasks.find(({ id }) => id === first?.researchTaskId)
        ?.lengthHours ?? 0;
    const startedAt = (first?.atMinute ?? Infinity) - length * 60;

    expect(startedAt).toBeLessThanOrEqual(
      earthDays(researchEndsOnEarthDay({ researchTasks: [], designs: [] })),
    );
  });

  const reachedAt = (milestoneId: string): number => {
    const reached = timeline.milestones.find(
      (milestone) => milestone.milestoneId === milestoneId,
    );
    if (reached === undefined) throw new Error(`${milestoneId} not reached`);
    return reached.atMinute;
  };

  it("plays to the end, reaching all nine of Act 1's Milestones in catalogue order with the Mission Director alive", () => {
    expect(timeline.failure).toBeUndefined();
    expect(timeline.milestones.map((reached) => reached.milestoneId)).toEqual(
      catalogue.milestones
        .filter((milestone) => milestone.actId === catalogue.acts[0]?.id)
        .map((milestone) => milestone.id),
    );
    expect(timeline.milestones).toHaveLength(9);
    expect(timeline.ended).toBeUndefined();
  });

  it("pays for the Launches after the first export sale with Export earnings", () => {
    // Until the first sale, the Funding is what is left of the Programme
    // Grant after the Launches paid for so far. The Launches paid for after
    // it, as the Lander leaves Earth, cost more than that, so the Grant
    // alone could not have paid for them: Export earnings did, as the
    // Funding never goes below nothing (a manifest it can't pay for is
    // refused).
    const [firstSale] = timeline.sales;
    if (firstSale === undefined) throw new Error("expected an export sale");
    const chargedBy = (before: (atMinute: number) => boolean) =>
      timeline.launches
        .filter((launch) => before(launch.atMinute))
        .reduce((sum, launch) => sum + launch.chargedMillionDollars, 0);
    const grantLeft =
      catalogue.programmeGrantMillionDollars -
      chargedBy((atMinute) => atMinute < firstSale.atMinute);
    const chargedAfter = chargedBy((atMinute) => atMinute > firstSale.atMinute);
    const earned = timeline.sales.reduce(
      (sum, sale) => sum + sale.earnedMillionDollars,
      0,
    );
    expect(chargedAfter).toBeGreaterThan(grantLeft);
    expect(chargedAfter - grantLeft).toBeLessThanOrEqual(earned);
  });

  // The balancing pass's pacing targets (see docs/balancing.md).
  it("meets the pacing targets for the Milestones", () => {
    const firstNight = earthDays(
      catalogue.lunation.initialDaylightRemainingEarthDays,
    );
    expect(reachedAt("power-storage")).toBeLessThan(firstNight);
    expect(reachedAt("moved-in")).toBeLessThan(lunation);
    expect(reachedAt("lander-departs")).toBeLessThan(lunation);
    // No Solar Particle Event can come sooner, so none can find the
    // Habitat unshielded.
    expect(reachedAt("habitat-shielded")).toBeLessThan(
      earthDays(catalogue.solarParticleEvents.earthDaysBetween.min) -
        toGameMinutes({ hours: catalogue.solarParticleEvents.warningHours }),
    );
    expect(reachedAt("landing-pad")).toBeLessThanOrEqual(earthDays(60));
    expect(reachedAt("oxygen-self-sufficient")).toBeLessThanOrEqual(
      4 * lunation,
    );
    expect(reachedAt("water-self-sufficient")).toBeLessThanOrEqual(
      4 * lunation,
    );
  });

  it("ends with Export income covering a typical Launch, and the Radiation Dose two to three years from the limit thanks to the water wall, close enough that a Buried Habitat is needed in Act 3, where without it the limit would come within a year", () => {
    const lastSale = timeline.sales.at(-1);
    const charges = timeline.launches
      .map((launch) => launch.chargedMillionDollars)
      .sort((a, b) => a - b);
    const typicalLaunch = charges[Math.floor(charges.length / 2)] ?? Infinity;
    expect(lastSale?.earnedMillionDollars).toBeGreaterThanOrEqual(
      typicalLaunch,
    );
    expect(timeline.waterWallAtMinute).toBeDefined();
    expect(timeline.radiationDoseAtEnd.earthDaysUntilLimit).toBeGreaterThan(
      2 * 365,
    );
    expect(timeline.radiationDoseAtEnd.earthDaysUntilLimit).toBeLessThan(
      3 * 365,
    );
    expect(
      timeline.radiationDoseWithoutWaterWall?.earthDaysUntilLimit,
    ).toBeLessThan(365);
  });

  describe("the try scenarios made from it", () => {
    const act2Save = (): string => {
      if (act2 === undefined) throw new Error("It never reached Act 2.");
      return act2;
    };

    it("act-3 starts with Act 2 done and enough propellant to fly a tripled Return Mass", () => {
      const loaded = loadCampaign(act3SaveFrom(act2Save()));
      if (!loaded.ok) throw new Error(loaded.message);
      const { campaign } = loaded;
      const state = campaign.snapshot();

      expect(state.milestones).toMatchObject({
        currentActId: "act-3",
        currentId: "first-propellant",
      });
      expect(state.exports.returnMassKilograms).toBe(350);
      expect(
        campaign.loadExports([
          { resourceId: "circuit-boards", kilograms: 150 },
          { resourceId: "metals", kilograms: 150 },
        ]).ok,
      ).toBe(true);
    });

    it("act-2 starts with Act 1 done, Act 2 current, its first Milestone next to reach, and the means to reach it", () => {
      const loaded = loadCampaign(act2Save());
      if (!loaded.ok) throw new Error(loaded.message);
      const { campaign } = loaded;
      const state = campaign.snapshot();

      expect(state.milestones).toMatchObject({
        currentActId: "act-2",
        currentId: "workshop-running",
        nextId: "spare-components-self-sufficient",
      });
      expect(state.fundingMillionDollars).toBe(2500);
      expect(campaign.unlockDesign("molten-regolith-electrolysis").ok).toBe(
        true,
      );
      expect(campaign.unlockDesign("parts-machining").ok).toBe(true);
      expect(
        campaign.setLaunchManifest([
          { itemId: "machine-tool", count: 1 },
          { itemId: "casting-furnace", count: 1 },
        ]).ok,
      ).toBe(true);
      expect(
        campaign.loadExports([
          { resourceId: "circuit-boards", kilograms: 60 },
          { resourceId: "metals", kilograms: 40 },
        ]).ok,
      ).toBe(true);
      // Loading it brings no notification of an Act already under way.
      expect(
        campaign.advance(60).filter(({ kind }) => kind === "act-started"),
      ).toEqual([]);
    });
  });
});
