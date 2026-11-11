import { describe, expect, it } from "vitest";
import {
  closeChoice,
  closeQuestionOptions,
  decideClose,
  parsePageAnswer,
  type CloseChoice,
  type CloseQuestion,
  type PageAnswer,
} from "../electron/close-prompt.js";
import type { SaveFileResult } from "../electron/desktop-bridge.js";

const unsaved: PageAnswer = {
  kind: "unsaved",
  name: "moon-base-earth-day-3-0705.moonbase",
  text: "{}",
};

/** Closes with the page and the player answering as given, and tells what happened. */
async function close(
  page: PageAnswer,
  choice?: CloseChoice,
  saved?: SaveFileResult,
) {
  const asked: CloseQuestion[] = [];
  const saves: [string, string][] = [];
  const decision = await decideClose({
    askPage: () => Promise.resolve(page),
    askPlayer: (question) => {
      asked.push(question);
      if (choice === undefined)
        throw new Error("The player wasn't to be asked.");
      return Promise.resolve(choice);
    },
    save: (name, text) => {
      saves.push([name, text]);
      if (saved === undefined) throw new Error("Nothing was to be saved.");
      return Promise.resolve(saved);
    },
  });
  return { decision, asked, saves };
}

describe("closing the game window", () => {
  it("closes at once with nothing unsaved", async () => {
    expect(await close({ kind: "nothing-unsaved" })).toEqual({
      decision: "close",
      asked: [],
      saves: [],
    });
  });

  it("with unsaved progress, asks whether to save first", async () => {
    expect((await close(unsaved, "cancel")).asked).toEqual(["save-first"]);
  });

  it("closes once Save has written the file", async () => {
    expect(
      await close(unsaved, "save", {
        outcome: "saved",
        fileName: "a.moonbase",
      }),
    ).toEqual({
      decision: "close",
      asked: ["save-first"],
      saves: [["moon-base-earth-day-3-0705.moonbase", "{}"]],
    });
  });

  it("stays open when the save dialog is cancelled, or the file can't be written", async () => {
    expect(
      (await close(unsaved, "save", { outcome: "cancelled" })).decision,
    ).toBe("stay");
    expect(
      (
        await close(unsaved, "save", {
          outcome: "failed",
          fileName: "a.moonbase",
        })
      ).decision,
    ).toBe("stay");
  });

  it("closes without saving on Don't save, and stays open on Cancel", async () => {
    expect(await close(unsaved, "dont-save")).toMatchObject({
      decision: "close",
      saves: [],
    });
    expect(await close(unsaved, "cancel")).toMatchObject({
      decision: "stay",
      saves: [],
    });
  });

  it("asks whether to close anyway when the page doesn't answer", async () => {
    expect(await close({ kind: "no-answer" }, "dont-save")).toEqual({
      decision: "close",
      asked: ["close-unchecked"],
      saves: [],
    });
    expect((await close({ kind: "no-answer" }, "cancel")).decision).toBe(
      "stay",
    );
  });
});

describe("the close prompt's message box", () => {
  it("offers Save, Don't save and Cancel, with Enter saving and Escape cancelling", () => {
    const options = closeQuestionOptions("save-first");
    expect(options.buttons).toEqual(["Save", "Don't save", "Cancel"]);
    expect(options.defaultId).toBe(0);
    expect(options.cancelId).toBe(2);
    expect(
      [0, 1, 2].map((response) => closeChoice("save-first", response)),
    ).toEqual(["save", "dont-save", "cancel"]);
  });

  it("when the page couldn't be asked, offers Close and Cancel, with Enter and Escape cancelling", () => {
    const options = closeQuestionOptions("close-unchecked");
    expect(options.buttons).toEqual(["Close", "Cancel"]);
    expect(options.defaultId).toBe(1);
    expect(options.cancelId).toBe(1);
    expect(
      [0, 1].map((response) => closeChoice("close-unchecked", response)),
    ).toEqual(["dont-save", "cancel"]);
  });

  it("takes an answer with no button as Cancel", () => {
    expect(closeChoice("save-first", 7)).toBe("cancel");
    expect(closeChoice("save-first", -1)).toBe("cancel");
  });
});

describe("the page's answer", () => {
  it("is nothing unsaved, or a save the save bridge would accept", () => {
    expect(parsePageAnswer(null)).toEqual({ kind: "nothing-unsaved" });
    expect(
      parsePageAnswer({
        name: "moon-base-earth-day-3-0705.moonbase",
        text: "{}",
      }),
    ).toEqual(unsaved);
  });

  it("is no answer when it is anything else", () => {
    for (const answer of [
      undefined,
      "save",
      3,
      {},
      { name: "../escape.moonbase", text: "{}" },
      { name: "notes.txt", text: "{}" },
      { name: "a.moonbase", text: 3 },
    ]) {
      expect(parsePageAnswer(answer), JSON.stringify(answer)).toEqual({
        kind: "no-answer",
      });
    }
  });
});
