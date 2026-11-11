# Verification history

The evidence behind the rules and limits in [`docs/verification.md`](verification.md), moved here from it unedited, apart from links into it. Each section names the part of `docs/verification.md` it came from, which keeps the rules and the reasons for them. The figures here are from when each was measured, so measure again before relying on one.

## Four workers at most: what showed it (#228)

From [Four workers at most for headless end-to-end runs](verification.md#four-workers-at-most-for-headless-end-to-end-runs).

What showed it, starting 4 to 10 headless Firefox instances at once against one dev server, each loading the game, two rounds a server:

- With 10, pages hung for over 60 seconds, or took 20 to 60 seconds, in most rounds, though every request had been answered within 6 seconds. With 8, one round in six hung; with 6, one round in six stalled for about 27 seconds. With 5 or 4, every page of 24 rounds loaded in 3 to 6 seconds.
- With WebGL turned off, 10 at once all loaded in 2.5 to 4.3 seconds. Software WebGL (`webgl.angle.force-warp`) and no GPU process (`layers.gpu-process.enabled` off) still hung or stalled.
- A cold Vite cache, the full Vitest run just before, and the CPU kept busy by Vitest beside them didn't bring it back with one run of 10 workers. Two runs of 10 at once, from two checkouts, did: 20 Firefox instances.

Four workers make a quiet run take 5 to 10 minutes on that PC, against 3.4 to 4.2 with 10. Three runs in a row with four workers, the first straight after the Vitest run, and two runs of four at once, all passed with none of the errors above. The other error #228 met, `browserContext.close` failing with `removeBrowserContext` as a failed test's Firefox closed, wasn't seen in any of these runs, stalled or not. Two checkouts running their end-to-end tests at once (see `E2E_PORT`) still add their workers together, so more than two at once could bring it back.

## Firefox end-to-end runs (dropped with the browser version)

From [Chromium against the dev server](verification.md#chromium-against-the-dev-server), [One worker for headed end-to-end runs](verification.md#one-worker-for-headed-end-to-end-runs) and [Four workers at most](verification.md#four-workers-at-most-for-headless-end-to-end-runs). Until the desktop app replaced the browser version (ADR-0010, #312), the end-to-end tests also ran in a Playwright project `firefox`, and CI ran it on four runners beside Chromium's. How it was set up, and why:

- **CI.** Headless Firefox can't create an OpenGL context without a GPU, so CI ran it headed (`PLAYWRIGHT_HEADED=1`) in a virtual X display (`xvfb-run`), drawing with Mesa's software OpenGL (llvmpipe), which the runner image ships. Firefox's graphics blocklist refused WebGL2 on that renderer, so the project set `webgl.force-enabled`; it also set `gfx.x11-egl.force-disabled`, to use Mesa through GLX, as the image has Mesa's GLX libraries but not its EGL ones.
- **One worker when headed.** Firefox windows on one software-rendered display held back each other's animation frames: in CI, with two workers, one test's page went up to 28 s without a frame while its timers ran on time. One worker was no slower overall, as both contended for the same CPUs.
- **127.0.0.1 rather than `localhost`.** Vite binds `localhost` to `::1` alone on Windows, while Firefox tried both `::1` and 127.0.0.1 for it, so a page slow to connect fell back to 127.0.0.1, where nothing listened, and reported `NS_ERROR_CONNECTION_REFUSED` instead of the stall.
- **Times.** On the maintainer's PC (20 cores, four workers, on the GPU) all of Firefox's tests took 5 to 10 minutes, against about 3 for Chromium's. In CI one share of four took up to 8.6 minutes.
- **Saves.** Firefox downloaded only from a link in the page, and inside the game-over screen, only from one in that screen, so the browser's save store put its download link and file picker in the element the request came from. Chromium needs neither in the page.

## The CI runs behind the timeout table

From [Timeouts](verification.md#timeouts).

The test figures are from the CI run of the merge of pull request #206 into `main` (1 November 2026, runs 41323630921 and 41323631019), which ran 2,161 Vitest tests and 98 end-to-end tests, except the first row's, which is from the CI run of pull request #207 (run 41330828226), the first after the slowest test was cut. The job figures are the slowest of the green runs on `main` up to and including it: the last 20 for the checks job, and all 9 for the end-to-end jobs since they were shared out.

The long game's figures are the slowest of its 14 green plays in CI up to and including the merge of pull request #230 into `main` (2 November 2026), from the first on pull request #210: pull request #224's play, run 41508111671. Plays took from 4.6 to 9.9 minutes, as the runners' speed varies; a developer's PC takes about 10.
