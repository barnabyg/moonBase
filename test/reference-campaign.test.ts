import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { playReferenceCampaign } from "./reference-campaign";

// The reference Campaign plays some 65 Earth Days a game-minute at a time,
// which takes about 15 s on a developer machine, and CI runs Vitest about
// 2.5 times slower, so about 38 s there (see README, "Timeouts"). This limit
// is about eight times that, so that it stops only a Campaign that hangs;
// it is set here rather than raised for the whole suite.
const timeoutMs = 300_000;

describe("the reference Campaign", () => {
  it(
    "reaches every Milestone in catalogue order with the Mission Director alive, paying for the Launches after the first export sale with Export earnings",
    () => {
      const timeline = playReferenceCampaign();

      expect(timeline.failure).toBeUndefined();
      expect(timeline.milestones.map((reached) => reached.milestoneId)).toEqual(
        catalogue.milestones.map((milestone) => milestone.id),
      );
      expect(timeline.ended).toBeUndefined();

      // Until the first sale, the Funding is what is left of the Programme
      // Grant after the Launches paid for so far. The Launches paid for
      // after it, as the Lander leaves Earth, cost more than that, so the
      // Grant alone could not have paid for them: Export earnings did, as
      // the Funding never goes below nothing (a manifest it can't pay for is
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
      const chargedAfter = chargedBy(
        (atMinute) => atMinute > firstSale.atMinute,
      );
      const earned = timeline.sales.reduce(
        (sum, sale) => sum + sale.earnedMillionDollars,
        0,
      );
      expect(chargedAfter).toBeGreaterThan(grantLeft);
      expect(chargedAfter - grantLeft).toBeLessThanOrEqual(earned);
    },
    timeoutMs,
  );
});
