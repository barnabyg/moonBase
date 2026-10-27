import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { loadCampaign, type Campaign } from "../src/simulation";
import { formatEvent } from "../src/ui/format";
import { scenario } from "./scenario";

const startingIds = catalogue.designs
  .filter((design) => design.starting)
  .map((design) => design.id);

/** The cheapest Design beyond the starting ones that needs only starting ones first. */
const [firstDesign] = catalogue.designs
  .filter(
    (design) =>
      !design.starting &&
      design.prerequisiteDesignIds.every((id) => startingIds.includes(id)),
  )
  .sort((a, b) => a.scienceCost - b.scienceCost);
if (firstDesign === undefined) {
  throw new Error(
    "The data catalogue needs a Design that needs only starting Designs first.",
  );
}

/**
 * Completes the Research Tasks on offer from the start, one after another,
 * until the base has at least this much Science.
 */
function earnScience(campaign: Campaign, science: number): void {
  for (const task of catalogue.researchTasks) {
    if (campaign.snapshot().science >= science) return;
    if (task.requiresDesignId !== undefined) continue;
    const result = campaign.startResearchTask(task.id);
    if (!result.ok) throw new Error(result.message);
    campaign.advance(task.lengthHours * 60);
  }
  if (campaign.snapshot().science < science) {
    throw new Error(`The Research Tasks can't earn ${science} Science.`);
  }
}

describe("a new Campaign", () => {
  it("starts with the starting Designs unlocked, and no others", () => {
    const { state } = scenario();

    expect([...state.unlockedDesignIds].sort()).toEqual(
      [...startingIds].sort(),
    );
  });
});

describe("unlocking a Design", () => {
  it("takes its cost off the Science and unlocks it at once, with a notification naming it", () => {
    const { campaign } = scenario();
    earnScience(campaign, firstDesign.scienceCost);
    const science = campaign.snapshot().science;

    const result = campaign.unlockDesign(firstDesign.id);

    expect(result).toEqual({
      ok: true,
      event: {
        kind: "design-unlocked",
        atMinute: campaign.snapshot().clock.elapsedMinutes,
        designId: firstDesign.id,
        science: firstDesign.scienceCost,
      },
    });
    if (!result.ok) throw new Error(result.message);
    expect(formatEvent(result.event)).toBe(
      `${firstDesign.label} unlocked, for ${firstDesign.scienceCost} Science`,
    );
    const state = campaign.snapshot();
    expect(state.science).toBe(science - firstDesign.scienceCost);
    expect(state.unlockedDesignIds).toContain(firstDesign.id);
  });
});

describe("unlocking a Design is refused, with the reason, and nothing changes", () => {
  it("for one already unlocked", () => {
    const { campaign } = scenario();
    const [starting] = catalogue.designs.filter((design) => design.starting);
    if (starting === undefined) throw new Error("expected a starting Design");

    expect(campaign.unlockDesign(starting.id)).toEqual({
      ok: false,
      reason: "already-unlocked",
      message: `${starting.label} is already unlocked.`,
    });

    earnScience(campaign, firstDesign.scienceCost);
    campaign.unlockDesign(firstDesign.id);
    const science = campaign.snapshot().science;
    expect(campaign.unlockDesign(firstDesign.id)).toMatchObject({
      ok: false,
      reason: "already-unlocked",
    });
    expect(campaign.snapshot().science).toBe(science);
  });

  it("for one whose prerequisite isn't unlocked yet, naming the prerequisite", () => {
    const { campaign } = scenario();
    const later = catalogue.designs.find((design) =>
      design.prerequisiteDesignIds.includes(firstDesign.id),
    );
    if (later === undefined) {
      throw new Error(`expected a Design that needs ${firstDesign.label}`);
    }
    earnScience(campaign, later.scienceCost);
    const before = campaign.snapshot();

    expect(campaign.unlockDesign(later.id)).toEqual({
      ok: false,
      reason: "prerequisite-missing",
      message: `${later.label} needs ${firstDesign.label} unlocked first.`,
    });
    expect(campaign.snapshot().science).toBe(before.science);
    expect(campaign.snapshot().unlockedDesignIds).toEqual(
      before.unlockedDesignIds,
    );
  });

  it("when the Science is short, saying how much it needs and how much there is", () => {
    const { campaign } = scenario();
    const [task] = catalogue.researchTasks;
    if (task === undefined) throw new Error("expected a Research Task");
    campaign.startResearchTask(task.id);
    campaign.advance(task.lengthHours * 60);
    const { science } = campaign.snapshot();
    expect(science).toBeLessThan(firstDesign.scienceCost);

    expect(campaign.unlockDesign(firstDesign.id)).toEqual({
      ok: false,
      reason: "not-enough-science",
      message: `${firstDesign.label} needs ${firstDesign.scienceCost} Science, and the base has ${science}.`,
    });
    expect(campaign.snapshot().science).toBe(science);
    expect(campaign.snapshot().unlockedDesignIds).not.toContain(firstDesign.id);
  });

  it("for one the Tech Tree doesn't have", () => {
    const { campaign } = scenario();

    expect(campaign.unlockDesign("warp-drive")).toEqual({
      ok: false,
      reason: "unknown-design",
      message: 'There is no Design called "warp-drive" in the Tech Tree.',
    });
  });
});

describe("a Research Task that needs a Design", () => {
  const gated = catalogue.researchTasks.find(
    (task) => task.requiresDesignId !== undefined,
  );
  if (gated?.requiresDesignId === undefined) {
    throw new Error("expected a Research Task that needs a Design");
  }
  const needed = catalogue.designs.find(
    (design) => design.id === gated.requiresDesignId,
  );
  if (needed === undefined) throw new Error("expected its Design");

  it("can't be started until its Design is unlocked, then can", () => {
    const { campaign } = scenario();

    expect(campaign.startResearchTask(gated.id)).toEqual({
      ok: false,
      reason: "design-locked",
      message: `${gated.label} needs the ${needed.label} Design unlocked first.`,
    });
    expect(campaign.snapshot().researchTask).toBeUndefined();

    // Its prerequisites first, then the Design it needs.
    for (const id of [...needed.prerequisiteDesignIds, needed.id]) {
      if (campaign.snapshot().unlockedDesignIds.includes(id)) continue;
      const design = catalogue.designs.find((entry) => entry.id === id);
      if (design === undefined) throw new Error(`expected Design ${id}`);
      earnScience(campaign, design.scienceCost);
      const unlocked = campaign.unlockDesign(id);
      if (!unlocked.ok) throw new Error(unlocked.message);
    }

    expect(campaign.startResearchTask(gated.id)).toEqual({ ok: true });
    expect(campaign.snapshot().researchTask).toMatchObject({
      researchTaskId: gated.id,
    });
  });
});

describe("unlocking a Design", () => {
  it("adds nothing to the base: the stock, Structures, Machines and Robots are as they were", () => {
    const { campaign } = scenario();
    earnScience(campaign, firstDesign.scienceCost);
    const before = campaign.snapshot();

    const result = campaign.unlockDesign(firstDesign.id);

    expect(result.ok).toBe(true);
    const after = campaign.snapshot();
    expect(after.stockpile).toEqual(before.stockpile);
    expect(after.bulkResources).toEqual(before.bulkResources);
    expect(after.lifeSupport).toEqual(before.lifeSupport);
    expect(after.structures).toEqual(before.structures);
    expect(after.constructions).toEqual(before.constructions);
    expect(after.machines).toEqual(before.machines);
    expect(after.robots).toEqual(before.robots);
    expect(after.rovers).toEqual(before.rovers);
    expect(after.launchManifest).toEqual(before.launchManifest);
    expect(after.fundingMillionDollars).toBe(before.fundingMillionDollars);
  });

  it("is refused once the Campaign has ended", () => {
    const loaded = loadCampaign(
      readFileSync(
        new URL("./saves/version-1-ended.moonbase", import.meta.url),
        "utf8",
      ),
    );
    if (!loaded.ok) throw new Error(loaded.message);

    expect(loaded.campaign.unlockDesign(firstDesign.id)).toEqual({
      ok: false,
      reason: "campaign-ended",
      message: "The Campaign is over: the Mission Director has died.",
    });
  });

  it("is kept through saving and loading", () => {
    const { campaign } = scenario();
    earnScience(campaign, firstDesign.scienceCost);
    campaign.unlockDesign(firstDesign.id);

    const loaded = loadCampaign(campaign.save());

    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.campaign.snapshot().unlockedDesignIds).toEqual(
      campaign.snapshot().unlockedDesignIds,
    );
    expect(loaded.campaign.snapshot().science).toBe(
      campaign.snapshot().science,
    );
  });
});
