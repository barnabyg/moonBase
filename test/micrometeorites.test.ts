import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type Campaign,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
} from "../src/simulation";
import { scenario } from "./scenario";
import { changed, withSpares, worn } from "./worn";

// A strike every 6 to 12 hours, and nothing else wearing anything down,
// so that every Condition change in these tests is a strike's.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutDust } = await import("./without-dust");
  const { withoutCold } = await import("./without-cold");
  return {
    ...actual,
    catalogue: {
      ...withoutCold(withoutDust(actual.catalogue)),
      micrometeorites: {
        ...actual.catalogue.micrometeorites,
        earthDaysBetween: { min: 0.25, max: 0.5 },
      },
    },
  };
});

const arraySite: GroundPosition = { x: 20, y: 12 };
const mastSite: GroundPosition = { x: -30, y: -25 };
const { conditionLossPercent } = catalogue.micrometeorites;
const { conditionFloorPercent } = catalogue.robot;

type Strike = Extract<GameEvent, { kind: "micrometeorite-strike" }>;

/**
 * A solar array and a light mast, built, so that strikes have Structures
 * to hit, with spare Components enough for all the Maintenance so many
 * strikes call for.
 */
function base(seed?: number): { campaign: Campaign } {
  const campaign = changed(scenario(seed).campaign, (state) => {
    withSpares(state, 1000);
  });
  for (const [structureTypeId, position] of [
    ["solar-array", arraySite],
    ["light-mast", mastSite],
  ] as const) {
    const planned = campaign.planConstruction({ structureTypeId, position });
    if (!planned.ok) throw new Error(planned.message);
  }
  for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    campaign.advance(60);
  }
  return { campaign };
}

function strikes(events: readonly GameEvent[]): Strike[] {
  return events.filter(
    (event): event is Strike => event.kind === "micrometeorite-strike",
  );
}

/** The Condition of whatever a strike hit, as a snapshot shows it. */
function conditionOf(state: Snapshot, target: Strike["target"]): number {
  switch (target.kind) {
    case "structure":
      return (
        state.structures.find((s) => s.id === target.structureId)
          ?.conditionPercent ?? Number.NaN
      );
    case "machine":
      return (
        state.machines.find((m) => m.id === target.machineId)
          ?.conditionPercent ?? Number.NaN
      );
    case "robot":
      return (
        state.robots.find((r) => r.id === target.robotId)?.conditionPercent ??
        Number.NaN
      );
  }
}

describe("Micrometeorite strikes", () => {
  it("arrive over time, at intervals drawn from the catalogue's range", () => {
    const { campaign } = base();
    const start = campaign.snapshot().clock.elapsedMinutes;

    const seen = strikes(campaign.advance(4 * 24 * 60));

    expect(seen.length).toBeGreaterThanOrEqual(8);
    const times = [start, ...seen.map((strike) => strike.atMinute)];
    for (const [index, time] of times.slice(1).entries()) {
      const gap = time - (times[index] ?? 0);
      expect(gap).toBeLessThanOrEqual(12 * 60);
      if (index > 0) expect(gap).toBeGreaterThanOrEqual(6 * 60);
    }
  });

  it("hit each kind of target, Structures, Machines and the Robot, wearing it down by an amount drawn from the catalogue's range", () => {
    const { campaign } = base();
    const kinds = new Set<string>();

    for (let minutes = 0; minutes < 10 * 24 * 60; minutes++) {
      const before = campaign.snapshot();
      for (const strike of strikes(campaign.advance(1))) {
        kinds.add(strike.target.kind);
        const loss =
          conditionOf(before, strike.target) - strike.conditionPercent;
        expect(conditionOf(campaign.snapshot(), strike.target)).toBe(
          strike.conditionPercent,
        );
        if (
          strike.conditionPercent > 0 &&
          strike.conditionPercent > conditionFloorPercent
        ) {
          expect(loss).toBeGreaterThanOrEqual(conditionLossPercent.min);
          expect(loss).toBeLessThanOrEqual(conditionLossPercent.max);
        }
      }
    }

    expect([...kinds].sort()).toEqual(["machine", "robot", "structure"]);
  });

  it("can break a Structure", () => {
    const game = base();
    const mast = game.campaign
      .snapshot()
      .structures.find((s) => s.structureTypeId === "light-mast");
    // Worn almost through, with no spare Components to maintain it.
    const campaign = worn(game.campaign, mast?.id ?? "", 1, 0);

    const events: GameEvent[] = [];
    for (let hours = 0; !events.some((e) => e.kind === "structure-broken");) {
      if (hours++ > 10 * 24) throw new Error("The light mast never broke.");
      events.push(...campaign.advance(60));
    }

    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "micrometeorite-strike",
        target: {
          kind: "structure",
          structureId: mast?.id,
          structureTypeId: "light-mast",
        },
        conditionPercent: 0,
      }),
    );
    expect(
      campaign.snapshot().structures.find((s) => s.id === mast?.id)
        ?.conditionPercent,
    ).toBe(0);
  });

  it("never break the Robot: at low Condition its Condition stops at its floor", () => {
    const campaign = worn(base().campaign, "robot-1", conditionFloorPercent, 0);
    const robotStrikes: Strike[] = [];

    for (let minutes = 0; robotStrikes.length < 3; minutes++) {
      if (minutes > 20 * 24 * 60) throw new Error("The Robot was never hit.");
      robotStrikes.push(
        ...strikes(campaign.advance(1)).filter(
          (strike) => strike.target.kind === "robot",
        ),
      );
      expect(
        campaign.snapshot().robots[0]?.conditionPercent,
      ).toBeGreaterThanOrEqual(conditionFloorPercent);
    }

    for (const strike of robotStrikes) {
      expect(strike.conditionPercent).toBeGreaterThanOrEqual(
        conditionFloorPercent,
      );
    }
  });

  it("are the same for the same seed and commands, and differ for another seed", () => {
    const play = (seed: number) =>
      strikes(base(seed).campaign.advance(4 * 24 * 60));

    expect(play(7)).toEqual(play(7));
    expect(play(7)).not.toEqual(play(8));
  });

  it("go on the same way through saving and loading", () => {
    const { campaign } = base();
    campaign.advance(90);

    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    const ahead = strikes(campaign.advance(3 * 24 * 60));
    expect(ahead.length).toBeGreaterThan(0);
    expect(strikes(loaded.campaign.advance(3 * 24 * 60))).toEqual(ahead);
  });
});
