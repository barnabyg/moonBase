import { describe, expect, it } from "vitest";
import type { ObservingProgrammeSnapshot } from "../src/simulation";
import { formatObservingProgramme } from "../src/ui/format";

/** The observing programme as the status panel reads it, with one telescope unless given. */
function programme(
  figures: Partial<ObservingProgrammeSnapshot> = {},
): ObservingProgrammeSnapshot {
  return {
    progress: 0.25,
    telescopes: 1,
    observing: 0,
    minutesLeft: undefined,
    stoppedFor: "daylight",
    ...figures,
  };
}

describe("the status panel's line for the observing programme", () => {
  it("isn't shown while the base has no telescope", () => {
    expect(
      formatObservingProgramme(
        programme({ telescopes: 0, stoppedFor: undefined }),
      ),
    ).toBeUndefined();
  });

  it("names the programme and says how long the round has left while a telescope observes", () => {
    expect(
      formatObservingProgramme(
        programme({
          observing: 1,
          minutesLeft: 28 * 60,
          stoppedFor: undefined,
        }),
      ),
    ).toEqual({ value: "Night-sky survey", note: "observing, 1d 4h left" });
  });

  it("says how many telescopes observe when there is more than one", () => {
    expect(
      formatObservingProgramme(
        programme({
          telescopes: 3,
          observing: 2,
          minutesLeft: 90,
          stoppedFor: undefined,
        }),
      ),
    ).toEqual({
      value: "Night-sky survey",
      note: "2 telescopes observing, 2h left",
    });
  });

  it("says why no telescope observes", () => {
    expect(formatObservingProgramme(programme())).toEqual({
      value: "Night-sky survey",
      note: "waits for Night",
    });
    expect(
      formatObservingProgramme(programme({ stoppedFor: "no-power" })),
    ).toEqual({ value: "Night-sky survey", note: "no power to observe" });
    expect(
      formatObservingProgramme(programme({ stoppedFor: "broken" })),
    ).toEqual({ value: "Night-sky survey", note: "telescope Broken" });
    expect(
      formatObservingProgramme(
        programme({ telescopes: 2, stoppedFor: "broken" }),
      ),
    ).toEqual({ value: "Night-sky survey", note: "telescopes Broken" });
  });
});
