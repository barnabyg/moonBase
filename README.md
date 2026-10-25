# Moon Base

A browser-based 3D construction and management game about building a base at the lunar south pole, where nothing appears by magic. See [`GLOSSARY.md`](GLOSSARY.md) for the game's language and [`docs/adr/`](docs/adr/) for the design decisions.

Desktop Firefox is the only supported browser.

## Play it

You need [Node.js](https://nodejs.org/) 24 or later. Double-click `run.bat` in the repository's root folder (the one containing `package.json`), or run it from PowerShell in any folder:

```powershell
C:\docs\git\moonBase\run.bat
```

It installs or updates the dependencies when needed, starts the game at <http://localhost:5173> and opens it in Firefox (or your default browser if Firefox isn't installed in the usual place). Stop it by closing its window or pressing `Ctrl+C` in it.

Without the launcher, run `npm.cmd ci && npm.cmd run dev` from the repository's root folder and open <http://localhost:5173> in Firefox.

In the game, drag with the left mouse button to pan the camera, drag with the right button to rotate it, and use the wheel to zoom from the whole base map down to a close-up of the Robot. "Skip to next event" jumps straight to the next notable moment, such as Night falling or a Construction being commissioned. To plan a Construction, pick a Structure in the build menu at the bottom left, move its translucent preview over the map and click to place it (right-click or Esc cancels); the Robot then carries it out by itself, and the Construction panel at the top right shows each stage.

Add `?seed=<number>` to the address (for example <http://localhost:5173/?seed=42>) to replay a Campaign exactly; without it, every new Campaign gets a new seed.

## Verification

`npm run verify` is the single verification command. Run it from the repository's root folder. It changes nothing apart from the ignored `dist/`, `test-results/` and `playwright-report/` folders, and it stops at the first failing check. CI runs the same command (`.github/workflows/verify.yml`).

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
- `src/render/`: the Three.js renderer, which only reads snapshots and the data catalogue (for sizes such as the Lander's footprint). It never changes simulation state.
- `src/ui/`: the HTML interface, which reads snapshots and sends player choices.
- `test/`: Vitest scenario tests through the simulation interface; `test/scenario.ts` is the helper for writing them.
- `e2e/`: Playwright end-to-end tests in Firefox.
