import { describe, expect, it } from "vitest";
import type {
  LanderSnapshot,
  PowerNetworkSnapshot,
  SpareComponentsForecast,
} from "../src/simulation";
import {
  formatBasePower,
  formatLander,
  formatLifeSupport,
  formatResidence,
  formatSpareComponents,
  listStock,
} from "../src/ui/status-panel-text";
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

describe("the Power line", () => {
  it("shows power made and used to one decimal place, across the base's networks", () => {
    const network = (
      generationKilowatts: number,
      consumptionKilowatts: number,
    ): PowerNetworkSnapshot => ({
      structureIds: [],
      generationKilowatts,
      consumptionKilowatts,
      storedKilowattHours: 0,
      storageCapacityKilowattHours: 0,
      powered: true,
    });

    expect(
      formatBasePower({
        networks: [network(100, 30.25), network(37.57, 6.26)],
      }),
    ).toEqual({ value: "137.6 kW made", note: "36.5 kW used" });
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
