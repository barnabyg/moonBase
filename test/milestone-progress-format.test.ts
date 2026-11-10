import { describe, expect, it } from "vitest";
import {
  formatMilestoneMeasure,
  formatMilestonePlace,
} from "../src/ui/status-panel-text";

describe("the current Milestone's place, in the status panel", () => {
  it("says which of its Act's Milestones it is", () => {
    expect(formatMilestonePlace({ place: { number: 3, of: 5 } })).toBe(
      "Milestone 3 of 5",
    );
  });

  it("says nothing once every Milestone is reached", () => {
    expect(formatMilestonePlace({ place: undefined })).toBeUndefined();
  });
});

describe("a measure of the current Milestone, in the status panel", () => {
  it("shows the share of a life support stock's use made at the base, and that it isn't judged yet", () => {
    expect(
      formatMilestoneMeasure({
        kind: "life-support-made",
        stockId: "oxygen",
        share: 0.754,
        windowComplete: false,
      }),
    ).toEqual({
      label: "Made here",
      value: "75% of use",
      note: "judged once a whole Lunation is recorded",
      fraction: 0.754,
    });
  });

  it("says what the share has to come to, once a whole Lunation is recorded", () => {
    expect(
      formatMilestoneMeasure({
        kind: "spare-components-made",
        share: 0.5,
        windowComplete: true,
      }),
    ).toEqual({
      label: "Made here",
      value: "50% of use",
      note: "needs 100% over the last Lunation",
      fraction: 0.5,
    });
  });

  it("shows a share past the whole of it as a full bar, and none used as an empty one", () => {
    expect(
      formatMilestoneMeasure({
        kind: "life-support-made",
        stockId: "water",
        share: 8.31,
        windowComplete: false,
      }),
    ).toMatchObject({ value: "831% of use", fraction: 1 });
    expect(
      formatMilestoneMeasure({
        kind: "spare-components-made",
        share: undefined,
        windowComplete: false,
      }),
    ).toMatchObject({ value: "none used yet", fraction: 0 });
  });

  it("shows the Return Mass and the Exports loaded against the mass to carry", () => {
    expect(
      formatMilestoneMeasure({
        kind: "return-mass",
        kilograms: 212.5,
        targetKilograms: 300,
      }),
    ).toEqual({
      label: "Return Mass",
      value: "212 of 300 kg",
      fraction: 212.5 / 300,
    });
    expect(
      formatMilestoneMeasure({
        kind: "exports-loaded",
        kilograms: 120,
        targetKilograms: 300,
      }),
    ).toEqual({
      label: "Exports",
      value: "120 of 300 kg",
      note: "aboard or to load",
      fraction: 0.4,
    });
  });

  it("shows a stock against what a Structure is stocked with, and the room for it where that is too little", () => {
    expect(
      formatMilestoneMeasure({
        kind: "stocked-with",
        stockId: "oxygen",
        kilograms: 45.2,
        targetKilograms: 611.76,
        limitKilograms: 400,
      }),
    ).toEqual({
      label: "Oxygen",
      value: "45 of 612 kg",
      note: "room for only 400 kg",
      fraction: 45.2 / 611.76,
    });
  });

  it("shows a stock at what it takes as all there, whatever the room for it", () => {
    expect(
      formatMilestoneMeasure({
        kind: "stocked-with",
        stockId: "oxygen",
        kilograms: 611.76,
        targetKilograms: 611.76,
        limitKilograms: 100,
      }),
    ).toEqual({ label: "Oxygen", value: "612 of 612 kg", fraction: 1 });
  });

  it("leaves out the room for a stock once the base can hold what it takes", () => {
    expect(
      formatMilestoneMeasure({
        kind: "stocked-with",
        stockId: "water",
        kilograms: 2600,
        targetKilograms: 2549,
        limitKilograms: 2900,
      }),
    ).toEqual({ label: "Water", value: "2600 of 2549 kg", fraction: 1 });
  });
});
