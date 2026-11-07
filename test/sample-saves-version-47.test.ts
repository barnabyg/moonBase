import { describe, expect, it } from "vitest";
import { loadSample } from "./sample-saves";

describe("the sample save of format version 47", () => {
  // The experiments-lab try scenario as it was then, with its lab worn to a quarter
  // of its Condition and run on a few game-minutes, so that the game-minutes done
  // of the Research Task running are a fraction.
  it("loads with the Research Task as far as it had got, a fraction of a game-minute and all", () => {
    const state = loadSample("version-47.moonbase").snapshot();

    expect(state.researchTask?.researchTaskId).toBe(
      "solar-wind-volatiles-survey",
    );
    expect(state.researchTask?.minutesLeft).toBe(576 * 60 - 130);
    const lab = state.structures.find(
      ({ structureTypeId }) => structureTypeId === "experiments-lab",
    );
    expect(lab?.plant).toMatchObject({ running: true });
    expect(state.experimentsLabs).toMatchObject({ labs: 1, speedingUp: 1 });
    expect(state.researchTask?.rate).toBeGreaterThan(1);
    expect(state.researchTask?.rate).toBeLessThan(2);
  });

  it("plays on, the lab speeding the Research Task up at its worn rate", () => {
    const campaign = loadSample("version-47.moonbase");
    const before = campaign.snapshot().researchTask?.minutesLeft ?? 0;

    campaign.advance(60);

    const after = campaign.snapshot().researchTask?.minutesLeft ?? 0;
    expect(before - after).toBeGreaterThan(60);
    expect(before - after).toBeLessThan(120);
  });
});

describe("a save from before automated experiments labs", () => {
  it("loads with none, its Research Task running at its usual rate", () => {
    const campaign = loadSample("version-46.moonbase");

    expect(campaign.snapshot().experimentsLabs).toEqual({
      labs: 0,
      speedingUp: 0,
      short: [],
    });
    expect(
      campaign.queueResearchTask("regolith-sample-analysis"),
    ).toMatchObject({ ok: true });
    campaign.advance(60);
    expect(campaign.snapshot().researchTask).toMatchObject({
      rate: 1,
      minutesLeft: 5 * 60,
      minutesLeftAtRate: 5 * 60,
    });
  });
});
