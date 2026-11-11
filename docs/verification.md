# Verification

`npm run verify` is the single verification command. Run it from the repository's root folder. It changes nothing apart from the ignored `dist/`, `dist-electron/`, `test-results/` and `playwright-report/` folders, and it stops at the first failing check. CI runs the same command split across parallel jobs: `npm run verify -- --skip-e2e` (`.github/workflows/verify.yml`) runs every check except the end-to-end tests, and `npm run verify -- --e2e-only --project=chromium` (`.github/workflows/end-to-end.yml`) runs just those in Chromium, on four runners that each take a share of them (see below), and `--project=electron` runs the desktop app's on a Windows runner (see [The desktop app's end-to-end tests](#the-desktop-apps-end-to-end-tests)), so a failure in one job can be re-run on its own. A change only to `docs/` or Markdown files skips the end-to-end tests, as it can't change what the game does; it still gets every other check.

Before the first run on a machine, install Playwright's Chromium once:

```powershell
npx.cmd playwright install chromium
```

It runs these checks, in this order:

| #   | Check                                                        | Script                             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Formatting (Prettier)                                        | `npm run format:check`             | `npm run format` fixes it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2   | Lint and static bug analysis (typescript-eslint)             | `npm run lint`                     | Type-aware `strictTypeChecked` rules, `--max-warnings 0`. These rules are the static bug analysis gate; no separate analyzer is added.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3   | Type check (`tsc --noEmit`, strict)                          | `npm run typecheck`                | Checks the whole project, then the simulation and data catalogue again with no DOM or Node types, so they stay headless (ADR-0003), then the desktop app's Electron code (`electron/`) with Node types and no DOM.                                                                                                                                                                                                                                                                                                                                                                          |
| 4   | Unit and scenario tests (Vitest)                             | `npm test`                         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 5   | End-to-end tests (Playwright, Chromium and Electron)         | `npm run test:e2e`                 | Runs every test in `e2e/` in Chromium against the dev server (see [Chromium against the dev server](#chromium-against-the-dev-server)), and those in `e2e/desktop/` against the desktop app's production build, which it builds first (see [The desktop app's end-to-end tests](#the-desktop-apps-end-to-end-tests)). Starts the Vite dev server at 127.0.0.1 on port 4173, or on `E2E_PORT` if set, so that two checkouts can run them at once. Chromium runs headless; set `PLAYWRIGHT_HEADED=1` to show its windows. Headed runs use one worker, headless runs at most four (see below). |
| 6   | Dependency audit and secret scan                             | `npm run audit`, `npm run secrets` | `npm audit` fails on any known vulnerability and needs network access. The secret scan uses secretlint's recommended rules.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 7   | Production build (Vite, and the desktop app's Electron code) | `npm run build:desktop`            | Builds the game into `dist/` (`npm run build`, the page the desktop app opens), then empties `dist-electron/` and compiles `electron/` into it, so a renamed file's old output never lingers there. Any bundler warning fails the build.                                                                                                                                                                                                                                                                                                                                                    |

Every check applies; none is skipped. Tool versions are pinned exactly in `package.json` (`.npmrc` sets `save-exact`), and the Node version for CI is in `.nvmrc`.

## The desktop app

The desktop app ([ADR-0010](adr/0010-electron-desktop-app-for-windows.md)) runs the same game in an Electron window. Its main process and preload script are in `electron/`, checked by the same formatting, lint and type checks as the rest. To play it during development, with the page reloading when the game changes:

```powershell
npm.cmd run desktop
```

To play the production build, from the built files with no dev server:

```powershell
npm.cmd run build:desktop
npm.cmd run desktop:start
```

The production build is served to the window from `app://moonbase/`, an origin of its own, rather than from `file://` URLs, so the Content Security Policy's `'self'` means the game's own files and Vite's asset paths need no change. `test/desktop-security.test.ts` checks the window's security settings (no Node integration, context isolation and the sandbox on), the Content Security Policy, the navigation rules and that `app://` serves nothing outside `dist/`. End-to-end tests launch the production build itself (below).

### The desktop app's end-to-end tests

The tests in `e2e/desktop/` run in the Playwright project `electron`. It launches the desktop app from its production build (`dist/` and `dist-electron/`), with Playwright's Electron support, rather than opening the dev server in a browser. One command builds the app and runs them all:

```powershell
npm.cmd run test:desktop
```

It is `playwright test --project=electron`. The project depends on a setup project, `desktop-build` (`e2e/desktop/build.setup.ts`), which runs `npm run build:desktop` first, in about 2 seconds, so the tests never launch a stale build; add `--no-deps` to skip it when the build is known to be current. The `chromium` project ignores `e2e/desktop/`, and the `electron` project runs nothing else.

They cover what only the desktop app does, starting with a smoke set (`e2e/desktop/smoke.spec.ts`): the app opens the game in a visible window titled "Moon Base", which draws with WebGL2 and logs no errors; a Structure placed from the build menu is built; the clock advances, and stops while paused; closing the window quits the app with exit code 0; what the game keeps in `localStorage` (folded sections) is still there when the app is started again; and an uncaught exception in the main process ends the app rather than waiting in a dialog. Saving and loading with the native dialogs (`e2e/desktop/save-and-load.spec.ts`) stubs the dialogs to answer with files in the test's output folder: save, load of every sample save in `test/saves/` (each saved again and compared with what the browser version writes for it), cancelling either dialog, a refused file, a file that can't be written, the folder last used kept between runs, and that the page gets only the bridge's functions. Fullscreen (`e2e/desktop/full-screen.spec.ts`): F11 and the top bar's Full screen button each enter and leave it, the button follows however the window got there, and in fullscreen Escape closes the structure pop-up, cancels placing, closes the Guide and the celebration, leaves the game-over screen up, and never leaves fullscreen. F11 is pressed with Electron's `webContents.sendInputEvent`, as Playwright's key presses go straight to the page, past the main process that catches F11. Each test leaves fullscreen as it ends, pass or fail, so no window is left covering the screen. The window's state (`e2e/desktop/window-state.spec.ts`): its size and place, maximised and fullscreen come back on the next launch with the same user-data folder, a window kept off every screen opens on the primary one, a damaged `window-state.json` is ignored, and the page can't be made smaller than 1366 × 660. The question before closing (`e2e/desktop/close-prompt.spec.ts`): with unsaved progress, closing the window asks whether to save first, and Save writes the save through the save dialog and exits, Save then cancelling the save dialog keeps the window open, Don't save exits without saving, Cancel keeps the window open, closing again while the question is open asks once, and quitting asks too; just after saving with the Save button, just after loading, and on the game-over screen, closing doesn't ask. The window's behaviour (`e2e/desktop/window-behaviour.spec.ts`): the production build has no menu bar and no developer tools, even asked for directly or with F12 and Ctrl+Shift+I; starting the app again with the same user-data folder quits at once and restores, shows and focuses the running window; and links to outside pages, which the test adds as the game has none, go to `shell.openExternal`, stubbed so that no browser opens, while the game's window stays on the game. Later desktop-only behaviour adds its tests here. Behaviour the browser and the desktop app share stays in `e2e/`, tested in Chromium against the dev server ([ADR-0010](adr/0010-electron-desktop-app-for-windows.md)).

`e2e/desktop/fixtures.ts` has the fixtures they use:

- `userDataDir`: a new, empty user-data folder for each test, removed after it, so every worker, and every test, has its own, and the tests run side by side (the project is `fullyParallel`). The main process uses it when `MOONBASE_USER_DATA_DIR` is set; an installed app ignores the variable.
- `launchApp(options?)`: launches the app with that folder, with `options.env` added to its environment. Called again once the first has closed, it launches the app again with the same folder, to test what is kept from one run to the next. Whatever it launched is closed when the test ends, or killed if it won't close within 10 seconds.
- `electronApp` and `window`: the app each test starts with, and its game window once loaded. `consoleErrors` collects every error the main process or a window logs.
- `closeWindow(app)` closes the window as its close button does, so the window's `close` event runs; `exitCode(app)` waits for the app to exit and returns its code.
- `stubDialog(app, method, result, { delayMs }?)` has the main process's `dialog.showSaveDialog`, `showOpenDialog` or `showMessageBox` answer `result` at once, or after `delayMs`, as a test can't click the operating system's dialogs, and `dialogCalls(app, method)` returns the options each call was given, even once the app has exited, from what the stubs log to the main process's console.
- No real dialog ever opens: each launch starts with every dialog stubbed by `stubDialogsToClose(app)`, under which the question before closing answers Don't save and the save and open dialogs are cancelled, so a test that closes or quits the app with unsaved progress still closes it. As each test ends, the fixture stubs them so again before closing whatever is still running, whatever the test stubbed.
- `startAgain(timeoutMs)` starts the app as a plain process, without Playwright's connection, with the test's user-data folder, and returns its exit code, killing it if it hasn't exited in time; the second-launch test uses it, as an instance that quits at once never makes the connection.

The fixtures also set `MOONBASE_E2E=1`, under which the main process logs an uncaught exception and exits with code 1, rather than showing Electron's modal error dialog, which would wait on the desktop with no one to close it. They check that the build exists before launching, as Electron answers a missing app with a dialog too.

The windows are real and show on the desktop while the tests run, as Electron has no headless mode. Several open at once and overlap, and Chromium stops drawing a window that is covered or in the background, which would stop the game's clock, so the tests launch Electron with switches that turn that off.

On the maintainer's PC (four workers, on the GPU) the twenty-six tests take about 40 seconds. Some briefly fill the screen. CI runs them in the `desktop` job of `.github/workflows/end-to-end.yml`, on Windows, as the desktop app is Windows only. The runner has no GPU, so there (`CI` set) the tests let Electron draw WebGL in software with SwiftShader; locally, `CI=1` doesn't make it draw in software, as the windows always have the GPU. The job keeps Electron's download in GitHub's cache, keyed on its pinned version. Its CI times are not yet measured.

### The installer

`npm.cmd run package:win` builds the desktop app's Windows installer into the ignored `release/` folder. `npm run verify` doesn't build it, as it takes longer than the rest of the build and downloads electron-builder's tools; the `Installer` workflow (`.github/workflows/installer.yml`) builds it in CI instead, on pushes to `main` and on pull requests that change what it is built from, and runs the packaged app's smoke test, the Playwright project `packaged`. That test is skipped when `release/win-unpacked/` hasn't been built, so it passes in `npm run verify` without it. [`docs/desktop-release.md`](desktop-release.md) has how to build and test the installer by hand.

## Running one test

While working on a change, run just the tests it touches, then `npm run verify` before handing it over. Give a file, and optionally part of a test's name:

```powershell
npm.cmd test -- test/digging.test.ts -t "start with no Regolith"
npm.cmd run test:e2e -- e2e/habitat.spec.ts --grep "moves from the Lander"
```

The first runs one Vitest test, the second one Playwright test in Chromium. A test in `e2e/desktop/` runs with `--project=electron`, after the build; add `--no-deps` to skip the build. Leave out `-t` or `--grep` to run the whole file.

## Chromium against the dev server

The tests in `e2e/` run in the Playwright project `chromium`, against the Vite dev server, as a quick stand-in for the desktop app's window, which draws with the same engine ([ADR-0010](adr/0010-electron-desktop-app-for-windows.md)). They load and save through the browser's file picker and download, which the game uses when it isn't in the desktop app (`src/ui/browser-save-file-store.ts`); that path serves the tests and development only, not players. The browser version, and its Firefox tests, were dropped; [their setup](verification-history.md#firefox-end-to-end-runs-dropped-with-the-browser-version) is in the verification history. To run all the tests in Chromium:

```powershell
npm.cmd run test:e2e -- --project=chromium
```

On the maintainer's PC (20 cores, four workers, on the GPU) they take about 3 minutes (2.8 in November 2026).

- In CI Chromium runs headless, with no display, drawing WebGL2 with its own software renderer, SwiftShader, which Playwright allows with `--enable-unsafe-swiftshader`. Each page draws on its own, so it runs headless runs' usual number of workers: two on a four-CPU runner. On a developer's PC, held to four CPUs with two workers and drawing in software, all the tests took 30 minutes, so a share of four should take about 8 minutes on a runner as fast. Its CI times are not yet measured; the job limit is 30 minutes.
- Headless Chromium draws in software on a developer's PC too, unless told to use the GPU, and that made the first tests up to five times slower. `playwright.config.ts` therefore starts it with `--enable-gpu` outside CI. To draw in software as CI does, set `$env:CI = "1"` first; that also stops at the first failure, which `--max-failures=0` undoes.
- The game turns off anisotropic filtering and multisampling when WebGL is drawn in software: the first slowed every frame several times over, the second by over half again. Chromium hides the renderer's name behind "WebKit WebGL", so `src/render/renderer.ts` reads it from the `WEBGL_debug_renderer_info` extension.
- To reproduce a CI-only failure, draw in software as above. The runner's fonts are also wider than Windows', which can wrap text that fits locally: setting `font-family: Verdana` for a run in `src/ui/styles.css` reproduces that.

## The long game

`npm run verify` doesn't play the long game, as it takes about 10 minutes of a full core. CI plays it in a workflow of its own (`.github/workflows/long-game.yml`), on a pull request that changes what the play imports and on `main`, so a change can be handed over without playing it by hand. [`docs/reference-campaign.md`](reference-campaign.md#ci-plays-it) says when it plays and how it reports.

## Stopping at the first failure in CI

In CI (`CI` set), both test runners stop at the first failure: `vitest.config.ts` with `bail`, and `playwright.config.ts` with `maxFailures`. Their details only print once the run ends: one end-to-end run's failure came 80 seconds in and was reported over 14 minutes later. A run therefore reports only the first failure it meets, so fixing it can reveal another. Vitest runs several files at once, so the files already started when one fails still finish, and their failures are reported too. Local runs don't stop early, and report every failure.

## One worker for headed end-to-end runs

When the end-to-end tests run headed (`PLAYWRIGHT_HEADED=1`), `playwright.config.ts` runs them one at a time: windows on one display can hold back each other's animation frames, and the game updates what it shows only once a frame, so a starved test can time out. Headless runs on a developer machine use half the CPU cores, but no more than four (see below).

CI gets its parallelism from separate runners: four jobs each run one share of the tests, chosen by `E2E_SHARD` (`1/4` to `4/4`). Playwright shares them out a whole file at a time. To run one share locally, set `$env:E2E_SHARD = "1/4"` first.

## Four workers at most for headless end-to-end runs

On a developer's PC, `playwright.config.ts` runs headless end-to-end tests on half the CPU cores, but no more than four workers. Each worker's browser makes a WebGL context as the game starts, and when many started at once on the PC's GPU, some pages stalled for minutes before they loaded: with 10 workers, the old default on a 20-core PC, the first tests of a run failed in some runs and not others (#228). That was measured in Firefox, before the browser version was dropped; [what showed it](verification-history.md#four-workers-at-most-what-showed-it-228) is in the verification history. Two checkouts running their end-to-end tests at once (see `E2E_PORT`) add their workers together.

The dev server listens on 127.0.0.1, and the browser goes there, rather than to `localhost`, which Vite binds to `::1` alone on Windows.

## Timeouts

A timeout is there to stop a test that hangs, not to check how fast it runs. Each limit is set well above the slowest run seen in CI, so ordinary variation in machine speed can't fail a test. If a test needs to check speed, it should measure it explicitly. Set limits for the whole suite, not for single tests, with one exception: the reference Campaign's test plays some 170 Earth Days a game-minute at a time, far longer than any other, so it sets its own limit rather than raising the suite's for every test.

The figures are the slowest seen in CI up to early November 2026: the tests' from one full run, the jobs' from the slowest of their recent green runs on `main`. [Which runs they came from](verification-history.md#the-ci-runs-behind-the-timeout-table) is in the verification history.

| Limit                                 | Where                              | Value  | Slowest seen in CI                                                                                         | Margin     |
| ------------------------------------- | ---------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- | ---------- |
| Vitest test and hook timeout          | `vitest.config.ts`                 | 120 s  | 18.0 s (`try-scenarios.test.ts`, "act-2 prepares a Campaign the game can load")                            | about 6.5× |
| Vitest timeout, reference Campaign    | `test/reference-campaign.test.ts`  | 300 s  | 54 s (`reference-campaign.test.ts`, the whole file: playing the Campaign in `beforeAll`, then its 6 tests) | about 5.5× |
| Playwright test timeout               | `playwright.config.ts`, `timeout`  | 300 s  | 1.3 min (`late-game.spec.ts`, a growing hall built on the late base earning its first round, one worker)   | about 4×   |
| Playwright `expect` and `expect.poll` | `playwright.config.ts`, `expect`   | 60 s   | about 8 s (a refusal that hides after a fixed 8 s)                                                         | 7.5×       |
| Playwright web server start           | Playwright's default               | 60 s   | under 2 s (the end-to-end tests start within 2 s of the check; Vite is ready in about 0.2 s locally)       | over 30×   |
| CI checks job                         | `.github/workflows/verify.yml`     | 30 min | 9.1 min                                                                                                    | about 3×   |
| CI end-to-end job, each of four       | `.github/workflows/end-to-end.yml` | 30 min | not yet measured in Chromium (8.6 min for one share in Firefox, before it was dropped)                     | about 3.5× |
| CI desktop end-to-end job             | `.github/workflows/end-to-end.yml` | 20 min | not yet measured (about 15 s locally on the GPU)                                                           | unknown    |
| Long game, hard limit                 | `scripts/long-game.mjs`            | 60 min | 9.9 min (the play, in the job below)                                                                       | about 6×   |
| CI long game job                      | `.github/workflows/long-game.yml`  | 75 min | 10.2 min; 15 min above the hard limit, so that the script reports being stopped                            | about 7×   |

The long game's plays in CI took from 4.6 to 9.9 minutes, as the runners' speed varies; a developer's PC takes about 10.

The runners' speed varies a lot from one run to the next, so the job limits are set against the slowest run, not a typical one. In the run of pull request #206's merge the four end-to-end shares took 24.5 minutes between them, so the end-to-end limit would only just cover every test landing on one runner; a share of a quarter of them has more margin than that.

The cost of a generous limit is that a test that really hangs takes longer to report. That is cheaper than a red run that has to be investigated and re-run.

## Exceptions

- **Vite chunk size limit raised to 700 kB** (`vite.config.ts`, `build.chunkSizeWarningLimit`). Three.js alone is about 530 kB minified, and the single-page game needs all of it before it can draw, so code-splitting would not make anything load sooner. Review if the bundle grows past the limit or the game gains screens that could load on demand.
- **`@typescript-eslint/restrict-template-expressions` allows numbers** (`eslint.config.js`, option `allowNumber: true`; every other operand type stays forbidden). Numbers always print sensibly in template strings, and the game builds many labels and messages from them (clock times, ids, refusal reasons), so wrapping each one in `String()` would add noise without catching any bug. Review if the rule's defaults change or a number-formatting bug turns up in a template string.
