import { beforeAll, describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { lunationMinutes } from "../src/simulation";
import {
  playReferenceCampaign,
  type ReferenceTimeline,
} from "./reference-campaign";
import { toGameMinutes } from "./scenario";

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
  beforeAll(() => {
    timeline = playReferenceCampaign();
  }, timeoutMs);

  const reachedAt = (milestoneId: string): number => {
    const reached = timeline.milestones.find(
      (milestone) => milestone.milestoneId === milestoneId,
    );
    if (reached === undefined) throw new Error(`${milestoneId} not reached`);
    return reached.atMinute;
  };

  it("plays to the end, reaching every Milestone in catalogue order with the Mission Director alive", () => {
    expect(timeline.failure).toBeUndefined();
    expect(timeline.milestones.map((reached) => reached.milestoneId)).toEqual(
      catalogue.milestones.map((milestone) => milestone.id),
    );
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

  // The balancing pass's pacing targets (see docs/reference-campaign.md, "Balancing").
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

  it("ends with Export income covering a typical Launch, and the Radiation Dose years from the limit thanks to the water wall, where without it the limit would come within a year", () => {
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
      3 * 365,
    );
    expect(
      timeline.radiationDoseWithoutWaterWall?.earthDaysUntilLimit,
    ).toBeLessThan(365);
  });
});
