import { describe, expect, it } from "vitest";
import { loadSample } from "./sample-saves";

describe("the sample save of format version 49", () => {
  // The radio-telescope-array try scenario as it was then, with one antenna field
  // commissioned beside the array and a second planned beside that one.
  it("loads with its antenna field joining the array, and the second still to join it", () => {
    const campaign = loadSample("version-49.moonbase");
    const state = campaign.snapshot();
    const array = state.structures.find(
      ({ structureTypeId }) => structureTypeId === "radio-telescope-array",
    );
    const field = state.structures.find(
      ({ structureTypeId }) => structureTypeId === "antenna-field",
    );

    expect(field?.arrayId).toBe(array?.id);
    expect(array?.observedMinutes).toBe(1295);
    expect(state.radioArrays).toEqual([
      expect.objectContaining({
        structureId: array?.id,
        antennaFields: 2,
        fieldIds: [field?.id],
      }),
    ]);
    expect(state.constructions).toEqual([
      expect.objectContaining({ structureTypeId: "antenna-field" }),
    ]);
    const saved = JSON.parse(campaign.save()) as {
      state: { constructions: { arrayId: string | null }[] };
    };
    expect(saved.state.constructions[0]?.arrayId).toBe(array?.id);
  });

  it("plays on, the array working its round with both fields", () => {
    const campaign = loadSample("version-49.moonbase");
    const before =
      campaign
        .snapshot()
        .structures.find(
          ({ structureTypeId }) => structureTypeId === "radio-telescope-array",
        )?.observedMinutes ?? 0;

    campaign.advance(60);

    const array = campaign.snapshot().radioArrays[0];
    expect(array?.working).toBe(true);
    expect(
      campaign
        .snapshot()
        .structures.find(
          ({ structureTypeId }) => structureTypeId === "radio-telescope-array",
        )?.observedMinutes,
    ).toBeCloseTo(before + 2 * 60);
  });
});
