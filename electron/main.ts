// Electron's main process. It opens the game in a window, either from the Vite
// dev server (`npm run desktop`, which sets MOONBASE_DEV_SERVER_URL) or from
// the production build in dist/ (`npm run desktop:start`).
import { app, session } from "electron";
import { join } from "node:path";
import { appUrl } from "./app-files.js";
import { registerAppScheme, serveAppFiles } from "./app-protocol.js";
import { createLastFolder } from "./last-folder.js";
import { handleSaveFiles } from "./save-dialogs.js";
import {
  applyContentSecurityPolicy,
  contentSecurityPolicy,
  denyPermissions,
  hardenWebContents,
} from "./security.js";
import { createMainWindow } from "./window.js";

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
// the window at a dev server.
const devServerUrl = app.isPackaged
  ? undefined
  : process.env["MOONBASE_DEV_SERVER_URL"];
const startUrl = devServerUrl ?? appUrl;
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

registerAppScheme();

app.on("web-contents-created", (_event, contents) => {
  hardenWebContents(contents, startUrl);
});

// Windows only (ADR-0010): closing the last window quits.
app.on("window-all-closed", () => {
  app.quit();
});

app
  .whenReady()
  .then(() => {
    denyPermissions(session.defaultSession);
    if (devServerUrl === undefined) {
      serveAppFiles(join(app.getAppPath(), "dist"), policy);
    } else {
      applyContentSecurityPolicy(session.defaultSession, policy);
    }
    // The save and load dialogs start in the folder last used, kept in the
    // user-data folder, or in the player's Documents until one has been.
    handleSaveFiles(
      startUrl,
      createLastFolder(
        join(app.getPath("userData"), "save-folder.json"),
        app.getPath("documents"),
      ),
    );
    createMainWindow(startUrl, join(import.meta.dirname, "preload.cjs"));
  })
  .catch((error: unknown) => {
    console.error("Moon Base could not start:", error);
    app.exit(1);
  });
