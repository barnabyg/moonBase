# Verification

`npm run verify` is the single verification command. Run it from the repository's root folder. It changes nothing apart from the ignored `dist/`, `test-results/` and `playwright-report/` folders, and it stops at the first failing check. CI runs the same command (`.github/workflows/verify.yml`) split across two parallel jobs: `npm run verify -- --skip-e2e` runs every check except the end-to-end tests, and `npm run verify -- --e2e-only` runs just those, so a failure in one job can be re-run on its own.

Before the first run on a machine, install Playwright's Firefox once:

```powershell
npx.cmd playwright install firefox
```

It runs these checks, in this order:

| #   | Check                                            | Script                             | Notes                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Formatting (Prettier)                            | `npm run format:check`             | `npm run format` fixes it.                                                                                                                                                                                                                                                                                              |
| 2   | Lint and static bug analysis (typescript-eslint) | `npm run lint`                     | Type-aware `strictTypeChecked` rules, `--max-warnings 0`. These rules are the static bug analysis gate; no separate analyzer is added.                                                                                                                                                                                  |
| 3   | Type check (`tsc --noEmit`, strict)              | `npm run typecheck`                | Checks the whole project, then the simulation and data catalogue again with no DOM or Node types, so they stay headless (ADR-0003).                                                                                                                                                                                     |
| 4   | Unit and scenario tests (Vitest)                 | `npm test`                         |                                                                                                                                                                                                                                                                                                                         |
| 5   | End-to-end tests (Playwright, Firefox)           | `npm run test:e2e`                 | Starts the Vite dev server on port 4173, or on `E2E_PORT` if set, so that two checkouts can run them at once. Firefox runs headless; set `PLAYWRIGHT_HEADED=1` to show its window, which CI does inside a virtual display because headless Firefox has no OpenGL without a GPU. Headed runs use one worker (see below). |
| 6   | Dependency audit and secret scan                 | `npm run audit`, `npm run secrets` | `npm audit` fails on any known vulnerability and needs network access. The secret scan uses secretlint's recommended rules.                                                                                                                                                                                             |
| 7   | Production build (Vite)                          | `npm run build`                    | Any bundler warning fails the build.                                                                                                                                                                                                                                                                                    |

Every check applies; none is skipped. Tool versions are pinned exactly in `package.json` (`.npmrc` sets `save-exact`), and the Node version for CI is in `.nvmrc`.

## Running one test

While working on a change, run just the tests it touches, then `npm run verify` before handing it over. Give a file, and optionally part of a test's name:

```powershell
npm.cmd test -- test/digging.test.ts -t "start with no Regolith"
npm.cmd run test:e2e -- e2e/habitat.spec.ts --grep "moves from the Lander"
```

The first runs one Vitest test, the second one Playwright test. Leave out `-t` or `--grep` to run the whole file.

## One worker for headed end-to-end runs

When Firefox runs headed (`PLAYWRIGHT_HEADED=1`, as in CI), `playwright.config.ts` runs the end-to-end tests one at a time. CI draws with Mesa's software renderer into one virtual display, where two Firefox windows hold back each other's animation frames, and the game updates what it shows only once a frame, so a starved test can time out. One worker is no slower overall, because both workers compete for the same CPUs. Headless runs on a developer machine still use Playwright's default number of workers.

## Timeouts

A timeout is there to stop a test that hangs, not to check how fast it runs. Each limit is set well above the slowest run seen in CI, so ordinary variation in machine speed can't fail a test. If a test needs to check speed, it should measure it explicitly. Set limits for the whole suite, not for single tests, with one exception: the reference Campaign's test plays some 170 Earth Days a game-minute at a time, far longer than any other, so it sets its own limit rather than raising the suite's for every test.

The test figures are from the CI run of pull request #139 (30 October 2026), the first after the slow tests were sped up. The job figures are the slowest of the 20 green runs up to and including it.

| Limit                                 | Where                             | Value  | Slowest seen in CI                                                                                                 | Margin    |
| ------------------------------------- | --------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ | --------- |
| Vitest test and hook timeout          | `vitest.config.ts`                | 120 s  | 12.0 s (`plant-recipes.test.ts`, "switched to metals and silicon, loses the base its self-sufficiency in oxygen")  | 10×       |
| Vitest timeout, reference Campaign    | `test/reference-campaign.test.ts` | 300 s  | 47 s (`reference-campaign.test.ts`, the whole file: playing the Campaign in `beforeAll`, then its 5 tests)         | about 6×  |
| Playwright test timeout               | `playwright.config.ts`, `timeout` | 300 s  | 26.0 s (`dust-wear.spec.ts`, Dust wearing a solar array down until a Maintenance Work Order is raised, one worker) | about 11× |
| Playwright `expect` and `expect.poll` | `playwright.config.ts`, `expect`  | 60 s   | about 8 s (a refusal that hides after a fixed 8 s)                                                                 | 7.5×      |
| Playwright web server start           | Playwright's default              | 60 s   | under 2 s (the end-to-end tests start within 2 s of the check; Vite is ready in about 0.2 s locally)               | over 30×  |
| CI checks job                         | `.github/workflows/verify.yml`    | 30 min | 5.9 min                                                                                                            | about 5×  |
| CI end-to-end job                     | `.github/workflows/verify.yml`    | 75 min | 12.8 min for 56 tests                                                                                              | about 6×  |

The runners' speed varies a lot from one run to the next: the same end-to-end tests have taken from 5.6 to 12.8 minutes in those 20 runs, so the job limits are set against the slowest run, not a typical one.

The cost of a generous limit is that a test that really hangs takes longer to report. That is cheaper than a red run that has to be investigated and re-run.

## Exceptions

- **Vite chunk size limit raised to 700 kB** (`vite.config.ts`, `build.chunkSizeWarningLimit`). Three.js alone is about 530 kB minified, and the single-page game needs all of it before it can draw, so code-splitting would not make anything load sooner. Review if the bundle grows past the limit or the game gains screens that could load on demand.
- **`@typescript-eslint/restrict-template-expressions` allows numbers** (`eslint.config.js`, option `allowNumber: true`; every other operand type stays forbidden). Numbers always print sensibly in template strings, and the game builds many labels and messages from them (clock times, ids, refusal reasons), so wrapping each one in `String()` would add noise without catching any bug. Review if the rule's defaults change or a number-formatting bug turns up in a template string.
