# Save format

A `.moonbase` file is JSON: `"format": "moonbase-save"`, the format `version`, the random generator's state (`random`) and the rest of the simulation state (`state`), with anything unset written as `null`. `src/simulation/save.ts` writes it and reads it back, checking every field. Saves are files the player manages; nothing is kept in the browser (ADR-0006).

## Changing the format

Each released format version is a compatibility contract:

- To change the format, raise the version and add a migration from the one before to `migrations` in `save.ts`. Never edit a released migration.
- Check in a sample save of the new version beside the old ones in `test/saves/`, where every file must go on loading. Never edit or regenerate a sample.
- New Components change the format, because the base's stock keeps a count of every Component. The migration adds a count of none for each new one, after the others, naming them in the migration rather than reading them from the data catalogue (the migration to version 28 is the model). Structures built without Components, and Launch items that aren't Components (such as oxygen and water tanks), add no counts.

The migrations themselves, with their comments, are the history of what each version added.

## Loading older saves

A migration can only fill in what the older save recorded. When one adds state the base never kept, it says how the gap is filled. For example, saves from before version 33 kept no Milestones: the Lander departing counts as reached only if the Lander was away when the game was saved, any other Milestone whose condition the saved state already meets is reached, with its notification, in the first game-minute played after loading, and the First Export counts from the next sale.
