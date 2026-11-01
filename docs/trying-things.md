# Trying a change by hand

To start the game in a state to try something, run this from the repository's root folder:

```powershell
npm.cmd run try -- crowded
```

It prepares a Campaign, starts the game at <http://localhost:5173> in Firefox with that Campaign loaded, and prints what to do and what should happen. Press `Ctrl+C` in the window that ran it to stop the game. Run `npm.cmd run try` with no scenario to list them. Some scenarios play a long way through a Campaign first, which can take a minute or more.

| Scenario              | What it starts in                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `everything-unlocked` | An hour into a Campaign with every Design unlocked and $5,000M                                                                                  |
| `last-milestone`      | An hour into a Campaign with every Milestone reached but power storage, the quickest to reach, which opens the last Act                         |
| `act-2`               | The start of Act 2, at the reference Campaign's base with $2,500M, 400 Science, 150 kg of metals and 60 kg of circuit boards                    |
| `act-3`               | The start of Act 3, with a propellant plant's Components in stock, 500 kg of propellant, 150 kg of circuit boards, 400 kg of metals and $5,000M |
| `workshop`            | A base with a Workshop running on two solar arrays and a battery bank, its metals about to run out, and a second Workshop's Components in stock |
| `buried-habitat`      | A base with the Mission Director behind a water wall at 568 mSv, a Buried Habitat commissioned to move to, and a bare Habitat beside it         |
| `water-reserve`       | A base with an optics works running on six batches' water above the reserve, and a water-processing plant switched off with water ice to use    |
| `full-store`          | A base with a water-processing plant running three batches below the limit of 400 kg, its water ice to spare, and an optics works switched off  |
| `storage-tanks`       | A base with a water tank and an oxygen tank half full, a few hours before Night, and a second water tank's Components in stock                  |
| `propellant-tanks`    | A base with a propellant plant and a propellant tank three batches from full, a few hours before Night, and a second tank's Components in stock |
| `greenhouse`          | A base with a Greenhouse growing a few hours before Night on a day's water above the reserve, and a water-processing plant switched off         |
| `late-game`           | Late in a Campaign, in a Buried Habitat at 570 mSv, a Greenhouse growing, Growing halls unlocked, the Science for a Vault cistern, and $20,000M |
| `crowded`             | A base with two Plants running, on a catalogue crowded with made-up items, with every bulk resource and silicon about to run out                |

## Adding a scenario

Add it to `tryScenarios` in `test/try-scenarios.ts` and to the table above. A scenario returns the text of a save: it may play the Campaign through the simulation interface, or edit the save, as it is a way to look at something rather than a test of the game's balance. `?try=<scenario>` only works on the development server; the production build leaves it out.

The crowded catalogue (`test/crowded-catalogue.ts`) has 80 Launch items and 15 bulk resources. An end-to-end test can play on it too, with `useCrowdedCatalogue` from `e2e/crowded.ts`. To test several Acts before their content exists, `test/with-acts.ts` shares the Milestones out among made-up ones.
