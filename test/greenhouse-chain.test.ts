import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { loadCampaign, type Campaign, type Snapshot } from "../src/simulation";
import { formatWaiting } from "../src/ui/construction-panel-text";
import { formatEvent } from "../src/ui/notifications-text";
import { describeStructure } from "../src/ui/describe";
import { structureDetails } from "../src/ui/structure-details";
import { buriedHabitatBase, buriedHabitatSites } from "./try-scenarios";
import { changed } from "./worn";

// What Science buys after Lunar greenhouses: a growing hall and a vault cistern,
// on the base with everything a Mission Director could live in.

const typeOf = (id: string) => {
  const type = catalogue.structureTypes.find(
    (candidate) => candidate.id === id,
  );
  if (type === undefined) throw new Error(`expected a ${id}`);
  return type;
};
const designOf = (id: string) => {
  const design = catalogue.designs.find((candidate) => candidate.id === id);
  if (design === undefined) throw new Error(`expected a Design ${id}`);
  return design;
};

const hall = typeOf("growing-hall");
const cistern = typeOf("vault-cistern");
const rates = catalogue.radiation.doseRateMillisievertsPerEarthDay;
const site = buriedHabitatSites.buriedHabitat;

function water(state: Snapshot): number {
  return (
    state.lifeSupport.find(({ stockId }) => stockId === "water")?.kilograms ?? 0
  );
}

/** The base, with both Designs unlocked, their Components in stock and the water given. */
function baseWith(waterKilograms: number, tanks = 2): Campaign {
  const base = changed(buriedHabitatBase(), (state) => {
    const saved = state as unknown as {
      unlockedDesignIds: string[];
      stockpile: { components: { componentId: string; count: number }[] };
      lifeSupport: { stockId: string; kilograms: number }[];
    };
    saved.unlockedDesignIds.push(
      "water-electrolysis",
      "bulk-supply-tanks",
      "molten-regolith-electrolysis",
      "parts-machining",
      "cold-trap-mining",
      "lunar-greenhouses",
      "growing-halls",
      "vault-cistern",
    );
    for (const { componentId, count } of [
      ...hall.components,
      ...cistern.components,
      ...Array.from(
        { length: tanks },
        () => typeOf("water-tank").components,
      ).flat(),
    ]) {
      const stock = saved.stockpile.components.find(
        (candidate) => candidate.componentId === componentId,
      );
      if (stock === undefined) throw new Error(`no count of ${componentId}`);
      stock.count += count;
    }
    for (const stock of saved.lifeSupport) {
      if (stock.stockId === "water") stock.kilograms = waterKilograms;
    }
  });
  return base;
}

function runUntilBuilt(campaign: Campaign, what: string): void {
  for (let hours = 0; ; hours++) {
    if (
      campaign
        .snapshot()
        .structures.some(({ structureTypeId }) => structureTypeId === what)
    ) {
      return;
    }
    if (hours > 40 * 24) throw new Error(`The ${what} never finished.`);
    campaign.advance(60);
  }
}

function withWater(campaign: Campaign, kilograms: number): Campaign {
  return changed(campaign, (state) => {
    for (const stock of state.lifeSupport) {
      if (stock.stockId === "water") stock.kilograms = kilograms;
    }
  });
}

function moveIn(campaign: Campaign, structureTypeId: string): void {
  const home = campaign
    .snapshot()
    .structures.find(
      (structure) => structure.structureTypeId === structureTypeId,
    );
  const moved = campaign.moveMissionDirectorIn(home?.id ?? "");
  if (!moved.ok) throw new Error(moved.message);
}

function ofType(campaign: Campaign, structureTypeId: string) {
  const found = campaign
    .snapshot()
    .structures.find(
      (structure) => structure.structureTypeId === structureTypeId,
    );
  if (found === undefined) throw new Error(`expected a ${structureTypeId}`);
  return found;
}

describe("where the chain stands in the Tech Tree", () => {
  it("comes after Lunar greenhouses and the last of Act 4's Designs, so that no date before them can move", () => {
    expect(designOf("growing-halls").prerequisiteDesignIds).toEqual(
      expect.arrayContaining(["lunar-greenhouses", "optics-grinding-line"]),
    );
    expect(designOf("vault-cistern").prerequisiteDesignIds).toEqual(
      expect.arrayContaining([
        "growing-halls",
        "buried-habitat",
        "bulk-supply-tanks",
      ]),
    );
  });

  it("adds no Export, and neither Structure makes anything to sell", () => {
    for (const type of [hall, cistern]) {
      for (const recipe of type.recipes ?? []) {
        expect(recipe.outputs).toEqual([]);
      }
    }
    expect(catalogue.exports.map(({ resourceId }) => resourceId)).toEqual([
      "wafers",
      "circuit-boards",
      "metals",
      "propellant",
      "precision-optics",
    ]);
  });

  it("has a growing hall take less water for each Science than a Greenhouse, and a longer round to lose", () => {
    const greenhouse = typeOf("greenhouse");
    const kilogramsPerScience = (type: typeof hall) =>
      ((type.recipes?.[0]?.inputs[0]?.kilogramsPerHour ?? 0) *
        (type.growing?.lengthHours ?? 0)) /
      (type.growing?.science ?? 1);

    expect(kilogramsPerScience(hall)).toBeLessThan(
      kilogramsPerScience(greenhouse),
    );
    expect(hall.growing?.lengthHours ?? 0).toBeGreaterThan(
      catalogue.lunation.nightEarthDays * 24,
    );
  });

  it("has a vault cistern hold more water than the base and one water tank can", () => {
    const own =
      catalogue.lifeSupportStocks.find(({ id }) => id === "water")
        ?.storageLimitKilograms ?? 0;
    const tank = typeOf("water-tank").storageTank?.kilograms ?? 0;

    expect(cistern.waterWall?.kilograms ?? 0).toBeGreaterThan(own + tank);
    expect(cistern.waterWall?.kilograms ?? 0).toBeLessThan(own + 2 * tank);
  });
});

describe("a growing hall", () => {
  it("earns its Science by rounds for its water, and tells the player what it is", () => {
    const base = baseWith(400);
    const placed = base.planConstruction({
      structureTypeId: "growing-hall",
      position: { x: 60, y: 60 },
    });
    if (!placed.ok) throw new Error(placed.message);
    runUntilBuilt(base, "growing-hall");

    const growing = hall.growing;
    if (growing === undefined) throw new Error("expected rounds of growing");
    const watered = withWater(base, 1200);
    const before = watered.snapshot().science;
    const events = watered.advance(growing.lengthHours * 60 + 60);

    const rounds = events.filter(
      (event) => event.kind === "greenhouse-round-completed",
    );
    expect(rounds).toHaveLength(1);
    expect(watered.snapshot().science).toBe(before + growing.science);
    const [round] = rounds;
    if (round === undefined) throw new Error("expected a round");
    expect(formatEvent(round)).toContain("Growing hall");
    expect(formatEvent(round)).not.toContain("Greenhouse");
  });
});

describe("a vault cistern", () => {
  it("can't go over anything but a Buried Habitat, and an ordinary water wall still can't go over that", () => {
    const base = baseWith(2200);

    expect(
      base.planConstruction({
        structureTypeId: "vault-cistern",
        position: buriedHabitatSites.waterWalledHabitat,
      }),
    ).toMatchObject({ ok: false, reason: "not-on-buried-habitat" });
    expect(
      base.planConstruction({
        structureTypeId: "vault-cistern",
        position: { x: 80, y: 80 },
      }),
    ).toMatchObject({ ok: false, reason: "not-on-buried-habitat" });
    expect(
      base.planConstruction({ structureTypeId: "water-wall", position: site }),
    ).toMatchObject({ ok: false, reason: "habitat-buried" });
  });

  it("waits for its water, saying so, and that the base can't hold that much without more tanks", () => {
    const base = baseWith(1000);
    const planned = base.planConstruction({
      structureTypeId: "vault-cistern",
      position: site,
    });
    if (!planned.ok) throw new Error(planned.message);

    let waiting;
    for (let hours = 0; waiting === undefined; hours++) {
      if (hours > 30 * 24) throw new Error("It never came to its water.");
      base.advance(60);
      const found = base.snapshot().constructions[0]?.waiting;
      if (found?.reason === "water-reserve") waiting = found;
    }

    expect(waiting.missingKilograms).toBeGreaterThan(0);
    const said = formatWaiting(waiting);
    expect(said).toContain("more water");
    expect(said).toContain("the base can hold only 400 kg");
    expect(said).toContain("water tank");
  });

  it("takes all its water at once, cuts the dose rate in a Buried Habitat, and gives that up when Broken", () => {
    const tanked = baseWith(400);
    for (const position of [
      { x: 80, y: 20 },
      { x: 90, y: 20 },
    ]) {
      const planned = tanked.planConstruction({
        structureTypeId: "water-tank",
        position,
      });
      if (!planned.ok) throw new Error(planned.message);
    }
    for (let hours = 0; tanked.snapshot().constructions.length > 0; hours++) {
      if (hours > 20 * 24) throw new Error("The tanks never finished.");
      tanked.advance(60);
    }
    moveIn(tanked, "buried-habitat");
    expect(tanked.forecasts().radiationDose.millisievertsPerEarthDay).toBe(
      rates.buriedHabitat,
    );

    const needed = cistern.waterWall?.kilograms ?? 0;
    const base = withWater(tanked, needed + 100);
    const planned = base.planConstruction({
      structureTypeId: "vault-cistern",
      position: site,
    });
    if (!planned.ok) throw new Error(planned.message);
    const before = water(base.snapshot());
    runUntilBuilt(base, "vault-cistern");

    expect(water(base.snapshot())).toBeLessThan(before - needed + 1);
    expect(base.forecasts().radiationDose.millisievertsPerEarthDay).toBe(
      rates.cisternedBuriedHabitat,
    );
    expect(rates.cisternedBuriedHabitat).toBeLessThan(rates.buriedHabitat);
    const home = ofType(base, "buried-habitat");
    expect(home.waterWalled).toBe(true);
    const lines = structureDetails(base.snapshot(), home.id)?.lines;
    expect(
      lines?.find(({ label }) => label === "Shielding")?.stat.value,
    ).toContain("a vault cistern");
    expect(
      lines?.find(({ label }) => label === "Dose rate")?.stat.value,
    ).toContain(String(rates.cisternedBuriedHabitat));

    // The Buried Habitat can't be taken apart from under it.
    const moved = base.moveMissionDirectorIn(
      ofType(base, "buried-habitat").id === home.id
        ? (base
            .snapshot()
            .structures.find(
              ({ position }) =>
                position.x === buriedHabitatSites.bareHabitat.x &&
                position.y === buriedHabitatSites.bareHabitat.y,
            )?.id ?? "")
        : "",
    );
    if (!moved.ok) throw new Error(moved.message);
    expect(base.dismantleStructure(home.id)).toMatchObject({
      ok: false,
      message: expect.stringContaining("vault cistern") as string,
    });

    // Broken, it protects no more than the Buried Habitat alone.
    const back = base.moveMissionDirectorIn(home.id);
    if (!back.ok) throw new Error(back.message);
    const cisternId = ofType(base, "vault-cistern").id;
    const broken = changed(base, (state) => {
      for (const structure of state.structures) {
        if (structure.id === cisternId) structure.conditionPercent = 0;
      }
    });
    expect(broken.forecasts().radiationDose.millisievertsPerEarthDay).toBe(
      rates.buriedHabitat,
    );
  });

  it("is described as going over a Buried Habitat, and a save holding one loads", () => {
    expect(describeStructure(cistern)).toContain("Buried Habitat");
    expect(describeStructure(cistern)).toContain(
      `${cistern.waterWall?.kilograms ?? 0} kg of water`,
    );
    const base = baseWith(2200);
    expect(loadCampaign(base.save()).ok).toBe(true);
  });
});
