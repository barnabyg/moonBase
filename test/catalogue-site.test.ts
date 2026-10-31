import { describe, expect, it } from "vitest";
import { catalogue, type GroundPosition } from "../src/catalogue";
import { isOnMap } from "./catalogue-helpers";

/**
 * The data catalogue's site.ts: the version, the map, game speeds, Lunations,
 * the Lander, the stockpile and what stands where at the start.
 */

describe("the data catalogue", () => {
  it("has a whole-number version from 1 upwards", () => {
    expect(Number.isInteger(catalogue.version)).toBe(true);
    expect(catalogue.version).toBeGreaterThanOrEqual(1);
  });

  it("describes a base map with a positive size", () => {
    expect(catalogue.map.widthMetres).toBeGreaterThan(0);
    expect(catalogue.map.depthMetres).toBeGreaterThan(0);
  });

  it("offers game speeds with unique ids and labels, including a pause", () => {
    const { gameSpeeds } = catalogue;

    expect(new Set(gameSpeeds.map((speed) => speed.id)).size).toBe(
      gameSpeeds.length,
    );
    expect(new Set(gameSpeeds.map((speed) => speed.label)).size).toBe(
      gameSpeeds.length,
    );
    expect(
      gameSpeeds.filter((speed) => speed.gameMinutesPerRealSecond === 0),
    ).toHaveLength(1);
    for (const speed of gameSpeeds) {
      expect(Number.isFinite(speed.gameMinutesPerRealSecond)).toBe(true);
      expect(speed.gameMinutesPerRealSecond).toBeGreaterThanOrEqual(0);
    }
  });

  it("schedules Lunations whose parts last a positive, whole number of game-minutes", () => {
    const {
      daylightEarthDays,
      nightEarthDays,
      initialDaylightRemainingEarthDays,
    } = catalogue.lunation;

    for (const earthDays of [
      daylightEarthDays,
      nightEarthDays,
      initialDaylightRemainingEarthDays,
    ]) {
      expect(earthDays).toBeGreaterThan(0);
      expect(Number.isInteger(earthDays * 24 * 60)).toBe(true);
    }
    expect(initialDaylightRemainingEarthDays).toBeLessThanOrEqual(
      daylightEarthDays,
    );
  });

  it("lands the Lander with its whole footprint on the map", () => {
    const { footprintRadiusMetres } = catalogue.lander;

    expect(footprintRadiusMetres).toBeGreaterThan(0);
    expect(
      isOnMap(catalogue.landingSite.landerPosition, footprintRadiusMetres),
    ).toBe(true);
  });

  it("flies the Lander's round trip in legs that each last a positive, whole number of game-minutes", () => {
    for (const earthDays of Object.values(
      catalogue.lander.roundTripEarthDays,
    )) {
      expect(earthDays).toBeGreaterThan(0);
      expect(Number.isInteger(earthDays * 24 * 60)).toBe(true);
    }
  });

  it("places at least one Robot on the map, outside the Lander's footprint", () => {
    const { landerPosition, robotPositions } = catalogue.landingSite;

    expect(robotPositions.length).toBeGreaterThanOrEqual(1);
    for (const robot of robotPositions) {
      expect(isOnMap(robot)).toBe(true);
      expect(
        Math.hypot(robot.x - landerPosition.x, robot.y - landerPosition.y),
      ).toBeGreaterThan(catalogue.lander.footprintRadiusMetres);
    }
  });

  it("parks one Rover near the Lander, on the map and clear of the Lander, the stockpile, the Robots and the Machines", () => {
    const { landerPosition, stockpilePosition, robotPositions, machines } =
      catalogue.landingSite;
    const { rover } = catalogue;
    const distance = (a: GroundPosition, b: GroundPosition) =>
      Math.hypot(a.x - b.x, a.y - b.y);

    expect(catalogue.landingSite.roverPositions).toHaveLength(1);
    for (const position of catalogue.landingSite.roverPositions) {
      expect(isOnMap(position, rover.footprintRadiusMetres)).toBe(true);
      // Near the Lander, but clear of it.
      expect(distance(position, landerPosition)).toBeGreaterThan(
        catalogue.lander.footprintRadiusMetres + rover.footprintRadiusMetres,
      );
      expect(distance(position, landerPosition)).toBeLessThan(15);
      expect(distance(position, stockpilePosition)).toBeGreaterThan(
        catalogue.stockpile.footprintRadiusMetres + rover.footprintRadiusMetres,
      );
      for (const robot of robotPositions) {
        expect(distance(position, robot)).toBeGreaterThan(
          rover.footprintRadiusMetres,
        );
      }
      for (const machine of machines) {
        const type = catalogue.machineTypes.find(
          (candidate) => candidate.id === machine.machineTypeId,
        );
        expect(distance(position, machine.position)).toBeGreaterThan(
          rover.footprintRadiusMetres + (type?.footprintRadiusMetres ?? 0),
        );
      }
    }
  });

  it("keeps the base's stock at a stockpile on the map, clear of the Lander, Robots and Machines, with room to walk round it", () => {
    const { landerPosition, stockpilePosition, robotPositions, machines } =
      catalogue.landingSite;
    const radius = catalogue.stockpile.footprintRadiusMetres;
    const distance = (a: GroundPosition, b: GroundPosition) =>
      Math.hypot(a.x - b.x, a.y - b.y);

    expect(radius).toBeGreaterThan(0);
    expect(isOnMap(stockpilePosition, radius)).toBe(true);
    // Room for the Robot to stand between it and the Lander.
    expect(distance(stockpilePosition, landerPosition)).toBeGreaterThan(
      radius +
        catalogue.lander.footprintRadiusMetres +
        catalogue.robot.workingGapMetres * 2,
    );
    for (const robot of robotPositions) {
      expect(distance(stockpilePosition, robot)).toBeGreaterThan(radius);
    }
    for (const machine of machines) {
      const type = catalogue.machineTypes.find(
        (candidate) => candidate.id === machine.machineTypeId,
      );
      expect(distance(stockpilePosition, machine.position)).toBeGreaterThan(
        radius + (type?.footprintRadiusMetres ?? 0),
      );
    }
  });

  it("gives the Lander a Return Mass well short of a Launch's Payload Mass", () => {
    expect(catalogue.lander.returnMassKilograms).toBeGreaterThan(0);
    expect(catalogue.lander.returnMassKilograms).toBeLessThan(
      catalogue.launch.payloadMassLimitKilograms,
    );
  });

  it("lands every Machine a Structure needs, on the map and clear of the Lander", () => {
    const { landerPosition, machines } = catalogue.landingSite;

    const landed = machines.map((machine) => machine.machineTypeId);
    for (const type of catalogue.structureTypes) {
      for (const machineTypeId of Object.values(type.stageMachines)) {
        expect(landed).toContain(machineTypeId);
      }
    }
    for (const machine of machines) {
      const type = catalogue.machineTypes.find(
        (candidate) => candidate.id === machine.machineTypeId,
      );
      if (type === undefined) throw new Error("expected a known Machine");
      expect(isOnMap(machine.position, type.footprintRadiusMetres)).toBe(true);
      expect(
        Math.hypot(
          machine.position.x - landerPosition.x,
          machine.position.y - landerPosition.y,
        ),
      ).toBeGreaterThan(
        catalogue.lander.footprintRadiusMetres + type.footprintRadiusMetres,
      );
    }
  });
});
