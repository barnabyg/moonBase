// Asking before the game window closes, or the app quits, whether to save the
// Campaign's unsaved progress (close-prompt.ts decides). It is all in the main
// process: the window's close is held while the page is asked, over the
// bridge, for its unsaved progress, and the player is asked with a message
// box. Quitting closes the window first, which comes here too, and a close
// held here cancels the quit.
//
// The message box is called as dialog.showMessageBox(...), never through a
// reference kept to the function, so the end-to-end tests can stub it.
import { BrowserWindow, dialog, ipcMain, type WebContents } from "electron";
import {
  closeChoice,
  closeQuestionOptions,
  decideClose,
  parsePageAnswer,
  type PageAnswer,
} from "./close-prompt.js";
import { channels } from "./desktop-bridge.js";
import type { LastFolder } from "./last-folder.js";
import { saveWithDialog } from "./save-dialogs.js";
import { isFromGame } from "./security.js";

/**
 * How long the page has to answer. It answers between two frames, so within
 * milliseconds; one that takes this long is hung or broken.
 */
const pageAnswerMs = 3000;

/** The questions sent to pages and not yet answered, by their number. */
const waiting = new Map<
  number,
  { readonly contents: WebContents; answer(answer: PageAnswer): void }
>();
let lastQuestion = 0;

/**
 * Hears the pages' answers, from the game's own page (started at `appUrl`)
 * only, and each only from the page it was asked of.
 */
export function handleUnsavedProgressAnswers(appUrl: string): void {
  ipcMain.on(channels.unsavedProgressAnswered, (event, ...args: unknown[]) => {
    if (!isFromGame(event, appUrl) || args.length !== 2) return;
    const [id, answer] = args;
    const question = typeof id === "number" ? waiting.get(id) : undefined;
    if (question?.contents !== event.sender) return;
    question.answer(parsePageAnswer(answer));
  });
}

/** Asks the page for its unsaved progress, waiting `pageAnswerMs` at most. */
function askPage(contents: WebContents): Promise<PageAnswer> {
  if (contents.isDestroyed() || contents.isCrashed()) {
    return Promise.resolve({ kind: "no-answer" });
  }
  lastQuestion += 1;
  const id = lastQuestion;
  return new Promise((resolve) => {
    const answer = (answer: PageAnswer): void => {
      clearTimeout(timer);
      waiting.delete(id);
      resolve(answer);
    };
    const timer = setTimeout(() => {
      answer({ kind: "no-answer" });
    }, pageAnswerMs);
    waiting.set(id, { contents, answer });
    contents.send(channels.unsavedProgressAsked, id);
  });
}

/**
 * Holds `window`'s close until the player has been asked, if there is
 * unsaved progress, whether to save it first, saving with the save dialog in
 * the folder `lastFolder` keeps. Closing again while the question is open
 * does nothing more. `onStay` is called when the player keeps the window open.
 */
export function askBeforeClosing(
  window: BrowserWindow,
  lastFolder: LastFolder,
  onStay: () => void = () => undefined,
): void {
  let asking = false;
  let decided = false;
  window.on("close", (event) => {
    if (decided) return;
    event.preventDefault();
    if (asking) return;
    asking = true;
    decideClose({
      askPage: () => askPage(window.webContents),
      askPlayer: async (question) => {
        const { response } = await dialog.showMessageBox(
          window,
          closeQuestionOptions(question),
        );
        return closeChoice(question, response);
      },
      save: (name, text) => saveWithDialog(window, lastFolder, name, text),
    })
      .then((decision) => {
        if (decision === "stay") {
          onStay();
        } else if (!window.isDestroyed()) {
          decided = true;
          window.close();
        }
      })
      .catch((error: unknown) => {
        // The window stays open, rather than lose the progress.
        console.error("Moon Base couldn't ask before closing:", error);
        onStay();
      })
      .finally(() => {
        asking = false;
      });
  });
}
