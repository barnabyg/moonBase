// What closing the game window, or quitting, comes to: the page is asked for
// its unsaved progress (src/game/unsaved-progress.ts), and the player whether
// to save it first. close-window.ts does the asking; this decides. Only types
// are imported from Electron, so the unit tests can run this in plain Node.
import type { MessageBoxOptions } from "electron";
import type { SaveFileResult, UnsavedSave } from "./desktop-bridge.js";
import { parseSaveFileArgs } from "./save-ipc.js";

/** What the page answered when asked for its unsaved progress. */
export type PageAnswer =
  | { readonly kind: "nothing-unsaved" }
  | ({ readonly kind: "unsaved" } & UnsavedSave)
  /** No answer came in time, or not one the bridge sends. */
  | { readonly kind: "no-answer" };

/**
 * What the player is asked: whether to save the unsaved progress first, or,
 * when the page couldn't say whether there is any, whether to close anyway.
 */
export type CloseQuestion = "save-first" | "close-unchecked";

/** The player's answer. */
export type CloseChoice = "save" | "dont-save" | "cancel";

/** The steps of closing, which close-window.ts does with Electron. */
export interface CloseSteps {
  askPage(): Promise<PageAnswer>;
  askPlayer(question: CloseQuestion): Promise<CloseChoice>;
  /** Saves with the save dialog (save-dialogs.ts's saveWithDialog). */
  save(name: string, text: string): Promise<SaveFileResult>;
}

/**
 * Whether the window closes, or stays open. With nothing unsaved it closes
 * at once. With unsaved progress the player chooses: Save opens the save
 * dialog, and the window closes only once the file is written, so cancelling
 * that dialog, or a file that can't be written, keeps it open; Don't save
 * closes; Cancel keeps it open.
 *
 * A page that doesn't answer may be hung or broken, and its progress can't be
 * saved, but closing without a word could lose it, and refusing to close
 * would leave the player a window they can't close. So the player is asked
 * whether to close anyway.
 */
export async function decideClose(
  steps: CloseSteps,
): Promise<"close" | "stay"> {
  const answer = await steps.askPage();
  switch (answer.kind) {
    case "nothing-unsaved":
      return "close";
    case "no-answer":
      return (await steps.askPlayer("close-unchecked")) === "dont-save"
        ? "close"
        : "stay";
    case "unsaved":
      switch (await steps.askPlayer("save-first")) {
        case "dont-save":
          return "close";
        case "cancel":
          return "stay";
        case "save": {
          const saved = await steps.save(answer.name, answer.text);
          return saved.outcome === "saved" ? "close" : "stay";
        }
      }
  }
}

/** Each question's buttons, in order, and what each one chooses. */
const buttons: Record<
  CloseQuestion,
  readonly { readonly label: string; readonly choice: CloseChoice }[]
> = {
  "save-first": [
    { label: "Save", choice: "save" },
    { label: "Don't save", choice: "dont-save" },
    { label: "Cancel", choice: "cancel" },
  ],
  "close-unchecked": [
    { label: "Close", choice: "dont-save" },
    { label: "Cancel", choice: "cancel" },
  ],
};

/**
 * The message box asking `question`. Escape, and the box's own close button,
 * answer Cancel. Enter saves, or, when the page couldn't be asked, cancels.
 */
export function closeQuestionOptions(
  question: CloseQuestion,
): MessageBoxOptions {
  const labels = buttons[question].map(({ label }) => label);
  const cancelId = labels.indexOf("Cancel");
  return question === "save-first"
    ? {
        type: "warning",
        title: "Moon Base",
        message: "Save the Campaign before closing?",
        detail: "Progress since it was last saved is lost if you don't save.",
        buttons: labels,
        defaultId: labels.indexOf("Save"),
        cancelId,
        noLink: true,
      }
    : {
        type: "warning",
        title: "Moon Base",
        message: "Close Moon Base without saving?",
        detail:
          "The game didn't say whether the Campaign has unsaved progress, so it can't be saved now.",
        buttons: labels,
        defaultId: cancelId,
        cancelId,
        noLink: true,
      };
}

/** What the button at `response` in `question`'s message box chooses. */
export function closeChoice(
  question: CloseQuestion,
  response: number,
): CloseChoice {
  return buttons[question][response]?.choice ?? "cancel";
}

/**
 * The page's answer from what came over the bridge: null for nothing
 * unsaved, or a save's name and text, which must be what saveFile would
 * accept. Anything else counts as no answer.
 */
export function parsePageAnswer(answer: unknown): PageAnswer {
  if (answer === null) return { kind: "nothing-unsaved" };
  if (typeof answer !== "object") return { kind: "no-answer" };
  try {
    const { suggestedName, contents } = parseSaveFileArgs([
      Reflect.get(answer, "name"),
      Reflect.get(answer, "text"),
    ]);
    return { kind: "unsaved", name: suggestedName, text: contents };
  } catch {
    return { kind: "no-answer" };
  }
}
