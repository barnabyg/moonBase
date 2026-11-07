import { describe, expect, it } from "vitest";
import { loadSample } from "./sample-saves";

describe("the sample save of format version 48", () => {
  // The infrared-telescope try scenario as it was then, run on a few game-minutes,
  // so that its telescope is 97 game-minutes into its round, an hour and a half
  // into the Night.
  it("loads with the infrared telescope's round as far as it had got", () => {
    const state = loadSample("version-48.moonbase").snapshot();

    expect(state.lunation.part).toBe("night");
    const telescope = state.structures.find(
      ({ structureTypeId }) => structureTypeId === "infrared-telescope",
    );
    expect(telescope?.observedMinutes).toBe(97);
    expect(state.infraredTelescopes).toEqual([
      expect.objectContaining({
        structureId: telescope?.id,
        observing: true,
        inTheWay: [],
      }),
    ]);
  });

  it("plays on, the telescope observing and boiling off propellant", () => {
    const campaign = loadSample("version-48.moonbase");
    const propellant = () =>
      campaign
        .snapshot()
        .bulkResources.find(({ resourceId }) => resourceId === "propellant")
        ?.kilograms ?? 0;
    const before = propellant();

    campaign.advance(3 * 60);

    expect(propellant()).toBeLessThan(before);
    expect(
      campaign
        .snapshot()
        .structures.find(
          ({ structureTypeId }) => structureTypeId === "infrared-telescope",
        )?.observedMinutes,
    ).toBe(97 + 3 * 60);
  });
});

describe("a save from before infrared telescopes", () => {
  it("loads with none, and its Structures on no round of observing", () => {
    const state = loadSample("version-47.moonbase").snapshot();

    expect(state.infraredTelescopes).toEqual([]);
    expect(
      state.structures.every(({ observedMinutes }) => observedMinutes === 0),
    ).toBe(true);
  });
});
