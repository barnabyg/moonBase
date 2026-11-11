// Electron's main process. It opens the game in a window, either from the Vite
// dev server (`npm run desktop`, which sets MOONBASE_DEV_SERVER_URL) or from
// the production build in dist/ (`npm run desktop:start`).
import { app, BrowserWindow, Menu, session, shell } from "electron";
import { join } from "node:path";
import { appUrl } from "./app-files.js";
import { registerAppScheme, serveAppFiles } from "./app-protocol.js";
import {
  askBeforeClosing,
  handleUnsavedProgressAnswers,
} from "./close-window.js";
import { handleFullScreen } from "./full-screen.js";
import { createLastFolder } from "./last-folder.js";
import { handleSaveFiles } from "./save-dialogs.js";
import {
  checkForUpdates,
  checksForUpdates,
  installUpdateAndRestart,
} from "./updates.js";
import {
  applyContentSecurityPolicy,
  contentSecurityPolicy,
  denyPermissions,
  hardenWebContents,
} from "./security.js";
import { bringToFront, createMainWindow } from "./window.js";

// Under the end-to-end tests (MOONBASE_E2E=1), an uncaught exception in the
// main process is logged, where the test reports it, and the app exits with
// code 1. Electron's default is a modal error dialog, which would wait on the
// developer's desktop, or a CI runner's, with no one to close it, until the
// test timed out. A player still gets the dialog, which at least says what
// went wrong. Set first, so it covers everything below.
if (!app.isPackaged && process.env["MOONBASE_E2E"] === "1") {
  process.on("uncaughtException", (error) => {
    console.error("Moon Base's main process failed:", error);
    app.exit(1);
  });
}

// An installed app ignores the variable, so only a development run can point
// the window at a dev server. It is the page to open there, which `npm run
// try` gives a query naming the prepared Campaign to load (src/main.ts).
const devServerUrl = app.isPackaged
  ? undefined
  : process.env["MOONBASE_DEV_SERVER_URL"];
const startUrl = devServerUrl ?? appUrl;
// Developer tools come with the dev server only. Not with every unpackaged
// run: the end-to-end tests and `npm run desktop:start` run the production
// build unpackaged, and should get what a player gets, as an installed app
// does.
const devTools = devServerUrl !== undefined;
const policy = contentSecurityPolicy(devServerUrl);

// The end-to-end tests give each run of the app a folder of its own for what
// Electron keeps between runs (localStorage, caches, and the lock that keeps
// one instance running), so tests running side by side can't share it, and a
// test can launch the app again with the same folder. It must be set before
// the app is ready. As with the dev server, an installed app ignores it.
const userDataDir = app.isPackaged
  ? undefined
  : process.env["MOONBASE_USER_DATA_DIR"];
if (userDataDir !== undefined && userDataDir !== "")
  app.setPath("userData", userDataDir);

// One game at a time. Starting the game while it runs focuses the window
// already open, rather than opening a second one, which could save over the
// first one's files and window state. The lock is kept in the user-data
// folder, so the end-to-end tests' runs, each with a folder of its own, don't
// share it.
if (app.requestSingleInstanceLock()) {
  start();
} else {
  app.quit();
}

/** Starts the game: everything the first instance does. */
function start(): void {
  let gameWindow: BrowserWindow | undefined;
  app.on("second-instance", () => {
    if (gameWindow !== undefined && !gameWindow.isDestroyed()) {
      bringToFront(gameWindow);
    }
  });

  registerAppScheme();

  app.on("web-contents-created", (_event, contents) => {
    // Outside links open in the player's default browser. Called as
    // shell.openExternal(...), so the end-to-end tests can stub it.
    hardenWebContents(contents, startUrl, (url) => {
      shell.openExternal(url).catch((error: unknown) => {
        console.warn(`Moon Base couldn't open ${url}:`, error);
      });
    });
  });

  // Set when the player chose to restart for a downloaded update, and the
  // window is closing for it; cleared if they keep the window open after all.
  let restartForUpdate = false;

  // Windows only (ADR-0010): closing the last window quits, or, for an
  // update, installs it and starts the game again (updates.ts).
  app.on("window-all-closed", () => {
    if (restartForUpdate) installUpdateAndRestart();
    else app.quit();
  });

  app
    .whenReady()
    .then(() => {
      // A game, not a browser: no File, Edit or View menu bar, whose View menu
      // would also reload the page and open the developer tools.
      Menu.setApplicationMenu(null);
      denyPermissions(session.defaultSession);
      if (devServerUrl === undefined) {
        serveAppFiles(join(app.getAppPath(), "dist"), policy);
      } else {
        applyContentSecurityPolicy(session.defaultSession, policy);
      }
      // The save and load dialogs start in the folder last used, kept in the
      // user-data folder, or in the player's Documents until one has been: the
      // Save and Load buttons' dialogs, and the save dialog of the question
      // before closing.
      const lastFolder = createLastFolder(
        join(app.getPath("userData"), "save-folder.json"),
        app.getPath("documents"),
      );
      handleSaveFiles(startUrl, lastFolder);
      handleUnsavedProgressAnswers(startUrl);
      // F11 and the top bar's Full screen button (full-screen.ts).
      handleFullScreen(startUrl);
      // The window opens where and as the player left it, kept in the
      // user-data folder.
      return createMainWindow(
        startUrl,
        join(import.meta.dirname, "preload.cjs"),
        join(app.getPath("userData"), "window-state.json"),
        devTools,
        // The installer packs it with the app (package.json's build.files).
        join(app.getAppPath(), "assets", "icon", "icon.ico"),
      ).then((window) => {
        gameWindow = window;
        // Closing with unsaved progress, or quitting, asks whether to save it
        // first (close-window.ts).
        askBeforeClosing(window, lastFolder, () => {
          restartForUpdate = false;
        });
        // An installed game checks GitHub Releases for a newer version, and
        // restarting for it closes the window as above, so the Campaign can be
        // saved first.
        if (checksForUpdates()) {
          checkForUpdates(window, () => {
            restartForUpdate = true;
            window.close();
          });
        }
      });
    })
    .catch((error: unknown) => {
      console.error("Moon Base could not start:", error);
      app.exit(1);
    });
}
