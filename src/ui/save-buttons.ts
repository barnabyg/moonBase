import {
  SAVE_FILE_EXTENSION,
  type LoadFileResult,
  type SaveFiles,
} from "../game/save-files";
import type { SaveFileStore } from "./save-file-store";

/**
 * "Save", which keeps the Campaign as a save file, and "Load", which asks
 * for a save file and loads it, both through `store`: the desktop app's
 * dialogs or the browser's download and file picker. Why a file couldn't be
 * saved, or was refused, goes to `showResult`, which tells the player.
 */
export function createSaveButtons(
  saveFiles: SaveFiles,
  store: SaveFileStore,
  showResult: (result: LoadFileResult) => void,
): HTMLElement {
  const group = document.createElement("div");
  group.className = "save-buttons";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Save file");

  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Save";
  save.title = `Save the Campaign as a ${SAVE_FILE_EXTENSION} file.`;
  save.addEventListener("click", () => {
    const { name, text } = saveFiles.save();
    void store.save(name, text, group).then((result) => {
      if (result.outcome === "saved") saveFiles.saved(text);
      if (result.outcome === "failed") {
        showResult({ ok: false, message: result.message });
      }
    });
  });

  const load = document.createElement("button");
  load.type = "button";
  load.textContent = "Load";
  load.title = `Load a Campaign from a ${SAVE_FILE_EXTENSION} file in place of this one.`;
  load.addEventListener("click", () => {
    void store.open(group).then(async (result) => {
      switch (result.outcome) {
        case "chosen":
          showResult(await saveFiles.load(result.file));
          return;
        case "failed":
          showResult({ ok: false, message: result.message });
          return;
        case "cancelled":
          return;
      }
    });
  });

  group.append(save, load);
  return group;
}
