import { describe, expect, it, vi } from "vitest";
import {
  catalogue,
  componentOutputs,
  resourceOutputs,
  type Catalogue,
  type PlantRecipe,
} from "../src/catalogue";
import {
  loadCampaign,
  type Campaign,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { readSaveDocument } from "../src/simulation/save";
import { watchSpareComponents } from "../src/simulation/spare-forecast";
import { describeStructure } from "../src/ui/describe";
import {
  formatSpareComponents,
  summariseStock,
} from "../src/ui/status-panel-text";
import { formatPlant, formatPlantRates } from "../src/ui/structure-state";
import { scenario } from "./scenario";
import { changed, worn, type SavedState } from "./worn";

// A Workshop's Components and Design aren't in the starting stock: a test gives
// them, or the whole path earns and ships them. Nothing strikes or freezes, the
// Robot digs no Regolith, and the Mission Director comes to no harm in the
// Habitat, so that only what a test does changes what is made and used.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutDigging } = await import("./without-digging");
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  const { withoutCold } = await import("./without-cold");
  const { safeHabitat } = await import("./safe-habitat");
  return {
    ...actual,
    catalogue: safeHabitat(
      withoutCold(withoutMicrometeorites(withoutDigging(actual.catalogue))),
      ["power", "radiation", "life-support", "solar-particle-events"],
    ),
  };
});

const type = catalogue.structureTypes.find(({ id }) => id === "workshop");
const recipe: PlantRecipe | undefined = type?.recipes?.[0];
if (type === undefined || recipe === undefined) {
  throw new Error("expected a Workshop");
}
const { designId, components: workshopComponents } = type;
const { spareComponentId } = catalogue.maintenance;
const batchHours = recipe.batchHours ?? 1;
const batchMinutes = batchHours * 60;
const metalsPerBatch =
  (recipe.inputs.find(
    (flow) =>
      flow.resource.kind === "bulk-resource" &&
      flow.resource.resourceId === "metals",
  )?.kilogramsPerHour ?? Number.NaN) * batchHours;
const sparesPerBatch =
  componentOutputs(recipe).find(
    (output) => output.componentId === spareComponentId,
  )?.count ?? Number.NaN;
const metalsInWords = Number(metalsPerBatch.toFixed(2));

const arraySite: GroundPosition = { x: 40, y: 25 };
const workshopSite: GroundPosition = { x: 50, y: 25 };
const secondWorkshopSite: GroundPosition = { x: 58, y: 25 };
const habitatSite: GroundPosition = { x: 40, y: 12 };
const bankSite: GroundPosition = { x: 40, y: 37 };

interface EditedState extends SavedState {
  unlockedDesignIds: string[];
}

function spares(state: Snapshot): number {
  return (
    state.stockpile.components.find(
      (stock) => stock.componentId === spareComponentId,
    )?.count ?? Number.NaN
  );
}

function metals(state: Snapshot): number {
  return (
    state.bulkResources.find((stock) => stock.resourceId === "metals")
      ?.kilograms ?? Number.NaN
  );
}

function workshopOf(state: Snapshot): StructureSnapshot {
  const workshop = state.structures.find(
    (structure) => structure.structureTypeId === "workshop",
  );
  if (workshop === undefined) throw new Error("expected a Workshop");
  return workshop;
}

function buildAll(campaign: Campaign): Campaign {
  for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    campaign.advance(60);
  }
  return campaign;
}

function plan(
  campaign: Campaign,
  structureTypeId: string,
  position: GroundPosition,
): void {
  const planned = campaign.planConstruction({ structureTypeId, position });
  if (!planned.ok) throw new Error(planned.message);
}

/** The Campaign with these many kilograms of metals in stock, as a Plant would have made. */
function withMetals(campaign: Campaign, kilograms: number): Campaign {
  return changed(campaign, (state) => {
    for (const stock of state.bulkResources) {
      if (stock.resourceId === "metals") stock.kilograms = kilograms;
    }
  });
}

/** The Campaign with the Workshop's Design unlocked and its Components in stock, as a Launch would have brought. */
function withWorkshopKit(campaign: Campaign, kits = 1): Campaign {
  return changed(campaign, (raw) => {
    const state = raw as EditedState;
    state.unlockedDesignIds.push(designId);
    for (const need of workshopComponents) {
      const stock = state.stockpile.components.find(
        (candidate) => candidate.componentId === need.componentId,
      );
      if (stock !== undefined) stock.count += need.count * kits;
    }
  });
}

/**
 * A solar array and a Workshop cabled to it, built in the first Daylight, and
 * as many kilograms of metals as given, with the first minute of a Batch
 * done if there are enough for one.
 */
function workshopBase(kilograms = 100): Campaign {
  const campaign = withWorkshopKit(scenario().campaign);
  plan(campaign, "solar-array", arraySite);
  plan(campaign, "workshop", workshopSite);
  buildAll(campaign);
  const stocked = withMetals(campaign, kilograms);
  stocked.advance(1);
  expect(stocked.snapshot().lunation.part).toBe("daylight");
  return stocked;
}

/** Sets the Robot to work, so that something is wearing down whatever the time. */
function robotAtWork(campaign: Campaign): void {
  plan(campaign, "light-mast", bankSite);
  for (let minutes = 0; forecastOf(campaign).perEarthDay === 0; minutes++) {
    if (minutes > 24 * 60) throw new Error("The Robot never started work.");
    campaign.advance(1);
  }
}

function forecastOf(campaign: Campaign) {
  return campaign.forecasts().spareComponents;
}

/** Runs the game to the first minute of the next Night, or of the next Daylight. */
function runUntil(campaign: Campaign, part: "daylight" | "night"): void {
  do {
    campaign.advance(campaign.snapshot().lunation.minutesRemaining);
  } while (campaign.snapshot().lunation.part !== part);
}

describe("the Workshop's whole path", () => {
  it("is locked, then unlocked, shipped, built, makes spare Components from metals, and Maintenance uses them", () => {
    const game = scenario()
      .plan("solar-array", arraySite)
      .plan("habitat", habitatSite);
    buildAll(game.campaign);
    const habitat = game.state.structures.find(
      (structure) => structure.structureTypeId === "habitat",
    );
    const movedIn = game.campaign.moveMissionDirectorIn(habitat?.id ?? "");
    if (!movedIn.ok) throw new Error(movedIn.message);

    // Locked: neither on the manifest nor in the build menu.
    const items = type.components.map((need) => ({
      itemId: need.componentId,
      count: need.count,
    }));
    expect(game.campaign.setLaunchManifest(items).ok).toBe(false);
    expect(
      game.campaign.planConstruction({
        structureTypeId: "workshop",
        position: workshopSite,
      }).ok,
    ).toBe(false);

    // Unlock it with Science, past the Design it needs first.
    const design = catalogue.designs.find(({ id }) => id === designId);
    expect(design?.scienceCost).toBeGreaterThan(0);
    expect(design?.category).toBe("industry");
    const rich = changed(game.campaign, (state) => {
      state.science = 1000;
      state.fundingMillionDollars = 5000;
    });
    expect(rich.unlockDesign(designId).ok).toBe(false);
    for (const needed of design?.prerequisiteDesignIds ?? []) {
      if (!rich.snapshot().unlockedDesignIds.includes(needed)) {
        const unlocked = rich.unlockDesign(needed);
        if (!unlocked.ok) throw new Error(unlocked.message);
      }
    }
    const unlocked = rich.unlockDesign(designId);
    if (!unlocked.ok) throw new Error(unlocked.message);

    // Ship it.
    const manifest = rich.setLaunchManifest(items);
    if (!manifest.ok) throw new Error(manifest.message);
    const sent = rich.sendLander();
    if (!sent.ok) throw new Error(sent.message);
    for (
      let hours = 0;
      rich.snapshot().lander.state !== "landed-free";
      hours++
    ) {
      if (hours > 20 * 24) throw new Error("The Lander never came back.");
      rich.advance(60);
    }
    for (const need of type.components) {
      expect(
        rich
          .snapshot()
          .stockpile.components.find(
            (stock) => stock.componentId === need.componentId,
          )?.count,
      ).toBe(need.count);
    }

    // Build it, on metals the extraction plant would have made.
    plan(rich, "workshop", workshopSite);
    buildAll(rich);
    const campaign = changed(withMetals(rich, 50), (state) => {
      for (const stock of state.stockpile.components) {
        if (stock.componentId === spareComponentId) stock.count = 0;
      }
    });
    if (campaign.snapshot().lunation.part === "night") {
      runUntil(campaign, "daylight");
    }

    // It makes spare Components from metals, a whole Batch at a time.
    campaign.advance(1);
    expect(workshopOf(campaign.snapshot()).plant?.running).toBe(true);
    const before = metals(campaign.snapshot());
    campaign.advance(3 * batchMinutes);
    const made = spares(campaign.snapshot());
    expect(made).toBeGreaterThanOrEqual(3 * sparesPerBatch);
    expect(metals(campaign.snapshot())).toBeCloseTo(
      before - 3 * metalsPerBatch,
      6,
    );

    // Maintenance uses them.
    const array = campaign
      .snapshot()
      .structures.find(
        (structure) => structure.structureTypeId === "solar-array",
      );
    const repaired = worn(campaign, array?.id ?? "", 60);
    const stockBefore = spares(repaired.snapshot());
    const need = Math.ceil(
      40 / catalogue.maintenance.conditionPercentPerSpareComponent,
    );
    for (
      let hours = 0;
      (repaired
        .snapshot()
        .structures.find((structure) => structure.id === array?.id)
        ?.conditionPercent ?? 0) < 90;
      hours++
    ) {
      if (hours > 5 * 24) throw new Error("Maintenance never finished.");
      repaired.advance(60);
    }
    // Used, though the Workshop may have made one meanwhile.
    expect(spares(repaired.snapshot())).toBeLessThanOrEqual(
      stockBefore - need + 2 * sparesPerBatch,
    );
  });
});

describe("a Workshop's Batches", () => {
  it("takes a whole Batch's metals as it starts, and adds its spare Components only as it finishes", () => {
    const campaign = workshopBase();
    const start = campaign.snapshot();
    expect(workshopOf(start)).toMatchObject({
      powered: true,
      plant: { running: true, stoppedFor: undefined },
    });
    expect(metals(start)).toBeCloseTo(100 - metalsPerBatch, 6);
    const stock = spares(start);

    campaign.advance(batchMinutes - 2);
    expect(spares(campaign.snapshot())).toBe(stock);
    expect(workshopOf(campaign.snapshot()).plant?.batch).toMatchObject({
      minutesLeft: 1,
    });

    campaign.advance(1);
    const finished = campaign.snapshot();
    expect(spares(finished)).toBe(stock + sparesPerBatch);
    expect(Number.isInteger(spares(finished))).toBe(true);
    expect(workshopOf(finished).plant?.batch).toBeUndefined();
    expect(metals(finished)).toBeCloseTo(100 - metalsPerBatch, 6);

    // The next one starts straight after.
    campaign.advance(1);
    expect(metals(campaign.snapshot())).toBeCloseTo(
      100 - 2 * metalsPerBatch,
      6,
    );
  });

  it("waits with too little metals for a Batch, saying how much there is, and starts once there is enough", () => {
    const campaign = workshopBase(metalsPerBatch / 2);
    const state = campaign.snapshot();
    const { plant } = workshopOf(state);

    expect(plant?.running).toBe(false);
    expect(plant?.stoppedFor).toEqual({
      reason: "no-input",
      resource: { kind: "bulk-resource", resourceId: "metals" },
      kilograms: metalsPerBatch / 2,
      kilogramsNeeded: metalsPerBatch,
    });
    expect(formatPlant(plant ?? expect.fail("expected a Plant"))).toBe(
      `waiting for Metals: ${metalsInWords / 2} of ${metalsInWords} kg`,
    );

    const fed = withMetals(campaign, metalsPerBatch);
    fed.advance(1);
    expect(workshopOf(fed.snapshot()).plant?.running).toBe(true);
    expect(metals(fed.snapshot())).toBeCloseTo(0, 6);
  });

  it("starts its Batch after a Plant commissioned before it when both want the last metals", () => {
    const campaign = withWorkshopKit(scenario().campaign, 2);
    plan(campaign, "solar-array", arraySite);
    plan(campaign, "workshop", workshopSite);
    plan(campaign, "workshop", secondWorkshopSite);
    buildAll(campaign);
    const stocked = withMetals(campaign, metalsPerBatch);
    stocked.advance(1);

    const [first, second] = stocked
      .snapshot()
      .structures.filter(
        (structure) => structure.structureTypeId === "workshop",
      );
    expect(first?.plant?.running).toBe(true);
    expect(second?.plant?.stoppedFor?.reason).toBe("no-input");
  });

  it("uses only power nothing else needs: it waits while a battery bank charges, and takes no metals until it starts", () => {
    const campaign = withWorkshopKit(scenario().campaign);
    plan(campaign, "solar-array", arraySite);
    plan(campaign, "battery-bank", bankSite);
    plan(campaign, "workshop", workshopSite);
    buildAll(campaign);
    const uncharged = changed(withMetals(campaign, 100), (state) => {
      for (const structure of state.structures) {
        structure.storedKilowattHours = 0;
      }
    });
    uncharged.advance(1);

    const waiting = workshopOf(uncharged.snapshot());
    expect(waiting.plant?.running).toBe(false);
    expect(waiting.plant?.stoppedFor?.reason).toBe("no-power");
    expect(metals(uncharged.snapshot())).toBe(100);

    for (
      let hours = 0;
      workshopOf(uncharged.snapshot()).plant?.running !== true;
      hours++
    ) {
      if (hours > 2 * 24) throw new Error("It never started.");
      uncharged.advance(60);
    }
    expect(metals(uncharged.snapshot())).toBeCloseTo(100 - metalsPerBatch, 6);
  });

  it("is supplied in the order Plants were commissioned when the power to spare won't run them all", () => {
    const campaign = withWorkshopKit(scenario().campaign, 2);
    plan(campaign, "solar-array", arraySite);
    plan(campaign, "workshop", workshopSite);
    plan(campaign, "workshop", secondWorkshopSite);
    buildAll(campaign);
    const array = campaign
      .snapshot()
      .structures.find(
        (structure) => structure.structureTypeId === "solar-array",
      );
    // Worn so far that it makes enough for one, with no spares to repair it.
    const stocked = worn(withMetals(campaign, 100), array?.id ?? "", 15, 0);
    stocked.advance(1);

    const [first, second] = stocked
      .snapshot()
      .structures.filter(
        (structure) => structure.structureTypeId === "workshop",
      );
    expect(first?.plant?.running).toBe(true);
    expect(second?.plant?.stoppedFor?.reason).toBe("no-power");
    // A Workshop's metals taken for its Batch, and not a second's.
    expect(metals(stocked.snapshot())).toBeLessThanOrEqual(
      100 - metalsPerBatch,
    );
  });

  it("stands idle at Night with no stored power to spare, keeping the work done on its Batch for the next Daylight", () => {
    const campaign = workshopBase();
    const { minutesRemaining } = campaign.snapshot().lunation;
    // Stop part-way through a Batch as Night falls.
    runUntil(campaign, "night");
    campaign.advance(5);
    const night = workshopOf(campaign.snapshot());
    expect(night.plant?.running).toBe(false);
    expect(night.plant?.stoppedFor?.reason).toBe("night");
    const stock = spares(campaign.snapshot());
    const left = night.plant?.batch?.minutesLeft ?? Number.NaN;
    expect(left).toBeGreaterThan(0);
    expect(minutesRemaining).toBeGreaterThan(0);

    campaign.advance(24 * 60);
    expect(spares(campaign.snapshot())).toBe(stock);
    expect(workshopOf(campaign.snapshot()).plant?.batch?.minutesLeft).toBe(
      left,
    );

    runUntil(campaign, "daylight");
    campaign.advance(left);
    expect(spares(campaign.snapshot())).toBe(stock + sparesPerBatch);
  });

  it("finishes the Batch it has started when switched off, then starts no other, until switched on", () => {
    const campaign = workshopBase();
    const { id } = workshopOf(campaign.snapshot());
    const stock = spares(campaign.snapshot());
    const taken = metals(campaign.snapshot());

    const off = campaign.switchPlant(id, "off");
    if (!off.ok) throw new Error(off.message);
    const last = workshopOf(campaign.snapshot());
    expect(
      formatPlant(last.plant ?? expect.fail("expected a Plant"), true),
    ).toMatch(/its last batch before switching off$/);
    campaign.advance(batchMinutes);

    expect(spares(campaign.snapshot())).toBe(stock + sparesPerBatch);
    campaign.advance(batchMinutes);
    expect(spares(campaign.snapshot())).toBe(stock + sparesPerBatch);
    expect(metals(campaign.snapshot())).toBeCloseTo(taken, 6);
    expect(workshopOf(campaign.snapshot()).plant?.stoppedFor).toEqual({
      reason: "switched-off",
    });

    const on = campaign.switchPlant(id, "on");
    if (!on.ok) throw new Error(on.message);
    campaign.advance(1);
    expect(metals(campaign.snapshot())).toBeCloseTo(taken - metalsPerBatch, 6);
  });

  it("runs slower below the performance threshold, and its Batch waits while it is Broken", () => {
    const campaign = workshopBase();
    const { id } = workshopOf(campaign.snapshot());
    const slowed = worn(campaign, id, 25, 0);
    slowed.advance(1);
    const { performance, plant } = workshopOf(slowed.snapshot());

    expect(performance).toBeLessThan(1);
    expect(plant?.batch?.minutesLeft).toBeGreaterThan(batchMinutes);
    const rate = formatPlantRates(workshopOf(slowed.snapshot()));
    expect(rate).toContain("spare Component");

    const broken = worn(slowed, id, 0, 0);
    const left = workshopOf(broken.snapshot()).plant?.batch?.minutesLeft;
    broken.advance(batchMinutes);
    expect(spares(broken.snapshot())).toBe(0);
    expect(workshopOf(broken.snapshot()).plant?.batch?.minutesLeft).toBe(left);
  });

  it("loses the Batch it has started if dismantled: neither the metals nor a spare Component come", () => {
    const campaign = workshopBase();
    const { id } = workshopOf(campaign.snapshot());
    const stock = spares(campaign.snapshot());
    const taken = metals(campaign.snapshot());
    const dismantled = campaign.dismantleStructure(id);
    if (!dismantled.ok) throw new Error(dismantled.message);

    for (
      let hours = 0;
      campaign
        .snapshot()
        .structures.some(
          (structure) => structure.structureTypeId === "workshop",
        );
      hours++
    ) {
      if (hours > 2 * 24) throw new Error("It was never dismantled.");
      campaign.advance(10);
    }
    const lost = spares(campaign.snapshot());
    // At most what it had finished before the Robot started on it.
    campaign.advance(batchMinutes);
    expect(spares(campaign.snapshot())).toBe(lost);
    expect(metals(campaign.snapshot())).toBeLessThanOrEqual(taken);
    expect(lost - stock).toBeLessThanOrEqual(sparesPerBatch);
  });

  it("is a Plant the player can see the output of, in words", () => {
    const campaign = workshopBase();
    const workshop = workshopOf(campaign.snapshot());

    expect(formatPlantRates(workshop)).toBe(
      `making ${sparesPerBatch} spare Component every ${batchHours} hours from ${metalsInWords} kg of metals`,
    );
    expect(describeStructure(type)).toContain(
      `turning ${metalsInWords} kg of metals into ${sparesPerBatch} spare Component every ${batchHours} hours`,
    );
    expect(describeStructure(type)).toContain("draws");
    expect(resourceOutputs(recipe)).toEqual([]);
  });
});

describe("saving a Workshop mid-Batch", () => {
  it("round-trips the Batch, and its output arrives after loading, with no change to the format", () => {
    const campaign = workshopBase();
    campaign.advance(batchMinutes / 2);
    const before = campaign.snapshot();
    const { plant } = workshopOf(before);
    const left = plant?.batch?.minutesLeft ?? Number.NaN;
    expect(left).toBeGreaterThan(0);

    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);
    const after = loaded.campaign;
    expect(workshopOf(after.snapshot()).plant?.batch).toEqual(plant?.batch);
    expect(after.save()).toBe(campaign.save());

    after.advance(left - 1);
    expect(spares(after.snapshot())).toBe(spares(before));
    after.advance(1);
    expect(spares(after.snapshot())).toBe(spares(before) + sparesPerBatch);
  });
});

describe("the spare Components forecast with a Workshop", () => {
  const forecast = forecastOf;

  it("counts what a running Workshop makes, as what is rising, with the stock a Batch late so that it never runs ahead", () => {
    const campaign = workshopBase();
    const start = forecast(campaign);

    expect(start.madePerEarthDay).toBeCloseTo(
      (24 / batchHours) * sparesPerBatch,
      9,
    );
    expect(start.madePerEarthDay).toBeGreaterThan(start.perEarthDay);
    expect(start.minutesUntilEmpty).toBeUndefined();
    const line = formatSpareComponents(start);
    expect(line.note).toBe(
      `rising ${(start.madePerEarthDay - start.perEarthDay).toFixed(1)} a day`,
    );
    expect(summariseStock(start)).toMatch(/spares?, rising$/);
  });

  it("gives a time that doesn't jump as a Batch finishes, as what the Batch makes counts only as it is made", () => {
    // Wear far beyond what a Workshop makes, so that it gives a time.
    const campaign = changed(workshopBase(), (state) => {
      for (const structure of state.structures) {
        structure.conditionPercent = 100;
      }
    });
    const countedAt = (minute: number) => {
      campaign.advance(minute);
      const read = readSaveDocument(campaign.save());
      if (!read.ok) throw new Error(read.message);
      const { state } = read;
      const workshop = state.structures.find(
        (structure) => structure.structureTypeId === "workshop",
      );
      return {
        worked: workshop?.batch?.minutesWorked,
        inStock: forecast(campaign).inStock,
        counted: forecast(campaign).countedOn,
      };
    };
    const early = countedAt(1);
    const late = countedAt(batchMinutes / 2);

    // Half-way through, half the Batch's spare counts, not the whole of it.
    expect(late.inStock).toBe(early.inStock);
    expect(late.counted).toBeGreaterThan(early.counted);
    expect(late.counted).toBeLessThan(late.inStock);
    expect(early.counted).toBeLessThan(early.inStock);
  });

  it("counts on nothing from one switched off, even finishing its last Batch", () => {
    const campaign = workshopBase();
    const { id } = workshopOf(campaign.snapshot());
    const off = campaign.switchPlant(id, "off");
    if (!off.ok) throw new Error(off.message);

    const shown = forecast(campaign);
    expect(shown.madePerEarthDay).toBe(0);
    expect(shown.countedOn).toBe(shown.inStock);
  });

  it("counts on nothing from one with no metals, by Night or Daylight", () => {
    const campaign = workshopBase(0);
    const daylight = forecast(campaign);
    expect(daylight.madePerEarthDay).toBe(0);
    expect(daylight.minutesUntilEmpty).toBeDefined();
    expect(formatSpareComponents(daylight).note).toMatch(/^last /);

    runUntil(campaign, "night");
    campaign.advance(5);
    robotAtWork(campaign);
    const night = forecast(campaign);
    expect(night.madePerEarthDay).toBe(0);
    expect(night.minutesUntilEmpty).toBeDefined();
  });

  it("counts on none through the Night ahead, so that a stock too small to last it says so while rising", () => {
    // A Dust-worn base with too few spares for the Night, as a sharp rise in
    // wear would leave it.
    const campaign = changed(workshopBase(), (state) => {
      for (const stock of state.stockpile.components) {
        if (stock.componentId === spareComponentId) stock.count = 0;
      }
    });
    campaign.advance(1);
    const shown = forecast(campaign);
    expect(shown.madePerEarthDay).toBeGreaterThan(shown.perEarthDay);
    // None in stock, and the first of the Workshop's still a Batch away.
    expect(shown.minutesUntilEmpty).toBe(0);
    expect(formatSpareComponents(shown).note).toMatch(
      /^rising [\d.]+ a day, but too few for the wear until a batch finishes$/,
    );
  });

  it("at Night looks only as far as the next Daylight, when the Workshop that would make more starts again", () => {
    const campaign = workshopBase();
    runUntil(campaign, "night");
    campaign.advance(5);
    robotAtWork(campaign);
    const shown = forecast(campaign);

    // It holds plenty for the Night's wear, so it says so rather than a time.
    expect(shown.madePerEarthDay).toBe(0);
    expect(shown.minutesUntilEmpty).toBeUndefined();
    expect(shown.perEarthDay).toBeGreaterThan(0);
    expect(formatSpareComponents(shown).note).toBe("enough until Daylight");
  });

  it("gives warnings again once a Workshop's spare Component joins the stock, as a Launch's do", () => {
    const campaign = workshopBase();
    const read = readSaveDocument(campaign.save());
    if (!read.ok) throw new Error(read.message);
    const { state } = read;
    const stock = state.stockpile.components.find(
      (candidate) => candidate.componentId === spareComponentId,
    );
    if (stock === undefined) throw new Error("expected spare Components");
    stock.count = 1;
    state.spareComponentsWarnedMinutes = 24 * 60;
    const before = {
      inStock: 1,
      forPendingRepairs: 0,
      perEarthDay: 0,
      madePerEarthDay: 0,
      countedOn: 1,
      minutesUntilEmpty: undefined,
    };

    stock.count = 1 + sparesPerBatch;
    watchSpareComponents(state, before);

    expect(state.spareComponentsWarnedMinutes).toBeUndefined();
  });

  it("clears the warned state by the game itself as a Batch finishes", () => {
    const campaign = workshopBase();
    const armed = changed(campaign, (raw) => {
      (
        raw as unknown as { spareComponentsWarnedMinutes: number }
      ).spareComponentsWarnedMinutes = 24 * 60;
    });
    armed.advance(batchMinutes);
    const document = JSON.parse(armed.save()) as {
      state: { spareComponentsWarnedMinutes: number | null };
    };
    expect(document.state.spareComponentsWarnedMinutes).toBeNull();
  });
});
