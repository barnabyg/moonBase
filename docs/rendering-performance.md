# Rendering performance

How long the game takes to draw a frame in Firefox and in Chromium, the engine of the desktop app ([ADR-0010](adr/0010-electron-desktop-app-for-windows.md)), and what was tried to make Chromium draw faster (#304). The figures are from when they were measured; measure again before relying on one.

## Measuring

From the repository's root folder:

```powershell
npm.cmd run frame-time
```

`scripts/frame-time.mjs` builds the game for production, serves the build, and opens it in Playwright's Firefox and Chromium, each with a window, so that WebGL is drawn on the GPU as a player's is rather than in software as headless Chromium would. Each browser draws as fast as it can rather than at the screen's refresh rate (Firefox's `layout.frame_rate` 0; Chromium's `--disable-gpu-vsync --disable-frame-rate-limit`), so a frame time is what the frame costs, not the refresh interval; `--vsync` measures at the refresh rate instead. The window is 1920 × 1080 CSS pixels at a device pixel ratio of 1.5, the maintainer's own Windows scaling, so the 3D view is drawn at about 2880 × 1620.

Each scene is loaded from a save with the game paused, zoomed out by the same wheel events in both browsers, warmed up for 3 seconds, then timed by the gaps between animation frames for 8 seconds. Each repeat opens each browser afresh and draws every scene, so that a drift in the machine's speed spreads over them alike. The report gives, for each browser and scene, the median over the repeats of each repeat's median and 95th percentile frame time, with their range. The results, with a screenshot of each scene in each browser, go to the ignored `.frame-time/<label>/` folder.

| Scene        | What it draws                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `early-day`  | The `npm run try -- workshop` base, 6 game-hours after sunrise, from the opening view zoomed out a little                                                                                        |
| `late-day`   | The long-game play guide's base from `npm run try -- act-4-end`, 59 Structures, with eight light masts added round the Lander, 6 game-hours after sunrise, with the sun low and the shadows long |
| `late-night` | The same base 6 game-hours into the Night, lit by the light masts                                                                                                                                |

Options: `--browser firefox` or `chromium`, `--scene <id>` (each may be given more than once), `--repeats 3`, `--seconds 8`, `--label <name>` for the results folder, and `--keep` to reuse the saves prepared last time. Preparing the late base plays the long-game play guide to Earth Day 2,850, which takes about 20 minutes of one core; `--keep` skips that, but its saves are what that code and catalogue made, so leave it out after changing them. The rest of a run takes about a minute and a half for each repeat.

Run it on a quiet machine, and don't lower its priority: the frame time depends on how much of the CPU the browser gets. The preparation alone can run at low priority, as it doesn't time anything.

The browser windows have to stay on screen. The script turns off Firefox's tracking of windows hidden behind others, which would draw them less often; Playwright does the same for Chromium.

## The machine

Measured on 11 November 2026:

- CPU: 12th Gen Intel Core i7-12700K, 12 cores, 20 threads; 128 GB of memory.
- GPU: NVIDIA GeForce RTX 4090, driver 32.0.16.2114, driving a 3840 × 2160 screen at 120 Hz with Windows scaling at 150%. The CPU's Intel UHD Graphics 770 is also present, with no screen.
- Windows 11 Pro 10.0.26300.
- Firefox 157.0 and Chromium 156.0.8078.4, the builds Playwright 1.64.0 installs. Both draw WebGL through ANGLE on Direct3D 11. Chromium names the GPU, "ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 ... Direct3D11 ...)"; Firefox names a class of GPU in its place, "NVIDIA GeForce GTX 980 ... or similar", to make the browser harder to fingerprint.

## Baseline

Five repeats, at commit `b5e7ebf`. The late scenes' saves were prepared once and kept for every run, from the `act-4-end` base played on to the Night of Earth Day 2,870; a fresh run starts from Earth Day 2,850 itself, so its late scenes come earlier in the Campaign, on a base a little different.

| Browser  | Scene        | Median ms (range)   | 95th percentile ms (range) |
| -------- | ------------ | ------------------- | -------------------------- |
| Firefox  | `early-day`  | 3.54 (3.52–3.62)    | 4.10 (4.04–4.26)           |
| Firefox  | `late-day`   | 11.64 (11.42–11.94) | 12.88 (12.54–13.22)        |
| Firefox  | `late-night` | 11.24 (11.06–11.64) | 12.80 (12.24–12.84)        |
| Chromium | `early-day`  | 2.20 (2.20–2.30)    | 2.70 (2.60–2.70)           |
| Chromium | `late-day`   | 17.80 (17.70–18.00) | 35.10 (35.10–35.30)        |
| Chromium | `late-night` | 17.50 (17.30–17.60) | 34.80 (34.60–34.90)        |

Chromium draws the early base faster than Firefox, but the late base half as fast again as Firefox, and about one frame in ten takes twice as long as the rest. Chromium rounds animation frame times to 0.1 ms.

Within a session the medians varied by about 3%. Between sessions an hour apart they varied by up to about 15%: the first baseline, taken before the zoom was made the same in both browsers, had Firefox's early base at 4.10 ms and Chromium's late base at 19.6 ms. So each attempt was measured against the baseline of the same session, and a change under about 5% counts as noise.

## What was tried

Each setting was changed on its own, built, and measured with three repeats against the baseline above. Times are the medians and 95th percentiles of `late-day`, the scene with the largest difference; the other scenes moved the same way.

| Attempt                                                                                      | Firefox ms (median, p95) | Chromium ms (median, p95) | Verdict                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------- | ------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline                                                                                     | 11.64, 12.88             | 17.80, 35.10              |                                                                                                                                                                                                       |
| WebGL `powerPreference: "high-performance"`                                                  | 11.62, 12.64             | 17.90, 35.10              | No change: both browsers already drew on the RTX 4090, which drives the screen. Not kept, as the numbers don't support it here; worth measuring on a laptop with two GPUs, where it is meant to help. |
| Device pixel ratio capped at 1 rather than 2 (2.25 times fewer pixels at this machine's 1.5) | 11.56, 12.70             | 18.10, 35.10              | No change, so neither browser is held back by the pixels it fills. Not kept: it would blur the view on high-DPI screens for nothing.                                                                  |
| Multisampling (`antialias`) off                                                              | 11.66, 12.82             | 17.80, 35.10              | No change. Not kept: edges would be jagged for nothing. It stays off where WebGL is drawn in software (#303).                                                                                         |
| Research Task cards not put back in their groups every frame                                 | 11.50, 12.84             | 17.70, 35.00              | No change. With every task completed, `src/ui/research-tasks.ts` re-appends all the cards every frame, but its screen is closed and so not laid out. Not kept; harmless to fix on its own.            |
| The held panel lines measured before the 3D view is drawn rather than after                  | 11.52, 12.84             | 17.90, 35.20              | No change, so the measuring isn't slow because it follows the WebGL drawing. Not kept.                                                                                                                |

None of these was kept. The time Chromium spends (see below) then pointed at the panels rather than the rendering, and holding the panel lines with a `ResizeObserver` was kept:

| Change                                                                                         | Firefox ms (median, p95) | Chromium ms (median, p95) | Verdict                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Held panel lines reported by a `ResizeObserver` rather than measured each frame (five repeats) | 11.62, 12.96             | 7.40, 8.30                | Kept. Chromium's frame falls by 58%, and its frames twice as long as the rest are gone; Firefox is unchanged. The lines hold still as before (`test/hold.test.ts` and the steady-panels end-to-end tests). |

The shadow map's size and type were then tried against that, three repeats each:

| Attempt                                                        | Firefox ms (median, p95) | Chromium ms (median, p95) | Verdict                                                                                                                                                              |
| -------------------------------------------------------------- | ------------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New baseline                                                   | 11.62, 12.96             | 7.40, 8.30                |                                                                                                                                                                      |
| Shadow map 1,024 px square rather than 2,048                   | 11.62, 12.90             | 7.40, 8.30                | No change, and the shadows would be coarser. Not kept.                                                                                                               |
| `BasicShadowMap` rather than `PCFShadowMap`, with no filtering | 11.60, 12.70             | 7.40, 8.20                | No change, and the shadows' edges would be hard and jagged. Not kept. With fewer pixels making no difference either, the GPU is not what limits either browser here. |

## Final numbers

Five repeats, at commit `60ed1d3`, in the same session as the baseline:

| Browser  | Scene        | Median ms (range)   | 95th percentile ms (range) | Median against the baseline |
| -------- | ------------ | ------------------- | -------------------------- | --------------------------- |
| Firefox  | `early-day`  | 3.66 (3.62–3.66)    | 4.32 (4.26–4.60)           | +3%, within noise           |
| Firefox  | `late-day`   | 11.62 (11.58–11.98) | 12.96 (12.74–13.18)        | unchanged                   |
| Firefox  | `late-night` | 11.16 (11.04–11.72) | 12.54 (12.20–12.90)        | unchanged                   |
| Chromium | `early-day`  | 2.10 (2.10–2.10)    | 2.50 (2.50–2.60)           | −5%                         |
| Chromium | `late-day`   | 7.40 (7.30–7.60)    | 8.30 (8.10–8.40)           | −58%                        |
| Chromium | `late-night` | 7.10 (7.00–7.10)    | 7.90 (7.90–7.90)           | −59%                        |

Chromium now draws every scene faster than Firefox, with frames as even. The screenshots of the Night and the low sun are the same before and after: the change is to the panels, not the rendering.

## Where Chromium's time goes

What the first attempts and these diagnostics showed on the late base, before the held lines were changed:

- **Chromium spends the frame on the main thread, not the GPU.** The game's animation frame callback took a median of 16 to 18 ms of Chromium's 17.8 ms frame, and about 11 ms of Firefox's 11.6 ms. Both browsers issue about 2,700 WebGL draw calls a frame there, against about 500 on the early base.
- **Most of it is measuring the held panel lines.** A CPU profile of Chromium put 46% of the main thread's time in `getClientRects`, called only by `src/ui/hold.ts`, which measures every panel line marked to hold its height, once a frame. With `holds.refresh()` taken out of the frame, Chromium drew the late base in 7.4 ms (p95 9.3 ms) and the Night in 7.0 ms (p95 8.8 ms), faster than Firefox's 11.2 ms, and its frames that took twice as long were gone; Firefox's times hardly moved, and the early base's not at all.
- **The cost is in the layout the measuring forces, not in the calls.** Measuring the 114 held lines on screen took 8.7 ms in Chromium, and again each time it was repeated with nothing changed between, against 0.05 ms in Firefox; each line on its own took at most 0.06 ms. The 74 held lines not on screen, in closed screens, cost nothing.
- **It isn't the panels writing the same values every frame.** The panels set `hidden`, `disabled`, `title` and classes to the values they already have thousands of times a second, and the Research Tasks screen re-appends its cards. Skipping every such write that changed nothing saved under 4% in Chromium.
- **Shadows cost Chromium little.** With the shadow map off, Chromium drew the late base in 15.0 ms and Firefox in 7.4 ms: the sun's shadow pass draws most models a second time, which costs Firefox about 4 ms and Chromium about 3 ms.

So `src/ui/hold.ts` no longer measures the held lines itself. A `ResizeObserver` reports a line's height once the browser has laid the page out for the frame, and before it paints, so a line that grows is held at its new height in the same frame, as before. A held line can't get shorter, so it is reported only when it grows or is hidden or shown, and a frame in which nothing changed measures nothing.
