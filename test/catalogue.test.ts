import { describe, expect, it } from "vitest";
import { catalogue, type GroundPosition } from "../src/catalogue";

const halfWidth = catalogue.map.widthMetres / 2;
const halfDepth = catalogue.map.depthMetres / 2;

function isOnMap(position: GroundPosition, margin = 0): boolean {
  return (
    Math.abs(position.x) + margin <= halfWidth &&
    Math.abs(position.y) + margin <= halfDepth
  );
}

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

  it("lands the Lander with its whole footprint on the map", () => {
    const { footprintRadiusMetres } = catalogue.lander;

    expect(footprintRadiusMetres).toBeGreaterThan(0);
    expect(
      isOnMap(catalogue.landingSite.landerPosition, footprintRadiusMetres),
    ).toBe(true);
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
});
