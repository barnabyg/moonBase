import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import type { GameEvent, Snapshot } from "../src/simulation";
import { untilBatteriesFull, loadSample } from "./sample-saves";

/**
 * What the sample saves of format versions 27 to 41 hold once loaded, and that
 * each plays on from where it was saved.
 */

describe("the sample save of format version 27", () => {
  // Saved 6000 game-minutes in, after four Research Tasks paid 45 Science
  // and Regolith sintering was unlocked for 30, with the Sintered block
  // testing it opened up 600 game-minutes in. Its length and the Science it
  // pays come from the data catalogue as it is.
  const sintered = catalogue.researchTasks.find(
    (task) => task.id === "sintered-block-testing",
  );
  if (sintered === undefined)
    throw new Error("expected Sintered block testing");
  const minutesLeft = sintered.lengthHours * 60 - 600;

  it("loads with Regolith sintering unlocked, 15 Science left, and Sintered block testing running", () => {
    const state = loadSample("version-27.moonbase").snapshot();

    expect(state.clock).toMatchObject({ earthDay: 5, hour: 4, minute: 0 });
    expect(state.science).toBe(15);
    expect(state.unlockedDesignIds).toContain("regolith-sintering");
    expect(state.unlockedDesignIds).not.toContain("large-battery-banks");
    expect(state.researchTask).toMatchObject({
      researchTaskId: "sintered-block-testing",
      minutesLeft,
    });
    expect(state.completedResearchTaskIds).toEqual([
      "regolith-sample-analysis",
      "ice-volatiles-assay",
      "radiation-environment-survey",
      "dust-levitation-study",
    ]);
  });

  it("plays on from where it was saved, Sintered block testing completing and its Science unlocking another Design", () => {
    const campaign = loadSample("version-27.moonbase");
    expect(campaign.unlockDesign("regolith-sintering")).toMatchObject({
      ok: false,
      reason: "already-unlocked",
    });

    const completed = campaign
      .advance(minutesLeft)
      .filter((event) => event.kind === "research-task-completed");

    expect(completed).toEqual([
      {
        kind: "research-task-completed",
        atMinute: 6000 + minutesLeft,
        researchTaskId: "sintered-block-testing",
        science: sintered.science,
      },
    ]);
    expect(campaign.snapshot().science).toBe(15 + sintered.science);
    expect(campaign.unlockDesign("large-battery-banks")).toMatchObject({
      ok: true,
    });
    expect(campaign.snapshot().ended).toBeUndefined();
  });
});

describe("the sample save of format version 28", () => {
  // Saved 3352 game-minutes in, after three Research Tasks paid 25 Science
  // and Large battery banks was unlocked for all of it, with a large
  // battery bank an hour into its Assembly beside a solar array.
  const storageOf = (structureTypeId: string) =>
    catalogue.structureTypes.find((type) => type.id === structureTypeId)?.power
      .storageKilowattHours ?? Number.NaN;

  it("loads with Large battery banks unlocked, no Science left, and a large battery bank being assembled from its Components", () => {
    const state = loadSample("version-28.moonbase").snapshot();

    expect(state.clock).toMatchObject({ earthDay: 3, hour: 7, minute: 52 });
    expect(state.science).toBe(0);
    expect(state.unlockedDesignIds).toContain("large-battery-banks");
    expect(state.constructions).toEqual([
      expect.objectContaining({
        structureTypeId: "large-battery-bank",
        stage: "assembly",
        componentsTaken: true,
      }),
    ]);
    expect(state.structures.map((s) => s.structureTypeId)).toEqual([
      "solar-array",
    ]);
  });

  it("plays on from where it was saved, the large battery bank being commissioned and storing more than a battery bank can", () => {
    const campaign = loadSample("version-28.moonbase");
    expect(campaign.unlockDesign("large-battery-banks")).toMatchObject({
      ok: false,
      reason: "already-unlocked",
    });

    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 2 * 24) throw new Error("It was never commissioned.");
      campaign.advance(60);
    }
    campaign.advance(24 * 60);

    const state = campaign.snapshot();
    expect(state.ended).toBeUndefined();
    const network = state.power.networks.find((candidate) =>
      candidate.structureIds.includes("structure-2"),
    );
    expect(network?.storageCapacityKilowattHours).toBe(
      storageOf("large-battery-bank"),
    );
    expect(network?.storedKilowattHours).toBeGreaterThan(
      storageOf("battery-bank"),
    );
  });
});

describe("the sample save of format version 29", () => {
  // Saved 39626 game-minutes in, 25 game-minutes after the Lander landed
  // with a Robot the Robots Design let it bring, two light masts planned
  // as it landed. The Mission Director waited out the first Night aboard
  // the Lander, then moved into the Habitat so that it could fly.
  it("loads with the Robots Design unlocked and the second Robot walking from the Lander to the stockpile, as the first works on a light mast", () => {
    const state = loadSample("version-29.moonbase").snapshot();

    expect(state.clock).toMatchObject({ earthDay: 28, hour: 12, minute: 26 });
    expect(state.unlockedDesignIds).toContain("robots");
    expect(state.lander).toMatchObject({ state: "landed-free", cargo: [] });
    expect(state.robots).toEqual([
      expect.objectContaining({
        id: "robot-1",
        activity: expect.objectContaining({
          structureId: "structure-4",
        }) as unknown,
      }),
      expect.objectContaining({
        id: "robot-2",
        activity: { kind: "walking-to-stockpile" },
        carrying: [],
      }),
    ]);
    expect(state.constructions.map((c) => c.structureTypeId)).toEqual([
      "light-mast",
      "light-mast",
    ]);
  });

  it("plays on from where it was saved, the second Robot arriving at the stockpile and building a light mast alongside the first", () => {
    const campaign = loadSample("version-29.moonbase");

    const events: GameEvent[] = [];
    const secondRobotOn = new Set<string>();
    for (let minutes = 0; campaign.snapshot().constructions.length > 0;) {
      if (minutes > 3 * 24 * 60) throw new Error("They were never built.");
      events.push(...campaign.advance(1));
      minutes += 1;
      const activity = campaign.snapshot().robots[1]?.activity;
      if (activity !== undefined && "structureId" in activity) {
        secondRobotOn.add(activity.structureId);
      }
    }

    expect(events).toContainEqual(
      expect.objectContaining({ kind: "robot-arrived", robotId: "robot-2" }),
    );
    expect(
      [...secondRobotOn].some((id) =>
        ["structure-4", "structure-5"].includes(id),
      ),
    ).toBe(true);
    const state = campaign.snapshot();
    expect(state.ended).toBeUndefined();
    expect(
      state.structures.filter((s) => s.structureTypeId === "light-mast"),
    ).toHaveLength(2);
  });
});

describe("the sample save of format version 30", () => {
  // Saved 40289 game-minutes in, an hour into the Assembly of a
  // dust-sealed solar array, built from two solar panels and a sealed
  // array mast a Launch brought once Dust-sealed solar arrays was
  // unlocked. The Mission Director moved into the Habitat after the first
  // Night, so that the Lander could fly.
  it("loads with Dust-sealed solar arrays unlocked and a dust-sealed solar array being assembled beside the first solar array", () => {
    const state = loadSample("version-30.moonbase").snapshot();

    expect(state.clock).toMatchObject({ earthDay: 28, hour: 23, minute: 29 });
    expect(state.science).toBe(5);
    expect(state.unlockedDesignIds).toContain("dust-sealed-solar-arrays");
    expect(state.constructions).toEqual([
      expect.objectContaining({
        id: "structure-4",
        structureTypeId: "dust-sealed-solar-array",
        stage: "assembly",
        componentsTaken: true,
      }),
    ]);
    expect(state.structures.map((s) => s.structureTypeId)).toEqual([
      "solar-array",
      "battery-bank",
      "habitat",
    ]);
  });

  it("plays on from where it was saved, the dust-sealed solar array generating like the first and wearing down by Dust more slowly", () => {
    const campaign = loadSample("version-30.moonbase");
    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 2 * 24) throw new Error("It was never commissioned.");
      campaign.advance(60);
    }
    const condition = (id: string) =>
      campaign.snapshot().structures.find((s) => s.id === id)
        ?.conditionPercent ?? Number.NaN;
    const before = [condition("structure-1"), condition("structure-4")];

    campaign.advance(24 * 60);

    const state = campaign.snapshot();
    expect(state.ended).toBeUndefined();
    expect(state.lunation.part).toBe("daylight");
    expect(state.structures.find((s) => s.id === "structure-4")).toMatchObject({
      structureTypeId: "dust-sealed-solar-array",
      powered: true,
    });
    const lost = [
      (before[0] ?? 0) - condition("structure-1"),
      (before[1] ?? 0) - condition("structure-4"),
    ];
    expect(lost[0]).toBeCloseTo(24 * 0.05);
    expect(lost[1]).toBeCloseTo(24 * 0.02);
  });
});

describe("the sample save of format version 31", () => {
  // Saved 41420 game-minutes in, half an hour into the Assembly of a
  // prefabricated solar array from one of two prefabricated array packs a
  // Launch brought once Prefabricated solar arrays was unlocked. The
  // Lander brought them down onto a sintered landing pad the regolith
  // printer laid once Regolith sintering was unlocked, after printing
  // Regolith shielding over the Habitat.
  it("loads with Prefabricated solar arrays and Regolith sintering unlocked, the Lander on a sintered landing pad, and a prefabricated solar array being assembled", () => {
    const state = loadSample("version-31.moonbase").snapshot();

    expect(state.clock).toMatchObject({ earthDay: 29, hour: 18, minute: 20 });
    expect(state.science).toBe(25);
    expect(state.unlockedDesignIds).toEqual(
      expect.arrayContaining([
        "prefabricated-solar-arrays",
        "regolith-sintering",
      ]),
    );
    expect(state.structures.map((s) => s.structureTypeId)).toEqual([
      "solar-array",
      "battery-bank",
      "habitat",
      "regolith-shielding",
      "sintered-landing-pad",
    ]);
    expect(state.lander).toMatchObject({
      state: "landed-free",
      position: { x: -40, y: 30 },
      landingPadId: "structure-5",
    });
    expect(state.constructions).toEqual([
      expect.objectContaining({
        id: "structure-6",
        structureTypeId: "prefabricated-solar-array",
        stage: "assembly",
        componentsTaken: true,
      }),
    ]);
    expect(
      state.stockpile.components.find(
        (stock) => stock.componentId === "prefabricated-array-pack",
      ),
    ).toEqual({ componentId: "prefabricated-array-pack", count: 1 });
  });

  it("plays on from where it was saved, the prefabricated solar array commissioned within the hour, powered and cabled to the first solar array", () => {
    const campaign = loadSample("version-31.moonbase");
    for (let minutes = 0; campaign.snapshot().constructions.length > 0;) {
      if (minutes > 60) throw new Error("It was never commissioned.");
      campaign.advance(1);
      minutes += 1;
    }

    campaign.advance(24 * 60);

    const state = campaign.snapshot();
    expect(state.ended).toBeUndefined();
    expect(state.lunation.part).toBe("daylight");
    expect(state.structures.find((s) => s.id === "structure-6")).toMatchObject({
      structureTypeId: "prefabricated-solar-array",
      powered: true,
    });
    expect(
      state.power.networks.find((network) =>
        network.structureIds.includes("structure-6"),
      )?.structureIds,
    ).toContain("structure-1");
  });
});

describe("the sample save of format version 32", () => {
  // Saved 40297 game-minutes in, an hour into the Assembly of an
  // electrolysis plant from an ice melter and one of two electrolyser
  // stacks a Launch brought once Water electrolysis was unlocked, with the
  // 200 kg of water ice an Expedition brought back in stock.
  it("loads with Water electrolysis unlocked, an electrolysis plant being assembled, an electrolyser stack in stock and an Expedition's water ice", () => {
    const state = loadSample("version-32.moonbase").snapshot();

    expect(state.clock).toMatchObject({ earthDay: 28, hour: 23, minute: 37 });
    expect(state.unlockedDesignIds).toContain("water-electrolysis");
    expect(state.missionDirector).toMatchObject({ residence: "habitat" });
    expect(state.structures.map((s) => s.structureTypeId)).toEqual([
      "solar-array",
      "battery-bank",
      "habitat",
    ]);
    expect(state.constructions).toEqual([
      expect.objectContaining({
        id: "structure-4",
        structureTypeId: "electrolysis-plant",
        stage: "assembly",
        componentsTaken: true,
      }),
    ]);
    expect(
      state.stockpile.components.find(
        (stock) => stock.componentId === "electrolyser-stack",
      ),
    ).toEqual({ componentId: "electrolyser-stack", count: 1 });
    expect(
      state.bulkResources.find((stock) => stock.resourceId === "water-ice"),
    ).toEqual({ resourceId: "water-ice", kilograms: 200 });
  });

  it("plays on from where it was saved, the electrolysis plant commissioned within a day and turning the water ice into oxygen", () => {
    const campaign = loadSample("version-32.moonbase");
    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 24) throw new Error("It was never commissioned.");
      campaign.advance(60);
    }
    untilBatteriesFull(campaign);
    const oxygen = (state: Snapshot) =>
      state.lifeSupport.find((stock) => stock.stockId === "oxygen")
        ?.kilograms ?? Number.NaN;
    const ice = (state: Snapshot) =>
      state.bulkResources.find((stock) => stock.resourceId === "water-ice")
        ?.kilograms ?? Number.NaN;
    const before = campaign.snapshot();

    campaign.advance(12 * 60);

    const after = campaign.snapshot();
    expect(after.ended).toBeUndefined();
    expect(after.lunation.part).toBe("daylight");
    expect(after.structures.find((s) => s.id === "structure-4")).toMatchObject({
      structureTypeId: "electrolysis-plant",
    });
    expect(ice(after)).toBeLessThan(ice(before));
    expect(oxygen(after)).toBeGreaterThan(oxygen(before));
  });
});

describe("the sample save of format version 33", () => {
  // Saved 3302 game-minutes in, an hour and a half after the Mission
  // Director moved into a Habitat beside a solar array and a battery bank,
  // with the Lander landed and free to fly.
  it("loads with power storage and moving in reached, and the Lander departing current", () => {
    const state = loadSample("version-33.moonbase").snapshot();

    expect(state.clock.elapsedMinutes).toBe(3302);
    expect(state.missionDirector).toMatchObject({ residence: "habitat" });
    expect(state.lander.state).toBe("landed-free");
    expect(state.milestones).toMatchObject({
      reachedIds: ["power-storage", "moved-in"],
      currentId: "lander-departs",
      currentActId: "act-1",
    });
  });

  it("plays on from where it was saved, reaching the Lander departing as it takes off", () => {
    const campaign = loadSample("version-33.moonbase");
    expect(campaign.sendLander()).toEqual({ ok: true });

    const events = campaign.advance(1);

    expect(events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["lander-took-off", "milestone-reached"]),
    );
    expect(campaign.snapshot().milestones.reachedIds).toEqual([
      "power-storage",
      "moved-in",
      "lander-departs",
    ]);
  });
});

describe("the sample save of format version 34", () => {
  // Saved 9970 game-minutes in, an hour into the Assembly of a water wall
  // over the Mission Director's Habitat and its Regolith shielding, once
  // Water-wall shielding was unlocked, its four bladders brought and
  // filled from the water stock as its Assembly started.
  it("loads with Water-wall shielding unlocked and a water wall being assembled over the shielded Habitat", () => {
    const state = loadSample("version-34.moonbase").snapshot();

    expect(state.clock.elapsedMinutes).toBe(9970);
    expect(state.unlockedDesignIds).toContain("water-wall-shielding");
    expect(state.missionDirector).toMatchObject({ residence: "habitat" });
    expect(
      state.structures.find((s) => s.structureTypeId === "habitat"),
    ).toMatchObject({ shielded: true, waterWalled: false });
    expect(state.constructions).toEqual([
      expect.objectContaining({
        structureTypeId: "water-wall",
        stage: "assembly",
        componentsTaken: true,
      }),
    ]);
  });

  it("plays on from where it was saved, the water wall commissioned within a day and cutting the Radiation Dose", () => {
    const campaign = loadSample("version-34.moonbase");
    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 24) throw new Error("It was never commissioned.");
      campaign.advance(60);
    }

    const state = campaign.snapshot();
    expect(state.ended).toBeUndefined();
    expect(
      state.structures.find((s) => s.structureTypeId === "habitat"),
    ).toMatchObject({ shielded: true, waterWalled: true });
    expect(campaign.forecasts().radiationDose.millisievertsPerEarthDay).toBe(
      catalogue.radiation.doseRateMillisievertsPerEarthDay.waterWalledHabitat,
    );
  });
});

describe("the sample save of format version 35", () => {
  it("loads with the extraction plant half way through its batch, and the vacuum fabrication plant waiting for silicon", () => {
    const campaign = loadSample("version-35.moonbase");
    const plantOf = (structureTypeId: string) =>
      campaign
        .snapshot()
        .structures.find(
          (structure) => structure.structureTypeId === structureTypeId,
        )?.plant;

    expect(plantOf("extraction-plant")).toEqual({
      running: true,
      stoppedFor: undefined,
      batch: { recipeId: "oxygen", minutesLeft: 30 },
    });
    expect(plantOf("vacuum-fabrication-plant")).toEqual({
      running: false,
      stoppedFor: {
        reason: "no-input",
        resource: { kind: "bulk-resource", resourceId: "silicon" },
        kilograms: 0.2,
        kilogramsNeeded: 0.35,
      },
      batch: undefined,
    });

    campaign.advance(30);

    expect(
      campaign
        .snapshot()
        .bulkResources.find((stock) => stock.resourceId === "silicon")
        ?.kilograms,
    ).toBeCloseTo(0.22, 6);
    expect(plantOf("extraction-plant")?.batch).toBeUndefined();
  });
});

describe("the sample save of format version 36", () => {
  // Saved 45900 game-minutes in, an hour after the Lander left Earth with
  // oxygen, water and five spare Components paid for at the Launch fee.
  it("loads with the Lander on its way back, its locked manifest at the fee it was paid with", () => {
    const state = loadSample("version-36.moonbase").snapshot();

    expect(state.clock.elapsedMinutes).toBe(45900);
    expect(state.lander).toMatchObject({
      state: "travelling-to-moon",
      legEndsAtMinute: 50160,
    });
    expect(state.launchManifest).toMatchObject({
      locked: true,
      costMillionDollars: 159,
      feeMillionDollars: 150,
    });
  });

  it("plays on from where it was saved, the next manifest costing the Launch fee once the Lander has landed", () => {
    const campaign = loadSample("version-36.moonbase");
    const funding = campaign.snapshot().fundingMillionDollars;

    campaign.advance(50160 - 45900);

    const state = campaign.snapshot();
    expect(state.lander.state).toBe("landed-free");
    expect(state.fundingMillionDollars).toBe(funding);
    expect(state.launchManifest).toMatchObject({
      items: [],
      locked: false,
      feeMillionDollars: catalogue.launch.feeMillionDollars,
    });
  });
});

describe("the sample save of format version 37", () => {
  // Saved 6740 game-minutes in, in the first Daylight, with the Mission
  // Director in the Habitat, the water-processing plant 20 minutes into a
  // batch, and the extraction plant switched off after its last batch.
  it("loads with the extraction plant switched off, saying so, and the water-processing plant running", () => {
    const state = loadSample("version-37.moonbase").snapshot();
    const plantOf = (structureTypeId: string) =>
      state.structures.find(
        (structure) => structure.structureTypeId === structureTypeId,
      );

    expect(state.clock.elapsedMinutes).toBe(6740);
    expect(plantOf("extraction-plant")).toMatchObject({
      switchedOff: true,
      plant: {
        running: false,
        stoppedFor: { reason: "switched-off" },
        batch: undefined,
      },
    });
    expect(plantOf("water-processing-plant")).toMatchObject({
      switchedOff: false,
      plant: {
        running: true,
        stoppedFor: undefined,
        batch: { recipeId: "water", minutesLeft: 40 },
      },
    });
  });

  it("plays on from where it was saved, the extraction plant taking no Regolith until it is switched on", () => {
    const campaign = loadSample("version-37.moonbase");
    const regolith = () =>
      campaign
        .snapshot()
        .bulkResources.find((stock) => stock.resourceId === "regolith")
        ?.kilograms;
    const before = regolith();

    campaign.advance(3 * 60);
    expect(regolith()).toBe(before);
    const extraction = campaign
      .snapshot()
      .structures.find(
        (structure) => structure.structureTypeId === "extraction-plant",
      );
    const result = campaign.switchPlant(extraction?.id ?? "", "on");
    expect(result).toEqual({ ok: true });
    campaign.advance(1);

    expect(regolith()).toBeLessThan(before ?? 0);
  });
});

describe("the sample save of format version 38", () => {
  // Saved 53670 game-minutes in, 5 hours 30 minutes before the second
  // Night falls. The Mission Director lives in the shielded Habitat, on a
  // network with a solar array and three battery banks, and the first
  // Launch brought a parking area's four bay sockets, with oxygen and
  // water; the parking area was built beside the battery banks during the
  // first Night. Both Machines and the Rover stood plugged in beside other
  // Structures, so the Robot is driving the excavator to a bay, with the
  // regolith printer and the Rover waiting to be parked in bays after it.
  it("loads with the Robot parking the excavator in a bay of the parking area, and the regolith printer and the Rover to follow", () => {
    const state = loadSample("version-38.moonbase").snapshot();

    expect(state.clock.elapsedMinutes).toBe(53670);
    expect(state.missionDirector).toMatchObject({ residence: "habitat" });
    expect(
      state.stockpile.components.find((s) => s.componentId === "bay-socket"),
    ).toEqual({ componentId: "bay-socket", count: 0 });
    expect(state.parking).toEqual([
      expect.objectContaining({
        subject: {
          kind: "machine",
          machineId: "excavator-1",
          machineTypeId: "excavator",
        },
        structureTypeId: "parking-area",
        inBay: true,
        underWay: true,
      }),
      expect.objectContaining({
        subject: {
          kind: "machine",
          machineId: "regolith-printer-2",
          machineTypeId: "regolith-printer",
        },
        structureTypeId: "parking-area",
        inBay: true,
        underWay: false,
      }),
      expect.objectContaining({
        subject: { kind: "rover", roverId: "rover-1" },
        structureTypeId: "parking-area",
        inBay: true,
        underWay: false,
      }),
    ]);
  });

  it("plays on from where it was saved, until both Machines and the Rover stand in bays of their own, plugged in", () => {
    const campaign = loadSample("version-38.moonbase");
    for (let hours = 0; campaign.snapshot().parking.length > 0; hours++) {
      if (hours > 24) throw new Error("The parking was never done.");
      campaign.advance(60);
    }

    const state = campaign.snapshot();
    const area = state.structures.find(
      (structure) => structure.structureTypeId === "parking-area",
    );
    const offsets =
      catalogue.structureTypes.find((type) => type.id === "parking-area")
        ?.parking?.bayOffsets ?? [];
    const bays = [...state.machines, ...state.rovers].map((driven) =>
      offsets.findIndex(
        (offset) =>
          driven.position.x === (area?.position.x ?? 0) + offset.x &&
          driven.position.y === (area?.position.y ?? 0) + offset.y,
      ),
    );
    expect(bays).not.toContain(-1);
    expect(new Set(bays).size).toBe(3);
    expect(
      [...state.machines, ...state.rovers].map((driven) => driven.pluggedIn),
    ).toEqual([true, true, true]);
  });
});

describe("the sample save of format version 39", () => {
  // Played with the real data catalogue: the starting solar array, three
  // battery banks and the inflatable Habitat built, the Mission Director
  // moved in and the Habitat shielded, the Lander sent at once, Research
  // Tasks run shortest first until Optical telescopes could be unlocked,
  // the telescope's optics and mount put on the Launch manifest before the
  // Lander left Earth, and the telescope built once they landed, in the
  // first Night. Saved 21526 game-minutes in, once it had observed ten
  // hours of a round, with the Thermal cycling survey running.
  it("loads with the telescope observing, ten hours into a round of the observing programme", () => {
    const state = loadSample("version-39.moonbase").snapshot();

    expect(state.clock.elapsedMinutes).toBe(21526);
    expect(state.lunation.part).toBe("night");
    expect(state.unlockedDesignIds).toContain("optical-telescopes");
    expect(state.missionDirector).toMatchObject({ residence: "habitat" });
    expect(state.researchTask).toMatchObject({
      researchTaskId: "thermal-cycling-survey",
    });
    expect(
      state.structures.find((s) => s.structureTypeId === "telescope"),
    ).toMatchObject({ powered: true, observing: true });
    expect(state.observingProgramme).toMatchObject({
      progress: 600 / (48 * 60),
      telescopes: 1,
      observing: 1,
      minutesLeft: 48 * 60 - 600,
    });
  });

  it("plays on from where it was saved, completing the round and earning its Science", () => {
    const campaign = loadSample("version-39.moonbase");
    const science = campaign.snapshot().science;

    const events = campaign.advance(48 * 60 - 600);

    expect(
      events.filter((event) => event.kind === "observing-round-completed"),
    ).toEqual([
      {
        kind: "observing-round-completed",
        atMinute: 21526 + 48 * 60 - 600,
        science: catalogue.observingProgramme.science,
      },
    ]);
    expect(campaign.snapshot().science).toBe(
      science + catalogue.observingProgramme.science,
    );
  });
});

describe("the sample save of format version 41", () => {
  // The `workshop` scenario of `npm run try`, at catalogue version 64, saved 30
  // game-hours on: a Workshop running on two solar arrays and a battery bank,
  // part of the way through a Lunation's records of spare Components.
  it("loads with its records of spare Components, and Workshop running reached", () => {
    const state = loadSample("version-41.moonbase").snapshot();

    expect(state.structures.map((s) => s.structureTypeId)).toContain(
      "workshop",
    );
    expect(state.milestones.reachedIds).toContain("workshop-running");
    expect(state.spareComponentSufficiency).toMatchObject({
      stockId: "spare-component",
      selfSufficient: false,
      windowComplete: false,
    });
  });

  it("plays on from where it was saved, the Workshop's spare Components counting towards it", () => {
    const campaign = loadSample("version-41.moonbase");
    const spares = () =>
      campaign
        .snapshot()
        .stockpile.components.find(
          ({ componentId }) => componentId === "spare-component",
        )?.count ?? 0;
    const before = spares();

    campaign.advance(2 * 24 * 60);

    expect(spares()).toBeGreaterThan(before);
  });
});

describe("the sample save of format version 40", () => {
  // A fresh Campaign, seed 20261030: a solar array, a battery bank and a
  // Habitat planned east of the landing site, and saved 36 game-hours in,
  // with the first two built and the Habitat's Components being delivered.
  it("loads with the Habitat being built", () => {
    const state = loadSample("version-40.moonbase").snapshot();

    expect(state.clock.elapsedMinutes).toBe(2160);
    expect(state.structures.map((s) => s.structureTypeId)).toEqual([
      "solar-array",
      "battery-bank",
    ]);
    expect(
      state.constructions.map((c) => [c.structureTypeId, c.stage]),
    ).toEqual([["habitat", "component-delivery"]]);
  });

  it("plays on from where it was saved, until the Habitat is commissioned", () => {
    const campaign = loadSample("version-40.moonbase");

    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 10 * 24) throw new Error("The Habitat was never built.");
      campaign.advance(60);
    }

    expect(
      campaign.snapshot().structures.map((s) => s.structureTypeId),
    ).toContain("habitat");
  });

  it("gains an empty record of spare Components, so that a whole Lunation has to pass before the base can be self-sufficient in them", () => {
    expect(
      loadSample("version-40.moonbase").snapshot().spareComponentSufficiency,
    ).toMatchObject({
      selfSufficient: false,
      coveredShare: undefined,
      windowComplete: false,
    });
  });
});
