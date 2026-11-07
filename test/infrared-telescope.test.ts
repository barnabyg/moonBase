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
import { scenario, scenarioOf, type Scenario } from "./scenario";
import { changed, worn } from "./worn";

// An infrared telescope's Design is unlocked from the start, with its Components,
// two large battery banks', a second solar array's and Light Masts' in the
// starting stock. Nothing wears down by Dust or Micrometeorites, no Machine draws
// power for a heater at Night, and the Habitat draws none, so that what the base's
// stocks and battery banks do is the telescope's alone.
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
    ["infrared-astronomy", "large-battery-banks", "light-masts"],
  );
  return {
    ...actual,
    catalogue: {
      ...base,
      startingStock: [
        ...base.startingStock,
        ...componentsOf("large-battery-bank"),
        ...componentsOf("solar-array"),
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
const infrared = structureType("infrared-telescope");
const { observingRounds, keepClear } = infrared;
if (observingRounds === undefined || keepClear === undefined) {
  throw new Error("expected rounds and a dark radius");
}
const propellantPerHour =
  infrared.recipes?.[0]?.inputs[0]?.kilogramsPerHour ?? Number.NaN;
const roundMinutes = observingRounds.lengthHours * 60;

const solarSite: GroundPosition = { x: 20, y: 12 };
const secondSolarSite: GroundPosition = { x: 18, y: 28 };
const batterySite: GroundPosition = { x: 30, y: 25 };
const secondBatterySite: GroundPosition = { x: 30, y: 36 };
// Past the dark radius of the Light Mast by the battery banks.
const telescopeSite: GroundPosition = { x: 130, y: 25 };
const baseLightSite: GroundPosition = { x: 40, y: 30 };
// Within its dark radius.
const nearLightSite: GroundPosition = { x: 100, y: 25 };

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

function telescopeOf(state: Snapshot): StructureSnapshot {
  const found = state.structures.find(
    ({ structureTypeId }) => structureTypeId === infrared.id,
  );
  if (found === undefined) throw new Error("expected an infrared telescope");
  return found;
}

function propellant(state: Snapshot): number {
  return (
    state.bulkResources.find(({ resourceId }) => resourceId === "propellant")
      ?.kilograms ?? 0
  );
}

/** The Campaign as saved, but with so much propellant. */
function withPropellant(game: Scenario, kilograms: number): Scenario {
  return scenarioOf(
    changed(game.campaign, (saved) => {
      for (const held of saved.bulkResources) {
        if (held.resourceId === "propellant") held.kilograms = kilograms;
      }
    }),
  );
}

/** The Campaign as saved, but with so much energy stored in each battery bank. */
function withStored(game: Scenario, kilowattHours: number): Scenario {
  return scenarioOf(
    changed(game.campaign, (saved) => {
      for (const structure of saved.structures) {
        if (structure.storedKilowattHours > 0) {
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

/**
 * Two solar arrays, two large battery banks, a Light Mast among them, and an
 * infrared telescope out past its dark radius, all commissioned and cabled, with
 * plenty of propellant.
 */
function telescopeBase(): Scenario {
  const game = scenario()
    .plan("solar-array", solarSite)
    .plan("solar-array", secondSolarSite)
    .plan("large-battery-bank", batterySite)
    .plan("large-battery-bank", secondBatterySite)
    .plan("light-mast", baseLightSite)
    .plan(infrared.id, telescopeSite);
  runUntilBuilt(game);
  return withPropellant(game, 500);
}

/** The telescope's base at the start of the next Night, with full battery banks. */
function atNight(): Scenario {
  const game = telescopeBase();
  runUntil(game, "night");
  return charged(game);
}

/** What the telescope's network draws now. */
function consumption(state: Snapshot): number {
  const id = telescopeOf(state).id;
  return (
    state.power.networks.find(({ structureIds }) => structureIds.includes(id))
      ?.consumptionKilowatts ?? Number.NaN
  );
}

function eventsOf(game: Scenario, hours: number): readonly GameEvent[] {
  return game.campaign.advance(hours * 60);
}

describe("an infrared telescope", () => {
  it("stands idle in Daylight, taking no propellant and drawing no power", () => {
    const game = telescopeBase();
    if (game.state.lunation.part !== "daylight") runUntil(game, "daylight");
    const before = propellant(game.state);

    game.advance({ hours: 5 });

    expect(propellant(game.state)).toBe(before);
    expect(telescopeOf(game.state)).toMatchObject({
      observedMinutes: 0,
      plant: { running: false, stoppedFor: { reason: "daylight" } },
    });
    expect(game.state.infraredTelescopes).toEqual([
      expect.objectContaining({
        observing: false,
        stoppedFor: "daylight",
        inTheWay: [],
      }),
    ]);
  });

  it("observes at Night, taking its propellant a batch at a time, and earns its round's Science once it has its length", () => {
    const game = atNight();
    const science = game.state.science;
    const before = propellant(game.state);

    game.advance({ hours: 5 });

    expect(telescopeOf(game.state)).toMatchObject({
      observedMinutes: 5 * 60,
      plant: { running: true },
    });
    expect(propellant(game.state)).toBeCloseTo(
      before - 5 * propellantPerHour,
      5,
    );
    expect(game.state.infraredTelescopes[0]).toMatchObject({
      observing: true,
      stoppedFor: undefined,
      minutesLeft: roundMinutes - 5 * 60,
    });

    const events = eventsOf(game, observingRounds.lengthHours - 5);

    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "infrared-round-completed",
        science: observingRounds.science,
      }),
    );
    expect(game.state.science).toBe(science + observingRounds.science);
    expect(telescopeOf(game.state).observedMinutes).toBe(0);
  });

  it("pays several times what the Night-sky survey does, and leaves it to the optical telescopes", () => {
    const perHour = (science: number, hours: number) => science / hours;
    expect(
      perHour(observingRounds.science, observingRounds.lengthHours),
    ).toBeGreaterThanOrEqual(
      3 *
        perHour(
          catalogue.observingProgramme.science,
          catalogue.observingProgramme.lengthHours,
        ),
    );
    const game = atNight();
    game.advance({ hours: 2 });
    expect(game.state.observingProgramme).toMatchObject({
      telescopes: 0,
      progress: 0,
    });
  });

  it("keeps its round through Daylight, and goes on with it at the next Night", () => {
    const game = atNight();
    // Up to a few hours before Daylight.
    game.advance({ minutes: game.state.lunation.minutesRemaining - 3 * 60 });
    const observed = telescopeOf(game.state).observedMinutes % roundMinutes;
    expect(observed).toBeGreaterThan(0);

    runUntil(game, "daylight");
    game.advance({ hours: 1 });
    const kept = telescopeOf(game.state).observedMinutes;
    expect(kept).toBeGreaterThan(0);

    runUntil(game, "night");
    const supplied = charged(withPropellant(game, 500));
    supplied.advance({ hours: 1 });
    expect(telescopeOf(supplied.state).observedMinutes).toBe(kept + 60);
  });

  it("observes less fast at a low Condition", () => {
    const game = atNight();
    const id = telescopeOf(game.state).id;
    const { thresholdPercent } = catalogue.structurePerformance;
    const half = scenarioOf(worn(game.campaign, id, thresholdPercent / 2, 0));
    const performance = telescopeOf(half.state).performance;
    expect(performance).toBeLessThan(1);

    half.advance({ hours: 2 });

    expect(telescopeOf(half.state).observedMinutes).toBeCloseTo(
      2 * 60 * performance,
    );
  });

  it("goes on exactly as an uninterrupted run would when saved and loaded part-way through a round", () => {
    const game = atNight();
    game.advance({ minutes: 97 });

    const loaded = loadCampaign(game.campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    const original = game.campaign.advance(24 * 60);
    const reloaded = loaded.campaign.advance(24 * 60);
    expect(reloaded).toEqual(original);
    expect(loaded.campaign.save()).toBe(game.campaign.save());
  });
});

describe("an infrared telescope's dark radius", () => {
  it("stops it observing while a lit Structure stands within it, and lets it go on once that is gone", () => {
    // A Light Mast within its dark radius, built in Daylight so as not to wait.
    const lit = telescopeBase();
    lit.plan("light-mast", nearLightSite);
    runUntilBuilt(lit);
    runUntil(lit, "night");
    const blocked = charged(withPropellant(lit, 500));

    blocked.advance({ hours: 3 });

    const mast = blocked.state.structures.find(
      ({ structureTypeId, position }) =>
        structureTypeId === "light-mast" && position.x === nearLightSite.x,
    );
    expect(mast).toBeDefined();
    expect(blocked.state.infraredTelescopes).toEqual([
      expect.objectContaining({
        observing: false,
        stoppedFor: "light",
        inTheWay: [mast?.id],
      }),
    ]);
    expect(telescopeOf(blocked.state)).toMatchObject({
      observedMinutes: 0,
      plant: { running: false, stoppedFor: { reason: "too-close" } },
    });
    // It draws no power while it waits.
    expect(consumption(blocked.state)).toBeLessThan(
      infrared.power.nightDrawKilowatts,
    );
    expect(propellant(blocked.state)).toBe(500);

    // Dismantled, the light no longer stops it.
    const dismantled = blocked.campaign.dismantleStructure(mast?.id ?? "");
    if (!dismantled.ok) throw new Error(dismantled.message);
    for (let hours = 0; blocked.state.dismantlings.length > 0; hours++) {
      if (hours > 48) throw new Error("The dismantling never finished.");
      blocked.advance({ hours: 1 });
    }
    const clear = charged(withPropellant(blocked, 500));
    clear.advance({ hours: 2 });
    expect(clear.state.infraredTelescopes[0]).toMatchObject({
      observing: true,
      inTheWay: [],
    });
  });

  it("loses the round it is on as a light comes within it", () => {
    const game = atNight();
    game.advance({ hours: 6 });
    expect(telescopeOf(game.state).observedMinutes).toBe(6 * 60);
    // A Light Mast's position changed to within the radius stands in for one
    // commissioned there.
    const moved = scenarioOf(
      changed(game.campaign, (saved) => {
        const mast = (
          saved.structures as unknown as {
            structureTypeId: string;
            position: GroundPosition;
          }[]
        ).find(({ structureTypeId }) => structureTypeId === "light-mast");
        if (mast !== undefined) mast.position = nearLightSite;
      }),
    );

    const events = eventsOf(moved, 1);

    expect(events).toContainEqual(
      expect.objectContaining({ kind: "infrared-round-lost", reason: "light" }),
    );
    expect(telescopeOf(moved.state).observedMinutes).toBe(0);
  });
});

describe("an infrared telescope short of propellant", () => {
  it("never takes what the Lander needs for the Exports set to load, loses its round, and starts again once there is a batch's worth above it", () => {
    const game = atNight();
    game.advance({ hours: 4 });
    const toSell = 20;
    const loaded = game.campaign.loadExports([
      { resourceId: "propellant", kilograms: toSell },
    ]);
    if (!loaded.ok) throw new Error(loaded.message);
    const kept = game.state.exports.propellantToBurnKilograms + toSell;
    const short = withPropellant(game, kept + 2 * propellantPerHour);
    // The Exports to load don't survive a save edited by hand, so set them again.
    const again = short.campaign.loadExports([
      { resourceId: "propellant", kilograms: toSell },
    ]);
    if (!again.ok) throw new Error(again.message);

    const events = eventsOf(short, 4);

    expect(propellant(short.state)).toBeCloseTo(kept, 5);
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "infrared-round-lost",
        reason: "propellant",
      }),
    );
    expect(short.state.infraredTelescopes[0]).toMatchObject({
      observing: false,
      stoppedFor: "propellant",
    });
    expect(telescopeOf(short.state).plant).toMatchObject({
      running: false,
      stoppedFor: {
        reason: "no-input",
        resource: { resourceId: "propellant" },
      },
    });

    const refilled = withPropellant(short, 500);
    refilled.advance({ hours: 2 });
    expect(refilled.state.infraredTelescopes[0]).toMatchObject({
      observing: true,
    });
  });
});

describe("an infrared telescope short of power", () => {
  it("gives up its power at Night before anything else goes without, losing its round", () => {
    const game = atNight();
    game.advance({ hours: 6 });
    // A few hours of the Night loads above what everything else needs through
    // the rest of the Night and the reserve after it, shared between the two
    // banks.
    const solarDraw = 2 * structureType("solar-array").power.drawKilowatts;
    const bankDraw =
      2 * structureType("large-battery-bank").power.drawKilowatts;
    const everythingElse =
      ((solarDraw + bankDraw) *
        (game.state.lunation.minutesRemaining +
          catalogue.nightReserveHours * 60)) /
      60;
    const short = withStored(
      game,
      (everythingElse + 3 * infrared.power.nightDrawKilowatts) / 2,
    );

    const events = eventsOf(short, 8);

    expect(events).toContainEqual(
      expect.objectContaining({ kind: "infrared-round-lost", reason: "power" }),
    );
    expect(short.state.infraredTelescopes[0]).toMatchObject({
      observing: false,
      stoppedFor: "power",
    });
    expect(
      short.state.structures
        .filter(({ structureTypeId }) => structureTypeId !== infrared.id)
        .every(({ powered }) => powered),
    ).toBe(true);
  });

  it("draws more through a Night than a large battery bank stores", () => {
    const nightHours =
      catalogue.lunation.nightEarthDays * 24 + catalogue.nightReserveHours;
    expect(infrared.power.nightDrawKilowatts * nightHours).toBeGreaterThan(
      structureType("large-battery-bank").power.storageKilowattHours,
    );
  });
});
