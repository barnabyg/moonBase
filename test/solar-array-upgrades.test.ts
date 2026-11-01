import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { isOnSale, loadCampaign } from "../src/simulation";
import { describeStructure } from "../src/ui/describe";
import { scenarioOf, type Scenario } from "./scenario";
import { freshSaveWith } from "./try-scenarios";

const site = { x: 25, y: -20 };
const SEALED = "dust-sealed-solar-arrays";
const SCREENS = "electrodynamic-dust-screens";
const THIN_FILM = "thin-film-solar-cells";
const PREFABRICATED = "prefabricated-solar-arrays";

/** A Campaign with these Designs unlocked and the stockpile holding exactly these parts of an array. */
function baseWith(
  designs: readonly string[],
  parts: Readonly<Record<string, number>>,
): Scenario {
  const save = freshSaveWith((state) => {
    state.unlockedDesignIds.push(...designs);
    state.science = 10000;
    for (const stock of state.stockpile.components) {
      if (/panel|mast$|array-pack/.test(stock.componentId)) stock.count = 0;
      const count = parts[stock.componentId];
      if (count !== undefined) stock.count = count;
    }
  });
  const loaded = loadCampaign(save);
  if (!loaded.ok) throw new Error(loaded.message);
  return scenarioOf(loaded.campaign);
}

function planned(game: Scenario): string {
  game.plan("solar-array", site);
  return game.state.constructions.at(-1)?.structureTypeId ?? "";
}

function onSale(designs: readonly string[]): string[] {
  const unlocked = ["solar-arrays", ...designs];
  return catalogue.launch.items
    .filter((item) => item.id.includes("array") || item.id.includes("solar"))
    .filter((item) => isOnSale(item, unlocked))
    .map((item) => item.id);
}

describe("what a Launch can bring of solar arrays", () => {
  it("is the plain panel and mast to begin with", () => {
    expect(onSale([])).toEqual(["solar-panel", "array-mast"]);
  });

  it("is only the improved part once a Design replaces the old one", () => {
    expect(onSale([SEALED])).toEqual(["solar-panel", "sealed-array-mast"]);
    expect(onSale([THIN_FILM])).toEqual([
      "thin-film-solar-panel",
      "array-mast",
    ]);
  });

  it("adds the upgrades up, in one panel and one mast", () => {
    expect(onSale([SEALED, SCREENS, THIN_FILM])).toEqual([
      "screened-thin-film-solar-panel",
      "sealed-array-mast",
    ]);
  });

  it("is one pack with every upgrade once arrays are prefabricated", () => {
    expect(onSale([PREFABRICATED])).toEqual(["prefabricated-array-pack"]);
    expect(onSale([PREFABRICATED, SEALED, SCREENS, THIN_FILM])).toEqual([
      "prefabricated-dust-screened-thin-film-array-pack",
    ]);
  });

  it("refuses a part no longer made", () => {
    expect(
      baseWith([SEALED], {}).campaign.setLaunchManifest([
        { itemId: "array-mast", count: 1 },
      ]),
    ).toMatchObject({ ok: false, reason: "no-longer-made" });
  });

  it("takes a replaced part off a manifest not yet paid for, and says so, leaving the rest", () => {
    const game = baseWith([], {});
    game.campaign.setLaunchManifest([
      { itemId: "array-mast", count: 1 },
      { itemId: "water", count: 1 },
    ]);
    expect(game.campaign.unlockDesign(SEALED)).toMatchObject({ ok: true });

    const events = game.campaign.advance(1);

    expect(game.state.launchManifest.items).toEqual([
      { itemId: "water", count: 1 },
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "launch-items-retired",
        itemIds: ["array-mast"],
      }),
    );
  });
});

describe("what the player is told of a kind of solar array", () => {
  function about(id: string): string {
    const type = catalogue.structureTypes.find(
      (candidate) => candidate.id === id,
    );
    if (type === undefined) throw new Error(`expected a ${id}`);
    return describeStructure(type);
  }

  it("says what each upgrade it was built with does", () => {
    const best = about("prefabricated-dust-screened-thin-film-solar-array");

    expect(best).toContain("15 kW");
    expect(best).toContain("its mast is sealed");
    expect(best).toContain("its panels are screened");
    expect(best).toContain("in one piece");
  });

  it("says none of it of a plain one", () => {
    expect(about("solar-array")).not.toMatch(/sealed|screened|one piece/);
  });
});

describe("the kind of solar array planned", () => {
  it("adds up every upgrade when all its parts are the new ones", () => {
    const game = baseWith([SEALED, SCREENS, THIN_FILM], {});

    const id = planned(game);
    const type = catalogue.structureTypes.find(
      (candidate) => candidate.id === id,
    );

    expect(type).toMatchObject({
      id: "dust-screened-thin-film-solar-array",
      dustWearPercentPerHour: 0.02,
      hazardMultipliers: { dustCoating: 0.25 },
      power: { generationKilowatts: 15 },
    });
  });

  it("is built from parts already at the base, which an upgrade doesn't change", () => {
    const game = baseWith([SEALED, THIN_FILM], {
      "solar-panel": 2,
      "array-mast": 1,
    });

    expect(planned(game)).toBe("solar-array");
  });

  it("uses a part in stock and buys the rest new", () => {
    const game = baseWith([SEALED, THIN_FILM], { "array-mast": 1 });

    expect(planned(game)).toBe("thin-film-solar-array");
  });

  it("doesn't count on parts promised to an array planned before it", () => {
    const game = baseWith([SEALED, THIN_FILM], {
      "solar-panel": 2,
      "array-mast": 1,
    });
    planned(game);

    game.plan("solar-array", { x: 40, y: -20 });

    expect(game.state.constructions.at(-1)?.structureTypeId).toBe(
      "dust-sealed-thin-film-solar-array",
    );
  });

  it("changes kind rather than wait for a part that is no longer made", () => {
    const game = baseWith([], {});
    expect(planned(game)).toBe("solar-array");

    expect(game.campaign.unlockDesign(SEALED)).toMatchObject({ ok: true });
    game.advance({ hours: 1 });

    expect(game.state.constructions[0]?.structureTypeId).toBe(
      "dust-sealed-solar-array",
    );
  });

  it("takes a whole set in stock, such as an array works has made, rather than wait for a part on sale", () => {
    const game = baseWith([SEALED], { "solar-panel": 2 });
    expect(planned(game)).toBe("dust-sealed-solar-array");

    const save = JSON.parse(game.campaign.save()) as {
      state: {
        stockpile: { components: { componentId: string; count: number }[] };
      };
    };
    for (const stock of save.state.stockpile.components) {
      if (stock.componentId === "array-mast") stock.count = 1;
    }
    const loaded = loadCampaign(JSON.stringify(save));
    if (!loaded.ok) throw new Error(loaded.message);
    const made = scenarioOf(loaded.campaign);
    made.advance({ hours: 1 });

    expect(made.state.constructions[0]?.structureTypeId).toBe("solar-array");
  });

  it("leaves an array already built as it was when a Design comes", () => {
    const game = baseWith([], { "solar-panel": 2, "array-mast": 1 });
    planned(game);
    for (let hours = 0; game.state.constructions.length > 0; hours++) {
      if (hours > 240) throw new Error("The array was never built.");
      game.advance({ hours: 1 });
    }
    const built = game.state.structures.at(-1);

    expect(game.campaign.unlockDesign(THIN_FILM)).toMatchObject({ ok: true });
    game.advance({ hours: 1 });

    expect(game.state.structures.at(-1)?.structureTypeId).toBe(
      built?.structureTypeId,
    );
    expect(built?.structureTypeId).toBe("solar-array");
  });
});
