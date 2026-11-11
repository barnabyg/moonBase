// The production build is served to the window from an origin of its own,
// app://moonbase/, rather than loaded from file:// URLs. A real origin lets the
// Content Security Policy's 'self' mean the game's own files (to a file:// page
// it means any file on the disk), keeps Vite's absolute asset paths
// (/assets/...) working without changing its `base` for the browser build, and
// gives localStorage an origin of its own.
import { net, protocol } from "electron";
import { pathToFileURL } from "node:url";
import { appScheme, resolveAppFile } from "./app-files.js";

/** Must run before the app is ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: appScheme,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
}

/** Serves the files under `root` at app://moonbase/, with `policy` as their CSP. */
export function serveAppFiles(root: string, policy: string): void {
  protocol.handle(appScheme, async (request) => {
    const file = resolveAppFile(root, request.url);
    if (file === undefined) return new Response(null, { status: 404 });
    let response: Response;
    try {
      response = await net.fetch(pathToFileURL(file).href);
    } catch {
      return new Response(null, { status: 404 });
    }
    const headers = new Headers(response.headers);
    headers.set("Content-Security-Policy", policy);
    return new Response(response.body, { status: response.status, headers });
  });
}
