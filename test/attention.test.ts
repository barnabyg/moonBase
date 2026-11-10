import { describe, expect, it } from "vitest";
import type { Forecasts, Snapshot, StructureSnapshot } from "../src/simulation";
import { ATTENTION_ORDER, listAttention } from "../src/ui/attention-text";
import { loadSample } from "./sample-saves";
import { scenario, toGameMinutes } from "./scenario";

// What the status panel lists at its top as needing the player now.

/**
 * A base with two solar arrays (structure-1 and structure-4), an extraction
 * plant running (structure-2) and a vacuum fabrication plant waiting for
 * silicon (structure-3), an excavator, a regolith printer and a Rover.
 */
const sample = loadSample("version-35.moonbase");
const base = sample.snapshot();
const calm = sample.forecasts();

/** The base with some of its Structures changed, by id. */
function withStructures(
  changes: Record<string, Partial<StructureSnapshot>>,
  snapshot: Snapshot = base,
): Snapshot {
  return {
    ...snapshot,
    structures: snapshot.structures.map((structure) => ({
      ...structure,
      ...changes[structure.id],
    })),
  };
}

/** The base with its vacuum fabrication plant running, so that nothing waits. */
const running = withStructures({
  "structure-3": {
    plant: { running: true, batch: undefined, stoppedFor: undefined },
  },
});

/** What the list says, a line each. */
const texts = (snapshot: Snapshot, forecasts: Forecasts = calm): string[] =>
  listAttention(snapshot, forecasts).map(({ text }) => text);

describe("the needs-attention list", () => {
  it("lists nothing while there is nothing to report", () => {
    const start = scenario();
    expect(listAttention(start.state, start.campaign.forecasts())).toEqual([]);
    expect(texts(running)).toEqual([]);
  });

  it("names something Broken, and leads to it on the map", () => {
    expect(
      listAttention(
        withStructures({ "structure-4": { conditionPercent: 0 } }, running),
        calm,
      ),
    ).toEqual([
      {
        id: "broken",
        text: "Solar array is Broken",
        leadsTo: {
          kind: "map",
          subject: { kind: "structure", id: "structure-4" },
        },
      },
    ]);
  });

  it("sums several Broken things into one line, which leads to the first, and leaves out one to be dismantled", () => {
    const broken: Snapshot = {
      ...withStructures(
        {
          "structure-1": { conditionPercent: 0 },
          "structure-4": { conditionPercent: 0 },
        },
        running,
      ),
      machines: base.machines.map((machine) =>
        machine.id === "excavator-1"
          ? { ...machine, conditionPercent: 0 }
          : machine,
      ),
      rovers: base.rovers.map((rover) => ({ ...rover, conditionPercent: 0 })),
    };

    expect(listAttention(broken, calm)).toEqual([
      {
        id: "broken",
        text: "Broken: 2 × Solar array, Excavator and Rover",
        leadsTo: {
          kind: "map",
          subject: { kind: "structure", id: "structure-1" },
        },
      },
    ]);

    // The player has dealt with a Broken Structure by having it dismantled.
    const [first] = broken.structures;
    if (first === undefined) throw new Error("expected a Structure");
    expect(
      texts({
        ...broken,
        dismantlings: [
          {
            id: first.id,
            structureTypeId: first.structureTypeId,
            position: first.position,
            stage: "taking-apart",
            stageProgress: 0,
            recovered: [],
            collected: false,
          },
        ],
      }),
    ).toEqual(["Broken: Solar array, Excavator and Rover"]);
  });

  it("reports Constructions waiting for Components that aren't in the base's stock, and no other wait", () => {
    const construction = {
      id: "structure-5",
      structureTypeId: "battery-bank",
      position: { x: 20, y: 20 },
      stage: "component-delivery",
      stageProgress: 0,
      componentsTaken: false,
      failedCommissionings: 0,
      unusedComponents: [],
      waiting: {
        reason: "missing-components",
        missing: [{ componentId: "battery-module", count: 2 }],
      },
    } as const;

    expect(
      listAttention({ ...running, constructions: [construction] }, calm),
    ).toEqual([
      {
        id: "constructions-waiting",
        text: "Battery bank is waiting for Components",
        leadsTo: {
          kind: "map",
          subject: { kind: "structure", id: "structure-5" },
        },
      },
    ]);
    expect(
      texts({
        ...running,
        constructions: [
          construction,
          { ...construction, id: "structure-6", structureTypeId: "light-mast" },
          // The Machine will be free by itself.
          {
            ...construction,
            id: "structure-7",
            waiting: { reason: "machine-busy", machineTypeId: "excavator" },
          },
        ],
      }),
    ).toEqual(["2 Constructions waiting for Components"]);
  });

  it("reports a Plant standing idle for want of an input, by name and input, or how many there are", () => {
    expect(listAttention(base, calm)).toEqual([
      {
        id: "plants-waiting",
        text: "Vacuum fabrication plant is waiting for Silicon",
        leadsTo: {
          kind: "map",
          subject: { kind: "structure", id: "structure-3" },
        },
      },
    ]);
    expect(
      texts(
        withStructures({
          "structure-2": {
            plant: {
              running: false,
              batch: undefined,
              stoppedFor: {
                reason: "reserve",
                resource: { kind: "life-support", stockId: "water" },
                kilograms: 49.5,
                kilogramsNeeded: 50,
                reserveKilograms: 49,
              },
            },
          },
        }),
      ),
    ).toEqual(["2 Plants waiting for an input"]);
    // One waiting for power, or for room for what it makes, wants nothing
    // the player can bring it.
    expect(
      texts(
        withStructures({
          "structure-3": {
            plant: {
              running: false,
              batch: undefined,
              stoppedFor: { reason: "no-power" },
            },
          },
        }),
      ),
    ).toEqual([]);
  });

  it("reports what is low on Condition, below 40%, but not a Robot, which repairs itself", () => {
    expect(
      listAttention(
        {
          ...withStructures(
            { "structure-2": { conditionPercent: 30 } },
            running,
          ),
          robots: base.robots.map((robot) => ({
            ...robot,
            conditionPercent: 11,
          })),
        },
        calm,
      ),
    ).toEqual([
      {
        id: "low-condition",
        text: "Extraction plant is at 30% Condition",
        leadsTo: {
          kind: "map",
          subject: { kind: "structure", id: "structure-2" },
        },
      },
    ]);

    // Several lead to the lowest of them.
    expect(
      listAttention(
        {
          ...withStructures(
            {
              "structure-2": { conditionPercent: 30 },
              "structure-4": { conditionPercent: 39.4 },
              "structure-1": { conditionPercent: 40 },
            },
            running,
          ),
          rovers: base.rovers.map((rover) => ({
            ...rover,
            conditionPercent: 22,
          })),
        },
        calm,
      ),
    ).toEqual([
      {
        id: "low-condition",
        text: "3 low on Condition, the lowest at 22%",
        leadsTo: { kind: "map", subject: { kind: "rover", id: "rover-1" } },
      },
    ]);
  });

  it("reports every Plant the player has switched off in one line", () => {
    const off = { switchedOff: true } as const;
    expect(
      listAttention(withStructures({ "structure-2": off }, running), calm),
    ).toEqual([
      {
        id: "plants-switched-off",
        text: "1 Plant switched off",
        leadsTo: {
          kind: "map",
          subject: { kind: "structure", id: "structure-2" },
        },
      },
    ]);
    expect(
      texts(
        withStructures({ "structure-2": off, "structure-3": off }, running),
      ),
    ).toEqual(["2 Plants switched off"]);
  });

  it("puts what is Broken first, then waiting Constructions, idle Plants and what is low on Condition, and switched-off Plants last", () => {
    expect(
      texts({
        ...withStructures({
          "structure-1": { conditionPercent: 35 },
          "structure-2": { switchedOff: true },
          "structure-4": { conditionPercent: 0 },
        }),
        constructions: [
          {
            id: "structure-5",
            structureTypeId: "battery-bank",
            position: { x: 20, y: 20 },
            stage: "component-delivery",
            stageProgress: 0,
            componentsTaken: false,
            failedCommissionings: 0,
            unusedComponents: [],
            waiting: {
              reason: "missing-components",
              missing: [{ componentId: "battery-module", count: 2 }],
            },
          },
        ],
      }),
    ).toEqual([
      "Solar array is Broken",
      "Battery bank is waiting for Components",
      "Vacuum fabrication plant is waiting for Silicon",
      "Solar array is at 35% Condition",
      "1 Plant switched off",
    ]);
  });

  it("lists first what the status panel's lines warn of, in the panel's order, each leading to its line", () => {
    const now = base.clock.elapsedMinutes;
    const warned = listAttention(
      {
        ...withStructures({ "structure-4": { conditionPercent: 0 } }, running),
        solarParticleEvent: {
          state: "coming",
          startsAtMinute: now + toGameMinutes({ hours: 4 }),
          endsAtMinute: now + toGameMinutes({ hours: 22 }),
          doseRateMultiplier: 10,
        },
        lifeSupport: base.lifeSupport.map((stock) =>
          stock.stockId === "oxygen" ? { ...stock, kilograms: 0 } : stock,
        ),
      },
      {
        ...calm,
        habitatPower: {
          habitatId: "habitat-1",
          minutesUntilPowerLost: toGameMinutes({ hours: 10 }),
        },
        lifeSupport: calm.lifeSupport.map((forecast) =>
          forecast.stockId === "water"
            ? {
                ...forecast,
                minutesUntilEmpty: toGameMinutes({ earthDays: 2 }),
              }
            : forecast,
        ),
        radiationDose: {
          millisievertsPerEarthDay: 5,
          minutesUntilLimit: toGameMinutes({ earthDays: 1, hours: 3 }),
        },
        spareComponents: {
          ...calm.spareComponents,
          minutesUntilEmpty: toGameMinutes({ hours: 12 }),
        },
      },
    );

    expect(warned.map(({ text }) => text)).toEqual([
      "Solar Particle Event starts in 4h, lasts 18h",
      "Habitat power fails in 10h",
      "Oxygen has run out",
      "Water runs out in 2d",
      "Radiation Dose reaches the limit in 1d 3h",
      "Spare Components run out in 12h",
      "Solar array is Broken",
    ]);
    // Each kind of line has its place in the order the page keeps them in.
    const places = warned.map(({ id }) => ATTENTION_ORDER.indexOf(id));
    expect(places).not.toContain(-1);
    expect(places).toEqual([...places].sort((a, b) => a - b));
    expect(warned.map(({ leadsTo }) => leadsTo).slice(0, 6)).toEqual([
      { kind: "status", line: "solar-particle-event" },
      { kind: "status", line: "habitat-power" },
      { kind: "status", line: "life-support:oxygen" },
      { kind: "status", line: "life-support:water" },
      { kind: "status", line: "radiation-dose" },
      { kind: "status", line: "spare-components" },
    ]);
  });

  it("warns of none of them outside the first warning's time", () => {
    expect(
      texts(running, {
        ...calm,
        habitatPower: {
          habitatId: "habitat-1",
          minutesUntilPowerLost: toGameMinutes({ hours: 25 }),
        },
        lifeSupport: calm.lifeSupport.map((forecast) => ({
          ...forecast,
          minutesUntilEmpty: toGameMinutes({ earthDays: 7, hours: 1 }),
        })),
        radiationDose: {
          millisievertsPerEarthDay: 1,
          minutesUntilLimit: toGameMinutes({ earthDays: 400 }),
        },
        spareComponents: {
          ...calm.spareComponents,
          minutesUntilEmpty: toGameMinutes({ earthDays: 7, hours: 1 }),
        },
      }),
    ).toEqual([]);
  });
});
