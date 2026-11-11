# Moon Base

A 3D construction and management game about building a base at the lunar south pole, where nothing appears by magic: everything is shipped from Earth or made on the Moon, and building takes real work and time. It is a desktop app for Windows, built with Electron ([ADR-0010](docs/adr/0010-electron-desktop-app-for-windows.md)); there is no browser version to play.

## Play it

You need Windows and [Node.js](https://nodejs.org/) 24 or later. From PowerShell, in the repository's root folder (the one containing `package.json`), install the dependencies and start the game:

```powershell
npm.cmd ci
npm.cmd run desktop
```

Or double-click `run.bat` in that folder, or run it from PowerShell in any folder, which installs or updates the dependencies when needed and then runs `npm.cmd run desktop`:

```powershell
C:\docs\git\moonBase\run.bat
```

Either compiles the desktop app's Electron code, starts the Vite dev server and opens the game from it in a Moon Base window, which reloads when you change the game. A change to `electron/` needs the command run again. Closing the window, or pressing `Ctrl+C` where you ran it, stops both.

The Milestones in the status panel guide you through the Campaign, each with a hint saying what to do next. "Save" in the top bar saves the Campaign as a `.moonbase` file where you choose, and "Load" carries on from one; nothing is saved by itself, and closing the window with unsaved progress asks whether to save first.

### The desktop app

To play the production build instead, which opens the built game from disk with no dev server:

```powershell
npm.cmd run build:desktop
npm.cmd run desktop:start
```

Run `build:desktop` again after changing the game or `electron/`, as `desktop:start` only opens what was built last.

`npm.cmd run dev` still serves the game at <http://localhost:5173>, for development and for the end-to-end tests, which open it in Chromium; add `?seed=<number>` to the address to replay a Campaign exactly. It is a development and test path, not a supported way to play.

F11, or the Full screen button in the top bar, fills the screen with the game, and either again goes back to a window; Esc doesn't leave fullscreen. The window opens next time at the size and place you left it, maximised or in fullscreen if it was. Closing it, or quitting, with unsaved progress asks whether to save first. Starting it again while it runs brings the running game to the front. Developer tools are there only in `npm.cmd run desktop`, with F12 or Ctrl+Shift+I, and so is reloading the page, with F5 or Ctrl+R, as the window has no menu bar.

To build the Windows installer, `release\Moon-Base-Setup-<version>.exe`, which installs the game for the current user with a Start menu entry:

```powershell
npm.cmd run package:win
```

[`docs/desktop-release.md`](docs/desktop-release.md) says what it installs, what uninstalling leaves, and how to test it. CI builds it on every push to `main`.

## Documentation

- [`docs/rules.md`](docs/rules.md): how the game works, system by system.
- [`GLOSSARY.md`](GLOSSARY.md): the game's language.
- [`docs/adr/`](docs/adr/): the design decisions.
- [`docs/balancing.md`](docs/balancing.md): how the data catalogue is balanced, with the targets, the Acts, the decisions behind them, the latest long-game play and the catalogue's consistency rules.
- [`docs/balancing-history.md`](docs/balancing-history.md): what the long-game play guide played at each earlier data catalogue version, and what the maintainer's playtests found, and how the catalogue's version was raised before its rule.
- [`docs/reference-campaign.md`](docs/reference-campaign.md): the scripted playthroughs and how to run them (`npm.cmd run reference-campaign` prints the timeline of the one the tests play, `npm.cmd run pacing-report` how the numbers fit together, and `npm.cmd run long-game` how a longer Campaign holds up).
- [`docs/adding-content.md`](docs/adding-content.md): the checklists for adding a Structure, a Plant, a type of Expedition, a Milestone or an Act, and when the catalogue's version is raised.
- [`docs/save-format.md`](docs/save-format.md): the `.moonbase` format and the rules for changing it.
- [`docs/desktop-release.md`](docs/desktop-release.md): building and testing the desktop app's Windows installer (`npm.cmd run package:win`), and what it installs.
- [`docs/verification.md`](docs/verification.md): the checks, test timeouts and exceptions.
- [`docs/verification-history.md`](docs/verification-history.md): the investigations and CI runs behind its limits.
- [`docs/trying-things.md`](docs/trying-things.md): starting the game in a prepared state to try a change by hand (`npm.cmd run try`).
- [`docs/rendering-performance.md`](docs/rendering-performance.md): how long a frame takes to draw in Chromium, the desktop app's engine, what was tried to speed it up, and where its time goes (`npm.cmd run frame-time` measures it).
- The [spec](https://github.com/barnabyg/moonBase/issues/1): what the game will be, and its eight phases.

## Verification

Before the first run on a machine, install Playwright's Chromium once with `npx.cmd playwright install chromium`. Then run every check (formatting, lint, type check, unit tests, end-to-end tests in Chromium against the dev server and against the desktop app's build, audit and secret scan, production build) from the repository's root folder:

```powershell
npm.cmd run verify
```

## Project layout

- `src/simulation/`: the headless, deterministic game rules. Create a Campaign from a seed, advance it in fixed 1-game-minute ticks, and read immutable snapshots. It never imports the renderer or interface, and never reads the system clock or `Math.random`; lint rules and a separate type check enforce this.
- `src/catalogue/`: the typed data catalogue holding all content and tuning numbers, in a file for each domain (`site.ts`, `workers.ts`, `resources.ts`, `structures.ts` putting together the Structures from a file for each group of the Base panel (`structures-habitats.ts`, `structures-power.ts`, `structures-lights.ts`, `structures-landing-and-parking.ts`, `structures-life-support.ts`, `structures-industry-refining.ts`, `structures-industry-fabrication.ts`, `structures-tanks.ts`, `structures-science.ts`), `solar-arrays.ts`, `launch.ts`, `research.ts`, `hazards.ts`, `milestones.ts`), with `recipes.ts` to read Plants' recipes and `labels.ts` for names in a sentence, its types in `types.ts`, and `catalogue.ts` putting them together, exported through `index.ts`.
- `src/game/`: the game loop, which turns real time into simulation ticks at the chosen speed, and the Campaign slot and save files, which load a Campaign from a file in place of the one being played.
- `src/render/`: the Three.js renderer, which only reads snapshots and the data catalogue (for sizes and timings such as the Lander's footprint and the length of a Lunation, which it converts with the simulation's own `lunationMinutes`). It never changes simulation state.
- `src/ui/`: the HTML interface, which reads snapshots and sends player choices.
- `electron/`: the desktop app's Electron main process and preload script, in strict TypeScript with its own `tsconfig.json` (Node types, no DOM), compiled to the ignored `dist-electron/`. `main.ts` starts the app; `window.ts` and `window-options.ts` open the game's window, and `window-state.ts` and `window-state-file.ts` put it back where the player left it; `full-screen.ts` toggles fullscreen on F11 and for the top bar's button; `close-window.ts` and `close-prompt.ts` ask before closing with unsaved progress; `security.ts` holds the Content Security Policy and stops the page navigating away, opening windows or getting permissions; `app-protocol.ts` and `app-files.ts` serve the production build from `dist/` at `app://moonbase/`; `preload.cts` exposes the page's narrow bridge to the main process, typed in `desktop-bridge.ts`.
- `test/`: Vitest scenario tests through the simulation interface; `test/scenario.ts` is the helper for writing them, `test/reference-campaign.ts` is the reference Campaign, `test/pacing-report.ts` is the pacing report, `test/long-game.ts` is the long-game play guide, `test/catalogue-rules.ts` holds the catalogue's consistency rules, the `test/catalogue-*.test.ts` files test the catalogue with a file for each domain (and `test/catalogue-*-designs.test.ts` for the later Designs) sharing `test/catalogue-helpers.ts`, and the `test/sample-saves-*.test.ts` files test the old saves in `test/saves/`, sharing `test/sample-saves.ts`.
- `scripts/`: the verification command (`verify.mjs`), the reference Campaign's timeline (`reference-campaign.mjs`), the pacing report (`pacing-report.mjs`), the long-game play guide (`long-game.mjs`), starting the game in a prepared state (`try.mjs`), playing it in the desktop app during development (`desktop.mjs`, with `desktop-launcher.mjs`, which `try.mjs` shares), drawing the desktop app's icon (`make-icon.mjs`) and measuring how long a frame takes to draw (`frame-time.mjs`).
- `e2e/`: Playwright end-to-end tests, run in Chromium against the dev server as a quick stand-in for the desktop app's window. Those in `e2e/desktop/` launch the desktop app's production build instead (`npm.cmd run test:desktop`), with their fixtures in `fixtures.ts`, and the one in `e2e/packaged/` launches the packaged app that `npm.cmd run package:win` builds.
- `assets/`: the desktop app's icon (`assets/icon/`, drawn by `scripts/make-icon.mjs`) and the installer's NSIS script (`assets/installer/installer.nsh`).
- `.claude/launch.json`: tells the Claude desktop app how to start the dev server for its browser preview.
