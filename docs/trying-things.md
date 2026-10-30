# Trying a change by hand

To start the game in a state to try something, run this from the repository's root folder:

```powershell
npm.cmd run try -- crowded
```

It prepares a Campaign, starts the game at <http://localhost:5173> in Firefox with that Campaign loaded, and prints what to do and what should happen. Press `Ctrl+C` in the window that ran it to stop the game. Run `npm.cmd run try` with no scenario to list them. Some scenarios play a long way through a Campaign first, which can take a minute or more.

| Scenario              | What it starts in                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `everything-unlocked` | An hour into a Campaign with every Design unlocked and $5,000M                                                                   |
| `last-milestone`      | An hour into a Campaign with every Milestone reached but power storage, the quickest to reach                                    |
| `crowded`             | A base with two Plants running, on a catalogue crowded with made-up items, with every bulk resource and silicon about to run out |

No scenario shows a second Act yet: that needs Act 2's content, and the ticket that adds it (#157) will add one.

## Adding a scenario

Add it to `tryScenarios` in `test/try-scenarios.ts` and to the table above. A scenario returns the text of a save: it may play the Campaign through the simulation interface, or edit the save, as it is a way to look at something rather than a test of the game's balance. `?try=<scenario>` only works on the development server; the production build leaves it out.

The crowded catalogue (`test/crowded-catalogue.ts`) has 80 Launch items and 15 bulk resources. An end-to-end test can play on it too, with `useCrowdedCatalogue` from `e2e/crowded.ts`. To test several Acts before their content exists, `test/with-acts.ts` shares the Milestones out among made-up ones.
