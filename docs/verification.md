# Verification

`npm run verify` is the single verification command. Run it from the repository's root folder. It changes nothing apart from the ignored `dist/`, `dist-electron/`, `test-results/` and `playwright-report/` folders, and it stops at the first failing check. CI runs the same command split across parallel jobs: `npm run verify -- --skip-e2e` (`.github/workflows/verify.yml`) runs every check except the end-to-end tests, and `npm run verify -- --e2e-only --project=firefox` and `--project=chromium` (`.github/workflows/end-to-end.yml`) run just those, in each browser on four runners that each take a share of them (see below), so a failure in one job can be re-run on its own. A change only to `docs/` or Markdown files skips the end-to-end tests, as it can't change what the game does; it still gets every other check.

Before the first run on a machine, install Playwright's Firefox and Chromium once:

```powershell
npx.cmd playwright install firefox chromium
```

It runs these checks, in this order:

| #   | Check                                                        | Script                             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Formatting (Prettier)                                        | `npm run format:check`             | `npm run format` fixes it.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2   | Lint and static bug analysis (typescript-eslint)             | `npm run lint`                     | Type-aware `strictTypeChecked` rules, `--max-warnings 0`. These rules are the static bug analysis gate; no separate analyzer is added.                                                                                                                                                                                                                                                                                                                               |
| 3   | Type check (`tsc --noEmit`, strict)                          | `npm run typecheck`                | Checks the whole project, then the simulation and data catalogue again with no DOM or Node types, so they stay headless (ADR-0003), then the desktop app's Electron code (`electron/`) with Node types and no DOM.                                                                                                                                                                                                                                                   |
| 4   | Unit and scenario tests (Vitest)                             | `npm test`                         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 5   | End-to-end tests (Playwright, Firefox and Chromium)          | `npm run test:e2e`                 | Runs every test in Firefox and in Chromium (see [Two browsers](#two-browsers)). Starts the Vite dev server at 127.0.0.1 on port 4173, or on `E2E_PORT` if set, so that two checkouts can run them at once. Both browsers run headless; set `PLAYWRIGHT_HEADED=1` to show their windows, which CI does for Firefox inside a virtual display because headless Firefox has no OpenGL without a GPU. Headed runs use one worker, headless runs at most four (see below). |
| 6   | Dependency audit and secret scan                             | `npm run audit`, `npm run secrets` | `npm audit` fails on any known vulnerability and needs network access. The secret scan uses secretlint's recommended rules.                                                                                                                                                                                                                                                                                                                                          |
| 7   | Production build (Vite, and the desktop app's Electron code) | `npm run build:desktop`            | Builds the game into `dist/` (`npm run build`, the browser build), then compiles `electron/` into `dist-electron/`. Any bundler warning fails the build.                                                                                                                                                                                                                                                                                                             |

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

The production build is served to the window from `app://moonbase/`, an origin of its own, rather than from `file://` URLs, so the Content Security Policy's `'self'` means the game's own files and Vite's asset paths need no change. `test/desktop-security.test.ts` checks the window's security settings (no Node integration, context isolation and the sandbox on), the Content Security Policy, the navigation rules and that `app://` serves nothing outside `dist/`. End-to-end tests against the Electron build come later (#306); until then, check a change to `electron/` by playing the production build.

## Running one test

While working on a change, run just the tests it touches, then `npm run verify` before handing it over. Give a file, and optionally part of a test's name:

```powershell
npm.cmd test -- test/digging.test.ts -t "start with no Regolith"
npm.cmd run test:e2e -- e2e/habitat.spec.ts --grep "moves from the Lander"
```

The first runs one Vitest test, the second one Playwright test in both browsers. Add `--project=firefox` or `--project=chromium` to run it in one. Leave out `-t` or `--grep` to run the whole file.

## Two browsers

The end-to-end tests run in two Playwright projects, `firefox` and `chromium`. Firefox is tested until the browser version is dropped; Chromium is the engine of the desktop app that replaces it ([ADR-0010](adr/0010-electron-desktop-app-for-windows.md)), and most end-to-end tests stay in it after that. To run all the tests in one browser:

```powershell
npm.cmd run test:e2e -- --project=firefox
npm.cmd run test:e2e -- --project=chromium
```

On the maintainer's PC (20 cores, four workers, on the GPU) Firefox takes 5 to 10 minutes (see [below](#four-workers-at-most-for-headless-end-to-end-runs)) and Chromium about 3 minutes (2.8 in November 2026). `npm.cmd run test:e2e` with no project runs both.

The browsers are set up differently, in CI more than anywhere:

- **Firefox** in CI runs headed in a virtual X display (`xvfb-run`), drawing with Mesa's software OpenGL, because headless Firefox can't create an OpenGL context without a GPU. Its windows on one display hold back each other's animation frames, so it runs [one worker](#one-worker-for-headed-end-to-end-runs).
- **Chromium** in CI runs headless, with no display, drawing WebGL2 with its own software renderer, SwiftShader, which Playwright allows with `--enable-unsafe-swiftshader`. Each page draws on its own, so it runs headless runs' usual number of workers: two on a four-CPU runner. Software rendering makes it the slower of the two there: on a developer's PC, held to four CPUs with two workers and drawing in software, all of Chromium's tests took 30 minutes, so a share of four should take about 8 minutes on a runner as fast. Its CI times are not yet measured; the job limit is the same 30 minutes as Firefox's.
- Headless Chromium draws in software on a developer's PC too, unless told to use the GPU, and that made the first tests up to five times slower than in Firefox. `playwright.config.ts` therefore starts it with `--enable-gpu` outside CI. To draw in software as CI does, set `$env:CI = "1"` first; that also stops at the first failure, which `--max-failures=0` undoes.
- The game turns off anisotropic filtering and multisampling when WebGL is drawn in software: the first slowed every frame several times over, the second by over half again. Chromium hides the renderer's name behind "WebKit WebGL", so `src/render/renderer.ts` reads it from the `WEBGL_debug_renderer_info` extension.
- To reproduce a CI-only failure in Chromium, draw in software as above. The runner's fonts are also wider than Windows', which can wrap text that fits locally: setting `font-family: Verdana` for a run in `src/ui/styles.css` reproduces that.

## The long game

`npm run verify` doesn't play the long game, as it takes about 10 minutes of a full core. CI plays it in a workflow of its own (`.github/workflows/long-game.yml`), on a pull request that changes what the play imports and on `main`, so a change can be handed over without playing it by hand. [`docs/reference-campaign.md`](reference-campaign.md#ci-plays-it) says when it plays and how it reports.

## Stopping at the first failure in CI

In CI (`CI` set), both test runners stop at the first failure: `vitest.config.ts` with `bail`, and `playwright.config.ts` with `maxFailures`. Their details only print once the run ends: one end-to-end run's failure came 80 seconds in and was reported over 14 minutes later. A run therefore reports only the first failure it meets, so fixing it can reveal another. Vitest runs several files at once, so the files already started when one fails still finish, and their failures are reported too. Local runs don't stop early, and report every failure.

## One worker for headed end-to-end runs

When Firefox runs headed (`PLAYWRIGHT_HEADED=1`, as in CI), `playwright.config.ts` runs the end-to-end tests one at a time. CI draws with Mesa's software renderer into one virtual display, where two Firefox windows hold back each other's animation frames, and the game updates what it shows only once a frame, so a starved test can time out. One worker is no slower overall, because both workers compete for the same CPUs. Headless runs on a developer machine use half the CPU cores, but no more than four (see below).

So CI gets its parallelism from separate runners instead, each with its own display and CPUs: for each browser, four jobs each run one share of the tests, chosen by `E2E_SHARD` (`1/4` to `4/4`). Playwright shares them out a whole file at a time. To run one share locally, set `$env:E2E_SHARD = "1/4"` first.

## Four workers at most for headless end-to-end runs

On a developer's PC, `playwright.config.ts` runs headless end-to-end tests on half the CPU cores, but no more than four workers. Each worker's Firefox makes a WebGL context as the game starts, and when many start at once on the PC's GPU, some pages stall for minutes before they load. With 10 workers, the old default on a 20-core PC, the first tests of a run failed in some runs and not others (#228): pages that never loaded, `NS_ERROR_CONNECTION_REFUSED`, and Firefox logging "WebGL is currently disabled" in the first minute, long before `e2e/no-webgl.spec.ts`, which switches WebGL off on purpose and logs it every run. In five runs, four workers passed with none of those errors, at 5 to 10 minutes a run on that PC against 3.4 to 4.2 with 10. Two checkouts running their end-to-end tests at once (see `E2E_PORT`) add their workers together, so more than two at once could bring the stalls back. [What showed it](verification-history.md#four-workers-at-most-what-showed-it-228), from 4 to 10 Firefox instances started at once, is in the verification history.

The dev server listens on 127.0.0.1, and Firefox goes there, rather than to `localhost`. Vite binds `localhost` to `::1` alone on Windows, while Firefox tries both `::1` and 127.0.0.1 for it, so a page slow to connect fell back to 127.0.0.1, where nothing listened, and reported `NS_ERROR_CONNECTION_REFUSED` instead of the stall.

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
| CI end-to-end job, each of four       | `.github/workflows/end-to-end.yml` | 30 min | 8.6 min for one share (Firefox; Chromium not yet measured)                                                 | about 3.5× |
| Long game, hard limit                 | `scripts/long-game.mjs`            | 60 min | 9.9 min (the play, in the job below)                                                                       | about 6×   |
| CI long game job                      | `.github/workflows/long-game.yml`  | 75 min | 10.2 min; 15 min above the hard limit, so that the script reports being stopped                            | about 7×   |

The long game's plays in CI took from 4.6 to 9.9 minutes, as the runners' speed varies; a developer's PC takes about 10.

The runners' speed varies a lot from one run to the next, so the job limits are set against the slowest run, not a typical one. In the run of pull request #206's merge the four end-to-end shares took 24.5 minutes between them, so the end-to-end limit would only just cover every test landing on one runner; a share of a quarter of them has more margin than that.

The cost of a generous limit is that a test that really hangs takes longer to report. That is cheaper than a red run that has to be investigated and re-run.

## Exceptions

- **Vite chunk size limit raised to 700 kB** (`vite.config.ts`, `build.chunkSizeWarningLimit`). Three.js alone is about 530 kB minified, and the single-page game needs all of it before it can draw, so code-splitting would not make anything load sooner. Review if the bundle grows past the limit or the game gains screens that could load on demand.
- **`@typescript-eslint/restrict-template-expressions` allows numbers** (`eslint.config.js`, option `allowNumber: true`; every other operand type stays forbidden). Numbers always print sensibly in template strings, and the game builds many labels and messages from them (clock times, ids, refusal reasons), so wrapping each one in `String()` would add noise without catching any bug. Review if the rule's defaults change or a number-formatting bug turns up in a template string.
