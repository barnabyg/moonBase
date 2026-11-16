# AGENTS.md

## Verification

`npm run verify` runs every check, from the repository's root folder. While working, run one test file or test instead. `docs/verification.md` has the commands for both, and says what each check does.

The desktop app's end-to-end tests open real windows on the developer's screen. Unless a change touches the desktop app, hand it over after `npm run verify -- --project=chromium`, and leave those tests to CI. `docs/verification.md` says which changes touch it.

## Adding content

A new Structure, Plant, type of Expedition, Milestone or Act touches many files, some of which nothing checks. `docs/adding-content.md` has a checklist for each, and says when the catalogue's version is raised. Changing a number the catalogue already holds, as a rebalance does, breaks tests and end-to-end specs that quote it: its checklist, "Changing a number", says how to find them.

## Changing what the game does or says

`docs/rules.md` describes the game's rules and quotes the panels' words. A change to what the game does, or to what the player sees, updates the passage of `docs/rules.md` that describes it, in the same commit, and `GLOSSARY.md` for a new term. The file is long: find the passage by searching for the words or numbers that changed. Nothing checks it.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `barnabyg/moonBase`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
