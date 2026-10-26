import { describe, expect, it } from "vitest";
import { createCampaignSlot } from "../src/game/campaign-slot";
import { scenario } from "./scenario";

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
});
