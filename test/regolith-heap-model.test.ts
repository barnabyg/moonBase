import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import {
  createRegolithHeapGeometry,
  regolithHeapShown,
} from "../src/render/regolith-heap-view";
import {
  regolithHeap,
  regolithHeapGround,
  type Campaign,
  type GroundPosition,
} from "../src/simulation";
import { scenario, scenarioOf } from "./scenario";
import { changed } from "./worn";

const stockpile = catalogue.landingSite.stockpilePosition;
const heapGround = regolithHeapGround(stockpile);

/** The Campaign as saved, with the base's Regolith set as given. */
function withRegolith(campaign: Campaign, kilograms: number): Campaign {
  return changed(campaign, (state) => {
    for (const stock of state.bulkResources) {
      if (stock.resourceId === "regolith") stock.kilograms = kilograms;
    }
  });
}

describe("the heap of Regolith shown beside the stockpile", () => {
  it("isn't shown with no Regolith in stock", () => {
    expect(regolithHeapShown(scenario().state)).toBeUndefined();
  });

  it("is shown at the size the stock gives it", () => {
    const game = scenarioOf(withRegolith(scenario().campaign, 1200));

    expect(regolithHeapShown(game.state)).toEqual(
      regolithHeap(stockpile, 1200),
    );
  });

  it("isn't shown while a Structure is planned or built over it", () => {
    // Just beyond the heap's middle, so that the light mast stands on the
    // heap but clear of the stockpile.
    const out =
      0.9 /
      Math.hypot(
        heapGround.position.x - stockpile.x,
        heapGround.position.y - stockpile.y,
      );
    const mast: GroundPosition = {
      x: heapGround.position.x + (heapGround.position.x - stockpile.x) * out,
      y: heapGround.position.y + (heapGround.position.y - stockpile.y) * out,
    };
    const game = scenarioOf(withRegolith(scenario().campaign, 2000));
    const planned = game.campaign.planConstruction({
      structureTypeId: "light-mast",
      position: mast,
    });
    if (!planned.ok) throw new Error(planned.message);

    expect(regolithHeapShown(game.state)).toBeUndefined();
  });
});

describe("the Regolith heap's model", () => {
  const geometry = createRegolithHeapGeometry();
  const position = geometry.getAttribute("position");
  const points = Array.from({ length: position.count }, (_, index) =>
    new THREE.Vector3().fromBufferAttribute(position, index),
  );

  it("is a low mound about 1 across its radius and no higher than 1, sunk just into the ground at its foot", () => {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox ?? new THREE.Box3();

    expect(box.max.y).toBeLessThanOrEqual(1);
    expect(box.max.y).toBeGreaterThan(0.85);
    expect(box.min.y).toBeLessThan(0);
    expect(box.min.y).toBeGreaterThan(-0.05);
    for (const point of points) {
      expect(Math.hypot(point.x, point.z)).toBeLessThan(1.2);
    }
  });

  it("has an uneven outline, not a perfect circle", () => {
    const foot = points
      .filter((point) => point.y < 0)
      .map((point) => Math.hypot(point.x, point.z));

    expect(Math.max(...foot) - Math.min(...foot)).toBeGreaterThan(0.1);
  });

  it("faces up and out everywhere, to be lit from above", () => {
    const normal = geometry.getAttribute("normal");
    for (let index = 0; index < normal.count; index++) {
      expect(normal.getY(index)).toBeGreaterThan(0);
    }
  });
});
