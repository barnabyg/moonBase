# Save format

A `.moonbase` file is JSON: `"format": "moonbase-save"`, the format `version`, the random generator's state (`random`) and the rest of the simulation state (`state`), with anything unset written as `null`. `src/simulation/save.ts` writes it and reads it back, checking every field. Saves are files the player manages; nothing is kept in the browser (ADR-0006).

## Changing the format

Each released format version is a compatibility contract:

- To change the format, raise the version and add a migration from the one before to `migrations` in `save.ts`. Never edit a released migration.
- Check in a sample save of the new version beside the old ones in `test/saves/`, where every file must go on loading. Never edit or regenerate a sample.
- New Components and bulk resources don't change the format. A save has one count for each Component and bulk resource it knew of, and from version 40 reading gives a count of none to any that a save doesn't have a count for, whatever the save's version, and puts the counts in catalogue order, so adding one needs no migration. It may go anywhere in its list.
- A count naming something the data catalogue doesn't have is refused as damaged, as any other unknown id is, so removing or renaming a Component or bulk resource still changes the format and needs a migration. Every other check stays as strict: a whole number or amount is still needed where a count is given, and a stock that isn't a list is refused. Structures built without Components, and Launch items that aren't Components (such as oxygen and water tanks), have no counts at all.

The migrations themselves, with their comments, are the history of what each version added. Those before version 40 add a count for each new Component or bulk resource; that was how it had to be done then, and they stay as released.

## Loading older saves

A migration can only fill in what the older save recorded. When one adds state the base never kept, it says how the gap is filled. For example, saves from before version 33 kept no Milestones: the Lander departing counts as reached only if the Lander was away when the game was saved, any other Milestone whose condition the saved state already meets is reached, with its notification, in the first game-minute played after loading, and the First Export counts from the next sale. Saves from before version 41 kept no record of spare Components, so a whole Lunation has to pass after loading before the base can be self-sufficient in them.

A save from before Act 2 was in the game, with all nine of Act 1's Milestones reached, needs no migration for it: the Act comes from the Milestones reached, so it loads straight into Act 2, with no notification, as no Act's start is announced on loading a save. Its Act 2 Milestones are reached from then on like any others, in the first game-minute they hold. Acts 3 and 4 are the same: a save with every Milestone of the Acts before reached loads straight into the next.
