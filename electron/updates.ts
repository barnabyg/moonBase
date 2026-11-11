// Keeping the installed game up to date with electron-updater: on start it
// checks GitHub Releases (package.json's build.publish, which electron-builder
// writes into the installed app's resources/app-update.yml) for a newer
// version, downloads it in the background, checks it against the SHA-512 hash
// in the release's latest.yml, and asks the player whether to restart and
// install it (update-prompt.ts decides). See docs/desktop-release.md.
//
// The message box is called as dialog.showMessageBox(...), never through a
// reference kept to the function, so the end-to-end tests can stub it.
import { app, dialog, type BrowserWindow } from "electron";
import electronUpdater from "electron-updater";
import {
  answerDownloadedUpdate,
  updateChoice,
  updateQuestionOptions,
} from "./update-prompt.js";

// electron-updater is CommonJS, and its autoUpdater a getter Node can't name
// as an ES module export.
const { autoUpdater } = electronUpdater;

/**
 * The switch that turns the check off: `"Moon Base.exe"
 * --moonbase-no-update-check`. The packaged app's smoke test uses it, so it
 * never downloads, or installs on quit, a newer release than the build it
 * tests.
 */
export const noUpdateCheckSwitch = "moonbase-no-update-check";

/** Whether this run checks for updates: an installed game, unless told not to. */
export function checksForUpdates(): boolean {
  return app.isPackaged && !app.commandLine.hasSwitch(noUpdateCheckSwitch);
}

/**
 * Checks for an update and, once one has downloaded, asks the player over
 * `window` whether to restart now; `restart` closes the window and installs
 * it. Failing to check or download, offline say, isn't the player's problem:
 * it is logged as a warning, and the game plays on.
 */
export function checkForUpdates(
  window: BrowserWindow,
  restart: () => void,
): void {
  autoUpdater.logger = {
    info: (message?: unknown) => {
      console.info("Moon Base's updater:", message);
    },
    warn: (message?: unknown) => {
      console.warn("Moon Base's updater:", message);
    },
    error: (message?: unknown) => {
      console.warn("Moon Base's updater:", message);
    },
  };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", (info) => {
    if (window.isDestroyed()) return;
    answerDownloadedUpdate(info.version, {
      askPlayer: async (version) => {
        const { response } = await dialog.showMessageBox(
          window,
          updateQuestionOptions(version),
        );
        return updateChoice(response);
      },
      restart,
    }).catch((error: unknown) => {
      console.warn("Moon Base couldn't ask about the update:", error);
    });
  });
  autoUpdater.checkForUpdates().catch((error: unknown) => {
    console.warn("Moon Base couldn't check for updates:", error);
  });
}

/**
 * Installs the downloaded update silently and starts the game again. Called
 * once the window has closed.
 */
export function installUpdateAndRestart(): void {
  autoUpdater.quitAndInstall(true, true);
}
