import { describe, expect, it } from "vitest";
import { createCampaign } from "../src/simulation";
import { inSentence } from "../src/ui/labels";

describe("names in a sentence", () => {
  it("lowercases a name, but not one the glossary always capitalises", () => {
    expect(inSentence("Solar array")).toBe("solar array");
    expect(inSentence("Workshop")).toBe("Workshop");
    expect(inSentence("Buried Habitat")).toBe("Buried Habitat");
  });

  it.each([
    ["workshop", "The Workshop needs"],
    ["buried-habitat", "The Buried Habitat needs"],
  ])("keeps %s capitalised in what the game refuses", (id, message) => {
    const planned = createCampaign({ seed: 1 }).planConstruction({
      structureTypeId: id,
      position: { x: 30, y: 30 },
    });
    expect(planned.ok).toBe(false);
    expect(planned.ok ? "" : planned.message).toContain(message);
  });
});
