import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import type {
  GroundPosition,
  MachineSnapshot,
  Snapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

const habitatSite: GroundPosition = { x: 25, y: -20 };
/** On the Habitat's footprint, but not at its centre. */
const onTheHabitat: GroundPosition = { x: 27, y: -18.5 };

/** Runs the game a game-minute at a time until the condition holds, returning every state. */
function runUntil(
  game: Scenario,
  done: (state: Snapshot) => boolean,
): Snapshot[] {
  const states: Snapshot[] = [];
  for (let minute = 0; minute < 20 * 24 * 60; minute++) {
    if (done(game.state)) return states;
    states.push(game.advance({ minutes: 1 }).state);
  }
  throw new Error("It never happened.");
}

/** A newly commissioned Habitat, with nothing else built. */
function commissionedHabitat(): { game: Scenario; habitatId: string } {
  const game = scenario().plan("habitat", habitatSite);
  const habitatId = game.state.constructions[0]?.id ?? "";
  runUntil(game, (state) => state.constructions.length === 0);
  return { game, habitatId };
}

function planShielding(game: Scenario, position: GroundPosition) {
  return game.campaign.planConstruction({
    structureTypeId: "regolith-shielding",
    position,
  });
}

function printerOf(state: Snapshot): MachineSnapshot {
  const printer = state.machines.find(
    (machine) => machine.machineTypeId === "regolith-printer",
  );
  if (printer === undefined) throw new Error("expected a regolith printer");
  return printer;
}

describe("the regolith printer", () => {
  it("has landed with the Lander, and stands idle where the data catalogue puts it", () => {
    const { state } = scenario();

    expect(printerOf(state)).toMatchObject({
      activity: { kind: "idle" },
      position: catalogue.landingSite.machines.find(
        (machine) => machine.machineTypeId === "regolith-printer",
      )?.position,
    });
  });
});

describe("planning Regolith shielding", () => {
  it("is refused anywhere but on a Habitat", () => {
    const game = scenario().plan("solar-array", { x: 20, y: 12 });
    runUntil(game, (state) => state.constructions.length === 0);

    for (const position of [
      { x: -40, y: 30 },
      { x: 20, y: 12 },
    ]) {
      expect(planShielding(game, position)).toEqual({
        ok: false,
        reason: "not-on-habitat",
        message:
          "Regolith shielding can only be printed over a commissioned Habitat.",
      });
    }
  });

  it("is refused on a Habitat that hasn't been commissioned yet", () => {
    const game = scenario().plan("habitat", habitatSite);

    expect(planShielding(game, onTheHabitat)).toMatchObject({
      ok: false,
      reason: "not-on-habitat",
    });
  });

  it("is allowed over a commissioned Habitat, overlapping it and standing centred on it", () => {
    const { game } = commissionedHabitat();

    expect(
      game.campaign.checkPlacement({
        structureTypeId: "regolith-shielding",
        position: onTheHabitat,
      }),
    ).toEqual({ ok: true, position: habitatSite });
    const result = planShielding(game, onTheHabitat);

    expect(result).toMatchObject({ ok: true });
    expect(game.state.constructions).toEqual([
      expect.objectContaining({
        structureTypeId: "regolith-shielding",
        position: habitatSite,
        stage: "site-preparation",
      }),
    ]);
  });

  it("is refused over a Habitat whose shielding is already planned", () => {
    const { game } = commissionedHabitat();
    planShielding(game, onTheHabitat);

    expect(planShielding(game, habitatSite)).toEqual({
      ok: false,
      reason: "already-shielded",
      message: "The Habitat's Regolith shielding is already planned.",
    });
  });

  it("is refused over a Habitat that is to be dismantled", () => {
    const { game, habitatId } = commissionedHabitat();
    game.campaign.dismantleStructure(habitatId);

    expect(planShielding(game, habitatSite)).toMatchObject({
      ok: false,
      reason: "not-on-habitat",
      message: "The Habitat is to be dismantled, so it can't be shielded.",
    });
  });

  it("still keeps other Structures off the Habitat", () => {
    const { game } = commissionedHabitat();

    expect(
      game.campaign.checkPlacement({
        structureTypeId: "light-mast",
        position: onTheHabitat,
      }),
    ).toMatchObject({ ok: false, reason: "overlaps-structure" });
  });
});

const printerType = catalogue.machineTypes.find(
  (type) => type.id === "regolith-printer",
);
const shieldingType = catalogue.structureTypes.find(
  (type) => type.id === "regolith-shielding",
);
if (printerType === undefined || shieldingType === undefined) {
  throw new Error("expected a regolith printer and Regolith shielding");
}

/** A commissioned Habitat cabled to a solar array, with its shielding just planned. */
function shieldingPlanned(): {
  game: Scenario;
  habitatId: string;
  shieldingId: string;
} {
  const game = scenario()
    .plan("solar-array", { x: 20, y: 12 })
    .plan("habitat", habitatSite);
  const habitatId = game.state.constructions[1]?.id ?? "";
  runUntil(game, (state) => state.constructions.length === 0);
  const result = planShielding(game, onTheHabitat);
  if (!result.ok) throw new Error(`Planning was refused: ${result.message}`);
  return { game, habitatId, shieldingId: result.constructionId };
}

describe("building Regolith shielding", () => {
  it("goes through Site Preparation, Assembly and Commissioning, using no Components and needing no cable", () => {
    const { game, shieldingId } = shieldingPlanned();
    const cargo = game.state.cargo;

    const states = runUntil(game, (state) => state.constructions.length === 0);

    const stages = states
      .map((state) => state.constructions[0]?.stage)
      .filter((stage) => stage !== undefined)
      .filter((stage, index, all) => stage !== all[index - 1]);
    expect(stages).toEqual(["site-preparation", "assembly", "commissioning"]);
    for (const state of states) {
      expect(state.cargo).toEqual(cargo);
      expect(state.robots[0]?.carrying).toEqual([]);
    }
    expect(
      game.state.cables.filter((cable) => cable.toStructureId === shieldingId),
    ).toEqual([]);
    expect(game.state.structures).toContainEqual(
      expect.objectContaining({
        id: shieldingId,
        structureTypeId: "regolith-shielding",
        position: habitatSite,
      }),
    );
  });

  it("is printed by the regolith printer by itself, once the Robot has driven it there and activated it", () => {
    const { game, shieldingId } = shieldingPlanned();
    const start = printerOf(game.state).position;

    const states = runUntil(
      game,
      (state) => state.constructions[0]?.stage === "commissioning",
    );

    const assembly = states.filter(
      (state) => state.constructions[0]?.stage === "assembly",
    );
    const robotSteps = assembly
      .map((state) => state.robots[0]?.activity.kind)
      .filter((kind, index, all) => kind !== all[index - 1]);
    expect(robotSteps).toEqual([
      "walking",
      "driving-machine",
      "walking",
      "activating-machine",
      "idle",
    ]);
    expect(
      assembly.filter(
        (state) => state.robots[0]?.activity.kind === "activating-machine",
      ),
    ).toHaveLength(printerType.activationHours * 60);
    const printing = states.filter(
      (state) => printerOf(state).activity.kind === "working",
    );
    expect(printing).toHaveLength(shieldingType.stageHours.assembly * 60);
    for (const state of printing) {
      expect(printerOf(state).activity).toEqual({
        kind: "working",
        constructionId: shieldingId,
      });
    }
    // The shielding grows with real progress while the Robot is idle.
    const progress = printing
      .slice(0, -1)
      .map((state) => state.constructions[0]?.stageProgress ?? 0);
    expect(progress[0]).toBeLessThan(0.01);
    expect(progress.at(-1)).toBeGreaterThan(0.99);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    for (const state of printing.slice(0, -1)) {
      expect(state.robots[0]?.activity).toEqual({ kind: "idle" });
    }
    expect(printerOf(game.state).position).not.toEqual(start);
    expect(
      Math.hypot(
        printerOf(game.state).position.x - habitatSite.x,
        printerOf(game.state).position.y - habitatSite.y,
      ),
    ).toBeLessThanOrEqual(
      shieldingType.footprintRadiusMetres +
        printerType.footprintRadiusMetres +
        catalogue.robot.workingGapMetres,
    );
  });
});

describe("a shielded Habitat", () => {
  const rates = catalogue.radiation.doseRateMillisievertsPerEarthDay;

  /** The Mission Director's Radiation Dose gained over an Earth Day. */
  function doseOverAnEarthDay(game: Scenario): number {
    const before = game.state.radiationDoseMillisieverts;
    game.advance({ earthDays: 1 });
    return game.state.radiationDoseMillisieverts - before;
  }

  it("is shown as shielded only once its shielding is commissioned", () => {
    const { game, habitatId } = shieldingPlanned();
    const habitatOf = (state: Snapshot) =>
      state.structures.find((structure) => structure.id === habitatId);
    expect(habitatOf(game.state)).toMatchObject({ shielded: false });

    const states = runUntil(game, (state) => state.constructions.length === 0);

    for (const state of states.slice(0, -1)) {
      expect(habitatOf(state)).toMatchObject({ shielded: false });
    }
    expect(habitatOf(game.state)).toMatchObject({ shielded: true });
    for (const structure of game.state.structures) {
      if (structure.id !== habitatId) expect(structure.shielded).toBe(false);
    }
  });

  it("lets in less radiation than an unshielded one, at the rate the data catalogue sets", () => {
    const { game, habitatId } = shieldingPlanned();
    const movedIn = game.campaign.moveMissionDirectorIn(habitatId);
    if (!movedIn.ok) throw new Error(movedIn.message);

    expect(
      game.campaign.forecasts().radiationDose.millisievertsPerEarthDay,
    ).toBe(rates.habitat);
    const unshielded = doseOverAnEarthDay(game);
    runUntil(game, (state) => state.constructions.length === 0);
    expect(
      game.campaign.forecasts().radiationDose.millisievertsPerEarthDay,
    ).toBe(rates.shieldedHabitat);
    const shielded = doseOverAnEarthDay(game);

    expect(unshielded).toBeCloseTo(rates.habitat, 6);
    expect(shielded).toBeCloseTo(rates.shieldedHabitat, 6);
    expect(shielded).toBeLessThan(unshielded);
  });
});

describe("a Habitat's Regolith shielding once it is built", () => {
  function shielded() {
    const planned = shieldingPlanned();
    runUntil(planned.game, (state) => state.constructions.length === 0);
    return planned;
  }

  it("keeps any more shielding off the Habitat", () => {
    const { game } = shielded();

    expect(planShielding(game, onTheHabitat)).toEqual({
      ok: false,
      reason: "already-shielded",
      message: "The Habitat is already shielded.",
    });
  });

  it("keeps the Habitat under it from being dismantled, from the moment it is planned", () => {
    const { game, habitatId, shieldingId } = shieldingPlanned();
    const refusal = {
      ok: false,
      message:
        "Its Regolith shielding is over it, and must be dismantled first.",
    };

    expect(game.campaign.dismantleStructure(habitatId)).toEqual(refusal);
    runUntil(game, (state) => state.constructions.length === 0);
    expect(game.campaign.dismantleStructure(habitatId)).toEqual(refusal);

    expect(game.campaign.dismantleStructure(shieldingId)).toEqual({ ok: true });
    runUntil(game, (state) => state.dismantlings.length === 0);
    expect(game.campaign.dismantleStructure(habitatId)).toEqual({ ok: true });
  });

  it("can be dismantled, leaving the Habitat unshielded and nothing to carry to the Lander", () => {
    const { game, habitatId, shieldingId } = shielded();
    const cargo = game.state.cargo;
    game.campaign.dismantleStructure(shieldingId);

    const states = runUntil(game, (state) => state.dismantlings.length === 0);

    const robotSteps = states
      .map((state) => state.robots[0]?.activity)
      .filter((activity) => activity?.kind !== "idle")
      .map((activity) =>
        activity?.kind === "walking"
          ? `walking to the ${activity.destination}`
          : activity?.kind,
      )
      .filter((step, index, all) => step !== all[index - 1]);
    // It may already stand at the site, from Commissioning the shielding.
    expect(robotSteps.filter((step) => step !== "walking to the site")).toEqual(
      ["dismantling"],
    );
    expect(game.state.cargo).toEqual(cargo);
    expect(
      game.state.structures.find((structure) => structure.id === habitatId),
    ).toMatchObject({ shielded: false });
    expect(planShielding(game, onTheHabitat)).toMatchObject({ ok: true });
  });
});
