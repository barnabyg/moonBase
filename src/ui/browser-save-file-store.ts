import { SAVE_FILE_EXTENSION } from "../game/save-files";
import type { SaveFileStore } from "./save-file-store";

/**
 * Saves and loads in the browser: saving downloads the file, and loading
 * opens a file picker. It goes when the browser version does (ADR-0010).
 */
export function createBrowserSaveFileStore(): SaveFileStore {
  return {
    save(name, text, host) {
      const url = URL.createObjectURL(
        new Blob([text], { type: "application/json" }),
      );
      // Firefox only downloads from a link in the page, and inside the
      // game-over screen, only from one in that screen. Chromium downloads
      // from either; a link in the host serves both.
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.hidden = true;
      host.append(link);
      link.click();
      link.remove();
      // Not at once, in case the browser hasn't yet read the file to download it.
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 10_000);
      // The browser doesn't say whether the player kept the download.
      return Promise.resolve({ outcome: "saved" });
    },
    open(host) {
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = SAVE_FILE_EXTENSION;
      picker.hidden = true;
      host.append(picker);
      return new Promise((resolve) => {
        picker.addEventListener("change", () => {
          const file = picker.files?.[0];
          picker.remove();
          resolve(
            file === undefined
              ? { outcome: "cancelled" }
              : { outcome: "chosen", file },
          );
        });
        picker.addEventListener("cancel", () => {
          picker.remove();
          resolve({ outcome: "cancelled" });
        });
        picker.click();
      });
    },
  };
}
