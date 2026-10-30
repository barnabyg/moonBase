# Moon Base

A browser-based 3D construction and management game about building a base at the lunar south pole, where nothing appears by magic: everything is shipped from Earth or made on the Moon, and building takes real work and time. Desktop Firefox is the only supported browser.

## Play it

You need [Node.js](https://nodejs.org/) 24 or later. Double-click `run.bat` in the repository's root folder (the one containing `package.json`), or run it from PowerShell in any folder:

```powershell
C:\docs\git\moonBase\run.bat
```

It installs or updates the dependencies when needed, starts the game at <http://localhost:5173> and opens it in Firefox (or your default browser if Firefox isn't installed in the usual place). Stop it by closing its window or pressing `Ctrl+C` in it.

Without the launcher, run `npm.cmd ci && npm.cmd run dev` from the repository's root folder and open <http://localhost:5173> in Firefox.

Add `?seed=<number>` to the address (for example <http://localhost:5173/?seed=42>) to replay a Campaign exactly. "Save" in the top bar downloads the Campaign as a `.moonbase` file and "Load" carries on from one; nothing is kept in the browser, so an unsaved Campaign is lost when you close or reload the page.

The Milestones in the status panel guide you through the Campaign, each with a hint saying what to do next.

## Documentation

- [`docs/rules.md`](docs/rules.md): how the game works, system by system.
- [`GLOSSARY.md`](GLOSSARY.md): the game's language.
- [`docs/adr/`](docs/adr/): the design decisions.
- [`docs/reference-campaign.md`](docs/reference-campaign.md): the scripted playthrough the tests play, and how the data catalogue is balanced against it (`npm.cmd run reference-campaign` prints its timeline, `npm.cmd run pacing-report` how the numbers fit together, and `npm.cmd run long-game` how a longer Campaign holds up).
- [`docs/save-format.md`](docs/save-format.md): the `.moonbase` format and the rules for changing it.
- [`docs/verification.md`](docs/verification.md): the checks, test timeouts and exceptions.
- [`docs/trying-things.md`](docs/trying-things.md): starting the game in a prepared state to try a change by hand (`npm.cmd run try`).
- The [spec](https://github.com/barnabyg/moonBase/issues/1): what the game will be, and its eight phases.

## Verification

Before the first run on a machine, install Playwright's Firefox once with `npx.cmd playwright install firefox`. Then run every check (formatting, lint, type check, unit and end-to-end tests, audit and secret scan, production build) from the repository's root folder:

```powershell
npm.cmd run verify
```

## Project layout

- `src/simulation/`: the headless, deterministic game rules. Create a Campaign from a seed, advance it in fixed 1-game-minute ticks, and read immutable snapshots. It never imports the renderer or interface, and never reads the system clock or `Math.random`; lint rules and a separate type check enforce this.
- `src/catalogue/`: the typed data catalogue holding all content and tuning numbers, in a file for each domain (`site.ts`, `workers.ts`, `resources.ts`, `structures.ts`, `launch.ts`, `research.ts`, `hazards.ts`, `milestones.ts`), its types in `types.ts`, and `catalogue.ts` putting them together.
- `src/game/`: the game loop, which turns real time into simulation ticks at the chosen speed, and the Campaign slot and save files, which load a Campaign from a file in place of the one being played.
- `src/render/`: the Three.js renderer, which only reads snapshots and the data catalogue (for sizes and timings such as the Lander's footprint and the length of a Lunation, which it converts with the simulation's own `lunationMinutes`). It never changes simulation state.
- `src/ui/`: the HTML interface, which reads snapshots and sends player choices.
- `test/`: Vitest scenario tests through the simulation interface; `test/scenario.ts` is the helper for writing them, `test/reference-campaign.ts` is the reference Campaign, `test/pacing-report.ts` is the pacing report, `test/long-game.ts` is the long-game play guide, and `test/catalogue-rules.ts` holds the catalogue's consistency rules.
- `scripts/`: the verification command (`verify.mjs`), the reference Campaign's timeline (`reference-campaign.mjs`), the pacing report (`pacing-report.mjs`), the long-game play guide (`long-game.mjs`) and starting the game in a prepared state (`try.mjs`).
- `e2e/`: Playwright end-to-end tests in Firefox.
- `.claude/launch.json`: tells the Claude desktop app how to start the dev server for its browser preview.
