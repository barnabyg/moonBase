import { describe, expect, it, vi } from "vitest";
import {
  catalogue,
  type Catalogue,
  type StructureType,
} from "../src/catalogue";
import {
  loadCampaign,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { describeStructure } from "../src/ui/describe";
import { structureDetails } from "../src/ui/structure-details";
import { describeStructureEntry } from "../src/ui/structure-state";
import { loadSample } from "./sample-saves";
import { scenario, scenarioOf, type Scenario } from "./scenario";
import { changed, worn } from "./worn";

// A radio telescope array's Design is unlocked from the start, with its
// Components, three antenna fields', two large battery banks', a second solar
// array's and a water-processing plant's in the starting stock. Nothing wears
// down by Dust or Micrometeorites, no Machine draws power for a heater at Night,
// and the Habitat draws none, so that what the base's battery banks do is the
// array's alone.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withDesigns } = await import("./with-designs");
  const { withoutDust } = await import("./without-dust");
  const { withoutCold } = await import("./without-cold");
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  const { withoutDigging } = await import("./without-digging");
  const { safeHabitat } = await import("./safe-habitat");
  const componentsOf = (id: string) =>
    actual.catalogue.structureTypes.find((type) => type.id === id)
      ?.components ?? [];
  const base = withDesigns(
    withoutDigging(
      withoutMicrometeorites(
        withoutCold(
          withoutDust(
            safeHabitat(actual.catalogue, [
              "power",
              "radiation",
              "solar-particle-events",
            ]),
          ),
        ),
      ),
    ),
    ["radio-astronomy", "large-battery-banks", "water-processing"],
  );
  return {
    ...actual,
    catalogue: {
      ...base,
      startingStock: [
        ...base.startingStock,
        ...componentsOf("large-battery-bank"),
        ...componentsOf("large-battery-bank"),
        ...componentsOf("solar-array"),
        ...componentsOf("water-processing-plant"),
        ...componentsOf("radio-telescope-array"),
        ...componentsOf("antenna-field"),
        ...componentsOf("antenna-field"),
        ...componentsOf("antenna-field"),
        {
          componentId: actual.catalogue.maintenance.spareComponentId,
          count: 30,
        },
      ],
    },
  };
});

function structureType(id: string): StructureType {
  const type = catalogue.structureTypes.find(
    (candidate) => candidate.id === id,
  );
  if (type === undefined) throw new Error(`expected a ${id}`);
  return type;
}
const array = structureType("radio-telescope-array");
const field = structureType("antenna-field");
const { radioArray } = array;
if (radioArray === undefined) throw new Error("expected rounds");
const plant = "water-processing-plant";

// Past the quiet radius of the Plant at the base, as in the array's own tests.
const arraySite: GroundPosition = { x: 170, y: 25 };
// Beside the array, 4 m from its footprint.
const fieldSite: GroundPosition = { x: 170, y: 45 };
// Beside the first field, but 24 m from the array's footprint.
const secondFieldSite: GroundPosition = { x: 170, y: 65 };
// Beside the array on the base's side, within the Plant's reach.
const nearPlantFieldSite: GroundPosition = { x: 150, y: 25 };
// Beside nothing.
const farSite: GroundPosition = { x: 170, y: 110 };

function runUntilBuilt(game: Scenario): void {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 15 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
}

function runUntilDismantled(game: Scenario): void {
  for (let hours = 0; game.state.dismantlings.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The dismantling never finished.");
    game.advance({ hours: 1 });
  }
}

function only(state: Snapshot, typeId: string): StructureSnapshot[] {
  return state.structures.filter(
    ({ structureTypeId }) => structureTypeId === typeId,
  );
}

function arrayOf(state: Snapshot): StructureSnapshot {
  const found = only(state, array.id)[0];
  if (found === undefined) throw new Error("expected a radio telescope array");
  return found;
}

/** The Campaign as saved, with full battery banks and every round afresh. */
function charged(game: Scenario): Scenario {
  const full = structureType("large-battery-bank").power.storageKilowattHours;
  return scenarioOf(
    changed(game.campaign, (saved) => {
      for (const structure of saved.structures as unknown as {
        structureTypeId: string;
        storedKilowattHours: number;
        observedMinutes: number;
      }[]) {
        if (structure.structureTypeId === "large-battery-bank") {
          structure.storedKilowattHours = full;
        }
        structure.observedMinutes = 0;
      }
    }),
  );
}

/**
 * Two solar arrays, two large battery banks, a water-processing plant among them
 * and a radio telescope array out past its quiet radius, all commissioned and
 * cabled, with full battery banks and the array's round just begun.
 */
function arrayBase(): Scenario {
  const game = scenario()
    .plan("solar-array", { x: 20, y: 12 })
    .plan("solar-array", { x: 18, y: 28 })
    .plan("large-battery-bank", { x: 30, y: 25 })
    .plan("large-battery-bank", { x: 30, y: 36 })
    .plan(plant, { x: 40, y: 12 })
    .plan(array.id, arraySite);
  runUntilBuilt(game);
  return charged(game);
}

/** The array's base with antenna fields commissioned at the given sites. */
function withFields(...sites: GroundPosition[]): Scenario {
  const game = arrayBase();
  for (const site of sites) game.plan(field.id, site);
  runUntilBuilt(game);
  return charged(game);
}

describe("an antenna field", () => {
  it("is its own Structure of the Radio astronomy Design, with its own Components, a small steady draw and the array's quiet radius, and is no Plant", () => {
    expect(field.designId).toBe("radio-astronomy");
    expect(field.recipes).toBeUndefined();
    expect(field.radioArray).toBeUndefined();
    expect(field.components.map(({ componentId }) => componentId)).toContain(
      "field-receiver",
    );
    expect(field.power.drawKilowatts).toBeGreaterThan(0);
    expect(field.power.drawKilowatts).toBeLessThan(array.power.drawKilowatts);
    expect(field.keepClear).toEqual(array.keepClear);
    expect(field.antennaField).toEqual({ besideWithinMetres: 10 });
  });

  it("costs less by Launch than the array it adds a whole field's Science to", () => {
    const priceOf = (type: StructureType) =>
      type.components.reduce(
        (sum, { componentId, count }) =>
          sum +
          count *
            (catalogue.launch.items.find(
              ({ brings }) =>
                brings.kind === "component" &&
                brings.componentId === componentId,
            )?.priceMillionDollars ?? Infinity),
        0,
      );
    expect(priceOf(field)).toBeLessThan(priceOf(array));
  });
});

describe("placing an antenna field", () => {
  it("is refused with no radio telescope array to join", () => {
    const game = scenario();

    const check = game.campaign.checkPlacement({
      structureTypeId: field.id,
      position: fieldSite,
    });

    expect(check).toMatchObject({
      ok: false,
      reason: "not-beside-radio-array",
      message:
        "An antenna field can only be built beside a commissioned radio telescope array, within 10 m of it or of one of its antenna fields.",
    });
  });

  it("is refused beside nothing, and allowed beside an array or one of its fields, which it joins", () => {
    const game = arrayBase();
    const arrayId = arrayOf(game.state).id;

    expect(
      game.campaign.checkPlacement({
        structureTypeId: field.id,
        position: farSite,
      }),
    ).toMatchObject({ ok: false, reason: "not-beside-radio-array" });
    // Too far from the array alone.
    expect(
      game.campaign.checkPlacement({
        structureTypeId: field.id,
        position: secondFieldSite,
      }),
    ).toMatchObject({ ok: false, reason: "not-beside-radio-array" });
    expect(
      game.campaign.checkPlacement({
        structureTypeId: field.id,
        position: fieldSite,
      }),
    ).toEqual({ ok: true, position: fieldSite, arrayId });

    // Beside a field still being built, which joins the array, it joins too.
    game.plan(field.id, fieldSite);
    expect(
      game.campaign.checkPlacement({
        structureTypeId: field.id,
        position: secondFieldSite,
      }),
    ).toEqual({ ok: true, position: secondFieldSite, arrayId });
  });

  it("is refused beside an array to be dismantled", () => {
    const game = arrayBase();
    const dismantled = game.campaign.dismantleStructure(arrayOf(game.state).id);
    if (!dismantled.ok) throw new Error(dismantled.message);

    expect(
      game.campaign.checkPlacement({
        structureTypeId: field.id,
        position: fieldSite,
      }),
    ).toMatchObject({ ok: false, reason: "not-beside-radio-array" });
  });

  it("is refused while its Design is locked", () => {
    const game = scenarioOf(
      changed(scenario().campaign, (saved) => {
        const unlocked = (saved as unknown as { unlockedDesignIds: string[] })
          .unlockedDesignIds;
        unlocked.splice(unlocked.indexOf("radio-astronomy"), 1);
      }),
    );

    expect(
      game.campaign.checkPlacement({
        structureTypeId: field.id,
        position: fieldSite,
      }),
    ).toMatchObject({ ok: false, reason: "design-locked" });
  });
});

describe("a radio telescope array with antenna fields", () => {
  it("joins the array once commissioned, and works its round faster for each field", () => {
    const game = withFields(fieldSite, secondFieldSite);
    const arrayId = arrayOf(game.state).id;
    const fields = only(game.state, field.id);
    expect(fields.map(({ arrayId: joins }) => joins)).toEqual([
      arrayId,
      arrayId,
    ]);

    game.advance({ hours: 2 });

    expect(fields.every(({ powered }) => powered)).toBe(true);
    expect(arrayOf(game.state).observedMinutes).toBeCloseTo(3 * 2 * 60);
    const [snapshot] = game.state.radioArrays;
    expect(snapshot).toMatchObject({
      working: true,
      antennaFields: 3,
      antennaFieldsAddingNothing: 0,
      fieldIds: fields.map(({ id }) => id),
    });
    expect(snapshot?.sciencePerLunation).toBeCloseTo(3 * 88.5, 5);
  });

  it("earns a round's Science sooner with a field", () => {
    const game = withFields(fieldSite);
    const science = game.state.science;

    game.advance({ hours: radioArray.lengthHours / 2 + 1 });

    expect(game.state.science).toBe(science + radioArray.science);
  });

  it("gets nothing from a field still being built", () => {
    const game = arrayBase();
    game.plan(field.id, fieldSite);
    game.advance({ hours: 2 });

    expect(game.state.constructions).toHaveLength(1);
    expect(game.state.radioArrays[0]?.antennaFields).toBe(1);
  });

  it("gets nothing from a Broken field until it is repaired, and keeps its round", () => {
    const game = withFields(fieldSite);
    game.advance({ hours: 1 });
    const fieldId = only(game.state, field.id)[0]?.id ?? "";
    const broken = scenarioOf(worn(game.campaign, fieldId, 0, 0));

    const events = broken.campaign.advance(2 * 60);

    expect(events).not.toContainEqual(
      expect.objectContaining({ kind: "radio-round-lost" }),
    );
    expect(arrayOf(broken.state).observedMinutes).toBeCloseTo(2 * 60 + 2 * 60);
    expect(broken.state.radioArrays[0]).toMatchObject({
      working: true,
      antennaFields: 2,
      antennaFieldsAddingNothing: 1,
    });
    expect(broken.state.radioArrays[0]?.sciencePerLunation).toBeCloseTo(
      88.5,
      5,
    );

    // Repaired, it adds its field's work again.
    const repaired = scenarioOf(worn(broken.campaign, fieldId, 100));
    repaired.advance({ hours: 1 });
    expect(arrayOf(repaired.state).observedMinutes).toBeCloseTo(
      4 * 60 + 2 * 60,
    );
  });

  it("gets less from a worn field, at that field's own performance", () => {
    const game = withFields(fieldSite);
    const fieldId = only(game.state, field.id)[0]?.id ?? "";
    const { thresholdPercent } = catalogue.structurePerformance;
    const half = scenarioOf(
      worn(game.campaign, fieldId, thresholdPercent / 2, 0),
    );
    const performance = only(half.state, field.id)[0]?.performance ?? 1;
    expect(performance).toBeLessThan(1);

    half.advance({ hours: 2 });

    expect(arrayOf(half.state).observedMinutes).toBeCloseTo(
      2 * 60 * (1 + performance),
    );
  });

  it("stops the whole array while a Plant stands within a field's quiet radius, though none is within the array's", () => {
    const game = withFields(nearPlantFieldSite);
    const nearby = only(game.state, plant)[0]?.id;

    const events = game.campaign.advance(2 * 60);

    expect(game.state.radioArrays[0]).toMatchObject({
      working: false,
      stoppedFor: "plant",
      inTheWay: [nearby],
    });
    expect(events).not.toContainEqual(
      expect.objectContaining({ kind: "radio-round-completed" }),
    );
    expect(arrayOf(game.state).observedMinutes).toBe(0);
  });

  it("goes on exactly as an uninterrupted run would when saved and loaded, keeping which array each field joins", () => {
    const game = withFields(fieldSite);
    game.plan(field.id, secondFieldSite);
    game.advance({ minutes: 97 });
    const saved = JSON.parse(game.campaign.save()) as {
      state: {
        structures: { structureTypeId: string; arrayId: string | null }[];
        constructions: { structureTypeId: string; arrayId: string | null }[];
      };
    };
    const arrayId = arrayOf(game.state).id;
    expect(
      saved.state.structures.map(({ structureTypeId, arrayId: joins }) =>
        structureTypeId === field.id ? joins : null,
      ),
    ).toEqual(
      saved.state.structures.map(({ structureTypeId }) =>
        structureTypeId === field.id ? arrayId : null,
      ),
    );
    expect(saved.state.constructions).toEqual([
      expect.objectContaining({ structureTypeId: field.id, arrayId }),
    ]);

    const loaded = loadCampaign(game.campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    const original = game.campaign.advance(6 * 24 * 60);
    const reloaded = loaded.campaign.advance(6 * 24 * 60);
    expect(reloaded).toEqual(original);
    expect(loaded.campaign.save()).toBe(game.campaign.save());
    expect(loaded.campaign.snapshot().radioArrays[0]?.antennaFields).toBe(3);
  });

  it("refuses to load a field that joins no array, or a Structure that isn't a field joining one", () => {
    const game = withFields(fieldSite);
    const document = JSON.parse(game.campaign.save()) as {
      state: {
        structures: { structureTypeId: string; arrayId: string | null }[];
      };
    };
    const saved = document.state.structures;
    const savedField = saved.find(
      ({ structureTypeId }) => structureTypeId === field.id,
    );
    if (savedField === undefined) throw new Error("expected a field");

    savedField.arrayId = "structure-999";
    expect(loadCampaign(JSON.stringify(document))).toMatchObject({
      ok: false,
      reason: "damaged",
    });

    savedField.arrayId = arrayOf(game.state).id;
    const other = saved.find(
      ({ structureTypeId }) => structureTypeId === "solar-array",
    );
    if (other === undefined) throw new Error("expected a solar array");
    other.arrayId = arrayOf(game.state).id;
    expect(loadCampaign(JSON.stringify(document))).toMatchObject({
      ok: false,
      reason: "damaged",
    });
  });
});

describe("dismantling a radio telescope array and its antenna fields", () => {
  it("refuses the array while a field joins it, and lowers its rate as a field goes", () => {
    const game = withFields(fieldSite);
    const arrayId = arrayOf(game.state).id;
    const fieldId = only(game.state, field.id)[0]?.id ?? "";

    expect(game.campaign.dismantleStructure(arrayId)).toEqual({
      ok: false,
      message: "Its antenna fields join it, and must be dismantled first.",
    });

    const dismantled = game.campaign.dismantleStructure(fieldId);
    if (!dismantled.ok) throw new Error(dismantled.message);
    runUntilDismantled(game);
    expect(game.state.radioArrays[0]).toMatchObject({
      antennaFields: 1,
      fieldIds: [],
    });
    expect(game.state.radioArrays[0]?.sciencePerLunation).toBeCloseTo(88.5, 5);

    expect(game.campaign.dismantleStructure(arrayId)).toEqual({ ok: true });
  });

  it("refuses the array while a field to join it is being built", () => {
    const game = arrayBase();
    game.plan(field.id, fieldSite);

    expect(game.campaign.dismantleStructure(arrayOf(game.state).id)).toEqual({
      ok: false,
      message:
        "An antenna field being built joins it. Cancel it, or dismantle it once built, first.",
    });
  });
});

describe("a save from before antenna fields", () => {
  it("loads unchanged, with no Structure or Construction joining an array", () => {
    const campaign = loadSample("version-48.moonbase");
    const document = JSON.parse(campaign.save()) as {
      version: number;
      state: {
        structures: { arrayId: unknown }[];
        constructions: { arrayId: unknown }[];
      };
    };

    expect(document.version).toBe(49);
    expect(
      [...document.state.structures, ...document.state.constructions].every(
        ({ arrayId }) => arrayId === null,
      ),
    ).toBe(true);
    expect(campaign.snapshot().radioArrays).toEqual([]);
  });
});

describe("what the player is told of antenna fields", () => {
  it("says how many fields the array has and what it earns, and what each field adds", () => {
    const game = withFields(fieldSite, secondFieldSite);
    const fieldId = only(game.state, field.id)[0]?.id ?? "";
    const broken = scenarioOf(worn(game.campaign, fieldId, 0, 0));
    broken.advance({ hours: 1 });

    const entry = describeStructureEntry(
      broken.state,
      arrayOf(broken.state),
      false,
    );
    expect(entry.note).toContain(
      "3 antenna fields, 1 adding nothing, about 177 Science a Lunation",
    );
    const arrayLines =
      structureDetails(broken.state, arrayOf(broken.state).id)?.lines ?? [];
    expect(
      arrayLines.find(({ label }) => label === "Antenna fields")?.stat.value,
    ).toBe("3 antenna fields, 1 adding nothing, about 177 Science a Lunation");

    const fieldLines = (id: string) =>
      structureDetails(broken.state, id)?.lines ?? [];
    expect(
      fieldLines(fieldId).find(({ label }) => label === "Array")?.stat.value,
    ).toBe("adds nothing to its radio telescope array: Broken");
    const working = only(broken.state, field.id)[1]?.id ?? "";
    expect(
      fieldLines(working).find(({ label }) => label === "Array")?.stat.value,
    ).toBe("adds a field's work to its radio telescope array");
    expect(
      fieldLines(working).find(({ label }) => label === "Quiet radius")?.stat
        .value,
    ).toBe("no Plant within its quiet radius of 120 m");
  });

  it("describes where a field goes, what it adds and what stops it", () => {
    const words = describeStructure(field);

    expect(words).toContain(
      "beside a commissioned radio telescope array, within 10 m of it or of one of its antenna fields",
    );
    expect(words).toContain("within 120 m of it, its quiet radius");
    expect(words).toContain(
      "can't be dismantled while an antenna field joins it",
    );
  });
});
