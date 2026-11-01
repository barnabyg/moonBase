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

It plays the reference Campaign's play guide (`test/reference-campaign.ts`), then carries on (`test/long-game.ts`), through the simulation interface alone, with the same seed and every Hazard, real Solar Particle Events among them, until Earth Day 3,000, the length the Campaign's content is meant to last. It keeps a Research Task running, unlocks the cheapest Design as soon as it can, and goes on keeping the base supplied. From Earth Day 350 it ships and builds in turn, as Science and Funding allow, a Workshop, a third solar array, a large extraction plant set to metals and silicon, a second Workshop, an array works that makes two more solar arrays, a concentrator tower and a cold-trap ice line. It brings no more spare Components by Launch once a Workshop is commissioned, switches them off while more than 40 are in stock, and fills what the circuit boards leave of each Return Mass with metals, or with propellant once it holds more than it means to burn, so that a trip goes about every round trip. As their Designs are unlocked it ships and builds a propellant plant, a propellant tank, a large propellant plant, an optics works and a grinding line, loads optics and circuit boards first, and burns propellant to lift all there are. Once, it makes up a tripled Return Mass with metals. From Earth Day 1,530 it sends for a Buried Habitat over three Launches, builds it early in the next Daylight it can, moves the Mission Director in as soon as it has power, and dismantles the old Habitat with its water wall and shielding before Night falls. From Earth Day 1,600 it ships a second Robot, then ships and builds a large battery bank, two more water-processing plants and a Greenhouse; once that stands it keeps the Rover going for water ice while under 600 kg is in stock, and switches the optics off below 320 kg of water and on again above 360 kg, so that the Greenhouse has a Night's water at dusk. From Earth Day 1,750 it ships and builds a water tank and an oxygen tank. It prints the reference Campaign's timeline, then when each Research Task was completed and each Design unlocked, then the spare Components in stock Lunation by Lunation with what Launches brought before and after the Workshop, then Act 2's Structures and whether its targets were met, then the Funding every 100 Earth Days and what Exports earned in Act 2, then what Exports earned in Act 4 and what became of the propellant, then the Buried Habitat's dates with the Radiation Dose at each, then when the Greenhouse was commissioned with the Science it earned and the rounds it lost, then the game's forecast of the date the Radiation Dose reaches its limit. The forecast counts only the Solar Particle Events the Mission Director knows of, so the limit really comes sooner: at data catalogue version 61, with no Buried Habitat, the Mission Director died of it on Earth Day 1,765, against the forecast's 1,796, a gap of 31 Earth Days. That is why the guide now plays the whole length rather than trusting a forecast.

From data catalogue version 72, once Growing halls is unlocked it ships and builds a third Workshop, a large battery bank, what water-processing plants it lacks, four more cold-trap ice lines and a growing hall; once Vault cistern is, with nothing left for Science to buy, it switches the Greenhouse and hall off, ships and builds a second water tank and a vault cistern round the Buried Habitat, and lets the optics have the water once it is filled.

It takes about 15 to 20 minutes of one full core (`scripts/long-game.mjs` stops it at a hard limit of 60), so it stays out of `npm run verify`, and no test plays it.

### When to play it whole

Rarely: once per branch, last, after the cheap checks, and only for a change that can move the balance. That means what a long Campaign depends on: spare Components and wear, the Hazards, Plant and Export numbers, the Research Tasks and Designs' costs, the play guide's steps, and a new Structure, Plant or Act. A change to the interface, the models, the words or the docs can't move it, and neither can a change to code that plays the same. To compare with what came before, use the last played figures in [`docs/balancing.md`](balancing.md) rather than playing the old version too.

First, cheapest first, as each finds in seconds what a whole play would find in minutes:

1. `npm.cmd run pacing-report`, for what the numbers come to.
2. `npm.cmd test -- test/catalogue-rules.test.ts test/long-game.test.ts test/pacing-report.test.ts`, whose `research-fits-the-campaign` rule fails Research Tasks that can't finish by Earth Day 3,000.
3. `npm.cmd test -- test/reference-campaign.test.ts`, which plays Act 1.

If a play fails, fix what it says, run those again, and play it again only when the fix is in: a fail, fix and retest is a whole play each time.

### When it fails

Like the reference Campaign, it says why and fails if a step can't go on. So that a stalled purchase doesn't cost a whole play to notice, it gives up as soon as one purchase has made no progress for 300 Earth Days (`PURCHASE_STALL_EARTH_DAYS`), saying which and what it waits on: Funding, Components that never come, a site that keeps being refused, or a Construction planned and never commissioned. Waiting for Science doesn't count, as a purchase isn't waited on until its Design is unlocked and its Earth Day has come. The longest any purchase waited, as last played up to Earth Day 2,400, is 22 Earth Days, leaving aside one water-processing plant, which stands planned from Earth Day 1,626 to about 2,200 and is marked as `strandedBecause` in `PURCHASES`.

So that a missed date doesn't cost the rest of the play either, it gives up as soon as a dated pacing target in `act2Targets` or `laterActTargets` can no longer be met, saying on which Earth Day and which target: a Workshop running by Earth Day 500, spare Components needing no Launch by 800 (or a Launch bringing them after that), metals sold by 900, propellant made by 1,050, the Return Mass tripled by 1,250, precision optics sold by 2,000, every Design of Act 2 unlocked before Earth Day 700, or an Act's research ending more than 50 Earth Days before its date or, for Acts 2 and 3, still going more than 50 after it. The check only reads the snapshot, so the same seed plays the same timeline. What only the end can judge still waits for it: whether Act 4's research lasts long enough, and the targets with no date, that spare Components never run out and what one of every Launch item takes. After giving up, the list of targets missed also names those whose dates the play never got to.

It also fails if a Research Task wasn't completed or a Design wasn't unlocked by the end, if the Mission Director died, if they hadn't moved into a Buried Habitat by Earth Day 1,600, if it missed any of the pacing targets of Acts 2, 3 and 4, or if it built and sent for nothing of a Design `designsTheLongGameUses` says it uses. A later Act adds its steps to `longGameSteps` and its Designs to that list.
