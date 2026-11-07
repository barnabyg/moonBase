# Trying a change by hand

To start the game in a state to try something, run this from the repository's root folder:

```powershell
npm.cmd run try -- crowded
```

It prepares a Campaign, starts the game at <http://localhost:5173> in Firefox with that Campaign loaded, and prints what to do and what should happen. Press `Ctrl+C` in the window that ran it to stop the game. Run `npm.cmd run try` with no scenario to list them. Some scenarios play a long way through a Campaign first, which can take a minute or more. Those for Act 4 play the long-game play guide to their Earth Day, which took from 6 minutes (Earth Day 1,400) to 20 (Earth Day 2,850) on the maintainer's computer. Their steps quote what the guide's base held at data catalogue version 75 (76 for `act-4-end`), which changes with the balance. Once one has been prepared, `npm.cmd run try -- act-4 --keep` starts from the save it prepared last time, in the ignored `.try` folder. That save is what the code and catalogue made then, so leave out `--keep` after changing them.

| Scenario                | What it starts in                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `everything-unlocked`   | An hour into a Campaign with every Design unlocked and $5,000M                                                                                                                       |
| `last-milestone`        | An hour into a Campaign with every Milestone reached but power storage, the quickest to reach, which opens the last Act                                                              |
| `act-2`                 | The start of Act 2, at the reference Campaign's base with $2,500M, 400 Science, 150 kg of metals and 60 kg of circuit boards                                                         |
| `act-3`                 | The start of Act 3, with a propellant plant's Components in stock, 500 kg of propellant, 150 kg of circuit boards, 400 kg of metals and $5,000M                                      |
| `act-4`                 | The start of Act 4, on Earth Day 1,400, at the long-game play guide's own base as it played there: 530 mSv, $12,171M and a Buried Habitat unlocked                                   |
| `act-4-moved-in`        | The guide's base on Earth Day 1,600, just after it moved into a Buried Habitat                                                                                                       |
| `act-4-optics`          | The guide's base on Earth Day 1,700, just after Precision optics was unlocked, with a Greenhouse growing                                                                             |
| `act-4-late`            | The guide's base on Earth Day 2,000, with an optics works and a Greenhouse running                                                                                                   |
| `act-4-halls`           | The guide's base on Earth Day 2,200, just after Growing halls was unlocked                                                                                                           |
| `act-4-end`             | The guide's base on Earth Day 2,850, with a Large-scale Crew Habitat waiting for water, to play to Earth Day 3,000                                                                   |
| `workshop`              | A base with a Workshop running on two solar arrays and a battery bank, its metals about to run out, and a second Workshop's Components in stock                                      |
| `crew-habitat`          | Early in a Campaign with every Milestone reached but the last, and a stocked Large-scale Crew Habitat being commissioned                                                             |
| `buried-habitat`        | A base with the Mission Director behind a water wall at 568 mSv, a Buried Habitat commissioned to move to, and a bare Habitat beside it                                              |
| `split-network`         | The starting base with the Mission Director moved in, but the Habitat and one battery bank on a network apart from the solar array and other banks                                   |
| `water-reserve`         | A base with an optics works running on six batches' water above the reserve, and a water-processing plant switched off with water ice to use                                         |
| `full-store`            | A base with a water-processing plant running three batches below the limit of 400 kg, its water ice to spare, and an optics works switched off                                       |
| `storage-tanks`         | A base with a water tank and an oxygen tank half full, a few hours before Night, and a second water tank's Components in stock                                                       |
| `propellant-tanks`      | A base with a propellant plant and a propellant tank three batches from full, a few hours before Night, and a second tank's Components in stock                                      |
| `regolith-digger`       | A base with a propellant plant, a bucket-wheel digger and a Regolith bin, 4,800 of 5,000 kg of Regolith, a few hours before Night                                                    |
| `greenhouse`            | A base with a Greenhouse growing a few hours before Night on a day's water above the reserve, and a water-processing plant switched off                                              |
| `experiments-lab`       | A base with an automated experiments lab speeding up a long Research Task in Daylight, and a second lab's Components in stock                                                        |
| `infrared-telescope`    | A base with an infrared telescope observing at Night, out past a Light Mast's dark radius, with propellant and a second telescope's Components                                       |
| `radio-telescope-array` | A base with a radio telescope array working in Daylight, out past a water-processing plant's quiet radius, with a second water-processing plant's Components and two antenna fields' |
| `late-game`             | Late in a Campaign, in a Buried Habitat at 570 mSv, a Greenhouse growing, Growing halls unlocked, the Science for a Vault cistern, and $20,000M                                      |
| `crowded`               | A base with two Plants running, on a catalogue crowded with made-up items, with every bulk resource and silicon about to run out                                                     |

## Adding a scenario

Add it to `tryScenarios` in `test/try-scenarios.ts` and to the table above. A scenario returns the text of a save: it may play the Campaign through the simulation interface, or edit the save, as it is a way to look at something rather than a test of the game's balance. One that takes minutes to prepare is marked `slow`, which leaves it out of `test/try-scenarios.test.ts`. `?try=<scenario>` only works on the development server; the production build leaves it out.

The crowded catalogue (`test/crowded-catalogue.ts`) has 100 Launch items and 15 bulk resources. An end-to-end test can play on it too, with `useCrowdedCatalogue` from `e2e/crowded.ts`. To test several Acts before their content exists, `test/with-acts.ts` shares the Milestones out among made-up ones.
