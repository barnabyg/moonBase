// Fixtures for the end-to-end tests of the desktop app, which launch the
// production Electron build (dist/ and dist-electron/, which the electron
// project's build step makes first; see playwright.config.ts) rather than
// opening the dev server in a browser.
//
// Each test gets a user-data folder of its own (`userDataDir`), so tests can
// run side by side, and `launchApp` can launch the app again with the same
// folder, to test what it keeps from one run to the next. `electronApp` and
// `window` are the app a test starts with and its game window.
//
// No real dialog ever opens: each app launched starts with the main process's
// dialogs stubbed (`stubDialogsToClose`), and a test stubs the one it tests.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
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
  /**
   * Starts the built app again with this test's user-data folder, as a
   * player starts it, without Playwright's connection, which an instance that
   * quits at once would never make. Resolves with its exit code, or rejects
   * if it hasn't exited within `timeoutMs`, killing it.
   */
  startAgain: (timeoutMs: number) => Promise<number | null>;
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
      const env = appEnv(userDataDir, options.env);
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
      logDialogCalls(app);
      await stubDialogsToClose(app);
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

  startAgain: async ({ userDataDir }, use) => {
    await use(async (timeoutMs) => {
      const child = spawn(electronPath, [...chromiumSwitches, appRoot], {
        cwd: appRoot,
        env: appEnv(userDataDir),
        stdio: "ignore",
      });
      return new Promise<number | null>((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error(`The app didn't exit within ${timeoutMs} ms.`));
        }, timeoutMs);
        child.once("exit", (code) => {
          clearTimeout(timer);
          resolve(code);
        });
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
    });
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

/**
 * The environment to launch the app with: this one, with `extra`, and this
 * test's user-data folder. It checks the build is there first, as Electron
 * answers an app it can't find, or a main.js missing from it, with a modal
 * "Error launching app" dialog on the desktop, rather than exiting. The
 * build step makes main.js.
 */
function appEnv(
  userDataDir: string,
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> {
  if (!existsSync(join(appRoot, "dist-electron", "main.js"))) {
    throw new Error(
      `No desktop build in ${appRoot}; run npm run build:desktop, or the electron project without --no-deps.`,
    );
  }
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) env[name] = value;
  }
  // Set by some editors' terminals; it would start Electron as plain Node.
  delete env["ELECTRON_RUN_AS_NODE"];
  return Object.assign(env, extra, {
    MOONBASE_USER_DATA_DIR: userDataDir,
    MOONBASE_E2E: "1",
  });
}

/** The Electron executable, as the electron package gives its path to Node. */
const electronPath = createRequire(import.meta.url)("electron") as string;

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
  // Whatever the test answered the question before closing, it now closes.
  const closed = stubDialogsToClose(app)
    .then(() => app.close())
    .then(
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
 * The calls to the stubbed dialogs that each app has logged to its main
 * process's console, so that a test can read them once the app has exited.
 */
const dialogLogs = new WeakMap<ElectronApplication, Map<string, unknown[]>>();
const dialogLogMarker = "moonbase-e2e-dialog ";

function logDialogCalls(app: ElectronApplication): void {
  const log = new Map<string, unknown[]>();
  dialogLogs.set(app, log);
  app.on("console", (message) => {
    const text = message.text();
    if (!text.startsWith(dialogLogMarker)) return;
    const entry = JSON.parse(text.slice(dialogLogMarker.length)) as {
      method: string;
      options?: unknown;
    };
    if (!("options" in entry)) log.set(entry.method, []);
    else log.get(entry.method)?.push(entry.options);
  });
}

/** What a stubbed dialog answers. */
type StubAnswer =
  /** Always this. */
  | { readonly result: unknown }
  /**
   * The message box's button that closes without saving: "Don't save", or
   * "Close" when the page couldn't be asked.
   */
  | { readonly closing: true };

async function stubDialogs(
  app: ElectronApplication,
  stubs: readonly {
    readonly method: DialogMethod;
    readonly answer: StubAnswer;
    readonly delayMs?: number | undefined;
  }[],
): Promise<void> {
  await app.evaluate(
    ({ dialog }, { stubs, marker }) => {
      const log = (entry: object) => {
        console.info(`${marker}${JSON.stringify(entry)}`);
      };
      for (const { method, answer, delayMs } of stubs) {
        const calls: unknown[] = [];
        log({ method });
        Reflect.set(dialog, method, (...args: unknown[]) => {
          // The options come last, after the window if one is given.
          const options = args.at(-1);
          calls.push(options);
          log({ method, options });
          let result: unknown;
          if ("result" in answer) {
            result = answer.result;
          } else {
            const buttons: unknown = Reflect.get(Object(options), "buttons");
            const labels: unknown[] = Array.isArray(buttons) ? buttons : [];
            result = {
              response: labels.findIndex(
                (label) => label === "Don't save" || label === "Close",
              ),
              checkboxChecked: false,
            };
          }
          return new Promise((resolve) => {
            setTimeout(resolve, delayMs ?? 0, result);
          });
        });
        Reflect.set(dialog, `${method}Calls`, calls);
      }
    },
    { stubs, marker: dialogLogMarker },
  );
}

/**
 * Stubs every dialog the main process opens, so that none waits on the
 * desktop: the question before closing answers the button that closes
 * without saving, and the save and open dialogs are cancelled. Each launch
 * starts this way, so a test that closes the app with unsaved progress, or
 * quits it, closes it, and the fixture closes each app this way as the test
 * ends, whatever the test stubbed. Their calls are kept for `dialogCalls`,
 * as `stubDialog`'s are.
 */
export async function stubDialogsToClose(
  app: ElectronApplication,
): Promise<void> {
  await stubDialogs(app, [
    { method: "showMessageBox", answer: { closing: true } },
    {
      method: "showSaveDialog",
      answer: { result: { canceled: true, filePath: "" } },
    },
    {
      method: "showOpenDialog",
      answer: { result: { canceled: true, filePaths: [] } },
    },
  ]);
}

/**
 * Has the main process's `dialog.<method>` answer `result` at once, or after
 * `delayMs`, as a player takes a moment to, rather than showing the
 * operating system's dialog, which a test can't click. The options each call
 * was given are kept, for `dialogCalls`; a second stub of the same method
 * starts a new list. It only catches calls made through the `dialog` object
 * (`dialog.showSaveDialog(...)`), not through a reference to the function
 * taken before the stub.
 */
export async function stubDialog<M extends DialogMethod>(
  app: ElectronApplication,
  method: M,
  result: Awaited<ReturnType<Dialog[M]>>,
  options: { readonly delayMs?: number } = {},
): Promise<void> {
  await stubDialogs(app, [
    { method, answer: { result }, delayMs: options.delayMs },
  ]);
}

/**
 * The options of each call to a dialog that `stubDialog` stubbed, in order,
 * or, once the app has exited, those it logged.
 */
export async function dialogCalls(
  app: ElectronApplication,
  method: DialogMethod,
): Promise<unknown[]> {
  if (hasExited(app)) return dialogLogs.get(app)?.get(method) ?? [];
  return app.evaluate(({ dialog }, name) => {
    const calls: unknown = Reflect.get(dialog, `${name}Calls`);
    return Array.isArray(calls) ? (calls as unknown[]) : [];
  }, method);
}
