import {
  SAVE_FILE_EXTENSION,
  type LoadFileResult,
  type SaveFiles,
} from "../game/save-files";

/**
 * "Save", which downloads the Campaign as a save file, and "Load", which
 * opens a file picker and loads the file chosen. The result of loading goes
 * to `showResult`, which tells the player why a file was refused.
 */
export function createSaveButtons(
  saveFiles: SaveFiles,
  showResult: (result: LoadFileResult) => void,
): HTMLElement {
  const group = document.createElement("div");
  group.className = "save-buttons";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Save file");

  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Save";
  save.title = `Download the Campaign as a ${SAVE_FILE_EXTENSION} file.`;
  save.addEventListener("click", () => {
    const { name, text } = saveFiles.save();
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    // Firefox only downloads from a link in the page, and inside the
    // game-over screen, only from one in that screen.
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.hidden = true;
    group.append(link);
    link.click();
    link.remove();
    // Not at once, in case Firefox hasn't yet read the file to download it.
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10_000);
  });

  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = SAVE_FILE_EXTENSION;
  picker.hidden = true;
  picker.addEventListener("change", () => {
    const file = picker.files?.[0];
    // Cleared, so that choosing the same file again loads it again.
    picker.value = "";
    if (file === undefined) return;
    void saveFiles.load(file).then(showResult);
  });

  const load = document.createElement("button");
  load.type = "button";
  load.textContent = "Load";
  load.title = `Load a Campaign from a ${SAVE_FILE_EXTENSION} file in place of this one.`;
  load.addEventListener("click", () => {
    picker.click();
  });

  group.append(save, load, picker);
  return group;
}
