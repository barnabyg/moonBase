# Moon Base

A browser-based 3D construction and management game about building a base at the lunar south pole, where nothing appears by magic. See the [spec](https://github.com/barnabyg/moonBase/issues/1) for what the game will be and its eight phases, [`GLOSSARY.md`](GLOSSARY.md) for the game's language and [`docs/adr/`](docs/adr/) for the design decisions.

Desktop Firefox is the only supported browser.

## Play it

You need [Node.js](https://nodejs.org/) 24 or later. Double-click `run.bat` in the repository's root folder (the one containing `package.json`), or run it from PowerShell in any folder:

```powershell
C:\docs\git\moonBase\run.bat
```

It installs or updates the dependencies when needed, starts the game at <http://localhost:5173> and opens it in Firefox (or your default browser if Firefox isn't installed in the usual place). Stop it by closing its window or pressing `Ctrl+C` in it.

Without the launcher, run `npm.cmd ci && npm.cmd run dev` from the repository's root folder and open <http://localhost:5173> in Firefox.

In the game, drag with the left mouse button to pan the camera, drag with the right button to rotate it, and use the wheel to zoom from the whole base map down to a close-up of the Robot. "Skip to next event" jumps straight to the next notable moment, such as Night falling, a Construction being commissioned or a warning; each one also appears in the notification list at the bottom right, which never pauses the game. To plan a Construction, pick a Structure in the build menu at the bottom left, move its translucent preview over the map and click to place it (right-click or Esc cancels); the Robot then carries it out by itself, and the Work panel at the top right shows each stage. For Site Preparation the Robot drives the excavator to the site and activates it, and the excavator grades the ground by itself while the Robot is free for other work. Every Construction after the first also has the Robot lay power cable from the nearest powered Structure (one on a network with a solar array or battery bank); only Structures joined by cable share power. If a Structure that uses power is left without any power source, for example when the solar array it was cabled from is dismantled or because it was built before there was one, the Robot lays it a new cable from the nearest powered Structure, in plan order, as soon as there is one. Solar arrays generate only in Daylight, battery banks store any surplus and cover any shortfall, and the status panel shows generation, use, stored energy and when stored power will run out. Light masts switch on by themselves at Night and light up the ground around them, drawing power only while they're on; they only help you see, as work carries on in the dark without them. The Robot works on Constructions and dismantling in the order you planned them. A Construction whose Components aren't in the cargo stock waits, with the reason shown in the Work panel, and the Robot gets on with the next one. "Cancel" in the Work panel removes an unfinished Construction at once and puts its unused Components (those not yet assembled) back in the cargo stock. "Dismantle" beside a commissioned Structure in the status panel has the Robot take it apart and carry its Components back to the Lander; a share of them, set in the data catalogue, is damaged beyond reuse. The Structure keeps working until the Robot starts taking it apart. The Mission Director starts aboard the Lander, and the starting cargo holds an inflatable Habitat kit: once the Habitat is commissioned, "Move in" beside it in the status panel moves the Mission Director in at once, for good, as long as the Habitat has power. The status panel then shows the Lander as free to fly, and the Habitat they live in can't be dismantled. The base starts with about 30 Earth Days of oxygen and water. The Lander keeps them safe indefinitely, but once the Mission Director lives in the Habitat they use some every Earth Day, and the status panel shows how much of each is left and when it will run out. Warnings come when 7, 3 and 1 Earth Days of a stock are left (the data catalogue sets these). If either runs out, the Mission Director dies at once and the Campaign is over: the game-over screen says how they died, and "Start a new Campaign" starts again from the landing (with the same seed, if the address gives one). The Habitat needs power too. When a power network can't cover everything, the Habitat is supplied first and the other Structures on it, such as Light Masts and battery banks, lose power before it does, always in the order they were commissioned. The Habitat only works with all the power it draws: if the network can cover just part of it, the Habitat has no power. While the Mission Director lives in the Habitat, the status panel shows when it will lose power, and warnings come 24, 6 and 1 hours before (the data catalogue sets these). If it loses power, the Mission Director dies at once; an unpowered Habitat with nobody in it kills nobody. With only the starting battery bank, the Habitat can't get through a whole Night. The Mission Director also absorbs a Radiation Dose: none aboard the Lander, and a steady rate in the Habitat while it has no shielding. The status panel shows the dose so far against the limit, how fast it is rising and when it will reach the limit; warnings come 7, 3 and 1 Earth Days before, and reaching the limit kills the Mission Director (the data catalogue sets the rates, the limit and the warnings).

Add `?seed=<number>` to the address (for example <http://localhost:5173/?seed=42>) to replay a Campaign exactly; without it, every new Campaign gets a new seed.

## Verification

`npm run verify` is the single verification command. Run it from the repository's root folder. It changes nothing apart from the ignored `dist/`, `test-results/` and `playwright-report/` folders, and it stops at the first failing check. CI runs the same command (`.github/workflows/verify.yml`) split across two parallel jobs: `npm run verify -- --skip-e2e` runs every check except the end-to-end tests, and `npm run verify -- --e2e-only` runs just those, so a failure in one job can be re-run on its own.

Before the first run on a machine, install Playwright's Firefox once:

```powershell
npx.cmd playwright install firefox
```

It runs these checks, in this order:

| #   | Check                                            | Script                             | Notes                                                                                                                                                                                                      |
| --- | ------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Formatting (Prettier)                            | `npm run format:check`             | `npm run format` fixes it.                                                                                                                                                                                 |
| 2   | Lint and static bug analysis (typescript-eslint) | `npm run lint`                     | Type-aware `strictTypeChecked` rules, `--max-warnings 0`. These rules are the static bug analysis gate; no separate analyzer is added.                                                                     |
| 3   | Type check (`tsc --noEmit`, strict)              | `npm run typecheck`                | Checks the whole project, then the simulation and data catalogue again with no DOM or Node types, so they stay headless (ADR-0003).                                                                        |
| 4   | Unit and scenario tests (Vitest)                 | `npm test`                         |                                                                                                                                                                                                            |
| 5   | End-to-end tests (Playwright, Firefox)           | `npm run test:e2e`                 | Starts the Vite dev server on port 4173. Firefox runs headless; set `PLAYWRIGHT_HEADED=1` to show its window, which CI does inside a virtual display because headless Firefox has no OpenGL without a GPU. |
| 6   | Dependency audit and secret scan                 | `npm run audit`, `npm run secrets` | `npm audit` fails on any known vulnerability and needs network access. The secret scan uses secretlint's recommended rules.                                                                                |
| 7   | Production build (Vite)                          | `npm run build`                    | Any bundler warning fails the build.                                                                                                                                                                       |

Every check applies; none is skipped. Tool versions are pinned exactly in `package.json` (`.npmrc` sets `save-exact`), and the Node version for CI is in `.nvmrc`.

### Exceptions

- **Vite chunk size limit raised to 700 kB** (`vite.config.ts`, `build.chunkSizeWarningLimit`). Three.js alone is about 530 kB minified, and the single-page game needs all of it before it can draw, so code-splitting would not make anything load sooner. Review if the bundle grows past the limit or the game gains screens that could load on demand.
- **`@typescript-eslint/restrict-template-expressions` allows numbers** (`eslint.config.js`, option `allowNumber: true`; every other operand type stays forbidden). Numbers always print sensibly in template strings, and the game builds many labels and messages from them (clock times, ids, refusal reasons), so wrapping each one in `String()` would add noise without catching any bug. Review if the rule's defaults change or a number-formatting bug turns up in a template string.

## Project layout

- `src/simulation/`: the headless, deterministic game rules. Create a Campaign from a seed, advance it in fixed 1-game-minute ticks, and read immutable snapshots. It never imports the renderer or interface, and never reads the system clock or `Math.random`; lint rules and a separate type check enforce this.
- `src/catalogue/`: the typed data catalogue holding all content and tuning numbers.
- `src/game/`: the game loop, which turns real time into simulation ticks at the chosen speed.
- `src/render/`: the Three.js renderer, which only reads snapshots and the data catalogue (for sizes and timings such as the Lander's footprint and the length of a Lunation, which it converts with the simulation's own `lunationMinutes`). It never changes simulation state.
- `src/ui/`: the HTML interface, which reads snapshots and sends player choices.
- `test/`: Vitest scenario tests through the simulation interface; `test/scenario.ts` is the helper for writing them.
- `e2e/`: Playwright end-to-end tests in Firefox.
- `.claude/launch.json`: tells the Claude desktop app how to start the dev server for its browser preview.
