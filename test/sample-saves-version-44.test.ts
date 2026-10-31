import { describe, expect, it } from "vitest";
import { loadSample } from "./sample-saves";

describe("the sample save of format version 44", () => {
  // The greenhouse try scenario as it was then, a few game-hours on: a Greenhouse
  // part-way through a round, a little before Night.
  it("loads with the Greenhouse's round as far as it had got", () => {
    const state = loadSample("version-44.moonbase").snapshot();

    const greenhouse = state.structures.find(
      ({ structureTypeId }) => structureTypeId === "greenhouse",
    );
    expect(greenhouse?.growingMinutes).toBe(120);
    expect(greenhouse?.plant).toMatchObject({ running: true });
  });

  it("plays on, the Greenhouse growing into the Night and its round lost as the water falls to the reserve", () => {
    const campaign = loadSample("version-44.moonbase");

    const events = campaign.advance(48 * 60);

    const state = campaign.snapshot();
    expect(state.lunation.part).toBe("night");
    expect(
      events.filter(({ kind }) => kind === "greenhouse-round-lost"),
    ).toMatchObject([{ reason: "water" }]);
    expect(
      state.lifeSupport.find(({ stockId }) => stockId === "water")?.kilograms,
    ).toBeCloseTo(49, 0);
  });
});

describe("a save from before the Greenhouse", () => {
  it("has nothing growing on any Structure, and can go on", () => {
    const campaign = loadSample("version-43.moonbase");

    expect(
      campaign
        .snapshot()
        .structures.every(({ growingMinutes }) => growingMinutes === 0),
    ).toBe(true);
    expect(campaign.advance(60)).toBeDefined();
  });
});
