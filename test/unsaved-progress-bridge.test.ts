import { describe, expect, it, vi } from "vitest";
import type {
  UnsavedProgressBridge,
  UnsavedSave,
} from "../electron/desktop-bridge";
import { answerUnsavedProgressFor } from "../src/ui/unsaved-progress";

function bridge() {
  let unsaved: (() => UnsavedSave | null) | undefined;
  return {
    answerUnsavedProgress: vi.fn((answer: () => UnsavedSave | null) => {
      unsaved = answer;
    }),
    /** What the page answers when the main process asks. */
    ask: () => unsaved?.(),
  } satisfies UnsavedProgressBridge & { ask(): unknown };
}

describe("answering the question before the window closes", () => {
  it("gives the save to offer when there is unsaved progress, and null when there is none", () => {
    const desktop = bridge();
    let unsaved: UnsavedSave | undefined = { name: "a.moonbase", text: "{}" };

    answerUnsavedProgressFor({ moonbase: desktop }, { unsaved: () => unsaved });

    expect(desktop.ask()).toEqual({ name: "a.moonbase", text: "{}" });
    unsaved = undefined;
    expect(desktop.ask()).toBeNull();
  });

  it("does nothing in a browser, or with a bridge from before the question", () => {
    const unsaved = vi.fn(() => undefined);
    answerUnsavedProgressFor({}, { unsaved });
    answerUnsavedProgressFor(
      { moonbase: { saveFile() {}, openSaveFile() {} } },
      { unsaved },
    );
    expect(unsaved).not.toHaveBeenCalled();
  });
});
