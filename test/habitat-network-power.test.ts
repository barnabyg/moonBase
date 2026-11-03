import { describe, expect, it } from "vitest";
import type {
  MissionDirectorResidence,
  PowerForecast,
  PowerNetworkSnapshot,
  Snapshot,
} from "../src/simulation";
import {
  formatHabitatNetworkPower,
  habitatNetworkApart,
  summarisePower,
} from "../src/ui/status-panel-text";

/** A power network as the status panel reads it, with nothing in it unless given. */
function network(
  figures: Partial<PowerNetworkSnapshot> = {},
): PowerNetworkSnapshot {
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

/** Structures as the status panel reads them: only their ids and types matter here. */
function structures(types: Record<string, string>): Snapshot["structures"] {
  return Object.entries(types).map(
    ([id, structureTypeId]) =>
      ({ id, structureTypeId }) as Snapshot["structures"][number],
  );
}

const inHabitat: MissionDirectorResidence = {
  residence: "habitat",
  habitatId: "habitat",
  movedInAtMinute: 0,
};

const base = structures({
  solar: "solar-array",
  firstBank: "battery-bank",
  habitat: "habitat",
  secondBank: "battery-bank",
  mast: "light-mast",
});

// The Habitat on a battery bank of its own, at Night, with the solar array
// and the other battery bank on another network.
const habitatsNetwork = network({
  structureIds: ["habitat", "secondBank"],
  consumptionKilowatts: 1.27,
  storedKilowattHours: 115.3,
  storageCapacityKilowattHours: 200,
});
const otherNetwork = network({
  structureIds: ["solar", "firstBank"],
  consumptionKilowatts: 0.12,
  storedKilowattHours: 190,
  storageCapacityKilowattHours: 200,
});
const split = { networks: [otherNetwork, habitatsNetwork] };

function forecast(minutesUntilEmpty: number | undefined): PowerForecast {
  return {
    minutesUntilEmpty,
    networks: [
      { structureIds: otherNetwork.structureIds, minutesUntilEmpty: undefined },
      { structureIds: habitatsNetwork.structureIds, minutesUntilEmpty },
    ],
  };
}

describe("the Habitat's network, apart from the rest of the base's power", () => {
  it("is the network of the Habitat the Mission Director lives in, when another network has a solar array or battery bank", () => {
    expect(habitatNetworkApart(split, inHabitat, base)).toBe(habitatsNetwork);
  });

  it("is none when the base's power is all on the Habitat's network", () => {
    const whole = network({
      structureIds: ["solar", "firstBank", "habitat", "secondBank"],
    });
    expect(
      habitatNetworkApart({ networks: [whole] }, inHabitat, base),
    ).toBeUndefined();
  });

  it("is none when the other networks have no power source, such as a Light Mast cut off", () => {
    const whole = network({
      structureIds: ["solar", "firstBank", "habitat", "secondBank"],
    });
    const mast = network({ structureIds: ["mast"] });
    expect(
      habitatNetworkApart({ networks: [whole, mast] }, inHabitat, base),
    ).toBeUndefined();
  });

  it("counts a solar array on another network at Night, when it generates nothing", () => {
    const habitatAndBanks = network({
      structureIds: ["firstBank", "habitat", "secondBank"],
    });
    const array = network({ structureIds: ["solar"] });
    expect(
      habitatNetworkApart(
        { networks: [habitatAndBanks, array] },
        inHabitat,
        base,
      ),
    ).toBe(habitatAndBanks);
  });

  it("is none while the Mission Director lives aboard the Lander", () => {
    expect(
      habitatNetworkApart(split, { residence: "lander" }, base),
    ).toBeUndefined();
  });
});

describe("the status panel's line for the Habitat's network", () => {
  it("says how much its battery banks hold and when it runs out, on its own network", () => {
    expect(
      formatHabitatNetworkPower(habitatsNetwork, forecast(90 * 60)),
    ).toEqual({
      value: "115.3 / 200.0 kWh",
      note: "own network, lasts 3d 18h",
      fraction: 115.3 / 200,
    });
  });

  it("says when it doesn't run out", () => {
    expect(
      formatHabitatNetworkPower(habitatsNetwork, forecast(undefined)),
    ).toMatchObject({ note: "own network, doesn't run out" });
  });

  it("says when it has no battery banks", () => {
    const unstored = network({
      structureIds: ["habitat"],
      generationKilowatts: 5,
    });
    expect(
      formatHabitatNetworkPower(unstored, {
        minutesUntilEmpty: undefined,
        networks: [{ structureIds: ["habitat"], minutesUntilEmpty: undefined }],
      }),
    ).toEqual({
      value: "no battery banks",
      note: "own network",
      fraction: undefined,
    });
  });
});

describe("a folded Power section with the Habitat on a network of its own", () => {
  it("also says how full the Habitat's battery banks are", () => {
    expect(summarisePower(split, habitatsNetwork)).toBe(
      "−1.39 kW · 76% · Habitat 58%",
    );
  });

  it("says so when the Habitat's network has no battery banks", () => {
    const unstored = network({ structureIds: ["habitat"] });
    expect(
      summarisePower({ networks: [otherNetwork, unstored] }, unstored),
    ).toBe("−0.12 kW · 95% · Habitat no storage");
  });
});
