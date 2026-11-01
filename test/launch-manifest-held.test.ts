import { describe, expect, it } from "vitest";
import { catalogue, type LaunchItem } from "../src/catalogue";
import { describeItemHeld } from "../src/ui/launch-manifest-text";
import { scenario } from "./scenario";

function item(id: string): LaunchItem {
  const found = catalogue.launch.items.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`expected a Launch item "${id}"`);
  return found;
}

describe("what the Launch manifest says the base already has", () => {
  it("counts a Component in the stockpile", () => {
    expect(describeItemHeld(item("solar-panel"), scenario().state)).toEqual({
      held: "2",
      none: false,
      coming: undefined,
    });
  });

  it("goes down as the Robot takes Components from the stockpile", () => {
    const game = scenario().plan("solar-array", { x: 25, y: -20 });
    for (let hours = 0; game.state.constructions.length > 0; hours++) {
      if (hours > 10 * 24) throw new Error("The array was never built.");
      game.advance({ hours: 1 });
    }

    expect(describeItemHeld(item("solar-panel"), game.state)).toMatchObject({
      held: "None",
      none: true,
    });
  });

  it("says plainly that the base has none of an item", () => {
    expect(describeItemHeld(item("pad-panel"), scenario().state)).toEqual({
      held: "None",
      none: true,
      coming: undefined,
    });
  });

  it("gives the amount of a life support stock, with its unit", () => {
    const { state } = scenario();
    const oxygen = state.lifeSupport.find(
      (stock) => stock.stockId === "oxygen",
    );
    if (oxygen === undefined) throw new Error("expected an oxygen stock");

    expect(
      describeItemHeld(item("oxygen"), {
        ...state,
        lifeSupport: [{ ...oxygen, kilograms: 120 }],
      }).held,
    ).toBe("120 kg");
  });

  it("counts the base's Robots", () => {
    const { state } = scenario();

    expect(describeItemHeld(item("robot"), state).held).toBe(
      String(state.robots.length),
    );
  });

  it("doesn't count what is on a manifest the player can still change", () => {
    const game = scenario();
    game.campaign.setLaunchManifest([{ itemId: "pad-panel", count: 3 }]);

    expect(describeItemHeld(item("pad-panel"), game.state).coming).toBe(
      undefined,
    );
  });

  it("shows apart what has left Earth and what waits aboard the Lander to be unloaded", () => {
    const { state } = scenario();

    expect(
      describeItemHeld(item("pad-panel"), {
        ...state,
        launchManifest: {
          ...state.launchManifest,
          locked: true,
          items: [{ itemId: "pad-panel", count: 3 }],
        },
        lander: {
          ...state.lander,
          cargo: [{ componentId: "pad-panel", count: 2 }],
        },
      }),
    ).toEqual({ held: "None", none: true, coming: "5 on the way" });
  });

  it("gives what is on the way of a life support stock in kilograms", () => {
    const { state } = scenario();

    expect(
      describeItemHeld(item("water"), {
        ...state,
        launchManifest: {
          ...state.launchManifest,
          locked: true,
          items: [{ itemId: "water", count: 2 }],
        },
      }).coming,
    ).toBe("100 kg on the way");
  });
});
