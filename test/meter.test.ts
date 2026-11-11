import { describe, expect, it } from "vitest";
import { limitState } from "../src/ui/stat";

describe("a bar showing a figure against its limit", () => {
  it("is plain while the figure is well clear of its limit", () => {
    expect(limitState(0)).toBe("clear");
    expect(limitState(0.79)).toBe("clear");
  });

  it("is picked out as the figure nears its limit", () => {
    expect(limitState(0.8)).toBe("near");
    expect(limitState(0.94)).toBe("near");
  });

  it("is a warning once the figure is at its limit or all but", () => {
    expect(limitState(0.95)).toBe("full");
    expect(limitState(1)).toBe("full");
    expect(limitState(1.3)).toBe("full");
  });
});
