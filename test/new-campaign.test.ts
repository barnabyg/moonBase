import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import type { GroundPosition, MapSnapshot } from "../src/simulation";
import { scenario } from "./scenario";

function distanceBetween(a: GroundPosition, b: GroundPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isOnMap(position: GroundPosition, map: MapSnapshot) {
  return (
    Math.abs(position.x) <= map.widthMetres / 2 &&
    Math.abs(position.y) <= map.depthMetres / 2
  );
}

describe("a new Campaign", () => {
  it("takes place on a 1×1 km base map", () => {
    expect(scenario().state.map).toEqual({
      widthMetres: 1000,
      depthMetres: 1000,
    });
  });

  it("begins with the Lander already landed on the map, with the Mission Director aboard", () => {
    const { lander, map } = scenario().state;

    expect(lander.state).toBe("landed-occupied");
    expect(isOnMap(lander.position, map)).toBe(true);
  });

  it("has one Robot standing beside the Lander, clear of its footprint", () => {
    const { lander, robots, map } = scenario().state;

    expect(robots).toHaveLength(1);
    const [robot] = robots;
    if (robot === undefined) throw new Error("expected a Robot");
    expect(isOnMap(robot.position, map)).toBe(true);
    const gap =
      distanceBetween(robot.position, lander.position) -
      catalogue.lander.footprintRadiusMetres;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(10);
  });

  it("keeps the base's starting stock of Components at a stockpile beside the Lander, where the data catalogue puts it", () => {
    const { lander, stockpile, map } = scenario().state;

    expect(stockpile.position).toEqual(catalogue.landingSite.stockpilePosition);
    expect(isOnMap(stockpile.position, map)).toBe(true);
    expect(stockpile.components.filter((stock) => stock.count > 0)).toEqual(
      catalogue.startingStock,
    );
    const gap =
      distanceBetween(stockpile.position, lander.position) -
      catalogue.lander.footprintRadiusMetres -
      catalogue.stockpile.footprintRadiusMetres;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(10);
  });

  it("returns a snapshot that cannot be changed by its reader", () => {
    const { campaign } = scenario();
    const snapshot = campaign.snapshot();

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.lander.position)).toBe(true);
    expect(Object.isFrozen(snapshot.robots)).toBe(true);
    expect(Object.isFrozen(snapshot.robots[0]?.position)).toBe(true);
    expect(() => {
      (snapshot.clock as { elapsedMinutes: number }).elapsedMinutes = 99;
    }).toThrow(TypeError);
  });

  it("is not changed by advancing after a snapshot was taken", () => {
    const { campaign } = scenario();
    const before = campaign.snapshot();

    campaign.advance(90);

    expect(before.clock.elapsedMinutes).toBe(0);
    expect(campaign.snapshot().clock.elapsedMinutes).toBe(90);
  });
});
