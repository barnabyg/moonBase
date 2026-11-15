import { describe, expect, it } from "vitest";
import { loadSample } from "./sample-saves";

describe("a save from before observing sites", () => {
  it("loads with none found, and its Surveys find them from then on", () => {
    const campaign = loadSample("version-50.moonbase");

    expect(campaign.snapshot().observingSites).toEqual([]);
  });
});

describe("the sample save of format version 51", () => {
  // The observing-sites try scenario as it was then: the infrared telescope's
  // base after a Survey came back with a dark site found, at Night.
  it("loads with its dark site where it was found, and the telescope by the base off it", () => {
    const campaign = loadSample("version-51.moonbase");
    const [site, ...others] = campaign.snapshot().observingSites;
    expect(others).toEqual([]);
    expect(site).toMatchObject({
      kindId: "dark",
      position: { x: 285.01819098194863, y: -227.2073916126383 },
    });
    const [telescope] = campaign.snapshot().infraredTelescopes;
    expect(telescope?.observingSiteKindId).toBeUndefined();
  });
});
