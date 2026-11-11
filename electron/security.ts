// What keeps the page from reaching beyond the game: its Content Security
// Policy, where it may navigate, which permissions it gets, and which messages
// to the main process come from the game itself. Only types are imported from
// Electron, so the unit tests can run this in plain Node.
import type { IpcMainInvokeEvent, Session, WebContents } from "electron";

/**
 * The page's Content Security Policy. Everything the game loads comes from its
 * own origin: scripts, styles and data. Three.js draws through WebGL, which CSP
 * doesn't govern, and needs no eval. Images may also be data: and blob: URLs,
 * which canvases and textures can make.
 *
 * Given `devServer`, the Vite dev server's URL, it also allows what Vite's
 * development client needs: the styles it injects as <style> elements, and
 * the WebSocket it reloads the page through.
 */
export function contentSecurityPolicy(devServer?: string): string {
  const development = devServer !== undefined;
  const hotReload = development
    ? [new URL(devServer).origin.replace(/^http/, "ws")]
    : [];
  const directives: Record<string, readonly string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'"],
    "style-src": development ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...hotReload],
    "worker-src": ["'none'"],
    "object-src": ["'none'"],
    "frame-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

/**
 * Whether the page may navigate to `url`: only within the game itself, which
 * starts at `appUrl`.
 */
export function isAllowedNavigation(url: string, appUrl: string): boolean {
  try {
    const target = new URL(url);
    const app = new URL(appUrl);
    // By scheme and host rather than URL.origin, which is "null" for a custom
    // scheme such as app:.
    return target.protocol === app.protocol && target.host === app.host;
  } catch {
    return false;
  }
}

/**
 * Whether a message came from the game's own page: the window's main frame,
 * not a frame inside it, showing a page from where the game started.
 */
export function isFromGame(
  event: Pick<IpcMainInvokeEvent, "sender" | "senderFrame">,
  appUrl: string,
): boolean {
  const frame = event.senderFrame;
  if (frame === null) return false;
  return (
    frame === event.sender.mainFrame && isAllowedNavigation(frame.url, appUrl)
  );
}

/**
 * Whether `url` is an outside page that the player's default browser may
 * open: a web page, over http or https. Nothing else, such as file:, mailto:
 * or another app's scheme, leaves the game.
 */
export function isOutsidePage(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Locks down a page's web contents: it can't navigate or be redirected away
 * from the game, open new windows or embed a <webview>. A link to an outside
 * page, followed or opened in a new window, goes to `openOutside`, which
 * opens it in the player's default browser, never in the game's window.
 */
export function hardenWebContents(
  contents: WebContents,
  appUrl: string,
  openOutside: (url: string) => void,
): void {
  contents.on("will-navigate", (event, url) => {
    if (isAllowedNavigation(url, appUrl)) return;
    event.preventDefault();
    if (isOutsidePage(url)) openOutside(url);
  });
  contents.on("will-redirect", (event, url) => {
    if (!isAllowedNavigation(url, appUrl)) event.preventDefault();
  });
  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (isOutsidePage(url)) openOutside(url);
    return { action: "deny" };
  });
}

/**
 * Refuses every permission a page can ask for (camera, notifications,
 * geolocation and so on), as the game needs none.
 */
export function denyPermissions(session: Session): void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  session.setPermissionCheckHandler(() => false);
}

/**
 * Adds `policy` as the Content Security Policy of every response, for pages
 * from the Vite dev server, which sends none. The production build's files get
 * it from app-protocol.ts instead.
 */
export function applyContentSecurityPolicy(
  session: Session,
  policy: string,
): void {
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [policy],
      },
    });
  });
}
