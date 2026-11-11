import { SAVE_FILE_EXTENSION } from "../game/save-files";
import type { SaveFileStore } from "./save-file-store";

/**
 * Saves and loads in a browser: saving downloads the file, and loading opens
 * a file picker. Players have only the desktop app (ADR-0010); this serves the
 * end-to-end tests that run in Chromium against the dev server, which save
 * with a download and load through the file picker, and `npm run dev`.
 */
export function createBrowserSaveFileStore(): SaveFileStore {
  return {
    save(name, text) {
      const url = URL.createObjectURL(
        new Blob([text], { type: "application/json" }),
      );
      // Chromium downloads from a link that isn't in the page.
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      // Not at once, in case the browser hasn't yet read the file to download it.
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 10_000);
      // The browser doesn't say whether the player kept the download.
      return Promise.resolve({ outcome: "saved" });
    },
    open() {
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = SAVE_FILE_EXTENSION;
      return new Promise((resolve) => {
        picker.addEventListener("change", () => {
          const file = picker.files?.[0];
          resolve(
            file === undefined
              ? { outcome: "cancelled" }
              : { outcome: "chosen", file },
          );
        });
        picker.addEventListener("cancel", () => {
          resolve({ outcome: "cancelled" });
        });
        picker.click();
      });
    },
  };
}
