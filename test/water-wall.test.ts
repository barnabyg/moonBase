import { describe, expect, it, vi } from "vitest";
import {
  catalogue,
  type Catalogue,
  type StructureType,
} from "../src/catalogue";
import {
  createCampaign,
  loadCampaign,
  type Campaign,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { unlock } from "./designs";
import { DEFAULT_SEED } from "./scenario";
import { changed, worn, type SavedState } from "./worn";

// The Habitat needs no power and no Solar Particle Event comes, so that the
// Mission Director lives in it for as long as a test runs and the Radiation
// Dose rises only at its usual rate; the Robot and the excavator stand idle
// rather than digging Regolith.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutDigging } = await import("./without-digging");
  const { safeHabitat } = await import("./safe-habitat");
  return {
    ...actual,
    catalogue: safeHabitat(withoutDigging(actual.catalogue), [
      "power",
      "solar-particle-events",
    ]),
  };
});

function waterWallType(): StructureType & {
  readonly waterWall: NonNullable<StructureType["waterWall"]>;
} {
  const type = catalogue.structureTypes.find(
    (candidate) => candidate.waterWall !== undefined,
  );
  if (type?.waterWall === undefined) throw new Error("expected a water wall");
  return { ...type, waterWall: type.waterWall };
}
const wall = waterWallType();
const { stockId: waterStockId, kilograms: fillKilograms } = wall.waterWall;
const waterUsePerEarthDay =
  catalogue.lifeSupportStocks.find((stock) => stock.id === waterStockId)
    ?.usePerEarthDayKilograms ?? Number.NaN;
const reserveKilograms = wall.waterWall.reserveEarthDays * waterUsePerEarthDay;
const rates = catalogue.radiation.doseRateMillisievertsPerEarthDay;

const habitatSite: GroundPosition = { x: 25, y: -20 };
/** On the Habitat's footprint, but not at its centre. */
const onTheHabitat: GroundPosition = { x: 27, y: -18.5 };

function runUntil(
  campaign: Campaign,
  done: (state: Snapshot) => boolean,
  limitHours = 20 * 24,
): void {
  for (let hours = 0; !done(campaign.snapshot()); hours++) {
    if (hours > limitHours) throw new Error("It never happened.");
    campaign.advance(60);
  }
}

function plan(
  campaign: Campaign,
  structureTypeId: string,
  position: GroundPosition,
): string {
  const result = campaign.planConstruction({ structureTypeId, position });
  if (!result.ok) throw new Error(result.message);
  return result.constructionId;
}

function waterInStock(state: Snapshot): number {
  return (
    state.lifeSupport.find((stock) => stock.stockId === waterStockId)
      ?.kilograms ?? Number.NaN
  );
}

function withWater(kilograms: number) {
  return (state: SavedState) => {
    for (const stock of state.lifeSupport) {
      if (stock.stockId === waterStockId) stock.kilograms = kilograms;
    }
  };
}

function withBladders(state: SavedState): void {
  for (const need of wall.components) {
    const stock = state.stockpile.components.find(
      (candidate) => candidate.componentId === need.componentId,
    );
    if (stock !== undefined) stock.count += need.count;
  }
}

/**
 * The saved text of a base whose Habitat has commissioned Regolith shielding
 * over it, with the Mission Director living in it, and, if asked, Water-wall
 * shielding unlocked. Built once for each, and loaded afresh for each test.
 */
const bases = new Map<boolean, string>();
function shieldedBase(unlocked = true): Campaign {
  let text = bases.get(unlocked);
  if (text === undefined) {
    const campaign = createCampaign({ seed: DEFAULT_SEED });
    const habitatId = plan(campaign, "habitat", habitatSite);
    runUntil(campaign, (state) => state.constructions.length === 0);
    plan(campaign, "regolith-shielding", habitatSite);
    runUntil(campaign, (state) => state.constructions.length === 0);
    const movedIn = campaign.moveMissionDirectorIn(habitatId);
    if (!movedIn.ok) throw new Error(movedIn.message);
    if (unlocked) unlock(campaign, wall.designId);
    text = campaign.save();
    bases.set(unlocked, text);
  }
  const loaded = loadCampaign(text);
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.campaign;
}

/** A shielded base with the water wall's Components in stock and the water given. */
function readyBase(water: number): Campaign {
  return changed(shieldedBase(), (state) => {
    withBladders(state);
    withWater(water)(state);
  });
}

function habitatOf(state: Snapshot): StructureSnapshot {
  const habitat = state.structures.find(
    (structure) => structure.structureTypeId === "habitat",
  );
  if (habitat === undefined) throw new Error("expected a Habitat");
  return habitat;
}

function doseOverAnEarthDay(campaign: Campaign): number {
  const before = campaign.snapshot().radiationDoseMillisieverts;
  campaign.advance(24 * 60);
  return campaign.snapshot().radiationDoseMillisieverts - before;
}

describe("planning a water wall", () => {
  it("is refused until Water-wall shielding is unlocked, naming the Design", () => {
    const campaign = shieldedBase(false);

    expect(
      campaign.planConstruction({
        structureTypeId: wall.id,
        position: habitatSite,
      }),
    ).toMatchObject({ ok: false, reason: "design-locked" });
  });

  it("is refused anywhere but over a commissioned Habitat with commissioned Regolith shielding, saying why", () => {
    const refusal = {
      ok: false,
      reason: "not-on-shielded-habitat",
      message: `The ${wall.label.toLowerCase()} can only be built over a commissioned Habitat with commissioned Regolith shielding over it.`,
    };
    const placeWall = (campaign: Campaign, position: GroundPosition) =>
      campaign.planConstruction({ structureTypeId: wall.id, position });

    expect(placeWall(shieldedBase(), { x: -40, y: 30 })).toEqual(refusal);

    // A commissioned Habitat with no shielding, then with its shielding
    // only planned.
    const campaign = createCampaign({ seed: DEFAULT_SEED });
    plan(campaign, "habitat", habitatSite);
    runUntil(campaign, (state) => state.constructions.length === 0);
    unlock(campaign, wall.designId);
    expect(placeWall(campaign, habitatSite)).toEqual(refusal);
    plan(campaign, "regolith-shielding", habitatSite);
    expect(placeWall(campaign, habitatSite)).toEqual(refusal);
  });

  it("is allowed over a shielded Habitat, overlapping it and its shielding and standing centred on it", () => {
    const campaign = readyBase(1000);

    expect(
      campaign.checkPlacement({
        structureTypeId: wall.id,
        position: onTheHabitat,
      }),
    ).toEqual({ ok: true, position: habitatSite });
    plan(campaign, wall.id, onTheHabitat);
    expect(campaign.snapshot().constructions).toEqual([
      expect.objectContaining({
        structureTypeId: wall.id,
        position: habitatSite,
        stage: "site-preparation",
      }),
    ]);
  });

  it("is refused over a Habitat that has one planned or built already", () => {
    const campaign = readyBase(1000);
    plan(campaign, wall.id, habitatSite);
    const refused = () =>
      campaign.planConstruction({
        structureTypeId: wall.id,
        position: habitatSite,
      });

    expect(refused()).toEqual({
      ok: false,
      reason: "already-water-walled",
      message: `The Habitat's ${wall.label.toLowerCase()} is already planned.`,
    });
    runUntil(campaign, (state) => state.constructions.length === 0);
    expect(refused()).toEqual({
      ok: false,
      reason: "already-water-walled",
      message: `The Habitat already has a ${wall.label.toLowerCase()}.`,
    });
  });
});

describe("building a water wall", () => {
  it("fills it with water from the base's stock as Assembly starts, besides what the Mission Director drinks", () => {
    const water = fillKilograms + reserveKilograms + 100;
    const campaign = readyBase(water);
    const id = plan(campaign, wall.id, habitatSite);
    const drunk = (from: number) =>
      ((campaign.snapshot().clock.elapsedMinutes - from) / (24 * 60)) *
      waterUsePerEarthDay;
    const planned = campaign.snapshot().clock.elapsedMinutes;
    runUntil(
      campaign,
      (state) =>
        state.constructions.find((c) => c.id === id)?.stage ===
        "component-delivery",
    );
    expect(waterInStock(campaign.snapshot())).toBeCloseTo(
      water - drunk(planned),
      6,
    );

    runUntil(campaign, (state) => state.constructions.length === 0);

    expect(waterInStock(campaign.snapshot())).toBeCloseTo(
      water - fillKilograms - drunk(planned),
      6,
    );
    expect(
      campaign.snapshot().structures.some((s) => s.structureTypeId === wall.id),
    ).toBe(true);
  });

  it("waits, saying why, while filling it would leave the Mission Director less than the reserve of water, then goes on once there is enough", () => {
    const water = fillKilograms + reserveKilograms - 20;
    const short = readyBase(water);
    const id = plan(short, wall.id, habitatSite);
    runUntil(
      short,
      (state) =>
        state.constructions.find((c) => c.id === id)?.stage === "assembly",
    );
    short.advance(12 * 60);

    const construction = short
      .snapshot()
      .constructions.find((c) => c.id === id);
    expect(construction).toMatchObject({ stage: "assembly", stageProgress: 0 });
    expect(construction?.waiting).toMatchObject({
      reason: "water-reserve",
      stockId: waterStockId,
    });
    if (construction?.waiting?.reason !== "water-reserve") {
      throw new Error("expected to wait for water");
    }
    expect(construction.waiting.missingKilograms).toBeGreaterThan(20);
    expect(construction.waiting.missingKilograms).toBeLessThan(25);
    expect(waterInStock(short.snapshot())).toBeLessThan(water);

    const topped = changed(short, withWater(water + 100));
    runUntil(topped, (state) => state.constructions.length === 0);
    expect(waterInStock(topped.snapshot())).toBeLessThan(
      water + 100 - fillKilograms,
    );
    expect(topped.snapshot().ended).toBeUndefined();
  });
});

describe("a water-walled Habitat", () => {
  function walled(): { campaign: Campaign; wallId: string } {
    const campaign = readyBase(fillKilograms + reserveKilograms + 100);
    const wallId = plan(campaign, wall.id, habitatSite);
    runUntil(campaign, (state) => state.constructions.length === 0);
    return { campaign, wallId };
  }

  it("is shown as water-walled only once its water wall is commissioned", () => {
    const campaign = readyBase(fillKilograms + reserveKilograms + 100);
    plan(campaign, wall.id, habitatSite);
    expect(habitatOf(campaign.snapshot())).toMatchObject({
      shielded: true,
      waterWalled: false,
    });

    runUntil(campaign, (state) => state.constructions.length === 0);

    const state = campaign.snapshot();
    expect(habitatOf(state)).toMatchObject({
      shielded: true,
      waterWalled: true,
    });
    for (const structure of state.structures) {
      if (structure.structureTypeId !== "habitat") {
        expect(structure.waterWalled).toBe(false);
      }
    }
  });

  it("lets in less radiation than a Habitat with Regolith shielding alone, at the rate the data catalogue sets", () => {
    const shielded = shieldedBase();
    expect(doseOverAnEarthDay(shielded)).toBeCloseTo(rates.shieldedHabitat, 6);

    const { campaign } = walled();
    expect(campaign.forecasts().radiationDose.millisievertsPerEarthDay).toBe(
      rates.waterWalledHabitat,
    );
    expect(doseOverAnEarthDay(campaign)).toBeCloseTo(
      rates.waterWalledHabitat,
      6,
    );
    expect(rates.waterWalledHabitat).toBeLessThan(rates.shieldedHabitat);
  });

  it("falls back to the Regolith-shielded rate while its water wall is Broken", () => {
    const { campaign, wallId } = walled();
    const broken = worn(campaign, wallId, 0, 0);

    expect(habitatOf(broken.snapshot())).toMatchObject({
      shielded: true,
      waterWalled: false,
    });
    expect(doseOverAnEarthDay(broken)).toBeCloseTo(rates.shieldedHabitat, 6);
  });

  it("keeps its Regolith shielding from being dismantled while the water wall stands over it", () => {
    const { campaign, wallId } = walled();
    const shielding = campaign
      .snapshot()
      .structures.find((s) => s.structureTypeId === "regolith-shielding");
    if (shielding === undefined) throw new Error("expected shielding");

    expect(campaign.dismantleStructure(shielding.id)).toEqual({
      ok: false,
      message: `Its ${wall.label.toLowerCase()} is over it, and must be dismantled first.`,
    });
    expect(campaign.dismantleStructure(wallId)).toEqual({ ok: true });
  });

  it("is saved and loaded, so that the loaded Campaign carries on exactly as the uninterrupted one does", () => {
    const uninterrupted = readyBase(fillKilograms + reserveKilograms + 100);
    plan(uninterrupted, wall.id, habitatSite);
    uninterrupted.advance(3 * 60);
    const loaded = loadCampaign(uninterrupted.save());
    if (!loaded.ok) throw new Error(loaded.message);

    const later = 2 * 24 * 60;
    const fromSave = loaded.campaign.advance(later);
    const straight = uninterrupted.advance(later);

    expect(fromSave).toEqual(straight);
    expect(loaded.campaign.snapshot()).toEqual(uninterrupted.snapshot());
    expect(habitatOf(uninterrupted.snapshot()).waterWalled).toBe(true);
  });
});
