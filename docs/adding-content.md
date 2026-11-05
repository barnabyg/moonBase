# Adding content

A new Structure, Plant, Milestone or Act reaches about 30 files, and the type check and tests only find some of them. These checklists come from the commits that added a Workshop (`5a81a54`), a Buried Habitat (`2b5bf20`) and Act 2 (`ce8bc96`), which are worked examples of each item. Not every item applies to every addition.

Where an item names a test, that test fails if you forget. "Nothing catches it" means no check will remind you.

## A Structure

Data catalogue:

- `src/catalogue/structures-*.ts`: the Structure type, in the file of its `listGroup`, one of `structures-habitats.ts`, `structures-power.ts`, `structures-lights.ts`, `structures-landing-and-parking.ts`, `structures-life-support.ts`, `structures-industry-refining.ts`, `structures-industry-fabrication.ts`, `structures-tanks.ts` and `structures-science.ts`, and in the list in `src/catalogue/structures.ts`, whose order is the order each group of the Base panel lists its Structures in. The catalogue tests fail one in the wrong group's file or missing from that list, and check it can be constructed. Its `listGroup` says which group of the Base panel's Structures list it goes in, by what it is for. The type check fails a Structure type without one. A new group needs a place in `structureListGroups` and in the `StructureListGroup` type, and a Habitat's shielding, water wall or vault cistern goes in the Habitats group, as the catalogue tests check.
- `src/catalogue/resources.ts` and `launch.ts`: its Components, and a Launch item for each. The catalogue tests fail a Component with no Launch item, and a Structure whose Components a Launch can't bring. A new Launch item can leave `e2e/launch-manifest.spec.ts` searching for a made-up part that no longer exists: lower its number.
- `src/catalogue/research.ts`: its Design, and Research Tasks that pay for it. The catalogue tests fail a Structure with no Design, a Design that permits nothing, and Research Tasks that pay too little. Those that count a category's Designs need the new count. The `research-fits-the-campaign` rule in `test/catalogue-rules.test.ts` fails Research Tasks that can't finish by Earth Day 3,000: take their time from the longest.
- `dismantlingSpareComponents` on the Structure type: how many spare Components dismantling it gives back. The comment at the top of `structures.ts` says how the values were chosen, from its Assembly hours. The type check fails a Structure type without one, and the catalogue tests fail one made from Regolith alone that gives any back, and one that costs less on a Launch than the spares it gives back.
- `src/catalogue/types.ts`: any new field, with anything new to export in `index.ts`. The type check catches a use of what is missing.
- `src/catalogue/catalogue.ts`: raise `version` ([see below](#the-catalogues-version)). Nothing catches it.

Rules and model:

- A storage tank needs no code: `storageTank` and `power.nightUpkeepKilowatts` on its Structure type say what it holds and draws, and `STORAGE_TANK_SHAPES` in `src/render/storage-tank-models.ts` gives it a shape in place of a case in `createStructureModel`. `src/simulation/storage-limits.ts` raises the limit of whatever `ResourceRef` it names, so long as that resource has a limit to raise: a life support stock always has, as does the bulk resource the excavator digs (the heap's `digging.fullKilograms`), and any other bulk resource has if some Structure type's `ownStorage` names it, as the propellant plants' does. A tank whose contents keep without power, as a Regolith bin's, has no `nightUpkeepKilowatts` and a `shareLostPerEarthDayWithoutPower` of 0, and takes no cable.
- `src/simulation/`: anything it does that no Structure did before, such as a Buried Habitat's dose rate in `radiation.ts`. Nothing catches it but the tests you write.
- `src/render/`: a model, in a file of its own or beside its kind, and a case for it in `createStructureModel` in `models.ts`. Nothing catches it: an id it doesn't know is drawn as a solar array. `test/buried-habitat-model.test.ts` shows how to test one.

A new upgrade to solar arrays goes in the tables of `src/catalogue/solar-arrays.ts`, not in a Structure of its own: its kinds are made from its parts, and each kind, part and Launch item comes from there. An upgrade changes nothing that exists, only what is on sale (`retiredByDesignIds`).

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
- Open the pull request and let CI play the long game ([when it plays](reference-campaign.md#ci-plays-it), and [what to run first](reference-campaign.md#before-ci-plays-it)). From the timeline in the run's summary, put the new figures in [`docs/balancing.md`](balancing.md) in place of the latest play's, each naming its version, and move the replaced play unedited to [`docs/balancing-history.md`](balancing-history.md) under a heading naming its version, so that `docs/balancing.md` doesn't grow with each play. If it takes much longer than it did, raise `HARD_LIMIT_MINUTES` in `scripts/long-game.mjs` and the job's limit in `.github/workflows/long-game.yml`.

Tests and docs:

- `test/<name>.test.ts` and `e2e/<name>.spec.ts`: its whole path, from unlocking the Design to using it. Nothing catches their absence. The spec finds its entry in the Base panel with `structureEntry` from `e2e/base-panel.ts`, not a locator of its own. Existing tests that build a Snapshot by hand, or filter a category's Structures, may need it too.
- `GLOSSARY.md`, [`docs/rules.md`](rules.md), and [`docs/reference-campaign.md`](reference-campaign.md) if the reference Campaign's play guide changed, or what either guide prints. The long-game guide's steps are only in `test/long-game.ts`. Nothing catches them.
- [`docs/save-format.md`](save-format.md) says whether the save format changes: new Components and bulk resources don't, and new saved state does.

## A Plant

Everything for a Structure, and:

- `recipes` on its Structure type in its `src/catalogue/structures-*.ts` file, usually `structures-industry-refining.ts`, `structures-industry-fabrication.ts` or `structures-life-support.ts`, using `src/catalogue/recipes.ts` to read them. The catalogue tests run every Plant through the same checks of its recipes, power and Components.
- `src/catalogue/resources.ts`: any new bulk resource or Export. The `bulk-resource-has-a-use` and `export-can-be-sold` rules fail one that nothing takes in or makes.
- `PLANT_SHAPES` in `src/render/plant-models.ts`: its shape, instead of a case in `createStructureModel`, unless it needs a model no shape can draw, as a Greenhouse's lit dome does. Keep its vessels, and fixtures such as gas bottles or a radiator, on the plinth. A new kind of vessel goes in `src/render/plant-vessels.ts`: a kind in `PlantVessel`, and its drawing in `VESSEL_DRAWINGS`, which the type check asks for. `test/plant-models.test.ts` checks that every Plant's model stays within its footprint, but not that it stays on its plinth. The one exception is a `haulLine`, as the cold-trap ice line's: scenery drawn in a group named `HAUL_LINE_NAME`, which runs out beyond the footprint without taking the ground it crosses, and which that check leaves out. Its `heading` is the one place its direction is set. Nothing catches a missing shape: without either it is drawn as a solar array.
- `src/simulation/plants.ts`: a recipe that works differently, such as making Components (`componentsPerHour`).
- The forecasts, if it makes or uses something they count: `src/simulation/spare-forecast.ts`, `bulk-forecast.ts`, `life-support.ts` or `self-sufficiency.ts`, and what `src/ui/status-panel-text.ts` says of them. A recipe that takes a life support stock leaves the reserve, and is counted by the forecast, with no more code; anything else that takes one, which isn't a Plant's recipe, should ask `life-support-reserve.ts` what it may take. A recipe that makes a stock with a limit waits or discards with no more code, and anything else that adds to one, or adds to how much it holds, goes through `storage-limits.ts`. Nothing catches it: the forecast just goes on ignoring the Plant.
- `describeRecipeFlows` in `src/ui/describe.ts` and `formatPlantRates` in `src/ui/structure-state.ts`, if its recipe has a new shape. The type check only catches a change to a type they read.

## A type of Expedition

- `types` in `expeditions` in `src/catalogue/workers.ts`, with the Design that offers it, if any. Its reward needs no more code if it is a bulk resource or Science.
- `src/catalogue/research.ts`: the Design. `describeUnlocks` says what it offers.
- `test/catalogue-rules.ts`: an exemption with its reason, unless the long game sends it.
- `docs/balancing.md`: how it pays against what the base can make for itself.

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
- Let CI play the long game (see above), and read its timeline, as nothing else plays that far.

Tests and docs:

- `test/<name>.test.ts`, and `e2e/<name>.spec.ts` for a new Act. `e2e/milestones-acts.spec.ts` names the last Act, so a new one fails it. `test/with-acts.ts` tries several Acts with made-up ones and needs no change.
- `GLOSSARY.md` (the Act entry says which Acts are in the game), [`docs/rules.md`](rules.md), and the Act's row and pacing targets in [`docs/balancing.md`](balancing.md). Nothing catches them.

## The catalogue's version

`version` in `src/catalogue/catalogue.ts` is a label. No game code reads it. The reference Campaign's timeline and the pacing report print it, and a catalogue test checks that it is a whole number from 1 up, so nothing fails if you forget. It isn't in a save, whose format has its own version.

Raise it by one, in the commit that changes the catalogue, whenever a change alters what the catalogue holds: content, numbers, or words alone. A change to code beside the catalogue, with no data changed, leaves it alone. When two branches have taken the same number, raise it again for the two together. That way a figure's version says which catalogue it was measured with. [How it was raised before the rule was written](balancing-history.md#the-catalogues-version-up-to-version-66) is in the balancing history.

The docs quote the version a figure was measured at, so change the number there only when you measure again: [`docs/balancing.md`](balancing.md#targets) still quotes version 61 for a long-game figure.
