import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import type { Campaign, GameEvent } from "../src/simulation";
import { loadSample } from "./sample-saves";

/**
 * What an older sample save gets once it loads into rules that came after it:
 * Condition, Maintenance, Dust, parking for the Night and Micrometeorites.
 */

describe("the sample saves from before Condition", () => {
  it.each([
    "version-1.moonbase",
    "version-1-ended.moonbase",
    "version-2.moonbase",
    "version-3.moonbase",
    "version-4.moonbase",
    "version-5.moonbase",
  ])("%s loads with every Structure at 100%", (name) => {
    const { structures } = loadSample(name).snapshot();

    expect(structures.length).toBeGreaterThan(0);
    expect(structures.map((s) => s.conditionPercent)).toEqual(
      structures.map(() => 100),
    );
  });
});

describe("the sample saves from before Maintenance", () => {
  it.each([
    "version-1.moonbase",
    "version-1-ended.moonbase",
    "version-2.moonbase",
    "version-3.moonbase",
    "version-4.moonbase",
    "version-5.moonbase",
    "version-6.moonbase",
    "version-7.moonbase",
  ])(
    "%s loads with the starting amount of spare Components added to the base's stock, and no Maintenance",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(state.stockpile.components.map((s) => s.componentId)).toEqual(
        catalogue.componentTypes.map((type) => type.id),
      );
      expect(
        state.stockpile.components.find(
          (stock) => stock.componentId === "spare-component",
        ),
      ).toEqual({ componentId: "spare-component", count: 6 });
      expect(state.maintenance).toEqual([]);
    },
  );

  it("raises Maintenance for a Structure already worn down below the threshold as play goes on", () => {
    const campaign = loadSample("version-6.moonbase");
    campaign.advance(
      35340 + 3 * 24 * 60 - campaign.snapshot().clock.elapsedMinutes,
    );

    campaign.advance(1);

    expect(
      campaign
        .snapshot()
        .maintenance.map((m) =>
          m.target.kind === "structure" ? m.target.structureTypeId : undefined,
        ),
    ).toEqual(["solar-array", "habitat"]);
  });
});

describe("the sample saves from before Dust coating", () => {
  it.each([
    "version-1.moonbase",
    "version-1-ended.moonbase",
    "version-2.moonbase",
    "version-3.moonbase",
    "version-4.moonbase",
    "version-5.moonbase",
    "version-6.moonbase",
    "version-7.moonbase",
    "version-8.moonbase",
  ])("%s loads with no Dust coating on anything", (name) => {
    const { structures } = loadSample(name).snapshot();

    expect(structures.length).toBeGreaterThan(0);
    expect(structures.map((s) => s.dustCoatingPercent)).toEqual(
      structures.map(() => 0),
    );
  });

  it("loads the Maintenance under way in version-8.moonbase as a visit that restores Condition and doesn't clean", () => {
    const campaign = loadSample("version-8.moonbase");
    const events: GameEvent[] = [];

    for (
      let minutes = 0;
      campaign.snapshot().maintenance.length > 0;
      minutes++
    ) {
      if (minutes > 24 * 60) throw new Error("Maintenance never finished.");
      events.push(...campaign.advance(1));
    }

    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "maintenance-completed",
        spareComponents: 2,
        cleaned: false,
      }),
    );
  });
});

describe("the sample saves from before Machines had a Condition", () => {
  it.each([
    "version-1.moonbase",
    "version-1-ended.moonbase",
    "version-2.moonbase",
    "version-3.moonbase",
    "version-4.moonbase",
    "version-5.moonbase",
    "version-6.moonbase",
    "version-7.moonbase",
    "version-8.moonbase",
    "version-9.moonbase",
  ])("%s loads with every Machine at 100%", (name) => {
    const { machines } = loadSample(name).snapshot();

    expect(machines.length).toBeGreaterThan(0);
    expect(machines.map((m) => m.conditionPercent)).toEqual(
      machines.map(() => 100),
    );
  });
});

describe("the sample saves from before Machines plugged in", () => {
  it.each([
    "version-1.moonbase",
    "version-2.moonbase",
    "version-6.moonbase",
    "version-8.moonbase",
    "version-10.moonbase",
  ])(
    "%s loads with no Machine being parked, and plays on through the next game-minute's power",
    (name) => {
      const campaign = loadSample(name);

      expect(campaign.snapshot().parking).toEqual([]);
      expect(campaign.snapshot().machines.map((m) => m.powered)).toEqual(
        campaign.snapshot().machines.map(() => false),
      );
      expect(() => campaign.advance(60)).not.toThrow();
    },
  );
});

describe("the sample saves from before the Robot had a Condition", () => {
  it.each([
    "version-1.moonbase",
    "version-1-ended.moonbase",
    "version-3.moonbase",
    "version-5.moonbase",
    "version-7.moonbase",
    "version-9.moonbase",
    "version-11.moonbase",
  ])("%s loads with the Robot at 100%, repairing nothing", (name) => {
    const [robot] = loadSample(name).snapshot().robots;

    expect(robot).toMatchObject({
      conditionPercent: 100,
      performance: 1,
      selfRepair: undefined,
    });
  });
});

describe("the sample saves from before Micrometeorites", () => {
  /** The Micrometeorite strikes in the next given Earth Days of play. */
  const strikesAhead = (campaign: Campaign, earthDays: number) =>
    campaign
      .advance(earthDays * 24 * 60)
      .filter((event) => event.kind === "micrometeorite-strike");

  // Samples in which the Mission Director lives through the next 20 Earth
  // Days, so that play goes on.
  it.each([
    "version-4.moonbase",
    "version-9.moonbase",
    "version-11.moonbase",
    "version-12.moonbase",
  ])(
    "%s loads with a first strike scheduled from its saved generator, 4 to 20 Earth Days on, the same every time",
    (name) => {
      const saved = loadSample(name);
      const savedAt = saved.snapshot().clock.elapsedMinutes;

      const first = strikesAhead(saved, 21)[0];

      expect(first).toBeDefined();
      expect(first?.atMinute).toBeGreaterThanOrEqual(savedAt + 4 * 24 * 60);
      expect(first?.atMinute).toBeLessThanOrEqual(savedAt + 20 * 24 * 60);
      expect(strikesAhead(loadSample(name), 21)[0]).toEqual(first);
    },
  );
});
