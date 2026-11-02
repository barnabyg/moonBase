import { describe, expect, it } from "vitest";
import { createCampaignSlot } from "../src/game/campaign-slot";
import { loadCampaign, type Campaign } from "../src/simulation";
import { scenario } from "./scenario";
import { freshSaveWith } from "./try-scenarios";

/** One of the Campaign's calls, taken by name. */
type Call = (...args: unknown[]) => unknown;

/**
 * A real Campaign's calls by name. Each declares all its parameters, with no
 * defaults, so a call's `length` counts every argument it takes.
 */
function campaignCalls(): Record<string, Call> {
  return scenario().campaign as unknown as Record<string, Call>;
}

/**
 * A stand-in for the Campaign with the same calls as a real one, which
 * records the arguments the latest of each call was given.
 */
function recordingCampaign(): {
  campaign: Campaign;
  calls: Map<string, unknown[]>;
} {
  const calls = new Map<string, unknown[]>();
  const campaign = Object.fromEntries(
    Object.keys(campaignCalls()).map((name) => [
      name,
      (...args: unknown[]) => {
        calls.set(name, args);
      },
    ]),
  );
  return { campaign: campaign as unknown as Campaign, calls };
}

describe("the Campaign slot", () => {
  it("passes every call on to the Campaign in it", () => {
    const game = scenario();
    const slot = createCampaignSlot(game.campaign);

    slot.planConstruction({
      structureTypeId: "solar-array",
      position: { x: 20, y: 12 },
    });
    slot.advance(90);

    expect(slot.snapshot()).toEqual(game.state);
    expect(slot.forecasts()).toEqual(game.campaign.forecasts());
    expect(slot.save()).toBe(game.campaign.save());
  });

  it("passes calls on to a Campaign put in place of the first, and leaves the first alone", () => {
    const first = scenario(1);
    const second = scenario(2).advance({ hours: 3 });
    const slot = createCampaignSlot(first.campaign);

    slot.replace(second.campaign);
    slot.advance(60);

    expect(slot.snapshot()).toEqual(second.state);
    expect(second.state.clock.elapsedMinutes).toBe(4 * 60);
    expect(first.state.clock.elapsedMinutes).toBe(0);
  });

  it("starts the type of Expedition asked for", () => {
    const loaded = loadCampaign(
      freshSaveWith((state) => {
        state.unlockedDesignIds.push("survey-expeditions");
      }),
    );
    if (!loaded.ok) throw new Error(loaded.message);
    const slot = createCampaignSlot(loaded.campaign);

    expect(slot.startExpedition("survey")).toEqual({ ok: true });

    expect(slot.snapshot().expedition?.typeId).toBe("survey");
  });

  it("passes on every argument each of the Campaign's calls takes", () => {
    const recording = recordingCampaign();
    const slot = createCampaignSlot(recording.campaign) as unknown as Record<
      string,
      Call
    >;

    for (const [name, call] of Object.entries(campaignCalls())) {
      const args = Array.from({ length: call.length }, (_, i) => ({
        argument: i,
      }));
      slot[name]?.(...args);

      expect(recording.calls.get(name), name).toEqual(args);
    }
  });
});
