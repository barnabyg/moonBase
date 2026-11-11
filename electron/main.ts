// Electron's main process. It opens the game in a window, either from the Vite
// dev server (`npm run desktop`, which sets MOONBASE_DEV_SERVER_URL) or from
// the production build in dist/ (`npm run desktop:start`).
import { app, session } from "electron";
import { join } from "node:path";
import { appUrl } from "./app-files.js";
import { registerAppScheme, serveAppFiles } from "./app-protocol.js";
import {
  applyContentSecurityPolicy,
  contentSecurityPolicy,
  denyPermissions,
  hardenWebContents,
} from "./security.js";
import { createMainWindow } from "./window.js";

// An installed app ignores the variable, so only a development run can point
// the window at a dev server.
const devServerUrl = app.isPackaged
  ? undefined
  : process.env["MOONBASE_DEV_SERVER_URL"];
const startUrl = devServerUrl ?? appUrl;
const policy = contentSecurityPolicy(devServerUrl);

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
    createMainWindow(startUrl, join(import.meta.dirname, "preload.cjs"));
  })
  .catch((error: unknown) => {
    console.error("Moon Base could not start:", error);
    app.exit(1);
  });
