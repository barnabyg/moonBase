import { describe, expect, it, vi } from "vitest";
import {
  catalogue,
  type Catalogue,
  type StructureType,
} from "../src/catalogue";
import type {
  GameEvent,
  GroundPosition,
  MachineSnapshot,
  Snapshot,
  StructureSnapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

// The Construction Designs are unlocked from the start, with a kit for each
// of their Structures in the starting stock. The Mission Director needs no
// power in the Habitat, so that they can live there while the Lander flies;
// no Machine feels the cold, nor digs when no Construction needs it, so
// that the Machines work just the hours the data catalogue gives.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withDesigns } = await import("./with-designs");
  const { safeHabitat } = await import("./safe-habitat");
  const { withoutCold } = await import("./without-cold");
  const { withoutDigging } = await import("./without-digging");
  return {
    ...actual,
    catalogue: withDesigns(
      withoutDigging(withoutCold(safeHabitat(actual.catalogue, ["power"]))),
      ["regolith-sintering", "microwave-sintering"],
    ),
  };
});

function structureType(id: string): StructureType {
  const type = catalogue.structureTypes.find(
    (candidate) => candidate.id === id,
  );
  if (type === undefined) throw new Error(`expected a ${id}`);
  return type;
}
const sinteredPad = structureType("sintered-landing-pad");
const sinteredShielding = structureType("sintered-regolith-shielding");
const padSite: GroundPosition = { x: 40, y: 25 };
const habitatSite: GroundPosition = { x: 60, y: -10 };

/** Runs the game a game-minute at a time until every planned Construction is commissioned, returning every state. */
function runUntilBuilt(game: Scenario): Snapshot[] {
  const states: Snapshot[] = [];
  for (let minute = 0; game.state.constructions.length > 0; minute++) {
    if (minute > 10 * 24 * 60) {
      throw new Error("The Constructions never finished.");
    }
    states.push(game.advance({ minutes: 1 }).state);
  }
  return states;
}

function machineOf(state: Snapshot, machineTypeId: string): MachineSnapshot {
  const machine = state.machines.find(
    (candidate) => candidate.machineTypeId === machineTypeId,
  );
  if (machine === undefined) throw new Error(`expected a ${machineTypeId}`);
  return machine;
}

function structureOf(state: Snapshot, typeId: string): StructureSnapshot {
  const found = state.structures.find((s) => s.structureTypeId === typeId);
  if (found === undefined) throw new Error(`expected a ${typeId}`);
  return found;
}

/** Skips from event to event until the event comes, returning every event on the way. */
function skipUntil(game: Scenario, kind: GameEvent["kind"]): GameEvent[] {
  const events: GameEvent[] = [];
  for (let skips = 0; !events.some((event) => event.kind === kind); skips++) {
    if (skips > 200) throw new Error(`No ${kind} event came.`);
    events.push(...game.campaign.advanceToNextEvent());
  }
  return events;
}

describe("a sintered landing pad", () => {
  it("is printed from Regolith by the regolith printer, taking nothing from the base's stock, in the hours the data catalogue gives", () => {
    const game = scenario();
    const stock = game.state.stockpile.components;

    const states = runUntilBuilt(game.plan(sinteredPad.id, padSite));
    const minutesWorking = (machineTypeId: string) =>
      states.filter(
        (state) => machineOf(state, machineTypeId).activity.kind === "working",
      ).length;

    expect(sinteredPad.components).toEqual([]);
    expect(minutesWorking("excavator")).toBe(
      sinteredPad.stageHours.sitePreparation * 60,
    );
    expect(minutesWorking("regolith-printer")).toBe(
      sinteredPad.stageHours.assembly * 60,
    );
    expect(
      states.some((state) =>
        state.robots.some((robot) =>
          ["loading-components", "unloading-components"].includes(
            robot.activity.kind,
          ),
        ),
      ),
    ).toBe(false);
    expect(game.state.stockpile.components).toEqual(stock);
    expect(structureOf(game.state, sinteredPad.id).position).toEqual(padSite);
  });

  it("has the Lander land on it, and take off from it, without blasting Plume Ejecta", () => {
    const game = scenario()
      .plan("habitat", habitatSite)
      .plan(sinteredPad.id, padSite);
    runUntilBuilt(game);
    const movedIn = game.campaign.moveMissionDirectorIn(
      structureOf(game.state, "habitat").id,
    );
    if (!movedIn.ok) throw new Error(movedIn.message);
    const padId = structureOf(game.state, sinteredPad.id).id;

    const sent = game.campaign.sendLander();
    if (!sent.ok) throw new Error(sent.message);
    const landing = skipUntil(game, "lander-landed");
    expect(game.state.lander).toMatchObject({
      position: padSite,
      landingPadId: padId,
    });
    expect(landing.map((event) => event.kind)).not.toContain(
      "plume-ejecta-damage",
    );

    const again = game.campaign.sendLander();
    if (!again.ok) throw new Error(again.message);
    const takeOff = skipUntil(game, "lander-took-off");
    expect(takeOff.map((event) => event.kind)).not.toContain(
      "plume-ejecta-damage",
    );
  });
});

describe("sintered Regolith shielding", () => {
  it("is printed over a commissioned Habitat by the regolith printer in the hours the data catalogue gives, and shields it", () => {
    const game = scenario().plan("habitat", habitatSite);
    runUntilBuilt(game);
    const habitat = structureOf(game.state, "habitat");
    expect(habitat.shielded).toBe(false);

    const states = runUntilBuilt(game.plan(sinteredShielding.id, habitatSite));

    expect(
      states.filter(
        (state) =>
          machineOf(state, "regolith-printer").activity.kind === "working",
      ),
    ).toHaveLength(sinteredShielding.stageHours.assembly * 60);
    expect(structureOf(game.state, sinteredShielding.id).position).toEqual(
      habitatSite,
    );
    expect(structureOf(game.state, "habitat").shielded).toBe(true);
  });

  it("shields a Habitat sooner than Regolith shielding, by the hours its stages save", () => {
    const timeToShield = (typeId: string) => {
      const game = scenario().plan("habitat", habitatSite);
      runUntilBuilt(game);
      return runUntilBuilt(game.plan(typeId, habitatSite)).length;
    };
    const stageMinutes = (type: StructureType) =>
      Object.values(type.stageHours).reduce((sum, hours) => sum + hours, 0) *
      60;

    expect(
      timeToShield("regolith-shielding") - timeToShield(sinteredShielding.id),
    ).toBe(
      stageMinutes(structureType("regolith-shielding")) -
        stageMinutes(sinteredShielding),
    );
  });
});
