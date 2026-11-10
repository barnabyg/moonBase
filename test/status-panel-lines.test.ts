import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import type {
  LanderSnapshot,
  PowerNetworkSnapshot,
  ScienceForecast,
  ScienceSource,
  SpareComponentsForecast,
} from "../src/simulation";
import {
  formatBasePower,
  formatLander,
  formatLifeSupport,
  formatResearchQueue,
  formatResidence,
  formatScienceRate,
  formatSpareComponents,
  formatStoredPower,
  listStock,
} from "../src/ui/status-panel-text";
import { designsToUnlock } from "../src/ui/tech-tree-text";
import { toGameMinutes } from "./scenario";

// The status panel's lines, worded to say what matters in as little room as
// it takes.

const habitat = {
  id: "habitat-1",
  structureTypeId: "buried-habitat",
  powered: true,
};
const inHabitat = {
  residence: "habitat",
  habitatId: "habitat-1",
  movedInAtMinute: 0,
} as const;

describe("the Living line", () => {
  it("says only where the Mission Director lives aboard the Lander, which needs no power from the base", () => {
    expect(formatResidence({ residence: "lander" }, [], undefined)).toEqual({
      value: "aboard the Lander",
    });
  });

  it("says the Habitat has power, in a word, while nothing is forecast to fail", () => {
    expect(
      formatResidence(inHabitat, [habitat], {
        minutesUntilPowerLost: undefined,
      }),
    ).toEqual({ value: "in the Buried Habitat", note: "powered" });
  });

  it("says when the Habitat's power fails, and that it has", () => {
    expect(
      formatResidence(inHabitat, [habitat], {
        minutesUntilPowerLost: toGameMinutes({ earthDays: 1, hours: 16 }),
      }),
    ).toEqual({
      value: "in the Buried Habitat",
      note: "power fails in 1d 16h",
    });
    expect(
      formatResidence(inHabitat, [{ ...habitat, powered: false }], undefined),
    ).toEqual({ value: "in the Buried Habitat", note: "power failed" });
  });
});

/** A power network as the status panel reads it, with nothing in it unless given. */
function network(figures: Partial<PowerNetworkSnapshot>): PowerNetworkSnapshot {
  return {
    structureIds: [],
    generationKilowatts: 0,
    consumptionKilowatts: 0,
    storedKilowattHours: 0,
    storageCapacityKilowattHours: 0,
    powered: true,
    ...figures,
  };
}

describe("the Power line", () => {
  it("shows the power to spare first, then power made and used, to one decimal place, across the base's networks", () => {
    expect(
      formatBasePower({
        networks: [
          network({ generationKilowatts: 100, consumptionKilowatts: 30.25 }),
          network({ generationKilowatts: 37.57, consumptionKilowatts: 6.26 }),
        ],
      }),
    ).toEqual({ value: "+101.1 kW", note: "137.6 made, 36.5 used" });
  });

  it("shows a shortfall, as at Night, when the solar arrays make none", () => {
    expect(
      formatBasePower({
        networks: [network({ consumptionKilowatts: 36.51 })],
      }),
    ).toEqual({ value: "−36.5 kW", note: "0.0 made, 36.5 used" });
  });
});

describe("the Stored line", () => {
  const stored = {
    networks: [
      network({ storedKilowattHours: 42, storageCapacityKilowattHours: 60 }),
    ],
  };
  const forecast = (minutesUntilEmpty: number | undefined) => ({
    minutesUntilEmpty,
    networks: [],
  });

  it("names the Night that the stored power lasts, as the forecast follows the Daylight and Night ahead", () => {
    expect(formatStoredPower(stored, forecast(undefined))).toEqual({
      value: "42.0 / 60.0 kWh",
      note: "lasts the Night",
      fraction: 0.7,
    });
  });

  it("says how long it lasts when it runs out, and that it is empty once it has", () => {
    expect(
      formatStoredPower(
        stored,
        forecast(toGameMinutes({ earthDays: 8, hours: 8 })),
      ),
    ).toMatchObject({ note: "lasts 8d 8h" });
    expect(
      formatStoredPower(
        { networks: [network({ storageCapacityKilowattHours: 60 })] },
        forecast(undefined),
      ),
    ).toMatchObject({ value: "0.0 / 60.0 kWh", note: "empty" });
  });
});

describe("the Lander line", () => {
  it("says when the Lander lands without saying where, on its way to the Moon", () => {
    const lander: LanderSnapshot = {
      position: { x: 0, y: 0 },
      state: "travelling-to-moon",
      legStartedAtMinute: 0,
      legEndsAtMinute: toGameMinutes({ earthDays: 2, hours: 7 }),
      cargo: [],
      landingPadId: "landing-pad-1",
    };

    expect(formatLander(lander, 0, [])).toEqual({
      value: "travelling to the Moon",
      note: "lands in 2d 7h",
    });
  });
});

describe("a life support stock's line", () => {
  const stock = {
    stockId: "oxygen",
    kilograms: 45.2,
    limitKilograms: 400,
    inUse: true,
  };

  it("gives the figures of one rising too slowly to last, and keeps the reason for hovering over it", () => {
    expect(
      formatLifeSupport(
        stock,
        {
          stockId: "oxygen",
          kilogramsPerEarthDay: 0.1,
          minutesUntilEmpty: toGameMinutes({ earthDays: 229, hours: 18 }),
          holdingFull: false,
          minutesUntilReserve: undefined,
        },
        inHabitat,
      ),
    ).toEqual({
      value: "45.2 of 400 kg",
      note: "rising 0.1 kg a day, lasts 229d 18h",
      explanation:
        "It is rising now, but lasts only that long: the Plants that make it may stand idle at Night.",
    });
  });

  it("has nothing to explain of one that is simply rising", () => {
    expect(
      formatLifeSupport(
        stock,
        {
          stockId: "oxygen",
          kilogramsPerEarthDay: 2.8,
          minutesUntilEmpty: undefined,
          holdingFull: false,
          minutesUntilReserve: undefined,
        },
        inHabitat,
      ),
    ).toEqual({ value: "45.2 of 400 kg", note: "rising 2.8 kg a day" });
  });
});

describe("the Spares line", () => {
  it("gives the figures of spare Components rising too slowly to last, and keeps the reason for hovering over it", () => {
    const forecast: SpareComponentsForecast = {
      inStock: 6,
      forPendingRepairs: 0,
      perEarthDay: 1,
      madePerEarthDay: 1.5,
      countedOn: 6,
      minutesUntilEmpty: toGameMinutes({ earthDays: 9, hours: 4 }),
    };

    expect(formatSpareComponents(forecast)).toEqual({
      value: "6 in stock",
      note: "rising 0.5 a day, last 9d 4h",
      explanation:
        "They are rising now, but last only that long: the Plants that make them may stand idle at Night.",
    });
  });
});

describe("the Components in the base's stock", () => {
  it("are listed with how many there are of each, leaving out those there are none of", () => {
    expect(
      listStock({
        position: { x: 0, y: 0 },
        components: [
          { componentId: "solar-panel", count: 1 },
          { componentId: "array-mast", count: 0 },
          { componentId: "spare-component", count: 36 },
        ],
      }),
    ).toEqual([
      { count: 1, name: "solar panel" },
      { count: 36, name: "spare components" },
    ]);
  });
});

describe("the Science line", () => {
  const forecast = (
    rates: Partial<Record<ScienceSource, number>>,
  ): ScienceForecast => {
    const sources = (
      [
        "research-task",
        "observing-programme",
        "infrared-survey",
        "radio-survey",
        "growing",
      ] as const
    ).map((source) => ({ source, perEarthDay: rates[source] ?? 0 }));
    return {
      perEarthDay: sources.reduce(
        (sum, { perEarthDay }) => sum + perEarthDay,
        0,
      ),
      sources,
    };
  };

  it("says how much Science the base earns an Earth Day, and where it comes from on hovering over it", () => {
    expect(
      formatScienceRate(
        forecast({
          "research-task": 2.5,
          "observing-programme": 0.43,
          growing: 0.04,
        }),
      ),
    ).toEqual({
      value: "+3.0 a day",
      explanation:
        "As things stand: the Research Task running 2.5, night-sky survey 0.4 and growing 0.04 Science an Earth Day. What works only at Night is averaged over a Lunation.",
    });
  });

  it("says when none is being earned", () => {
    expect(formatScienceRate(forecast({}))).toEqual({
      value: "none being earned",
      explanation:
        "A Research Task, a telescope or a Greenhouse earns Science.",
    });
  });
});

describe("the Queued line", () => {
  const starting = catalogue.designs
    .filter((design) => design.starting)
    .map((design) => design.id);
  const cheapest = Math.min(
    ...catalogue.designs
      .filter((design) => !design.starting)
      .map((design) => design.scienceCost),
  );

  it("finds no Design to unlock without the Science for the cheapest", () => {
    expect(
      designsToUnlock({ science: cheapest - 1, unlockedDesignIds: starting }),
    ).toEqual([]);
  });

  it("finds the Designs whose cost the Science covers and whose prerequisites are unlocked", () => {
    const found = designsToUnlock({
      science: 1e6,
      unlockedDesignIds: starting,
    });

    expect(found.length).toBeGreaterThan(0);
    for (const design of found) {
      expect(starting).not.toContain(design.id);
      expect(
        design.prerequisiteDesignIds.every((id) => starting.includes(id)),
      ).toBe(true);
    }
    // One whose prerequisite is locked is out of reach, whatever the Science.
    const beyond = catalogue.designs.filter((design) =>
      design.prerequisiteDesignIds.some((id) => !starting.includes(id)),
    );
    expect(beyond.length).toBeGreaterThan(0);
    for (const design of beyond) expect(found).not.toContain(design);
  });

  it("lists what is queued, in order, whatever the Science would unlock", () => {
    const [first, second] = catalogue.researchTasks;
    if (first === undefined || second === undefined) {
      throw new Error("expected two Research Tasks");
    }
    expect(
      formatResearchQueue([first.id, second.id], catalogue.designs),
    ).toEqual({ value: `1. ${first.label}, 2. ${second.label}` });
  });

  it("says, with nothing queued, that the Science would unlock a Design, by name, or how many", () => {
    const [one, two] = catalogue.designs.filter((design) => !design.starting);
    if (one === undefined || two === undefined) {
      throw new Error("expected two Designs");
    }

    expect(formatResearchQueue([], [])).toEqual({ value: "none" });
    expect(formatResearchQueue([], [one])).toEqual({
      value: "none",
      note: `Science for ${one.label}`,
    });
    expect(formatResearchQueue([], [one, two])).toEqual({
      value: "none",
      note: "Science for 2 Designs",
    });
  });
});
