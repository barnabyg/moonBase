# Moon Base

A browser-based 3D construction and management game about building a base at the lunar south pole, where nothing appears by magic. See [`GLOSSARY.md`](GLOSSARY.md) for the game's language and [`docs/adr/`](docs/adr/) for the design decisions.

Desktop Firefox is the only supported browser.

## Play it

You need [Node.js](https://nodejs.org/) 24 or later. In PowerShell, from the repository's root folder (the one containing `package.json`), run:

```powershell
npm.cmd ci && npm.cmd run dev
```

This installs the dependencies and starts the game. Open <http://localhost:5173> in Firefox. Stop it with `Ctrl+C`.

Add `?seed=<number>` to the address (for example <http://localhost:5173/?seed=42>) to replay a Campaign exactly; without it, every new Campaign gets a new seed.

## Verification

`npm run verify` is the single verification command. Run it from the repository's root folder. It changes nothing apart from the ignored `dist/`, `test-results/` and `playwright-report/` folders, and it stops at the first failing check. CI runs the same command (`.github/workflows/verify.yml`).

Before the first run on a machine, install Playwright's Firefox once:

```powershell
npx.cmd playwright install firefox
```

It runs these checks, in this order:

| #   | Check                                            | Script                             | Notes                                                                                                                                  |
| --- | ------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Formatting (Prettier)                            | `npm run format:check`             | `npm run format` fixes it.                                                                                                             |
| 2   | Lint and static bug analysis (typescript-eslint) | `npm run lint`                     | Type-aware `strictTypeChecked` rules, `--max-warnings 0`. These rules are the static bug analysis gate; no separate analyzer is added. |
| 3   | Type check (`tsc --noEmit`, strict)              | `npm run typecheck`                | Checks the whole project, then the simulation and data catalogue again with no DOM or Node types, so they stay headless (ADR-0003).    |
| 4   | Unit and scenario tests (Vitest)                 | `npm test`                         |                                                                                                                                        |
| 5   | End-to-end tests (Playwright, Firefox)           | `npm run test:e2e`                 | Starts the Vite dev server on port 4173.                                                                                               |
| 6   | Dependency audit and secret scan                 | `npm run audit`, `npm run secrets` | `npm audit` fails on any known vulnerability and needs network access. The secret scan uses secretlint's recommended rules.            |
| 7   | Production build (Vite)                          | `npm run build`                    | Any bundler warning fails the build.                                                                                                   |

Every check applies; none is skipped. Tool versions are pinned exactly in `package.json` (`.npmrc` sets `save-exact`), and the Node version for CI is in `.nvmrc`.

### Exceptions

- **Vite chunk size limit raised to 700 kB** (`vite.config.ts`, `build.chunkSizeWarningLimit`). Three.js alone is about 530 kB minified, and the single-page game needs all of it before it can draw, so code-splitting would not make anything load sooner. Review if the bundle grows past the limit or the game gains screens that could load on demand.
- **`@typescript-eslint/restrict-template-expressions` allows numbers** (`eslint.config.js`, option `allowNumber: true`; every other operand type stays forbidden). Numbers always print sensibly in template strings, and the game builds many labels and messages from them (clock times, ids, refusal reasons), so wrapping each one in `String()` would add noise without catching any bug. Review if the rule's defaults change or a number-formatting bug turns up in a template string.

## Project layout

- `src/simulation/`: the headless, deterministic game rules. Create a Campaign from a seed, advance it in fixed 1-game-minute ticks, and read immutable snapshots. It never imports the renderer or interface, and never reads the system clock or `Math.random`; lint rules and a separate type check enforce this.
- `src/catalogue/`: the typed data catalogue holding all content and tuning numbers.
- `src/game/`: the game loop, which turns real time into simulation ticks at the chosen speed.
- `src/render/`: the Three.js renderer, which only reads snapshots.
- `src/ui/`: the HTML interface, which reads snapshots and sends player choices.
- `test/`: Vitest scenario tests through the simulation interface; `test/scenario.ts` is the helper for writing them.
- `e2e/`: Playwright end-to-end tests in Firefox.
