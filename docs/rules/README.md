# How the game works

This is how a Campaign plays. It describes the rules, not the numbers: rates, masses, prices, thresholds, durations and Science costs are set in the data catalogue (`src/catalogue/`, one file for each domain), and the game shows them where they matter. [`GLOSSARY.md`](../../GLOSSARY.md) defines the terms in capitals.

Each system has a file of its own, so a change reads and edits only the file it touches. Search the folder for the words or numbers that changed to find the passage.

## Conventions

These hold throughout, so the files for each system don't repeat them:

- **Refusals give the reason.** Any command that can't be carried out (an item that won't fit on the Launch manifest, a Structure placed where it can't stand, a Design that isn't unlocked) is refused, and the game says why.
- **Notifications never pause the game.** They appear in the list at the bottom right. "Skip to next event" jumps straight to the next notable moment: Night falling, a Construction commissioned, a warning, a Milestone (with a new Act, if it brings one), each leg of the Lander's round trip, a Solar Particle Event's warning, start and end, an Expedition leaving or returning, a Research Task, a round of the observing programme or a Greenhouse's round of growing completed, a Greenhouse's round lost, or a Structure needing Maintenance.
- **Screens don't pause the game either**: the Launch manifest, Research Tasks, Tech Tree and Expeditions screens all let it run on.
- **Running out is forecast and warned of.** For oxygen, water, Habitat power, the Radiation Dose and spare Components, the status panel shows when the limit will be reached, and warnings come at three levels of time left (the data catalogue sets them).
- **Chance is seeded.** Random events are the same for the same seed and choices. Add `?seed=<number>` to the address to replay a Campaign exactly.

## The systems

- [Screen and controls](screen-and-controls.md)
- [Milestones](milestones.md)
- [Construction](construction.md)
- [Power](power.md)
- [The Mission Director](mission-director.md)
- [Radiation](radiation.md)
- [Launches and the Lander](launches.md)
- [Exports](exports.md)
- [Condition and Maintenance](condition-and-maintenance.md)
- [Robots](robots.md)
- [Machines and the Rover](machines-and-the-rover.md)
- [Bulk resources, digging and Expeditions](bulk-resources.md)
- [Plants](plants.md)
- [Research and the Tech Tree](research.md)
- [Saving](saving.md)
