import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { describeStructure } from "../src/ui/describe";
import { formatPlant, formatTank } from "../src/ui/structure-state";
import { scenario, scenarioOf, type Scenario } from "./scenario";
import { changed } from "./worn";

// A bucket-wheel digger and a Regolith bin, built from the starting stock, with
// the excavator digging as it does in play. Nothing wears and nothing is hit, so
// that only digging and the Plants change the stock, and the Habitat keeps the
// Mission Director safe.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withDesigns } = await import("./with-designs");
  const { withoutDust } = await import("./without-dust");
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  const { safeHabitat } = await import("./safe-habitat");
  const base = withDesigns(
    safeHabitat(withoutMicrometeorites(withoutDust(actual.catalogue)), [
      "power",
      "radiation",
      "solar-particle-events",
    ]),
    ["continuous-excavation"],
  );
  const componentsOf = (id: string) =>
    base.structureTypes.find((type) => type.id === id)?.components ?? [];
  return {
    ...actual,
    catalogue: {
      ...base,
      startingStock: [
        ...base.startingStock,
        ...componentsOf("regolith-bin"),
        ...componentsOf("solar-array"),
      ],
    },
  };
});

/** The figures the data catalogue is checked against. */
const HEAP_HOLDS = 2000;
const BIN_HOLDS = 3000;
const DIGGER_KILOGRAMS_PER_HOUR = 30;

const solarSite: GroundPosition = { x: 20, y: 12 };
const secondSolarSite: GroundPosition = { x: 20, y: 0 };
const batterySite: GroundPosition = { x: 30, y: 30 };
const secondBatterySite: GroundPosition = { x: 40, y: 30 };
const diggerSite: GroundPosition = { x: 34, y: 12 };
const binSite: GroundPosition = { x: 34, y: -6 };
const secondBinSite: GroundPosition = { x: 44, y: -6 };

function regolithOf(state: Snapshot) {
  const line = state.bulkResources.find(
    ({ resourceId }) => resourceId === "regolith",
  );
  if (line === undefined) throw new Error("expected Regolith");
  return line;
}

function typed(state: Snapshot, typeId: string): StructureSnapshot {
  const found = state.structures.find(
    ({ structureTypeId }) => structureTypeId === typeId,
  );
  if (found === undefined) throw new Error(`expected a ${typeId}`);
  return found;
}

function runUntilBuilt(game: Scenario): void {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
}

/** The base as it stands, with this much Regolith in stock. */
function withRegolith(game: Scenario, kilograms: number): Scenario {
  return scenarioOf(
    changed(game.campaign, (state) => {
      const stock = state.bulkResources.find(
        ({ resourceId }) => resourceId === "regolith",
      );
      if (stock === undefined) throw new Error("expected Regolith");
      stock.kilograms = kilograms;
    }),
  );
}

function excavatorActivity(state: Snapshot): string | undefined {
  return state.machines.find(
    ({ machineTypeId }) => machineTypeId === catalogue.digging.machineTypeId,
  )?.activity.kind;
}

describe("a Regolith bin", () => {
  it("raises the Regolith limit from the heap's 2000 kg once it is commissioned, with no cable, and the excavator fills it", () => {
    const game = scenario();
    expect(regolithOf(game.state).limitKilograms).toBe(HEAP_HOLDS);

    game.plan("regolith-bin", binSite);
    game.advance({ minutes: 5 });
    expect(regolithOf(game.state).limitKilograms).toBe(HEAP_HOLDS);
    runUntilBuilt(game);
    expect(regolithOf(game.state).limitKilograms).toBe(HEAP_HOLDS + BIN_HOLDS);
    const bin = typed(game.state, "regolith-bin");
    expect(
      game.state.cables.some(({ toStructureId }) => toStructureId === bin.id),
    ).toBe(false);

    for (
      let hours = 0;
      regolithOf(game.state).kilograms < HEAP_HOLDS + BIN_HOLDS;
      hours++
    ) {
      if (hours > 10 * 24) throw new Error("The bin never filled.");
      game.advance({ hours: 1 });
    }
    expect(regolithOf(game.state).kilograms).toBe(HEAP_HOLDS + BIN_HOLDS);
    game.advance({ hours: 1 });
    expect(excavatorActivity(game.state)).not.toBe("digging");
  });

  it("starts digging as far below the raised limit as the data catalogue's level is below the heap's", () => {
    const built = scenario().plan("regolith-bin", binSite);
    runUntilBuilt(built);
    const { refillBelowKilograms } = catalogue.digging;

    // Above the heap's own level, but short of the bin's.
    const short = withRegolith(built, refillBelowKilograms + BIN_HOLDS - 10);
    short.advance({ hours: 3 });
    expect(excavatorActivity(short.state)).toBe("digging");

    const enough = withRegolith(built, refillBelowKilograms + BIN_HOLDS + 10);
    enough.advance({ hours: 3 });
    expect(excavatorActivity(enough.state)).not.toBe("digging");
  });

  it("holds its share of the stock, needs no power and loses none at Night, and says so", () => {
    const built = scenario()
      .plan("regolith-bin", binSite)
      .plan("regolith-bin", secondBinSite);
    runUntilBuilt(built);
    const game = withRegolith(built, 4000);
    game.advance({ minutes: 1 });
    const bin = typed(game.state, "regolith-bin");
    const limit = HEAP_HOLDS + 2 * BIN_HOLDS;

    expect(bin.tank).toMatchObject({
      resource: { kind: "bulk-resource", resourceId: "regolith" },
      addsKilograms: BIN_HOLDS,
      losing: false,
    });
    expect(bin.tank?.heldKilograms).toBeCloseTo((4000 * BIN_HOLDS) / limit);
    expect(formatTank(bin, true)).toBe(
      `holds ${(4000 * BIN_HOLDS) / limit} of ${BIN_HOLDS} kg of Regolith`,
    );

    for (let hours = 0; game.state.lunation.part !== "night"; hours++) {
      if (hours > 30 * 24) throw new Error("Night never came.");
      game.advance({ hours: 1 });
    }
    const atDusk = regolithOf(game.state).kilograms;
    game.advance({ hours: 48 });
    expect(regolithOf(game.state).kilograms).toBe(atDusk);
    expect(typed(game.state, "regolith-bin").tank?.losing).toBe(false);
  });

  it("is described as adding to the Regolith the base can hold, drawing nothing", () => {
    const type = catalogue.structureTypes.find(
      ({ id }) => id === "regolith-bin",
    );
    if (type === undefined) throw new Error("expected a Regolith bin");
    const text = describeStructure(type);
    expect(text).toMatch(/3000 kg/);
    expect(text).toMatch(/Regolith/);
    expect(text).not.toMatch(/at Night/);
  });
});

describe("a bucket-wheel digger", () => {
  it("digs Regolith by itself on power, and waits once the stock is full", () => {
    const game = scenario()
      .plan("solar-array", solarSite)
      .plan("solar-array", secondSolarSite)
      .plan("bucket-wheel-digger", diggerSite);
    runUntilBuilt(game);
    const full = withRegolith(game, HEAP_HOLDS - 10);
    for (
      let hours = 0;
      typed(full.state, "bucket-wheel-digger").plant?.stoppedFor?.reason !==
      "output-full";
      hours++
    ) {
      if (hours > 24) throw new Error("The digger never filled the stock.");
      full.advance({ hours: 1 });
    }
    const digger = typed(full.state, "bucket-wheel-digger");
    expect(digger.plant && formatPlant(digger.plant)).toMatch(
      /^waiting for room to store it: Regolith is \d+\.\d of 2000 kg$/,
    );
  });

  it("goes on digging at Night with stored power, while the excavator is parked", () => {
    const built = scenario()
      .plan("solar-array", solarSite)
      .plan("solar-array", secondSolarSite)
      .plan("battery-bank", batterySite)
      .plan("battery-bank", secondBatterySite)
      .plan("bucket-wheel-digger", diggerSite);
    runUntilBuilt(built);
    for (let hours = 0; built.state.lunation.part !== "night"; hours++) {
      if (hours > 30 * 24) throw new Error("Night never came.");
      built.advance({ hours: 1 });
    }
    built.advance({ hours: 6 });
    const game = withRegolith(built, 0);
    game.advance({ minutes: 1 });
    const before = regolithOf(game.state).kilograms;
    expect(excavatorActivity(game.state)).not.toBe("digging");
    expect(before).toBeLessThan(HEAP_HOLDS - 4 * DIGGER_KILOGRAMS_PER_HOUR);

    game.advance({ hours: 4 });

    expect(excavatorActivity(game.state)).not.toBe("digging");
    expect(regolithOf(game.state).kilograms - before).toBeCloseTo(
      4 * DIGGER_KILOGRAMS_PER_HOUR,
      0,
    );
  });
});
