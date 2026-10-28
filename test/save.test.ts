import { describe, expect, it, vi } from "vitest";
import type { Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type Campaign,
  type GameEvent,
  type GroundPosition,
} from "../src/simulation";
import { readSaveDocument, type Migration } from "../src/simulation/save";
import { scenario, type Scenario } from "./scenario";

// The Habitat needs no power and its oxygen and water last, so that the
// Mission Director can live in it until a Solar Particle Event comes.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { safeHabitat } = await import("./safe-habitat");
  return {
    ...actual,
    catalogue: safeHabitat(actual.catalogue, ["power", "life-support"]),
  };
});

const habitatSite: GroundPosition = { x: 25, y: -20 };

/** Runs the game until the Robot has carried out every planned Construction. */
function buildAll(game: Scenario): Scenario {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
  return game;
}

/**
 * The Mission Director in a shielded Habitat, with a Solar Particle Event's
 * warning come, and a solar array part-way through Site Preparation so that
 * the Robot and the excavator are busy.
 */
function shieldedAsAnEventComes(): Scenario {
  const game = buildAll(scenario().plan("habitat", habitatSite));
  const habitatId = game.state.structures[0]?.id ?? "";
  buildAll(game.plan("regolith-shielding", habitatSite));
  const movedIn = game.campaign.moveMissionDirectorIn(habitatId);
  if (!movedIn.ok) throw new Error(movedIn.message);
  for (let skips = 0; game.state.solarParticleEvent === undefined; skips++) {
    if (skips > 1000) throw new Error("No Solar Particle Event came.");
    game.campaign.advanceToNextEvent();
  }
  game.plan("solar-array", { x: 20, y: 12 }).advance({ minutes: 50 });
  expect(game.state.structures[0]?.shielded).toBe(true);
  expect(game.state.missionDirector).toMatchObject({ residence: "habitat" });
  expect(game.state.solarParticleEvent).toMatchObject({ state: "coming" });
  return game;
}

function load(text: string): Campaign {
  const result = loadCampaign(text);
  if (!result.ok) throw new Error(result.message);
  return result.campaign;
}

/** Edits a save's document as parsed JSON, and writes it back as text. */
function edited(text: string, edit: (document: SaveJson) => void): string {
  const document = JSON.parse(text) as SaveJson;
  edit(document);
  return JSON.stringify(document);
}

interface SaveJson {
  format: unknown;
  version: unknown;
  random: Record<string, unknown>;
  state: Record<string, unknown> & {
    robots: { position: Record<string, unknown> }[];
    structures: Record<string, unknown>[];
  };
}

describe("a save document", () => {
  it("is JSON with the format, its version, the random generator state and the simulation state", () => {
    const document = JSON.parse(
      shieldedAsAnEventComes().campaign.save(),
    ) as SaveJson;

    expect(document).toMatchObject({
      format: "moonbase-save",
      version: 36,
      random: {
        a: expect.any(Number) as number,
        b: expect.any(Number) as number,
        c: expect.any(Number) as number,
        d: expect.any(Number) as number,
      },
      state: expect.objectContaining({
        missionDirector: expect.objectContaining({
          residence: "habitat",
        }) as unknown,
        solarParticleEvent: expect.any(Object) as unknown,
      }) as unknown,
    });
  });

  it("keeps the Funding balance and the Launch manifest", () => {
    const game = scenario();
    game.campaign.setLaunchManifest([
      { itemId: "habitat-envelope", count: 1 },
      { itemId: "oxygen", count: 2 },
    ]);

    const loaded = load(game.campaign.save()).snapshot();

    expect(loaded.fundingMillionDollars).toBe(game.state.fundingMillionDollars);
    expect(loaded.launchManifest).toEqual(game.state.launchManifest);
    expect(loaded.launchManifest.items).toHaveLength(2);
  });

  it("starts a Campaign identical to the one saved", () => {
    const game = shieldedAsAnEventComes();
    const saved = game.campaign.save();

    const loaded = load(saved);

    expect(loaded.snapshot()).toEqual(game.campaign.snapshot());
    expect(loaded.forecasts()).toEqual(game.campaign.forecasts());
    expect(loaded.save()).toBe(saved);
  });

  it("starts a Campaign that carries on exactly as the one saved does, through the Solar Particle Event", () => {
    const game = shieldedAsAnEventComes();
    const loaded = load(game.campaign.save());
    /** The same commands, the same time passing, and everything seen on the way. */
    const play = (campaign: Campaign) => {
      const events: GameEvent[] = [...campaign.advance(17)];
      campaign.planConstruction({
        structureTypeId: "light-mast",
        position: { x: -30, y: 4 },
      });
      const doseBefore = campaign.snapshot().radiationDoseMillisieverts;
      while (
        !events.some((event) => event.kind === "solar-particle-event-ended")
      ) {
        events.push(...campaign.advanceToNextEvent());
      }
      events.push(...campaign.advance(3 * 24 * 60));
      return {
        events,
        dose: campaign.snapshot().radiationDoseMillisieverts - doseBefore,
        snapshot: campaign.snapshot(),
        forecasts: campaign.forecasts(),
        saved: campaign.save(),
      };
    };

    const uninterrupted = play(game.campaign);
    const afterLoading = play(loaded);

    expect(uninterrupted.dose).toBeGreaterThan(0);
    expect(uninterrupted.snapshot.constructions).toHaveLength(0);
    expect(afterLoading).toEqual(uninterrupted);
  });

  it("starts a Campaign that shares nothing with the one saved", () => {
    const game = shieldedAsAnEventComes();
    const loaded = load(game.campaign.save());

    loaded.advance(60);

    expect(loaded.snapshot()).not.toEqual(game.campaign.snapshot());
    expect(load(game.campaign.save()).snapshot()).toEqual(
      game.campaign.snapshot(),
    );
  });

  it("can be saved again once the Campaign has ended", () => {
    const game = scenario();
    // A Mission Director left in an unshielded Habitat for long enough dies of
    // the Radiation Dose, even with the Habitat's other dangers taken away.
    const habitatId =
      buildAll(game.plan("habitat", habitatSite)).state.structures[0]?.id ?? "";
    game.campaign.moveMissionDirectorIn(habitatId);
    for (let days = 0; game.state.ended === undefined; days++) {
      if (days > 1000) throw new Error("The Campaign never ended.");
      game.advance({ earthDays: 1 });
    }

    const loaded = load(game.campaign.save());

    expect(loaded.snapshot()).toEqual(game.state);
    expect(loaded.snapshot().ended).toMatchObject({
      cause: { kind: "radiation-dose-limit" },
    });
  });
});

describe("loading a file", () => {
  const valid = () => shieldedAsAnEventComes().campaign.save();

  it.each([
    ["isn't JSON", "Earth Day 3, 07:12"],
    ["is empty", ""],
    ["is a JSON array", "[]"],
    ["is a JSON string", '"moonbase-save"'],
    ["is JSON null", "null"],
    ["is an object of another kind", '{"format":"something-else","version":1}'],
    ["has no format", '{"version":1}'],
  ])("is refused as not a save when it %s", (_, text) => {
    expect(loadCampaign(text)).toEqual({
      ok: false,
      reason: "not-a-save",
      message: "It isn't a Moon Base save file.",
    });
  });

  it("is refused when it comes from a newer format version", () => {
    const text = edited(valid(), (document) => {
      document.version = 37;
    });

    expect(loadCampaign(text)).toEqual({
      ok: false,
      reason: "newer-version",
      message:
        "It was saved by a newer version of Moon Base, in save format version 37. This version can load up to version 36.",
    });
  });

  it.each([
    ["no version", undefined],
    ["a version of 0", 0],
    ["a fractional version", 1.5],
    ["a version in words", "one"],
  ])("is refused as damaged when it has %s", (_, version) => {
    const text = edited(valid(), (document) => {
      document.version = version;
    });

    expect(loadCampaign(text)).toMatchObject({
      ok: false,
      reason: "damaged",
      message:
        "The save file is damaged: its version isn't a whole number from 1 up.",
    });
  });

  it.each<[string, (document: SaveJson) => void, string]>([
    [
      "a number in words",
      (document) => {
        const robot = document.state.robots[0];
        if (robot !== undefined) robot.position["x"] = "far";
      },
      "state.robots.0.position.x isn't a number",
    ],
    [
      "a field missing",
      (document) => {
        delete document.state["elapsedMinutes"];
      },
      "state.elapsedMinutes isn't a whole number from 0 up",
    ],
    [
      "a Structure type the data catalogue doesn't have",
      (document) => {
        const structure = document.state.structures[0];
        if (structure !== undefined) structure["structureTypeId"] = "castle";
      },
      "state.structures.0.structureTypeId isn't a Structure type in the data catalogue",
    ],
    [
      "a recipe for a Structure that isn't a Plant",
      (document) => {
        const structure = document.state.structures[0];
        if (structure !== undefined) structure["recipeId"] = "oxygen";
      },
      "state.structures.0.recipeId isn't null, though the Structure isn't a Plant",
    ],
    [
      "a completed Research Task the data catalogue doesn't have",
      (document) => {
        document.state["completedResearchTaskIds"] = ["perpetual-motion"];
      },
      "state.completedResearchTaskIds.0 isn't a Research Task in the data catalogue",
    ],
    [
      "an unlocked Design the data catalogue doesn't have",
      (document) => {
        document.state["unlockedDesignIds"] = ["warp-drive"];
      },
      "state.unlockedDesignIds.0 isn't a Design in the data catalogue",
    ],
    [
      "random generator state out of range",
      (document) => {
        document.random["a"] = 2 ** 32;
      },
      "random.a isn't a 32-bit whole number",
    ],
    [
      "a Mission Director living nowhere known",
      (document) => {
        document.state["missionDirector"] = { residence: "crater" };
      },
      'state.missionDirector.residence isn\'t one of "lander", "habitat"',
    ],
  ])("is refused as damaged when it has %s", (_, edit, detail) => {
    const result = loadCampaign(edited(valid(), edit));

    expect(result).toMatchObject({ ok: false, reason: "damaged" });
    expect(result.ok ? "" : result.message).toContain(
      `The save file is damaged: ${detail}`,
    );
  });
});

describe("the chain of migrations", () => {
  /** Two made-up migrations, as if the current format were version 3. */
  function chain(log: string[]): Migration[] {
    return [
      (document) => {
        log.push(`1 to 2, from version ${String(document["version"])}`);
        return document;
      },
      (document) => {
        log.push(`2 to 3, from version ${String(document["version"])}`);
        return document;
      },
    ];
  }
  const atVersion = (version: number) =>
    edited(shieldedAsAnEventComes().campaign.save(), (document) => {
      document.version = version;
    });

  it("runs every migration from the file's version to the current one, in order", () => {
    const log: string[] = [];

    const result = readSaveDocument(atVersion(1), chain(log));

    expect(result.ok).toBe(true);
    expect(log).toEqual(["1 to 2, from version 1", "2 to 3, from version 2"]);
  });

  it("reads the document as the migrations leave it", () => {
    const later: Migration[] = [
      (document) => ({
        ...document,
        state: { ...(document["state"] as object), elapsedMinutes: 12345 },
      }),
    ];

    const result = readSaveDocument(atVersion(1), later);

    expect(result.ok ? result.state.elapsedMinutes : undefined).toBe(12345);
  });

  it("runs only the migrations after the file's version", () => {
    const log: string[] = [];

    expect(readSaveDocument(atVersion(2), chain(log)).ok).toBe(true);
    expect(log).toEqual(["2 to 3, from version 2"]);
  });

  it("runs none on a file of the current version", () => {
    const log: string[] = [];

    expect(readSaveDocument(atVersion(3), chain(log)).ok).toBe(true);
    expect(log).toEqual([]);
  });

  it("refuses a file newer than the current version", () => {
    const log: string[] = [];

    expect(readSaveDocument(atVersion(4), chain(log))).toMatchObject({
      ok: false,
      reason: "newer-version",
    });
    expect(log).toEqual([]);
  });

  it("refuses a file a migration has left damaged", () => {
    const breaking: Migration[] = [
      (document) => ({ ...document, state: "gone" }),
    ];

    expect(readSaveDocument(atVersion(1), breaking)).toMatchObject({
      ok: false,
      reason: "damaged",
      message: "The save file is damaged: state isn't an object.",
    });
  });
});
