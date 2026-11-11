// Fixtures for the end-to-end tests of the desktop app, which launch the
// production Electron build (dist/ and dist-electron/, which the electron
// project's build step makes first; see playwright.config.ts) rather than
// opening the dev server in a browser.
//
// Each test gets a user-data folder of its own (`userDataDir`), so tests can
// run side by side, and `launchApp` can launch the app again with the same
// folder, to test what it keeps from one run to the next. `electronApp` and
// `window` are the app a test starts with and its game window.
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  _electron,
  test as base,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import type { Dialog } from "electron";
import { appUrl } from "../../electron/app-files";

export { expect } from "@playwright/test";

/**
 * The repository's root folder, which package.json's `main` makes the app.
 * With no separator at the end, which Windows would read as escaping the
 * quote around it on Electron's command line.
 */
const appRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** The game's address in the production build, with `query` such as "?seed=1". */
export function gameUrl(query = ""): string {
  return `${appUrl}${query}`;
}

// Chromium's switches for each launch. A run opens several windows at once,
// which overlap, and Chromium on Windows stops drawing a window that others
// cover, or that is in the background, which would stop the game's clock, as
// the game advances in animation frames. The tests turn that off. CI's
// Windows runner has no GPU, so there WebGL draws in software, with
// SwiftShader, which Chromium only allows when told to.
const chromiumSwitches = [
  "--disable-features=CalculateNativeWinOcclusion",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
  ...(process.env["CI"] ? ["--enable-unsafe-swiftshader"] : []),
];

export interface LaunchOptions {
  /** Environment variables to add for this launch. */
  readonly env?: Readonly<Record<string, string>>;
}

interface DesktopFixtures {
  /** A user-data folder for this test alone, removed after it. */
  userDataDir: string;
  /**
   * Launches the built app with this test's user-data folder. Call it again,
   * once the first has closed, to relaunch with the same folder. Any app
   * still running when the test ends is closed, or killed if it won't close.
   */
  launchApp: (options?: LaunchOptions) => Promise<ElectronApplication>;
  /** The app the test starts with, launched by `launchApp`. */
  electronApp: ElectronApplication;
  /** The app's first window, the game, once its page has loaded. */
  window: Page;
  /**
   * Every error logged by any app this test launched: the main process's
   * console, and each window's console and uncaught exceptions.
   */
  consoleErrors: string[];
}

export const test = base.extend<DesktopFixtures>({
  // Fixture functions take their dependencies as a destructured object, even
  // when they need none.
  // eslint-disable-next-line no-empty-pattern
  userDataDir: async ({}, use) => {
    const folder = await mkdtemp(join(tmpdir(), "moonbase-e2e-"));
    await use(folder);
    // Chromium can hold files in it for a moment after the app exits.
    await rm(folder, { recursive: true, force: true, maxRetries: 10 });
  },

  // eslint-disable-next-line no-empty-pattern
  consoleErrors: async ({}, use) => {
    await use([]);
  },

  launchApp: async ({ userDataDir, consoleErrors }, use) => {
    const launched: ElectronApplication[] = [];
    await use(async (options = {}) => {
      const env: Record<string, string> = {};
      for (const [name, value] of Object.entries(process.env)) {
        if (value !== undefined) env[name] = value;
      }
      // Set by some editors' terminals; it would start Electron as plain Node.
      delete env["ELECTRON_RUN_AS_NODE"];
      Object.assign(env, options.env, {
        MOONBASE_USER_DATA_DIR: userDataDir,
        MOONBASE_E2E: "1",
      });
      // Electron answers an app it can't find, or a main.js missing from it,
      // with a modal "Error launching app" dialog on the desktop, rather than
      // exiting, so check before launching. The build step makes main.js.
      if (!existsSync(join(appRoot, "dist-electron", "main.js"))) {
        throw new Error(
          `No desktop build in ${appRoot}; run npm run build:desktop, or the electron project without --no-deps.`,
        );
      }
      const app = await _electron.launch({
        args: [...chromiumSwitches, appRoot],
        cwd: appRoot,
        env,
      });
      launched.push(app);
      track(app);
      app.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(`main process: ${message.text()}`);
        }
      });
      const watch = (page: Page): void => {
        page.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        page.on("pageerror", (error) => consoleErrors.push(error.message));
      };
      app.windows().forEach(watch);
      app.on("window", watch);
      return app;
    });
    await Promise.all(launched.map(closeOrKill));
  },

  electronApp: async ({ launchApp }, use) => {
    await use(await launchApp());
  },

  window: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState("load");
    await use(page);
  },
});

interface LaunchedProcess {
  readonly child: ChildProcess;
  /** Its exit code once it exits, or null if a signal ended it. */
  readonly exited: Promise<number | null>;
}

// Kept from the launch, as Playwright's app.process() throws once the app has
// closed.
const processes = new WeakMap<ElectronApplication, LaunchedProcess>();

function track(app: ElectronApplication): void {
  const child = app.process();
  const exited = new Promise<number | null>((resolve) => {
    child.once("exit", resolve);
  });
  processes.set(app, { child, exited });
}

function launchedProcess(app: ElectronApplication): LaunchedProcess {
  const launched = processes.get(app);
  if (launched === undefined) throw new Error("Not launched by launchApp.");
  return launched;
}

/** Whether the app's process has exited. */
export function hasExited(app: ElectronApplication): boolean {
  const { child } = launchedProcess(app);
  return child.exitCode !== null || child.signalCode !== null;
}

/**
 * Waits for the app's process to exit, and returns its exit code (null if a
 * signal ended it).
 */
export async function exitCode(
  app: ElectronApplication,
): Promise<number | null> {
  return launchedProcess(app).exited;
}

/**
 * Closes the game window as a player does, with its close button: the
 * window's `close` event runs, unlike Playwright's own `close()`, which quits
 * the app.
 */
export async function closeWindow(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.close();
  });
}

async function closeOrKill(app: ElectronApplication): Promise<void> {
  if (hasExited(app)) return;
  const { child } = launchedProcess(app);
  const closed = app.close().then(
    () => true,
    () => false,
  );
  const timedOut = new Promise<false>((resolve) => {
    setTimeout(resolve, 10_000, false).unref();
  });
  if (!(await Promise.race([closed, timedOut])) && !hasExited(app)) {
    child.kill();
  }
}

type DialogMethod = "showSaveDialog" | "showOpenDialog" | "showMessageBox";

/**
 * Has the main process's `dialog.<method>` answer `result` at once, rather
 * than showing the operating system's dialog, which a test can't click. The
 * options each call was given are kept beside it, for `dialogCalls`; a second
 * stub of the same method starts a new list. It only catches
 * calls made through the `dialog` object (`dialog.showSaveDialog(...)`), not
 * through a reference to the function taken before the stub.
 */
export async function stubDialog<M extends DialogMethod>(
  app: ElectronApplication,
  method: M,
  result: Awaited<ReturnType<Dialog[M]>>,
): Promise<void> {
  await app.evaluate(
    ({ dialog }, stub) => {
      const calls: unknown[] = [];
      Reflect.set(dialog, stub.method, (...args: unknown[]) => {
        // The options come last, after the window if one is given.
        calls.push(args.at(-1));
        return Promise.resolve(stub.result);
      });
      Reflect.set(dialog, `${stub.method}Calls`, calls);
    },
    { method, result },
  );
}

/** The options of each call to a dialog that `stubDialog` stubbed, in order. */
export async function dialogCalls(
  app: ElectronApplication,
  method: DialogMethod,
): Promise<unknown[]> {
  return app.evaluate(({ dialog }, name) => {
    const calls: unknown = Reflect.get(dialog, `${name}Calls`);
    return Array.isArray(calls) ? (calls as unknown[]) : [];
  }, method);
}
