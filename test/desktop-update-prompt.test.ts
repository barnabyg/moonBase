import { describe, expect, it } from "vitest";
import {
  answerDownloadedUpdate,
  updateChoice,
  updateQuestionOptions,
  type UpdateChoice,
} from "../electron/update-prompt.js";

/** Answers an update to `version` as the player chooses, and tells what happened. */
async function answer(version: string, choice: UpdateChoice) {
  const asked: string[] = [];
  let restarts = 0;
  const result = await answerDownloadedUpdate(version, {
    askPlayer: (asking) => {
      asked.push(asking);
      return Promise.resolve(choice);
    },
    restart: () => {
      restarts += 1;
    },
  });
  return { result, asked, restarts };
}

describe("a downloaded update", () => {
  it("asks the player about its version and restarts when they choose to", async () => {
    expect(await answer("0.2.0", "restart")).toEqual({
      result: "restart",
      asked: ["0.2.0"],
      restarts: 1,
    });
  });

  it("leaves the game running when the player chooses later", async () => {
    expect(await answer("0.2.0", "later")).toEqual({
      result: "later",
      asked: ["0.2.0"],
      restarts: 0,
    });
  });
});

describe("the update's question", () => {
  const options = updateQuestionOptions("0.2.0");

  it("names the version and offers Restart now, then Later", () => {
    expect(options.message).toBe("Moon Base 0.2.0 is ready to install.");
    expect(options.buttons).toEqual(["Restart now", "Later"]);
  });

  it("restarts on Enter and answers Later on Escape", () => {
    expect(updateChoice(options.defaultId ?? -1)).toBe("restart");
    expect(updateChoice(options.cancelId ?? -1)).toBe("later");
  });

  it("answers Later for a response that isn't a button", () => {
    expect(updateChoice(-1)).toBe("later");
    expect(updateChoice(2)).toBe("later");
  });
});
