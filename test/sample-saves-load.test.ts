import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { samples, loadSample } from "./sample-saves";

/**
 * Every sample save must go on loading, whichever format version wrote it. A
 * new sample is picked up by itself.
 */

describe("the sample saves", () => {
  it.each(readdirSync(samples).filter((name) => name.endsWith(".moonbase")))(
    "%s loads",
    (name) => {
      expect(() => loadSample(name)).not.toThrow();
    },
  );
});
