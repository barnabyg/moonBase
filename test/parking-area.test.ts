import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type Campaign,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { describeParking, formatParkingPlace } from "../src/ui/format";
import { scenario, scenarioOf, type Scenario } from "./scenario";

// Dust wears nothing down, so that only parking moves the Machines and the
// Rover about, and the starting stock holds a parking area's bay sockets.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutDust } = await import("./without-dust");
  const { withDesigns } = await import("./with-designs");
  return {
    ...actual,
    catalogue: withDesigns(withoutDust(actual.catalogue), ["parking-areas"]),
  };
});

const arraySite: GroundPosition = { x: 20, y: 12 };
const bankSites: readonly GroundPosition[] = [
  { x: -30, y: 4 },
  { x: -36, y: 4 },
];
/**
 * Further from the regolith printer and the Rover than the battery bank
 * and the solar array, which they would otherwise be parked beside.
 */
const parkingSite: GroundPosition = { x: -20, y: -20 };
const { parkingLeadHours } = catalogue.cold;

const parkingArea = catalogue.structureTypes.find(
  (type) => type.id === "parking-area",
);
if (parkingArea?.parking === undefined) {
  throw new Error("expected a parking area with bays");
}
const { bayOffsets } = parkingArea.parking;

/** Runs the game until the Robot has carried out every planned Construction. */
function buildAll(game: Scenario): Scenario {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
  return game;
}

/** Advances to the given number of game-minutes before Night falls. */
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

/** Where the bays of a parking area are, in the order the data catalogue has them. */
function baysOf(area: StructureSnapshot): GroundPosition[] {
  return bayOffsets.map((offset) => ({
    x: area.position.x + offset.x,
    y: area.position.y + offset.y,
  }));
}

/** The index of the bay something stands in, or undefined if it stands in none. */
function bayAt(area: StructureSnapshot, position: GroundPosition) {
  const index = baysOf(area).findIndex(
    (bay) => bay.x === position.x && bay.y === position.y,
  );
  return index === -1 ? undefined : index;
}

/**
 * A solar array with the two battery banks it takes to carry everything
 * on it, and the heaters of both Machines and the Rover, through a Night.
 */
function poweredBase(): Scenario {
  const game = scenario().plan("solar-array", arraySite);
  for (const site of bankSites) game.plan("battery-bank", site);
  return game;
}

/** A powered base and a parking area, all cabled together. */
function baseWithParkingArea(): Scenario {
  return buildAll(poweredBase().plan("parking-area", parkingSite));
}

/** The parts of a save document's simulation state these tests change. */
interface SavedState {
  structures: { id: string; storedKilowattHours: number }[];
  cables: { fromStructureId: string; toStructureId: string }[];
}

/** The Campaign as saved, changed as given, then loaded. */
function changedSave(
  campaign: Campaign,
  change: (state: SavedState) => void,
): Scenario {
  const document = JSON.parse(campaign.save()) as { state: SavedState };
  change(document.state);
  const loaded = loadCampaign(JSON.stringify(document));
  if (!loaded.ok) throw new Error(loaded.message);
  return scenarioOf(loaded.campaign);
}

/**
 * Runs from before parking starts until every park Work Order raised for
 * the Night has been carried out.
 */
function parkedForNight(game: Scenario): Snapshot {
  untilBeforeNight(game.campaign, parkingLeadHours * 60 + 1);
  game.advance({ minutes: 1 });
  expect(game.state.parking.length).toBeGreaterThan(0);
  for (let minutes = 0; game.state.parking.length > 0; minutes++) {
    if (minutes > 24 * 60) throw new Error("The parking was never done.");
    game.advance({ minutes: 1 });
  }
  return game.state;
}

describe("a parking area", () => {
  it("is on a powered network once commissioned, its bays empty", () => {
    const state = baseWithParkingArea().state;
    const area = structure(state, "parking-area");
    const network = state.power.networks.find((candidate) =>
      candidate.structureIds.includes(area.id),
    );

    expect(network?.structureIds).toContain(
      structure(state, "battery-bank").id,
    );
    expect(bayOffsets).toHaveLength(4);
    for (const driven of [...state.machines, ...state.rovers]) {
      expect(bayAt(area, driven.position)).toBeUndefined();
    }
  });

  it("has the Robot park the idle Machines and the Rover that aren't plugged in in its bays as Night comes, rather than beside the nearer powered Structures, each in a bay of its own", () => {
    const game = baseWithParkingArea();
    untilBeforeNight(game.campaign, parkingLeadHours * 60 + 1);
    const unplugged = [...game.state.machines, ...game.state.rovers]
      .filter((driven) => !driven.pluggedIn)
      .map((driven) => driven.id);
    expect(unplugged).toContain("rover-1");
    expect(unplugged.length).toBeGreaterThanOrEqual(2);

    const state = parkedForNight(game);
    const area = structure(state, "parking-area");
    const parked = [...state.machines, ...state.rovers].filter((driven) =>
      unplugged.includes(driven.id),
    );
    const bays = parked.map((driven) => bayAt(area, driven.position));

    expect(bays).not.toContain(undefined);
    expect(new Set(bays).size).toBe(parked.length);
    expect(parked.map((driven) => driven.pluggedIn)).not.toContain(false);
    expect(state.parking).toEqual([]);
  });

  it("keeps what is parked in its bays warm through the Night", () => {
    const game = baseWithParkingArea();
    parkedForNight(game);
    const area = structure(game.state, "parking-area");
    const inBays = () =>
      [...game.state.machines, ...game.state.rovers].filter(
        (driven) => bayAt(area, driven.position) !== undefined,
      );
    const before = inBays().map((driven) => driven.conditionPercent);

    game.advance({ hours: 12 });

    expect(game.state.lunation.part).toBe("night");
    expect(inBays().map((driven) => driven.powered)).not.toContain(false);
    expect(inBays().map((driven) => driven.conditionPercent)).toEqual(before);
  });

  it("isn't parked in before it is commissioned: parking is beside the nearest powered Structure, as without one", () => {
    const game = buildAll(poweredBase());
    untilBeforeNight(game.campaign, parkingLeadHours * 60 + 1);
    game.plan("parking-area", parkingSite);
    game.advance({ minutes: 1 });

    expect(game.state.parking.length).toBeGreaterThan(0);
    expect(
      game.state.parking.map((parking) => parking.structureTypeId),
    ).not.toContain("parking-area");
    expect(game.state.parking.map((parking) => parking.inBay)).not.toContain(
      true,
    );
  });

  it("says which park Work Orders are for one of its bays, and the Work panel says so", () => {
    const game = baseWithParkingArea();
    untilBeforeNight(game.campaign, parkingLeadHours * 60 + 1);
    game.advance({ minutes: 1 });

    expect(game.state.parking.length).toBeGreaterThan(0);
    for (const parking of game.state.parking) {
      expect(parking).toMatchObject({
        structureTypeId: "parking-area",
        inBay: true,
      });
    }
    const rover = game.state.parking.find(
      (parking) => parking.subject.kind === "rover",
    );
    if (rover === undefined) throw new Error("expected the Rover's parking");
    expect(formatParkingPlace(rover)).toBe("in a bay of the parking area");
    expect(describeParking(rover, game.state)).toBe(
      "Waiting for the Robot to park the Rover in a bay of the parking area",
    );
  });

  it("carries on parking in its bays exactly the same through saving and loading", () => {
    const game = baseWithParkingArea();
    untilBeforeNight(game.campaign, parkingLeadHours * 60 - 30);
    expect(game.state.parking.length).toBeGreaterThan(0);
    const loaded = loadCampaign(game.campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    game.advance({ hours: 3 });
    loaded.campaign.advance(3 * 60);

    expect(loaded.campaign.snapshot()).toEqual(game.state);
  });

  it("keeps which bay each park Work Order is for in the save, not only where it goes", () => {
    const game = baseWithParkingArea();
    untilBeforeNight(game.campaign, parkingLeadHours * 60 - 1);
    const area = structure(game.state, "parking-area");
    const document = JSON.parse(game.campaign.save()) as {
      state: {
        parking: {
          structureId: string;
          bayIndex: number | null;
          destination: GroundPosition;
        }[];
      };
    };
    const orders = document.state.parking;
    expect(orders.length).toBeGreaterThanOrEqual(2);
    expect(orders.map((order) => order.structureId)).toEqual(
      orders.map(() => area.id),
    );
    const bays = orders.map((order) => order.bayIndex);
    expect(new Set(bays).size).toBe(orders.length);
    for (const order of orders) {
      expect(order.bayIndex).not.toBeNull();
      expect(order.destination).toEqual(baysOf(area)[order.bayIndex ?? -1]);
    }

    // Were a bay's spot to move, as if the bays were laid out afresh, the
    // Work Order going to it still holds that bay, so it is still in a bay
    // and no other Work Order is given it.
    const moved = orders[orders.length - 1];
    if (moved === undefined) throw new Error("expected a park Work Order");
    moved.destination = { x: area.position.x, y: area.position.y };
    const loaded = loadCampaign(JSON.stringify(document));
    if (!loaded.ok) throw new Error(loaded.message);
    loaded.campaign.advance(1);
    const after = JSON.parse(loaded.campaign.save()) as typeof document;

    expect(loaded.campaign.snapshot().parking.map((p) => p.inBay)).toEqual(
      loaded.campaign.snapshot().parking.map(() => true),
    );
    const held = after.state.parking.map((order) => order.bayIndex);
    expect(new Set(held).size).toBe(held.length);
  });
});

describe("a parking area far from what is to be parked", () => {
  it("takes nothing from further than the data catalogue's detour beyond the nearest powered Structure: parking is beside that, as without one", () => {
    const farSite: GroundPosition = { x: -20, y: -130 };
    const game = buildAll(poweredBase().plan("parking-area", farSite));
    untilBeforeNight(game.campaign, parkingLeadHours * 60 + 1);
    const area = structure(game.state, "parking-area");
    const nearestBay = (position: GroundPosition) =>
      Math.min(
        ...baysOf(area).map((bay) =>
          Math.hypot(bay.x - position.x, bay.y - position.y),
        ),
      );
    // The regolith printer and the Rover, still where they began, are each
    // within 25 m of a powered Structure.
    const farOff = [...game.state.machines, ...game.state.rovers].filter(
      (driven) => !driven.pluggedIn && nearestBay(driven.position) > 100,
    );
    expect(farOff.map((driven) => driven.id)).toEqual(
      expect.arrayContaining(["regolith-printer-2", "rover-1"]),
    );

    game.advance({ minutes: 1 });

    const orders = game.state.parking.filter((order) =>
      farOff.some(
        (driven) =>
          driven.id ===
          (order.subject.kind === "rover"
            ? order.subject.roverId
            : order.subject.machineId),
      ),
    );
    expect(orders).toHaveLength(farOff.length);
    expect(orders.map((order) => order.inBay)).not.toContain(true);
  });

  it("is still used from as far as the detour beyond the nearest powered Structure", () => {
    const game = baseWithParkingArea();
    untilBeforeNight(game.campaign, parkingLeadHours * 60 + 1);
    const area = structure(game.state, "parking-area");
    const printer = game.state.machines.find(
      (machine) => machine.machineTypeId === "regolith-printer",
    );
    if (printer === undefined) throw new Error("expected the printer");
    const bank = structure(game.state, "battery-bank");
    const gap = (a: GroundPosition, b: GroundPosition) =>
      Math.hypot(a.x - b.x, a.y - b.y);
    const detour =
      Math.min(...baysOf(area).map((bay) => gap(bay, printer.position))) -
      gap(bank.position, printer.position);
    expect(detour).toBeGreaterThan(0);
    expect(detour).toBeLessThanOrEqual(catalogue.cold.bayDetourMetres);

    game.advance({ minutes: 1 });

    expect(
      game.state.parking.find(
        (order) =>
          order.subject.kind === "machine" &&
          order.subject.machineId === printer.id,
      )?.inBay,
    ).toBe(true);
  });
});

describe("a parking area that can't keep heaters on through the Night", () => {
  /** The park Work Orders raised in the first game-minute of parking. */
  function ordersRaised(game: Scenario): Snapshot["parking"] {
    game.advance({ minutes: 1 });
    expect(game.state.parking.length).toBeGreaterThan(0);
    return game.state.parking;
  }

  it("on a network with a solar array but no battery bank, takes nothing: parking is beside the nearest powered Structure, as without one", () => {
    const built = baseWithParkingArea();
    untilBeforeNight(built.campaign, parkingLeadHours * 60 + 1);
    const banks = built.state.structures
      .filter((s) => s.structureTypeId === "battery-bank")
      .map((s) => s.id);
    const arrayId = structure(built.state, "solar-array").id;
    const areaId = structure(built.state, "parking-area").id;
    // The battery banks cut off from the solar array, and the parking area
    // cabled to the solar array alone.
    const game = changedSave(built.campaign, (state) => {
      state.cables = state.cables.filter(
        (cable) => !banks.includes(cable.toStructureId),
      );
      for (const cable of state.cables) {
        if (cable.toStructureId === areaId) cable.fromStructureId = arrayId;
      }
    });
    const area = structure(game.state, "parking-area");
    const network = game.state.power.networks.find((candidate) =>
      candidate.structureIds.includes(area.id),
    );
    expect(network?.storageCapacityKilowattHours).toBe(0);

    const orders = ordersRaised(game);
    expect(orders.map((order) => order.inBay)).not.toContain(true);
    expect(orders.map((order) => order.structureTypeId)).not.toContain(
      "parking-area",
    );
  });

  it("on a network whose battery banks are flat, takes nothing: parking is beside the nearest powered Structure, as without one", () => {
    const built = baseWithParkingArea();
    untilBeforeNight(built.campaign, parkingLeadHours * 60 + 1);
    const game = changedSave(built.campaign, (state) => {
      for (const s of state.structures) s.storedKilowattHours = 0;
    });

    const orders = ordersRaised(game);
    expect(orders.map((order) => order.inBay)).not.toContain(true);
    expect(orders.map((order) => order.structureTypeId)).not.toContain(
      "parking-area",
    );
  });
});
