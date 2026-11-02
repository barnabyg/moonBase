# The reference Campaign and the play guides

## The reference Campaign

The reference Campaign is a scripted playthrough of the whole first version, from the landing to a self-sufficient, export-funded base, and on for three more Lunations. It plays a fresh Campaign with a fixed seed through the simulation interface alone, as a player would: it sends commands, lets the game run and reads the snapshot and forecasts, but never edits a save or reaches into the simulation, and it plays the real data catalogue, with every Hazard. It follows only the Milestone guidance, taking each Milestone in order. `test/reference-campaign.ts` holds it as a play guide, a list of steps, each tied to the Milestone it serves:

1. **Power storage:** build the starting solar array and the three battery banks from the starting stock east of the landing site, beyond the reach of the Lander's Plume Ejecta.
2. **Moved in:** build the inflatable Habitat beside them, wait until the battery banks are charged for the Night, then move the Mission Director in.
3. **Lander departs:** put a landing pad on the Launch manifest, with two tanks of oxygen, three of water and ten spare Components, and send the Lander.
4. **Habitat shielded:** plan Regolith shielding over the Habitat.
5. **Landing pad:** once the Lander is back, build the landing pad south of the landing site.
6. **First Research Task:** start the shortest Research Task, and keep one running from then on; unlock Water-wall shielding once they have paid for it.
7. **First Export:** send the Lander for an extraction plant, a vacuum fabrication plant and a second solar array, and build them. Run the extraction plant for metals and silicon until the vacuum fabrication plant has made a full Return Mass of wafers, load them and send the Lander, and while it is away put a water-processing plant, a circuit board plant, water-wall bladders, oxygen, water and spare Components on the Launch manifest, paid for by the wafers and what is left of the Programme Grant. Build the circuit board plant once it comes, and the water wall over the Habitat once its bladders come and there is the water for it.
8. **Oxygen self-sufficiency:** switch the extraction plant back to oxygen.
9. **Water self-sufficiency:** build the water-processing plant, and send the Rover on an Expedition for water ice.
10. **Afterwards:** keep the base going for at least three Lunations, and until the water wall has stood over the Habitat for a whole Lunation. Run the extraction plant for oxygen whenever the oxygen runs low and for metals and silicon otherwise, send the Rover for more water ice once the last is used up and the water is getting low (or short of what the water wall needs), and send the Lander whenever there is a full Return Mass of circuit boards, with oxygen, water and spare Components on the Launch manifest as they are needed (it keeps 30 spare Components in stock).

`test/reference-campaign.test.ts` plays it once with the other tests and checks:

- that all nine Milestones are reached in order and the Mission Director is alive at the end;
- that the Launches paid for after the first export sale cost more than was left of the Programme Grant at that sale, so Export earnings paid for them;
- that the [pacing targets](balancing.md#targets) are met;
- that by the end the last Export sale earns at least what a typical (median) Launch costs;
- that a water wall was built, and that at the rate the Radiation Dose rose over the last Lunation the limit is more than three years away, where at the rate it rose under Regolith shielding alone, in the Lunation before the water wall, it would come within a year.

## The timeline

To see how the Campaign went, run this from the repository's root folder:

```powershell
npm.cmd run reference-campaign
```

It plays the reference Campaign, which takes about 20 seconds, and prints its timeline in four parts:

- **Milestones:** the game time, in Earth Days since the landing, at which each Milestone was reached.
- **Launches and sales:** every Launch, with what it cost as the Lander left Earth, and every Export sale as the Lander reached Earth.
- **Margins:** the closest the Campaign came to the edge: the least oxygen and water in stock and the fewest Earth Days each would have lasted, the shortest forecast until the Habitat would lose power and the least energy stored on its network, the lowest Funding, and the highest Radiation Dose against the limit. Oxygen, water and Habitat power count only while the Mission Director lives in the Habitat.
- **The end:** the Funding at the end, when the water wall was commissioned, and how fast the Radiation Dose rose over the last Lunation and over the Lunation before the water wall, each with how long it would take at that rate to reach the limit.

If the play guide can't go on, it says why and the command fails. That happens when a command is refused, something it waits for never comes, or the Mission Director dies.

## The pacing report

To judge a balancing change without replaying the game, run this from the repository's root folder:

```powershell
npm.cmd run pacing-report
```

It reads only the data catalogue, plays nothing, and takes a second or two. Each part says what it assumes; where a figure is a span of game time, it also gives the real time at each game speed.

- **Science earned and spent over time:** the Research Tasks run back to back, the shortest on offer first, unlocking the cheapest Design as soon as it can be afforded. A Research Task or Design it never reaches is named. The Science left at the end is what a player has to spare, and a long gap between unlocks is a stretch of the Tech Tree with nothing to choose.
- **The Designs' cost by depth in the Tech Tree:** the cost should rise with the depth.
- **Payback of each Plant that earns anything:** what its Components cost against the value it adds, up to what the Lander can carry away. A payback of a few Earth Days means the Plant is a clear buy as soon as it can be had; "all the Lander can carry" means Return Mass rather than the Plant is the limit.
- **Payback of each Design that earns Science:** "never pays back" isn't a fault, as most Designs are bought for what they bring, but a Design that pays back fast is an early buy for every player.
- **Income and cost of each Launch, for each Export:** a full Return Mass's price less the Launch fee, how often a trip can go, how many Launches' profit buys one of every Launch item, and what limits the Export: a Plant's rate, or the Return Mass. That number of Launches is how soon Funding stops being a limit: the smaller it is, the less the rest of the Campaign asks of Funding.
- **Science and Funding over an Act:** what the Research Tasks pay and the Designs unlocked cost over Act 2, which Designs are still to buy at Earth Day 700, when research ends, what the Act's big purchases come to, and what Exports earn over it.
- **Designs that something cheaper beats outright:** anything listed is no reason to spend the Science. It compares only things that do the same job, across everything they cost and do; anything else, such as a Design that's better in a way the player doesn't value, is for a person to see.

## The long-game play guide

To see how the Campaign holds up past the reference Campaign's end, run this from the repository's root folder:

```powershell
npm.cmd run long-game
```

It plays the reference Campaign's play guide (`test/reference-campaign.ts`), then carries on (`test/long-game.ts`), through the simulation interface alone, with the same seed and every Hazard, real Solar Particle Events among them, until Earth Day 3,000, the length the Campaign's content is meant to last. `longGameSteps` and `PURCHASES` in `test/long-game.ts` are what it plays, [`docs/balancing.md`](balancing.md) records what the latest play came to, and [`docs/balancing-history.md`](balancing-history.md) what each earlier version's did.

It prints the reference Campaign's timeline, then when each Research Task was completed and each Design unlocked, then the spare Components in stock Lunation by Lunation with what Launches brought before and after the Workshop, then Act 2's Structures and whether its targets were met, then the Funding every 100 Earth Days and what Exports earned in Act 2, then what Exports earned in Act 4 and what became of the propellant, then the Buried Habitat's dates with the Radiation Dose at each, then when the Greenhouse was commissioned with the Science it earned and the rounds it lost, then the game's forecast of the date the Radiation Dose reaches its limit. The forecast counts only the Solar Particle Events the Mission Director knows of, so the limit really comes sooner, as [the last time it was played to](balancing.md#targets) showed. That is why the guide plays the whole length rather than trusting a forecast.

It takes about 10 minutes of one full core, reporting on stderr every 100 Earth Days how far it has got, with the timeline on stdout at the end (`scripts/long-game.mjs` stops it at a hard limit of 60), so it stays out of `npm run verify`, and no test plays it. It plays at below-normal priority, so the PC stays usable while it does.

### CI plays it

You don't need to play it by hand before handing a change over. `.github/workflows/long-game.yml` plays it on a runner of its own:

- **On a pull request** that changes what the play imports: `src/simulation/`, `src/catalogue/`, the play guide's files in `test/`, or the workflow and script themselves. A change only to the interface, the models or the Guide's words doesn't trigger it. A new push cancels the play still going and starts again.
- **On `main`**, after a merge of anything but `docs/` or Markdown files, so that a merge whose result plays differently from its pull request, or a play guide that has come to import something else, is still played. GitHub tells whoever merged it if the play fails. A merge while a play is going waits for it, and a later merge takes its place in the queue, so the newest code is always played.
- **By hand**, for any branch, once the workflow is on `main`:

```powershell
gh workflow run long-game.yml --ref my-branch
```

A failed play turns the run red. The run's summary says whether it passed and, at the top, why it failed, then gives the whole timeline. On a pull request it ends by comparing the timeline with `main`'s last play: the same, or a diff and a notice on the run, which stays green, as moving the balance may be what the change is for.

Merge a pull request only once its play has finished. If it played differently, check that was meant, and record what changed in [`docs/balancing.md`](balancing.md). A commit that only records it plays again, as the filter looks at the whole pull request, but it can't change the play, so there's no need to wait for that one.

### Before CI plays it

While working on a change that can move the balance, run these, cheapest first, as each finds in seconds what a whole play would find in minutes. That means what a long Campaign depends on: spare Components and wear, the Hazards, Plant and Export numbers, the Research Tasks and Designs' costs, the play guide's steps, and a new Structure, Plant or Act.

1. `npm.cmd run pacing-report`, for what the numbers come to.
2. `npm.cmd test -- test/catalogue-rules.test.ts test/long-game.test.ts test/pacing-report.test.ts`, whose `research-fits-the-campaign` rule fails Research Tasks that can't finish by Earth Day 3,000.
3. `npm.cmd test -- test/reference-campaign.test.ts`, which plays Act 1.

### When to play it by hand

Only when waiting for CI would cost more than a full core for 10 minutes: when writing steps for the play guide, or trying out a fix for a failure CI reported. A play that fails is a whole play each time, so fix what it says and run the checks above before playing it again.

### When it fails

Like the reference Campaign, it says why and fails if a step can't go on. So that a stalled purchase doesn't cost a whole play to notice, it gives up as soon as one purchase has made no progress for 300 Earth Days (`PURCHASE_STALL_EARTH_DAYS`), counting each of its Components that comes as progress, as a Large-scale Crew Habitat comes over many Launches. It says which and what it waits on: Funding, Components that never come, a site that keeps being refused, or a Construction planned and never commissioned. Waiting for Science doesn't count, as a purchase isn't waited on until its Design is unlocked and its Earth Day has come. The longest any purchase waited, as last measured at data catalogue version 73, when the guide played up to Earth Day 2,400, is 22 Earth Days, leaving aside one water-processing plant, which stands planned from Earth Day 1,626 to about 2,200 and is marked as `strandedBecause` in `PURCHASES`.

So that a missed date doesn't cost the rest of the play either, it gives up as soon as a dated pacing target in `act2Targets` or `laterActTargets` can no longer be met, saying on which Earth Day and which target: a Workshop running by Earth Day 500, spare Components needing no Launch by 800 (or a Launch bringing them after that), metals sold by 900, propellant made by 1,050, the Return Mass tripled by 1,250, precision optics sold by 2,000, a Large-scale Crew Habitat commissioned by 3,000, every Design of Act 2 unlocked before Earth Day 700, or an Act's research ending more than 50 Earth Days before its date or, for Acts 2 and 3, still going more than 50 after it. The check only reads the snapshot, so the same seed plays the same timeline. What only the end can judge still waits for it: whether Act 4's research lasts long enough, and the targets with no date, that spare Components never run out and what one of every Launch item takes. After giving up, the list of targets missed also names those whose dates the play never got to.

It also fails if a Research Task wasn't completed or a Design wasn't unlocked by the end, if the Mission Director died, if they hadn't moved into a Buried Habitat by Earth Day 1,600, if it missed any of the pacing targets of Acts 2, 3 and 4, or if it built and sent for nothing of a Design `designsTheLongGameUses` says it uses. A later Act adds its steps to `longGameSteps` and its Designs to that list.
