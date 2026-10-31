import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type Campaign,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { scenario, scenarioOf, type Scenario } from "./scenario";

// Dust wears nothing down and nothing is dug, so that the Machines stand
// idle wherever their last work left them, and the starting stock holds a
// parking area's bay sockets. A Lunation is shorter, as playing through one
// takes most of the time of the test that does, and none looks at its length.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutDust } = await import("./without-dust");
  const { withoutDigging } = await import("./without-digging");
  const { withDesigns } = await import("./with-designs");
  return {
    ...actual,
    catalogue: {
      ...withDesigns(withoutDigging(withoutDust(actual.catalogue)), [
        "parking-areas",
      ]),
      lunation: {
        ...actual.catalogue.lunation,
        daylightEarthDays: 10,
        nightEarthDays: 2,
      },
    },
  };
});

const arraySite: GroundPosition = { x: 20, y: 12 };
const bankSites: readonly GroundPosition[] = [
  { x: -30, y: 4 },
  { x: -36, y: 4 },
];
const parkingSite: GroundPosition = { x: -30, y: -12 };
const { parkingLeadHours } = catalogue.cold;
const bayOffsets =
  catalogue.structureTypes.find((type) => type.id === "parking-area")?.parking
    ?.bayOffsets ?? [];

/** Runs the game until the Robot has carried out every planned Construction. */
function buildAll(game: Scenario): Scenario {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
  return game;
}

function untilBeforeNight(campaign: Campaign, minutes: number): void {
  const { lunation } = campaign.snapshot();
  if (lunation.part !== "daylight") throw new Error("expected Daylight");
  campaign.advance(lunation.minutesRemaining - minutes);
}

function structure(state: Snapshot, type: string): StructureSnapshot {
  const found = state.structures.find((s) => s.structureTypeId === type);
  if (found === undefined) throw new Error(`expected a ${type}`);
  return found;
}

/** The index of the bay something stands in, or undefined if it stands in none. */
function bayAt(state: Snapshot, position: GroundPosition): number | undefined {
  const area = structure(state, "parking-area");
  const index = bayOffsets.findIndex(
    (offset) =>
      area.position.x + offset.x === position.x &&
      area.position.y + offset.y === position.y,
  );
  return index === -1 ? undefined : index;
}

/**
 * The parking area built first, then the solar array and the battery
 * banks, so that the excavator is left plugged in beside the last battery
 * bank, after grading its site.
 */
let excavatorBesideABatteryBankSave: string | undefined;
function excavatorBesideABatteryBank(): Scenario {
  if (excavatorBesideABatteryBankSave === undefined) {
    const game = scenario().plan("parking-area", parkingSite);
    game.plan("solar-array", arraySite);
    for (const site of bankSites) game.plan("battery-bank", site);
    buildAll(game);
    const cabled = () => {
      const area = structure(game.state, "parking-area");
      return game.state.power.networks.some(
        (network) =>
          network.structureIds.includes(area.id) &&
          network.storageCapacityKilowattHours > 0,
      );
    };
    for (let hours = 0; !cabled(); hours++) {
      if (hours > 2 * 24) throw new Error("The parking area was never cabled.");
      game.advance({ hours: 1 });
    }
    excavatorBesideABatteryBankSave = game.campaign.save();
  }
  const loaded = loadCampaign(excavatorBesideABatteryBankSave);
  if (!loaded.ok) throw new Error(loaded.message);
  return scenarioOf(loaded.campaign);
}

function excavator(state: Snapshot) {
  const found = state.machines.find((m) => m.machineTypeId === "excavator");
  if (found === undefined) throw new Error("expected the excavator");
  return found;
}

/** Runs until every park Work Order raised has been carried out. */
function untilParked(game: Scenario): void {
  for (let minutes = 0; game.state.parking.length > 0; minutes++) {
    if (minutes > 24 * 60) throw new Error("The parking was never done.");
    game.advance({ minutes: 1 });
  }
}

describe("a parking area, before Night", () => {
  it("has the Robot park the idle Machines and the Rover in its bays even when they are plugged in beside another Structure", () => {
    const game = excavatorBesideABatteryBank();
    untilBeforeNight(game.campaign, parkingLeadHours * 60 + 1);
    expect(excavator(game.state)).toMatchObject({ pluggedIn: true });
    expect(bayAt(game.state, excavator(game.state).position)).toBeUndefined();

    game.advance({ minutes: 1 });
    expect(
      game.state.parking.find(
        (order) =>
          order.subject.kind === "machine" &&
          order.subject.machineTypeId === "excavator",
      ),
    ).toMatchObject({ inBay: true, structureTypeId: "parking-area" });
    untilParked(game);

    const everything = [...game.state.machines, ...game.state.rovers];
    const bays = everything.map((driven) => bayAt(game.state, driven.position));
    expect(bays).not.toContain(undefined);
    expect(new Set(bays).size).toBe(everything.length);
    expect(everything.map((driven) => driven.pluggedIn)).not.toContain(false);
  });

  it("leaves what is parked in its bays there, through the Night and the next Daylight, raising no more park Work Orders for it", () => {
    const game = excavatorBesideABatteryBank();
    untilBeforeNight(game.campaign, parkingLeadHours * 60 + 1);
    game.advance({ minutes: 1 });
    untilParked(game);
    const where = () =>
      [...game.state.machines, ...game.state.rovers].map(
        (driven) => driven.position,
      );
    const parked = where();

    // Through the Night, the next Daylight and into the next parking time.
    for (let hours = 0; game.state.lunation.part === "daylight"; hours++) {
      if (hours > 24) throw new Error("Night never fell.");
      game.advance({ hours: 1 });
    }
    game.advance({ minutes: game.state.lunation.minutesRemaining + 1 });
    untilBeforeNight(game.campaign, parkingLeadHours * 60 - 60);

    expect(game.state.parking).toEqual([]);
    expect(where()).toEqual(parked);
  });

  it("doesn't move one plugged in beside another Structure during Night, when the drive would leave it in the cold", () => {
    const game = excavatorBesideABatteryBank();
    untilBeforeNight(game.campaign, parkingLeadHours * 60 + 1);
    game.advance({ minutes: 1 });
    untilParked(game);
    for (let hours = 0; game.state.lunation.part === "daylight"; hours++) {
      if (hours > 24) throw new Error("Night never fell.");
      game.advance({ hours: 1 });
    }
    // The excavator back where it was, plugged in beside the battery bank,
    // as if its work at Night had left it there.
    const bank = game.state.structures.filter(
      (s) => s.structureTypeId === "battery-bank",
    )[1];
    if (bank === undefined) throw new Error("expected a battery bank");
    const spot = { x: bank.position.x, y: bank.position.y - 4 };
    const document = JSON.parse(game.campaign.save()) as {
      state: { machines: { id: string; position: GroundPosition }[] };
    };
    for (const machine of document.state.machines) {
      if (machine.id === excavator(game.state).id) machine.position = spot;
    }
    const loaded = loadCampaign(JSON.stringify(document));
    if (!loaded.ok) throw new Error(loaded.message);
    const night = scenarioOf(loaded.campaign);
    expect(excavator(night.state)).toMatchObject({
      pluggedIn: true,
      position: spot,
    });

    night.advance({ hours: 2 });

    expect(night.state.parking).toEqual([]);
    expect(excavator(night.state).position).toEqual(spot);
  });
});
