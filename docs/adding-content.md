# Adding content

A new Structure, Plant, Milestone or Act reaches about 30 files, and the type check and tests only find some of them. These checklists come from the commits that added a Workshop (`5a81a54`), a Buried Habitat (`2b5bf20`) and Act 2 (`ce8bc96`), which are worked examples of each item. Not every item applies to every addition.

Where an item names a test, that test fails if you forget. "Nothing catches it" means no check will remind you.

## A Structure

Data catalogue:

- `src/catalogue/structures.ts`: the Structure type. The catalogue tests check it can be constructed.
- `src/catalogue/resources.ts` and `launch.ts`: its Components, and a Launch item for each. The catalogue tests fail a Component with no Launch item, and a Structure whose Components a Launch can't bring. A new Launch item can leave `e2e/launch-manifest.spec.ts` searching for a made-up part that no longer exists: lower its number.
- `src/catalogue/research.ts`: its Design, and Research Tasks that pay for it. The catalogue tests fail a Structure with no Design, a Design that permits nothing, and Research Tasks that pay too little. Those that count a category's Designs need the new count.
- `src/catalogue/types.ts`: any new field, with anything new to export in `index.ts`. The type check catches a use of what is missing.
- `src/catalogue/catalogue.ts`: raise `version` ([see below](#the-catalogues-version)). Nothing catches it.

Rules and model:

- `src/simulation/`: anything it does that no Structure did before, such as a Buried Habitat's dose rate in `radiation.ts`. Nothing catches it but the tests you write.
- `src/render/`: a model, in a file of its own or beside its kind, and a case for it in `createStructureModel` in `models.ts`. Nothing catches it: an id it doesn't know is drawn as a solar array. `test/buried-habitat-model.test.ts` shows how to test one.

Words for the player:

- `src/ui/describe.ts`: a line in `describeStructure` for any new field. The Guide's cards for Structures and Components are built from this and the catalogue. Nothing catches it.
- `src/ui/guide.ts`: the Guide's topics, where it changes how to play. Nothing catches it.
- `src/ui/structure-state.ts` and `structure-details.ts`: what the Base panel and pop-up say of its state. Nothing catches it.
- `inSentence` in `src/catalogue/labels.ts`, which `src/ui/labels.ts` passes on: add a name `GLOSSARY.md` always capitalises, or it comes out in lower case. `test/labels-in-sentence.test.ts` only knows the names already there, so nothing catches a new one. `build-menu.ts`, `construction-panel-text.ts` and others use it, so don't lowercase a label by hand.
- `src/ui/base-panel-text.ts`, `construction-panel-text.ts`, `status-panel-text.ts` and `notifications-text.ts`: any sentence it makes untrue, as "Ship more on the Launch manifest" gained "or make them in a Workshop". Search for it, as nothing catches it. The type check does catch a new kind of event with no words in `formatEvent`.

Trying and playing it:

- `test/try-scenarios.ts`: a scenario, its test in `test/try-scenarios.test.ts`, and a row in the table in [`docs/trying-things.md`](trying-things.md). Nothing catches it.
- `test/long-game.ts`: steps that build it, with its Design in `designsTheLongGameUses`. The `design-has-a-purpose` rule in `test/catalogue-rules.test.ts` fails a Design the long game doesn't use and that offers no choice, unless it has a reason on the exemption list in `test/catalogue-rules.ts`.
- `test/pacing-report.ts`: in `offerings`, what it does better, as the Buried Habitat's `buried` is. Without it, the `design-not-beaten` rule fails a dear Structure that looks no better than a cheap one.
- `test/reference-campaign.ts`: keep its play the same (the long game plays it first, so a step may have to allow for what comes later), and add to its recorder whatever the long game has to report. `test/reference-campaign.test.ts` fails if a pacing target slips.
- Play the long game by hand, as `npm run verify` doesn't, and record what changes in [`docs/balancing.md`](balancing.md). If it takes much longer, raise `HARD_LIMIT_MINUTES` in `scripts/long-game.mjs`.

```powershell
npm.cmd run long-game
```

Tests and docs:

- `test/<name>.test.ts` and `e2e/<name>.spec.ts`: its whole path, from unlocking the Design to using it. Nothing catches their absence. Existing tests that build a Snapshot by hand, or filter a category's Structures, may need it too.
- `GLOSSARY.md`, [`docs/rules.md`](rules.md), and [`docs/reference-campaign.md`](reference-campaign.md) if a play guide changed. Nothing catches them.
- [`docs/save-format.md`](save-format.md) says whether the save format changes: new Components and bulk resources don't, and new saved state does.

## A Plant

Everything for a Structure, and:

- `recipes` on its Structure type in `src/catalogue/structures.ts`, using `src/catalogue/recipes.ts` to read them. The catalogue tests run every Plant through the same checks of its recipes, power and Components.
- `src/catalogue/resources.ts`: any new bulk resource or Export. The `bulk-resource-has-a-use` and `export-can-be-sold` rules fail one that nothing takes in or makes.
- `PLANT_SHAPES` in `src/render/plant-models.ts`: its shape, instead of a case in `createStructureModel`. Nothing catches it: without one it is drawn as a solar array.
- `src/simulation/plants.ts`: a recipe that works differently, such as making Components (`componentsPerHour`).
- The forecasts, if it makes something they count: `src/simulation/spare-forecast.ts`, `bulk-forecast.ts`, `life-support.ts` or `self-sufficiency.ts`, and what `src/ui/status-panel-text.ts` says of them. Nothing catches it: the forecast just goes on ignoring the Plant.
- `describeRecipeFlows` in `src/ui/describe.ts` and `formatPlantRates` in `src/ui/structure-state.ts`, if its recipe has a new shape. The type check only catches a change to a type they read.

## A Milestone or an Act

Data catalogue:

- `src/catalogue/milestones.ts`: the Milestone, in order, with its Act, label, hint and condition, and any new Act in `acts`. The catalogue tests check their order, that every Act holds a Milestone, and that hints are one line. One of them, and `test/reference-campaign.test.ts`, pin Act 1's nine.
- `src/catalogue/catalogue.ts`: raise `version` ([see below](#the-catalogues-version)). Nothing catches it.
- `src/catalogue/research.ts`, `structures.ts` and the rest: what the Act needs, each by the checklists above. The Act 2 commit shows the whole of it.

Rules and words:

- `MilestoneCondition` in `src/catalogue/types.ts` and `holds` in `src/simulation/milestones.ts`, for a new kind of condition. The type check fails a kind `holds` doesn't handle.
- An Act's start needs no code: `act-started` and its notification, and the status panel's lines, work from the data.
- `src/ui/status-panel-text.ts` and `status-panel.ts`: a way to see progress towards the condition, if it takes more than one step. `src/ui/guide.ts`, where it changes how to play. Nothing catches them.
- [`docs/save-format.md`](save-format.md): the Act comes from the Milestones reached, so neither a Milestone nor an Act changes the format, but a condition on something the base never kept does. Say there how older saves load, and add a sample save test.

Trying and playing it:

- `test/try-scenarios.ts`: an `act-<n>` scenario for a new Act, with its test and its row in [`docs/trying-things.md`](trying-things.md). Nothing catches it.
- `test/long-game.ts`: steps that reach it, and for a new Act its targets and a check of them, as `act2Targets` and `act2TargetsMissed` are, tested in `test/long-game.test.ts`. Nothing fails a Milestone the play guide never reaches, unless you add it.
- `test/pacing-report.ts` and its test: the Act's Science and Funding.
- `test/reference-campaign.ts`: only for a Milestone in Act 1. It stops there, and its timeline shows a later Act's Milestones only once reached.
- Play the long game by hand (see above), as nothing else does.

Tests and docs:

- `test/<name>.test.ts`, and `e2e/<name>.spec.ts` for a new Act. `e2e/milestones-acts.spec.ts` names the last Act, so a new one fails it. `test/with-acts.ts` tries several Acts with made-up ones and needs no change.
- `GLOSSARY.md` (the Act entry says which Acts are in the game), [`docs/rules.md`](rules.md), and the Act's row and pacing targets in [`docs/balancing.md`](balancing.md). Nothing catches them.

## The catalogue's version

`version` in `src/catalogue/catalogue.ts` is a label, with no written rule behind it until now. No game code reads it. The reference Campaign's timeline and the pacing report print it, and a catalogue test checks that it is a whole number from 1 up, so nothing fails if you forget. It isn't in a save, whose format has its own version.

What the history shows, with version 65 reached one step at a time:

- Each ticket that adds content raises it by one in the commit that changes the catalogue, as all three above did.
- So do changes to numbers or to the words alone: `b5ca87a` changed one Milestone's hint, and `79fe87b` was for descriptions.
- A change to code beside the catalogue, with no data changed, leaves it alone (`174b24a`).
- When two branches took the same number, a later commit raised it again for the two together (`9346be9`).

So raise it by one when a change alters what the catalogue holds. That has been the usual practice rather than a rule that always held: pull requests #107 and #108 changed digging's numbers and removed a Design with no raise, and within a branch that has raised it, later commits sometimes haven't (`8c44cb2` added six Milestones).

The docs quote the version a figure was measured at, so change the number there only when you measure again: `docs/reference-campaign.md` still quotes version 61 for a long-game figure.
