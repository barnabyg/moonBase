import { describe, expect, it } from "vitest";
import type {
  ExpeditionSnapshot,
  ObservingProgrammeSnapshot,
  LanderSnapshot,
  PowerNetworkSnapshot,
} from "../src/simulation";
import {
  summariseMilestones,
  summariseMissionDirector,
  summarisePower,
  summariseStock,
  summariseResearch,
  summariseTravel,
} from "../src/ui/format";
import { toGameMinutes } from "./scenario";

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

describe("a folded Power section", () => {
  it("shows the power to spare across the base and how full its battery banks are", () => {
    expect(
      summarisePower({
        networks: [
          network({
            generationKilowatts: 10,
            consumptionKilowatts: 0.3,
            storedKilowattHours: 42,
            storageCapacityKilowattHours: 60,
          }),
          network({
            generationKilowatts: 2,
            consumptionKilowatts: 0.5,
            storedKilowattHours: 15,
            storageCapacityKilowattHours: 15,
          }),
        ],
      }),
    ).toBe("+11.20 kW · 76%");
  });

  it("shows power falling short, without battery banks to fill", () => {
    expect(
      summarisePower({ networks: [network({ consumptionKilowatts: 0.3 })] }),
    ).toBe("−0.30 kW");
  });
});

describe("a folded Mission Director section", () => {
  const oxygen = { stockId: "oxygen", kilograms: 24.9, inUse: true };
  const water = { stockId: "water", kilograms: 20, inUse: true };
  const inHabitat = {
    residence: "habitat",
    habitatId: "s1",
    movedInAtMinute: 0,
  } as const;

  it("shows how long the oxygen and water last, to the Earth Day", () => {
    expect(
      summariseMissionDirector(
        inHabitat,
        [oxygen, water],
        [
          {
            stockId: "oxygen",
            kilogramsPerEarthDay: -0.84,
            minutesUntilEmpty: toGameMinutes({ earthDays: 29, hours: 15 }),
          },
          {
            stockId: "water",
            kilogramsPerEarthDay: -3.5,
            minutesUntilEmpty: toGameMinutes({ earthDays: 5, hours: 17 }),
          },
        ],
      ),
    ).toBe("O₂ 29d · H₂O 5d");
  });

  it("shows a stock that the base's Plants keep rising, and one that ran out", () => {
    expect(
      summariseMissionDirector(
        inHabitat,
        [oxygen, { ...water, kilograms: 0 }],
        [
          {
            stockId: "oxygen",
            kilogramsPerEarthDay: 2.8,
            minutesUntilEmpty: undefined,
          },
          { stockId: "water", kilogramsPerEarthDay: 0, minutesUntilEmpty: 0 },
        ],
      ),
    ).toBe("O₂ rising · H₂O ran out");
  });

  it("shows hours left once a stock has less than an Earth Day", () => {
    expect(
      summariseMissionDirector(
        inHabitat,
        [oxygen],
        [
          {
            stockId: "oxygen",
            kilogramsPerEarthDay: -0.84,
            minutesUntilEmpty: toGameMinutes({ hours: 22, minutes: 10 }),
          },
        ],
      ),
    ).toBe("O₂ 23h");
  });

  it("says they are aboard the Lander, where nothing is used", () => {
    expect(
      summariseMissionDirector({ residence: "lander" }, [oxygen, water], []),
    ).toBe("aboard the Lander");
  });
});

describe("a folded Stock section", () => {
  const regolith = { resourceId: "regolith", kilograms: 1250.7 };
  const silicon = { resourceId: "silicon", kilograms: 30 };

  it("shows how many spare Components there are, how long they last, and the Regolith", () => {
    expect(
      summariseStock([silicon, regolith], {
        inStock: 6,
        forPendingRepairs: 0,
        perEarthDay: 0.6,
        minutesUntilEmpty: toGameMinutes({ earthDays: 9, hours: 4 }),
      }),
    ).toBe("6 spares, last 9d · Regolith 1250 kg");
  });

  it("leaves out how long spares last while nothing wears down, and says when they are too few", () => {
    const spares = {
      inStock: 1,
      forPendingRepairs: 0,
      perEarthDay: 0,
      minutesUntilEmpty: undefined,
    };
    expect(summariseStock([regolith], spares)).toBe(
      "1 spare · Regolith 1250 kg",
    );
    expect(
      summariseStock([], {
        ...spares,
        forPendingRepairs: 2,
        minutesUntilEmpty: 0,
      }),
    ).toBe("1 spare, too few");
  });
});

describe("a folded Lander & Expeditions section", () => {
  const now = toGameMinutes({ earthDays: 40 });
  const away = (
    state: LanderSnapshot["state"],
    left: number,
  ): LanderSnapshot => ({
    state,
    position: { x: 0, y: 0 },
    landingPadId: "s4",
    legStartedAtMinute: now - 60,
    legEndsAtMinute: now + left,
    cargo: [],
  });
  const landed: LanderSnapshot = {
    ...away("landed-free", 0),
    legStartedAtMinute: undefined,
    legEndsAtMinute: undefined,
  };

  it("shows where the Lander is and when it next arrives or leaves", () => {
    const twoDays = toGameMinutes({ earthDays: 2, hours: 3 });
    expect(summariseTravel(landed, undefined, now)).toBe("landed");
    expect(
      summariseTravel(away("travelling-to-earth", twoDays), undefined, now),
    ).toBe("at Earth in 2d");
    expect(summariseTravel(away("turnaround", twoDays), undefined, now)).toBe(
      "leaves Earth in 2d",
    );
    expect(
      summariseTravel(away("travelling-to-moon", twoDays), undefined, now),
    ).toBe("lands in 2d");
  });

  it("adds the Rover on an Expedition, and when it is back", () => {
    const expedition: ExpeditionSnapshot = {
      robotId: "r1",
      roverId: "v1",
      stage: "away",
      returnsAtMinute: now + toGameMinutes({ hours: 5 }),
      resourceId: "water-ice",
      kilograms: 0,
    };
    expect(summariseTravel(landed, expedition, now)).toBe(
      "landed · Rover back in 5h",
    );
    expect(
      summariseTravel(
        landed,
        { ...expedition, stage: "driving-out", returnsAtMinute: undefined },
        now,
      ),
    ).toBe("landed · Rover on Expedition");
  });
});

describe("a folded Research section", () => {
  /** The observing programme of a base with no telescope, unless given. */
  const programme = (
    figures: Partial<ObservingProgrammeSnapshot> = {},
  ): ObservingProgrammeSnapshot => ({
    progress: 0,
    telescopes: 0,
    observing: 0,
    minutesLeft: undefined,
    stoppedFor: undefined,
    ...figures,
  });
  const seismic = {
    researchTaskId: "seismic-monitoring",
    progress: 0.456,
    minutesLeft: toGameMinutes({ earthDays: 2 }),
  };

  it("shows the Research Task running and how far it has got", () => {
    expect(summariseResearch(seismic, programme())).toBe(
      "Seismic monitoring · 45%",
    );
    expect(summariseResearch(undefined, programme())).toBe("none running");
  });

  it("shows how far the observing programme's round has got once the base has a telescope, with or without a Research Task running", () => {
    const observing = programme({
      progress: 0.208,
      telescopes: 1,
      observing: 1,
      minutesLeft: 2280,
    });

    expect(summariseResearch(seismic, observing)).toBe(
      "Seismic monitoring · 45%, Night-sky survey · 20%",
    );
    expect(summariseResearch(undefined, observing)).toBe(
      "none running, Night-sky survey · 20%",
    );
  });
});

describe("a folded Milestones section", () => {
  it("shows the Milestone to aim for now", () => {
    expect(
      summariseMilestones({
        reachedIds: ["power-storage"],
        currentId: "moved-in",
        nextId: "lander-departs",
      }),
    ).toBe("Habitat commissioned, Mission Director moved in");
    expect(
      summariseMilestones({
        reachedIds: [],
        currentId: undefined,
        nextId: undefined,
      }),
    ).toBe("every Milestone reached");
  });
});
