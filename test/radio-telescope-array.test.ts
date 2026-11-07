import { describe, expect, it, vi } from "vitest";
import {
  catalogue,
  type Catalogue,
  type StructureType,
} from "../src/catalogue";
import {
  loadCampaign,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { describeStructure } from "../src/ui/describe";
import { formatRadioSurvey } from "../src/ui/status-panel-text";
import { structureDetails } from "../src/ui/structure-details";
import { describeStructureEntry } from "../src/ui/structure-state";
import { loadSample } from "./sample-saves";
import { scenario, scenarioOf, type Scenario } from "./scenario";
import { changed, worn } from "./worn";

// A radio telescope array's Design is unlocked from the start, with its
// Components, two large battery banks', a second solar array's and a water-
// processing plant's in the starting stock. Nothing wears down by Dust or
// Micrometeorites, no Machine draws power for a heater at Night, and the Habitat
// draws none, so that what the base's battery banks do is the array's alone.
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
const { radioArray, keepClear } = array;
if (radioArray === undefined || keepClear === undefined) {
  throw new Error("expected rounds and a quiet radius");
}
const roundMinutes = radioArray.lengthHours * 60;
const plant = "water-processing-plant";

const solarSite: GroundPosition = { x: 20, y: 12 };
const secondSolarSite: GroundPosition = { x: 18, y: 28 };
const batterySite: GroundPosition = { x: 30, y: 25 };
const secondBatterySite: GroundPosition = { x: 30, y: 36 };
const plantSite: GroundPosition = { x: 40, y: 12 };
// Past the quiet radius of the Plant at the base.
const arraySite: GroundPosition = { x: 170, y: 25 };
// Within its quiet radius.
const nearPlantSite: GroundPosition = { x: 100, y: 25 };

function runUntilBuilt(game: Scenario): void {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
}

function runUntil(game: Scenario, part: "daylight" | "night"): void {
  do {
    game.advance({ minutes: game.state.lunation.minutesRemaining });
  } while (game.state.lunation.part !== part);
}

function arrayOf(state: Snapshot): StructureSnapshot {
  const found = state.structures.find(
    ({ structureTypeId }) => structureTypeId === array.id,
  );
  if (found === undefined) throw new Error("expected a radio telescope array");
  return found;
}

/** The Campaign as saved, but with so much energy stored in each battery bank. */
function withStored(game: Scenario, kilowattHours: number): Scenario {
  return scenarioOf(
    changed(game.campaign, (saved) => {
      for (const structure of saved.structures as unknown as {
        structureTypeId: string;
        storedKilowattHours: number;
      }[]) {
        if (structure.structureTypeId === "large-battery-bank") {
          structure.storedKilowattHours = kilowattHours;
        }
      }
    }),
  );
}

/** Full battery banks, so that power is never short. */
function charged(game: Scenario): Scenario {
  return withStored(
    game,
    structureType("large-battery-bank").power.storageKilowattHours,
  );
}

/** The Campaign as saved, but with every array's round starting afresh. */
function afresh(game: Scenario): Scenario {
  return scenarioOf(
    changed(game.campaign, (saved) => {
      for (const structure of saved.structures as unknown as {
        observedMinutes: number;
      }[]) {
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
    .plan("solar-array", solarSite)
    .plan("solar-array", secondSolarSite)
    .plan("large-battery-bank", batterySite)
    .plan("large-battery-bank", secondBatterySite)
    .plan(plant, plantSite)
    .plan(array.id, arraySite);
  runUntilBuilt(game);
  return afresh(charged(game));
}

function eventsOf(game: Scenario, hours: number): readonly GameEvent[] {
  return game.campaign.advance(hours * 60);
}

/** The Campaign as saved, but with the first Plant of a type moved to a position. */
function withPlantAt(
  game: Scenario,
  structureTypeId: string,
  position: GroundPosition,
): Scenario {
  return scenarioOf(
    changed(game.campaign, (saved) => {
      const plant = (
        saved.structures as unknown as {
          structureTypeId: string;
          position: GroundPosition;
        }[]
      ).find((structure) => structure.structureTypeId === structureTypeId);
      if (plant === undefined) throw new Error(`expected a ${structureTypeId}`);
      plant.position = position;
    }),
  );
}

describe("a radio telescope array", () => {
  it("is built with one antenna field, many Components and a steady draw, and is no Plant", () => {
    expect(array.recipes).toBeUndefined();
    expect(
      array.components.reduce((sum, { count }) => sum + count, 0),
    ).toBeGreaterThanOrEqual(10);
    expect(array.power.drawKilowatts).toBeGreaterThan(0);
    expect(array.power.nightDrawKilowatts).toBe(0);
    // A Night of it is less than a large battery bank stores.
    expect(
      array.power.drawKilowatts * catalogue.lunation.nightEarthDays * 24,
    ).toBeLessThan(
      structureType("large-battery-bank").power.storageKilowattHours,
    );
    expect(keepClear).toEqual({ of: "plants", radiusMetres: 120 });
  });

  it("works in Daylight, drawing its power steadily, and earns its round's Science once it has its length", () => {
    const game = arrayBase();
    if (game.state.lunation.part !== "daylight") runUntil(game, "daylight");
    const daylight = afresh(charged(game));
    const science = daylight.state.science;

    daylight.advance({ hours: 5 });

    expect(arrayOf(daylight.state)).toMatchObject({
      powered: true,
      observedMinutes: 5 * 60,
    });
    expect(daylight.state.radioArrays).toEqual([
      expect.objectContaining({
        working: true,
        stoppedFor: undefined,
        inTheWay: [],
        antennaFields: 1,
        minutesLeft: roundMinutes - 5 * 60,
      }),
    ]);

    const events = eventsOf(daylight, radioArray.lengthHours - 5);

    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "radio-round-completed",
        science: radioArray.science,
      }),
    );
    expect(daylight.state.science).toBe(science + radioArray.science);
    expect(arrayOf(daylight.state).observedMinutes).toBe(0);
  });

  it("works through the Night as well, on the battery banks", () => {
    const game = arrayBase();
    runUntil(game, "night");
    const night = afresh(charged(game));
    const science = night.state.science;

    const events = eventsOf(night, radioArray.lengthHours + 2);

    expect(events).toContainEqual(
      expect.objectContaining({ kind: "radio-round-completed" }),
    );
    expect(night.state.science).toBe(science + radioArray.science);
    expect(arrayOf(night.state).observedMinutes).toBe(2 * 60);
    // It draws its power as any Structure does, which the network counts.
    const id = arrayOf(night.state).id;
    const network = night.state.power.networks.find(({ structureIds }) =>
      structureIds.includes(id),
    );
    expect(network?.consumptionKilowatts).toBeGreaterThanOrEqual(
      array.power.drawKilowatts,
    );
  });

  it("earns about 88 Science a Lunation with one antenna field", () => {
    const lunationHours =
      (catalogue.lunation.daylightEarthDays +
        catalogue.lunation.nightEarthDays) *
      24;
    const perLunation =
      (radioArray.science * lunationHours) / radioArray.lengthHours;
    expect(perLunation).toBeCloseTo(88.5, 1);

    const game = arrayBase();
    game.advance({ hours: 1 });
    expect(game.state.radioArrays[0]?.sciencePerLunation).toBeCloseTo(
      perLunation,
      5,
    );
  });

  it("works less fast at a low Condition", () => {
    const game = arrayBase();
    const id = arrayOf(game.state).id;
    const { thresholdPercent } = catalogue.structurePerformance;
    const half = scenarioOf(worn(game.campaign, id, thresholdPercent / 2, 0));
    const performance = arrayOf(half.state).performance;
    expect(performance).toBeLessThan(1);

    half.advance({ hours: 2 });

    expect(arrayOf(half.state).observedMinutes).toBeCloseTo(
      2 * 60 * performance,
    );
  });

  it("keeps its round while Broken, earning nothing until it is repaired", () => {
    const game = arrayBase();
    game.advance({ hours: 3 });
    const id = arrayOf(game.state).id;
    const broken = scenarioOf(worn(game.campaign, id, 0, 0));

    const events = eventsOf(broken, 2);

    expect(events).not.toContainEqual(
      expect.objectContaining({ kind: "radio-round-lost" }),
    );
    expect(arrayOf(broken.state).observedMinutes).toBe(3 * 60);
    expect(broken.state.radioArrays[0]).toMatchObject({
      working: false,
      stoppedFor: "broken",
    });
  });

  it("goes on exactly as an uninterrupted run would when saved and loaded part-way through a round", () => {
    const game = arrayBase();
    game.advance({ minutes: 97 });

    const loaded = loadCampaign(game.campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    const original = game.campaign.advance(30 * 60);
    const reloaded = loaded.campaign.advance(30 * 60);
    expect(reloaded).toEqual(original);
    expect(loaded.campaign.save()).toBe(game.campaign.save());
  });
});

describe("a radio telescope array's quiet radius", () => {
  it("stops it working while a Plant stands within it, and lets it go on once that is switched off", () => {
    const game = arrayBase();
    const nearby = game.state.structures.find(
      ({ structureTypeId }) => structureTypeId === plant,
    );
    expect(nearby).toBeDefined();
    const blocked = withPlantAt(game, plant, nearPlantSite);

    blocked.advance({ hours: 3 });

    expect(blocked.state.radioArrays).toEqual([
      expect.objectContaining({
        working: false,
        stoppedFor: "plant",
        inTheWay: [nearby?.id],
      }),
    ]);
    expect(arrayOf(blocked.state).observedMinutes).toBe(0);

    // Switched off, the Plant no longer stops it.
    const switched = blocked.campaign.switchPlant(nearby?.id ?? "", "off");
    if (!switched.ok) throw new Error(switched.message);
    blocked.advance({ hours: 2 });
    expect(blocked.state.radioArrays[0]).toMatchObject({
      working: true,
      inTheWay: [],
    });
  });

  it("loses the round it is on as a Plant comes within it", () => {
    const game = arrayBase();
    game.advance({ hours: 6 });
    expect(arrayOf(game.state).observedMinutes).toBe(6 * 60);
    // The Plant's position changed to within the radius stands in for one
    // commissioned there.
    const moved = withPlantAt(game, plant, nearPlantSite);

    const events = eventsOf(moved, 1);

    expect(events).toContainEqual(
      expect.objectContaining({ kind: "radio-round-lost", reason: "plant" }),
    );
    expect(arrayOf(moved.state).observedMinutes).toBe(0);
  });

  it("isn't stopped by another radio telescope array, which is no Plant", () => {
    const game = arrayBase();
    game.plan(array.id, { x: arraySite.x, y: arraySite.y + 30 });
    runUntilBuilt(game);
    const both = afresh(charged(game));

    both.advance({ hours: 2 });

    expect(both.state.radioArrays).toHaveLength(2);
    for (const each of both.state.radioArrays) {
      expect(each).toMatchObject({ working: true, inTheWay: [] });
    }
  });
});

describe("a radio telescope array short of power", () => {
  it("loses its round as the battery banks run out at Night, and starts a new one once it has power", () => {
    const game = arrayBase();
    runUntil(game, "night");
    const night = afresh(charged(game));
    night.advance({ hours: 6 });
    expect(arrayOf(night.state).observedMinutes).toBe(6 * 60);
    const flat = withStored(night, 0);

    const events = eventsOf(flat, 1);

    expect(events).toContainEqual(
      expect.objectContaining({ kind: "radio-round-lost", reason: "power" }),
    );
    expect(flat.state.radioArrays[0]).toMatchObject({
      working: false,
      stoppedFor: "power",
    });
    expect(arrayOf(flat.state).observedMinutes).toBe(0);

    const recharged = charged(flat);
    recharged.advance({ hours: 2 });
    expect(arrayOf(recharged.state).observedMinutes).toBe(2 * 60);
  });
});

describe("a save from before radio telescope arrays", () => {
  it("loads unchanged, with none", () => {
    const campaign = loadSample("version-48.moonbase");
    const state = campaign.snapshot();

    expect(state.radioArrays).toEqual([]);
    expect(
      state.structures.find(
        ({ structureTypeId }) => structureTypeId === "infrared-telescope",
      )?.observedMinutes,
    ).toBe(97);
  });
});

describe("what the player is told of a radio telescope array", () => {
  it("says it is working, with its antenna field and rate, in the Base panel, the pop-up and the status panel", () => {
    const game = arrayBase();
    game.advance({ hours: 1 });
    const entry = describeStructureEntry(
      game.state,
      arrayOf(game.state),
      false,
    );

    expect(entry.value).toMatch(/^working, \S+ left of this round$/);
    expect(entry.note).toContain(
      "1 antenna field, about 89 Science a Lunation",
    );
    const lines =
      structureDetails(game.state, arrayOf(game.state).id)?.lines ?? [];
    expect(lines.map(({ label }) => label)).toEqual(
      expect.arrayContaining(["Round", "Antenna fields", "Quiet radius"]),
    );
    expect(
      lines.find(({ label }) => label === "Quiet radius")?.stat.value,
    ).toBe("no Plant within its quiet radius of 120 m");
    expect(formatRadioSurvey(game.state.radioArrays)?.note).toMatch(
      /^1 radio telescope array working, /,
    );
  });

  it("says why it can't work while a Plant is within its quiet radius", () => {
    const blocked = withPlantAt(arrayBase(), plant, nearPlantSite);
    blocked.advance({ hours: 1 });

    expect(
      describeStructureEntry(blocked.state, arrayOf(blocked.state), false)
        .value,
    ).toBe("can't work: a Plant is within its quiet radius");
    expect(formatRadioSurvey(blocked.state.radioArrays)?.note).toBe(
      "a Plant within its quiet radius",
    );
  });

  it("describes its survey, its steady draw and its quiet radius", () => {
    const words = describeStructure(array);

    expect(words).toContain(
      "through Daylight and Night for the Radio sky survey",
    );
    expect(words).toContain("within 120 m of it, its quiet radius");
    expect(words).toContain(
      "A shortage of power, or a Plant within its quiet radius, loses",
    );
  });
});
