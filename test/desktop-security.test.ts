import type { WebContents } from "electron";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { appUrl, resolveAppFile } from "../electron/app-files.js";
import {
  contentSecurityPolicy,
  hardenWebContents,
  isAllowedNavigation,
  isOutsidePage,
} from "../electron/security.js";
import {
  mainWindowOptions,
  minimumWindowSize,
} from "../electron/window-options.js";

const largeScreen = { width: 2560, height: 1400 };

describe("the desktop window's options", () => {
  const options = mainWindowOptions("C:/app/preload.cjs", largeScreen);

  it("give the page no Node access, isolated and sandboxed", () => {
    expect(options.webPreferences).toMatchObject({
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      preload: "C:/app/preload.cjs",
    });
  });

  it("have no developer tools unless asked for, as only a development run is", () => {
    expect(options.webPreferences?.devTools).toBe(false);
    expect(
      mainWindowOptions("preload.cjs", largeScreen, true).webPreferences
        ?.devTools,
    ).toBe(true);
  });

  it("keep the page at least 1366 px wide, and no taller than a maximised window's on a 1366 × 768 laptop", () => {
    expect(options.useContentSize).toBe(true);
    expect(options.minWidth).toBe(1366);
    expect(options.minHeight).toBe(660);
    const small = mainWindowOptions("preload.cjs", {
      width: 1280,
      height: 720,
    });
    expect(small.width).toBe(minimumWindowSize.width);
    expect(small.height).toBe(minimumWindowSize.height);
  });

  it("open the page at 1600 × 900 where the screen has room for it and its frame", () => {
    expect(options).toMatchObject({ width: 1600, height: 900 });
    expect(
      mainWindowOptions("preload.cjs", { width: 1600, height: 900 }),
    ).toMatchObject({ width: 1584, height: 836 });
  });
});

describe("the Content Security Policy", () => {
  function directives(policy: string): Map<string, string[]> {
    return new Map(
      policy.split("; ").map((directive) => {
        const [name = "", ...sources] = directive.split(" ");
        return [name, sources];
      }),
    );
  }

  it("allows only the game's own scripts, with no inline code or eval", () => {
    const policy = directives(contentSecurityPolicy());
    expect(policy.get("script-src")).toEqual(["'self'"]);
    expect(policy.get("style-src")).toEqual(["'self'"]);
    expect(policy.get("default-src")).toEqual(["'self'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(contentSecurityPolicy()).not.toContain("unsafe");
  });

  it("lets Vite's development client inject styles and reload the page", () => {
    const policy = directives(contentSecurityPolicy("http://127.0.0.1:5173/"));
    expect(policy.get("script-src")).toEqual(["'self'"]);
    expect(policy.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy.get("connect-src")).toEqual([
      "'self'",
      "ws://127.0.0.1:5173",
    ]);
  });
});

describe("navigation", () => {
  it("is allowed only within the game", () => {
    expect(
      isAllowedNavigation("app://moonbase/index.html?seed=4", appUrl),
    ).toBe(true);
    expect(isAllowedNavigation("https://example.com/", appUrl)).toBe(false);
    expect(isAllowedNavigation("app://elsewhere/", appUrl)).toBe(false);
    expect(isAllowedNavigation("file:///C:/Windows/", appUrl)).toBe(false);
    expect(isAllowedNavigation("not a url", appUrl)).toBe(false);
    const dev = "http://127.0.0.1:5173/";
    expect(isAllowedNavigation("http://127.0.0.1:5173/?seed=1", dev)).toBe(
      true,
    );
    expect(isAllowedNavigation("http://127.0.0.1:5174/", dev)).toBe(false);
  });

  it("away from the game is stopped, and new windows are refused", () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    let windowOpenHandler: ((details: { url: string }) => unknown) | undefined;
    const opened: string[] = [];
    const contents = {
      on(event: string, listener: (...args: unknown[]) => void) {
        listeners.set(event, listener);
        return contents;
      },
      setWindowOpenHandler(handler: (details: { url: string }) => unknown) {
        windowOpenHandler = handler;
      },
    };
    hardenWebContents(contents as unknown as WebContents, appUrl, (url) => {
      opened.push(url);
    });

    function prevented(event: string, url?: string): boolean {
      let wasPrevented = false;
      const fakeEvent = {
        preventDefault: () => {
          wasPrevented = true;
        },
      };
      listeners.get(event)?.(fakeEvent, url);
      return wasPrevented;
    }
    expect(prevented("will-navigate", "https://example.com/")).toBe(true);
    expect(prevented("will-navigate", "app://moonbase/")).toBe(false);
    expect(prevented("will-redirect", "https://example.com/")).toBe(true);
    expect(prevented("will-attach-webview")).toBe(true);
    expect(windowOpenHandler?.({ url: "app://moonbase/" })).toEqual({
      action: "deny",
    });
    // Only the link followed, never the redirect.
    expect(opened).toEqual(["https://example.com/"]);
  });

  it("to an outside page opens it in the default browser instead, followed or in a new window", () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    let windowOpenHandler: ((details: { url: string }) => unknown) | undefined;
    const contents = {
      on(event: string, listener: (...args: unknown[]) => void) {
        listeners.set(event, listener);
        return contents;
      },
      setWindowOpenHandler(handler: (details: { url: string }) => unknown) {
        windowOpenHandler = handler;
      },
    };
    const opened: string[] = [];
    hardenWebContents(contents as unknown as WebContents, appUrl, (url) => {
      opened.push(url);
    });
    let prevented = false;
    listeners.get("will-navigate")?.(
      {
        preventDefault: () => {
          prevented = true;
        },
      },
      "https://example.com/moon",
    );
    const opening = windowOpenHandler?.({ url: "http://example.com/base" });
    windowOpenHandler?.({ url: "file:///C:/Windows/" });
    listeners.get("will-navigate")?.(
      { preventDefault: () => {} },
      "mailto:someone@example.com",
    );

    expect(prevented).toBe(true);
    expect(opening).toEqual({ action: "deny" });
    expect(opened).toEqual([
      "https://example.com/moon",
      "http://example.com/base",
    ]);
  });

  it("is an outside page only over http or https", () => {
    expect(isOutsidePage("https://example.com/")).toBe(true);
    expect(isOutsidePage("http://example.com/")).toBe(true);
    expect(isOutsidePage("file:///C:/Windows/")).toBe(false);
    expect(isOutsidePage("mailto:someone@example.com")).toBe(false);
    expect(isOutsidePage("javascript:alert(1)")).toBe(false);
    expect(isOutsidePage("ms-settings:")).toBe(false);
    expect(isOutsidePage("not a url")).toBe(false);
  });
});

describe("the production build's files", () => {
  const root = resolve("dist");

  it("are served from the build folder", () => {
    expect(resolveAppFile(root, "app://moonbase/")).toBe(
      join(root, "index.html"),
    );
    expect(resolveAppFile(root, "app://moonbase/assets/index.js")).toBe(
      join(root, "assets", "index.js"),
    );
  });

  it("never include anything outside it", () => {
    // The URL itself drops "..", even percent-encoded, at the top.
    expect(resolveAppFile(root, "app://moonbase/../package.json")).toBe(
      join(root, "package.json"),
    );
    expect(resolveAppFile(root, "app://moonbase/%2e%2e/package.json")).toBe(
      join(root, "package.json"),
    );
    // Encoded slashes only become separators once decoded.
    expect(resolveAppFile(root, "app://moonbase/..%2fpackage.json")).toBe(
      undefined,
    );
    expect(resolveAppFile(root, "app://moonbase/..%5c..%5cpackage.json")).toBe(
      undefined,
    );
    expect(resolveAppFile(root, "app://elsewhere/index.html")).toBe(undefined);
    expect(resolveAppFile(root, "https://moonbase/index.html")).toBe(undefined);
  });
});
