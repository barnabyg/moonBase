import { describe, expect, it } from "vitest";
import type { ObservingSiteSnapshot } from "../src/simulation";
import {
  describeFoundSite,
  describeNextSite,
  formatSiteFor,
  formatSiteFound,
} from "../src/ui/observing-sites-text";

const darkSite: ObservingSiteSnapshot = {
  kindId: "dark",
  label: "Dark site",
  position: { x: 300, y: 40 },
  radiusMetres: 40,
  keptClearOf: "lit",
  fromLanderMetres: 302.65,
};

describe("the words for observing sites", () => {
  it("says what a Survey found, and for which telescope", () => {
    expect(formatSiteFound("dark")).toBe(
      "found a dark site, where an infrared telescope works its rounds 50% faster",
    );
    expect(formatSiteFound("radio-quiet")).toBe(
      "found a radio-quiet site, where a radio telescope array works its rounds 50% faster",
    );
  });

  it("describes a found site with how far it is from the Lander", () => {
    expect(describeFoundSite(darkSite)).toBe(
      "Dark site, 303 m from the Lander: an infrared telescope standing wholly on it works its rounds 50% faster.",
    );
  });

  it("says what the next Survey back finds, until each kind unlocked is found", () => {
    expect(describeNextSite([], [])).toBeUndefined();
    expect(describeNextSite(["radio-astronomy"], [])).toBe(
      "The next Survey back also finds a radio-quiet site for a radio telescope array.",
    );
    expect(
      describeNextSite(["infrared-astronomy", "radio-astronomy"], [darkSite]),
    ).toBe(
      "The next Survey back also finds a radio-quiet site for a radio telescope array.",
    );
    expect(
      describeNextSite(["infrared-astronomy"], [darkSite]),
    ).toBeUndefined();
  });

  it("says whether a telescope stands on its site, and nothing for a Structure no site suits", () => {
    expect(formatSiteFor("infrared-telescope", { x: 0, y: 0 }, [])).toBe(
      "no dark site found yet: a Survey finds one",
    );
    expect(
      formatSiteFor("infrared-telescope", { x: 310, y: 40 }, [darkSite]),
    ).toBe("on the dark site, working its rounds 50% faster");
    expect(
      formatSiteFor("infrared-telescope", { x: 337, y: 40 }, [darkSite]),
    ).toBe("not wholly on the dark site, 303 m from the Lander");
    expect(
      formatSiteFor("radio-telescope-array", { x: 300, y: 40 }, [darkSite]),
    ).toBe("no radio-quiet site found yet: a Survey finds one");
    expect(
      formatSiteFor("antenna-field", { x: 300, y: 40 }, [darkSite]),
    ).toBeUndefined();
    expect(
      formatSiteFor("light-mast", { x: 300, y: 40 }, [darkSite]),
    ).toBeUndefined();
  });
});
