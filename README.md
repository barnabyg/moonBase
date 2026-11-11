# Moon Base

A browser-based 3D construction and management game about building a base at the lunar south pole, where nothing appears by magic: everything is shipped from Earth or made on the Moon, and building takes real work and time. Desktop Firefox is the only supported browser for now; the game is becoming a desktop app for Windows, built with Electron, and the browser version will be dropped once it works ([ADR-0010](docs/adr/0010-electron-desktop-app-for-windows.md)).

## Play it

You need [Node.js](https://nodejs.org/) 24 or later. Double-click `run.bat` in the repository's root folder (the one containing `package.json`), or run it from PowerShell in any folder:

```powershell
C:\docs\git\moonBase\run.bat
```

It installs or updates the dependencies when needed, starts the game at <http://localhost:5173> and opens it in Firefox (or your default browser if Firefox isn't installed in the usual place). Stop it by closing its window or pressing `Ctrl+C` in it.

Without the launcher, run `npm.cmd ci && npm.cmd run dev` from the repository's root folder and open <http://localhost:5173> in Firefox.

Add `?seed=<number>` to the address (for example <http://localhost:5173/?seed=42>) to replay a Campaign exactly. "Save" in the top bar downloads the Campaign as a `.moonbase` file and "Load" carries on from one; nothing is kept in the browser, so an unsaved Campaign is lost when you close or reload the page.

The Milestones in the status panel guide you through the Campaign, each with a hint saying what to do next.

### In the desktop app

The desktop app (Windows only) is being built. To play it while developing, run this from the repository's root folder:

```powershell
npm.cmd ci
npm.cmd run desktop
```

It starts the Vite dev server and opens the game from it in an Electron window, which reloads when you change the game, as the browser does. A change to `electron/` needs the command run again. Closing the window, or pressing `Ctrl+C` where you ran it, stops both.

To play the production build instead, which opens the built game from disk with no dev server:

```powershell
npm.cmd run build:desktop
npm.cmd run desktop:start
```

Run `build:desktop` again after changing the game or `electron/`, as `desktop:start` only opens what was built last.

F11, or the Full screen button in the top bar, fills the screen with the game, and either again goes back to a window; Esc doesn't leave fullscreen. The window opens next time at the size and place you left it, maximised or in fullscreen if it was.

## Documentation

- [`docs/rules.md`](docs/rules.md): how the game works, system by system.
- [`GLOSSARY.md`](GLOSSARY.md): the game's language.
- [`docs/adr/`](docs/adr/): the design decisions.
- [`docs/balancing.md`](docs/balancing.md): how the data catalogue is balanced, with the targets, the Acts, the decisions behind them, the latest long-game play and the catalogue's consistency rules.
- [`docs/balancing-history.md`](docs/balancing-history.md): what the long-game play guide played at each earlier data catalogue version, and what the maintainer's playtests found, and how the catalogue's version was raised before its rule.
- [`docs/reference-campaign.md`](docs/reference-campaign.md): the scripted playthroughs and how to run them (`npm.cmd run reference-campaign` prints the timeline of the one the tests play, `npm.cmd run pacing-report` how the numbers fit together, and `npm.cmd run long-game` how a longer Campaign holds up).
- [`docs/adding-content.md`](docs/adding-content.md): the checklists for adding a Structure, a Plant, a type of Expedition, a Milestone or an Act, and when the catalogue's version is raised.
- [`docs/save-format.md`](docs/save-format.md): the `.moonbase` format and the rules for changing it.
- [`docs/verification.md`](docs/verification.md): the checks, test timeouts and exceptions.
- [`docs/verification-history.md`](docs/verification-history.md): the investigations and CI runs behind its limits.
- [`docs/trying-things.md`](docs/trying-things.md): starting the game in a prepared state to try a change by hand (`npm.cmd run try`).
- [`docs/rendering-performance.md`](docs/rendering-performance.md): how long a frame takes to draw in Firefox and Chromium, what was tried to speed Chromium up, and where its time goes (`npm.cmd run frame-time` measures it).
- The [spec](https://github.com/barnabyg/moonBase/issues/1): what the game will be, and its eight phases.

## Verification

Before the first run on a machine, install Playwright's Firefox and Chromium once with `npx.cmd playwright install firefox chromium`. Then run every check (formatting, lint, type check, unit tests, end-to-end tests in both browsers and against the desktop app's build, audit and secret scan, production build) from the repository's root folder:

```powershell
npm.cmd run verify
```

## Project layout

- `src/simulation/`: the headless, deterministic game rules. Create a Campaign from a seed, advance it in fixed 1-game-minute ticks, and read immutable snapshots. It never imports the renderer or interface, and never reads the system clock or `Math.random`; lint rules and a separate type check enforce this.
- `src/catalogue/`: the typed data catalogue holding all content and tuning numbers, in a file for each domain (`site.ts`, `workers.ts`, `resources.ts`, `structures.ts` putting together the Structures from a file for each group of the Base panel (`structures-habitats.ts`, `structures-power.ts`, `structures-lights.ts`, `structures-landing-and-parking.ts`, `structures-life-support.ts`, `structures-industry-refining.ts`, `structures-industry-fabrication.ts`, `structures-tanks.ts`, `structures-science.ts`), `solar-arrays.ts`, `launch.ts`, `research.ts`, `hazards.ts`, `milestones.ts`), with `recipes.ts` to read Plants' recipes and `labels.ts` for names in a sentence, its types in `types.ts`, and `catalogue.ts` putting them together, exported through `index.ts`.
- `src/game/`: the game loop, which turns real time into simulation ticks at the chosen speed, and the Campaign slot and save files, which load a Campaign from a file in place of the one being played.
- `src/render/`: the Three.js renderer, which only reads snapshots and the data catalogue (for sizes and timings such as the Lander's footprint and the length of a Lunation, which it converts with the simulation's own `lunationMinutes`). It never changes simulation state.
- `src/ui/`: the HTML interface, which reads snapshots and sends player choices.
- `electron/`: the desktop app's Electron main process and preload script, in strict TypeScript with its own `tsconfig.json` (Node types, no DOM), compiled to the ignored `dist-electron/`. `main.ts` starts the app; `window.ts` and `window-options.ts` open the game's window, and `window-state.ts` and `window-state-file.ts` put it back where the player left it; `full-screen.ts` toggles fullscreen on F11 and for the top bar's button; `security.ts` holds the Content Security Policy and stops the page navigating away, opening windows or getting permissions; `app-protocol.ts` and `app-files.ts` serve the production build from `dist/` at `app://moonbase/`; `preload.cts` exposes the page's narrow bridge to the main process, typed in `desktop-bridge.ts`.
- `test/`: Vitest scenario tests through the simulation interface; `test/scenario.ts` is the helper for writing them, `test/reference-campaign.ts` is the reference Campaign, `test/pacing-report.ts` is the pacing report, `test/long-game.ts` is the long-game play guide, `test/catalogue-rules.ts` holds the catalogue's consistency rules, the `test/catalogue-*.test.ts` files test the catalogue with a file for each domain (and `test/catalogue-*-designs.test.ts` for the later Designs) sharing `test/catalogue-helpers.ts`, and the `test/sample-saves-*.test.ts` files test the old saves in `test/saves/`, sharing `test/sample-saves.ts`.
- `scripts/`: the verification command (`verify.mjs`), the reference Campaign's timeline (`reference-campaign.mjs`), the pacing report (`pacing-report.mjs`), the long-game play guide (`long-game.mjs`), starting the game in a prepared state (`try.mjs`), playing it in the desktop app during development (`desktop.mjs`) and measuring how long a frame takes to draw (`frame-time.mjs`).
- `e2e/`: Playwright end-to-end tests, run in both Firefox and Chromium. Those in `e2e/desktop/` launch the desktop app's production build instead (`npm.cmd run test:desktop`), with their fixtures in `fixtures.ts`.
- `.claude/launch.json`: tells the Claude desktop app how to start the dev server for its browser preview.
