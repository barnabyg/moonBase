import { describe, expect, it } from "vitest";
import { isClick, moved } from "../src/ui/click";

describe("a press and release on the 3D view", () => {
  it("is a click when the pointer stays put", () => {
    expect(
      isClick({ x: 100, y: 200, button: 0 }, { x: 100, y: 200, button: 0 }),
    ).toBe(true);
  });

  it("is still a click when the hand shakes a few pixels", () => {
    expect(
      isClick({ x: 100, y: 200, button: 0 }, { x: 104, y: 196, button: 0 }),
    ).toBe(true);
  });

  it("is a drag, moving the camera, once the pointer moves further", () => {
    expect(
      isClick({ x: 100, y: 200, button: 0 }, { x: 108, y: 200, button: 0 }),
    ).toBe(false);
  });

  it("is a drag when the pointer wanders off and comes back, as the camera moved meanwhile", () => {
    const press = { x: 100, y: 200, button: 0 };
    const wandered = moved(moved(press, { x: 160, y: 210 }), {
      x: 101,
      y: 200,
    });
    expect(isClick(wandered, { x: 101, y: 200, button: 0 })).toBe(false);
  });

  it("isn't a click when another button is released than was pressed", () => {
    expect(
      isClick({ x: 100, y: 200, button: 0 }, { x: 100, y: 200, button: 2 }),
    ).toBe(false);
  });

  it("isn't a click without a press on the view first", () => {
    expect(isClick(undefined, { x: 100, y: 200, button: 0 })).toBe(false);
  });
});
