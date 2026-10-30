# The reference Campaign and balancing

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
- that the pacing targets below are met;
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

## Balancing

The data catalogue's numbers are balanced against the reference Campaign's timeline, so that a new player can play from the landing to a self-sufficient, export-funded base by following the Milestones, and carry on afterwards. Every balancing change is in the data catalogue; none is in code.

### Targets

The spec's tunable defaults all hold:

- 1x is 6 game-minutes a second.
- A Lunation is 20 Earth Days of Daylight and 9.5 of Night, and the first Night falls on Earth Day 8.
- The Lander's legs take 3, 4 and 3 Earth Days.
- The Robot repairs itself below 10% Condition.
- The starting oxygen and water last about 30 Earth Days.

The pacing targets, and where the reference Campaign came at data catalogue version 60:

| Target                                                                          | Reference Campaign                                                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Power storage before the first Night (Earth Day 8)                              | Earth Day 1.1                                                                              |
| Moved in and the Lander departed within the first Lunation (29.5 Earth Days)    | Earth Days 3.8 and 3.9                                                                     |
| The Habitat shielded before a Solar Particle Event could take a dangerous share | Earth Day 7.0, before the earliest a Solar Particle Event can start (Earth Day 10)         |
| A landing pad by about Earth Day 60                                             | Earth Day 15.5                                                                             |
| Both self-sufficiency Milestones within about four Lunations (118 Earth Days)   | Earth Days 62.5 and 82.8                                                                   |
| By the end, Export income covers the cost of a typical Launch                   | Each Launch of circuit boards sells for $300M; Launches after the third cost $154M–180M    |
| The Radiation Dose, played as the hints and Designs allow, survivable for years | Over 4 years from the end with a water wall; about 5 months under Regolith shielding alone |

The reference Campaign's test checks each of these.

### The larger changes, and why

**Battery banks.** A Night lasts 228 hours. Through it the Habitat draws 274 kWh (1.2 kW), each solar array 11 kWh, and the heaters of the excavator, the regolith printer and the Rover, which the Robot plugs in before every Night, 137 kWh between them. A battery bank stores 200 kWh, about what a small electric car carries, and its heaters draw 0.07 kW, 16 kWh through a Night. The starting stock holds three battery banks, 600 kWh, which carry the Habitat, two solar arrays and all the heaters through a Night, about 480 kWh, with over 100 kWh to spare; two would not. The large battery bank stays the better buy: 800 kWh for 0.2 kW of heaters, less mass and money for each kWh. (A battery bank used to store 60 kWh, and its heaters to draw 0.25 kW, 57 of those 60 through a Night, so no number of battery banks could carry anything else through one.)

The Habitat's first Night has to be carried by the starting stock. The Lander can't leave until the Mission Director has moved in, and a round trip takes 10 Earth Days. Large battery banks need Science, and the Milestones put the first Research Task after the landing pad, which the first Launch brings, so they could arrive at the earliest on the second Launch, as the Night falls and uncharged. Staying aboard the Lander through the first Night only puts the problem off to the second. The first two Milestone hints say to build all the starting battery banks and to move in once they are charged, so a player following them gets through the first Night. The starting stock's four Light Masts would draw over 360 kWh through it, more than is left once the Habitat and the heaters have theirs, so the lights switch themselves off part-way through rather than leave the Habitat without power: building them costs a new player some light, never the Mission Director.

**Two Launches, and a $650M Programme Grant.** Launches carry two tonnes. Before the first Export can be sold, the Milestones need a landing pad (1240 kg, $30M) and an extraction plant, a vacuum fabrication plant and a second solar array to power them (1950 kg, $151M): two Launches. The first brings the landing pad with oxygen, water and spare Components ($200M with the Launch fee), and the second the export Plants ($301M). A full Return Mass of wafers sells for $150M, no more than the Launch fee, so wafers alone never pay for what a Launch brings: circuit boards, at twice the price, do. So the Launch after the first sale has to bring a circuit board plant, with the water-processing plant the water Milestone needs and supplies (about $265M), and the grant has to pay for what the sale doesn't. That comes to about $615M, so the Programme Grant is $650M. It couldn't go back to $400M without cutting the Launch fee to about $45M (and the wafer price with it), or the export Plants' prices by about two thirds. The cost is that no two-tonne Launch can cost more than the Programme Grant (the dearest comes to about $540M), so the Funding first runs short only after the second Launch; the Milestone hint for the first Launch says to keep enough for the export Plants on the next.

**The Radiation Dose.** Regolith shielding cuts the dose rate to a twentieth, 1.5 mSv an Earth Day. With Solar Particle Events on top it rises about 2 mSv an Earth Day, so the 600 mSv limit comes in about nine Lunations: the Hazard still bites over the long run. Water-wall shielding cuts it to a tenth of that again, 0.15 mSv an Earth Day. In the reference Campaign the Research Tasks pay for it by Earth Day 20, the third Launch brings its bladders, and it is filled once there is 300 kg of water to spare beyond a fortnight's drinking water, on Earth Day 96.0. From then on the limit is over four years away; without it, under Regolith shielding alone, it would come about five months after the end.

**Research that lasts.** The Research Tasks used to take 63 Earth Days back to back and pay 631 Science, against a Tech Tree costing 625, so a player who kept one running had every Design by about Earth Day 80, half-way through the reference Campaign. Twelve longer tasks, from 8 Earth Days to two Lunations and paying about 0.3 Science an hour (the earlier ones pay about 0.4), bring that to about 315 Earth Days and 2435 Science. Seven of them are offered once a Design that had none of its own is unlocked. The Designs' costs now rise with their depth in the tree. Those the early game leans on cost what they did (Robots, Prefabricated and Dust-sealed solar arrays, Large battery banks and Water-wall shielding) or a little more, a few Earth Days of research each. The rest of the first rank cost 60–150, and those past it 150–340, from a few weeks to a Lunation and a half of research each. The whole tree costs 2225: the Research Tasks have to pay that even when the last Design unlocked is Integrated fabrication, whose own task's 148 Science then has nothing left to buy. The reference Campaign unlocks only Water-wall shielding, at the same 40 Science and the same time, so its timeline is unchanged.

**The telescope.** Optical telescopes, a first-rank Industry Design at 60 Science that leads to nothing else, brings a telescope ($25M, 260 kg) that works on the observing programme, a standing Research Task, only at Night. Each round is 48 hours of one telescope's observing and earns 6 Science, so through a Night's 228 hours one telescope earns about 28 Science a Lunation: about an eighth of what Research Tasks run back to back pay, so it adds to research rather than replacing it, and pays back its Design in about two Lunations. It draws 0.25 kW only while it observes, 57 kWh through a whole Night, about half of what the starting battery banks have to spare once the Habitat and the heaters have theirs. Like a light, it stops observing rather than eat into the reserve, so a player who builds one has a reason to keep power in hand through the Night. Its Science is not counted in the balance between the Research Tasks and the Tech Tree above, and the reference Campaign builds none, so its timeline is unchanged.

### Still to watch

- **Machine heaters.** The Machines' and Rover's heaters draw from the Habitat's network every Night, because the Robot parks them beside the nearest powered Structure. That is about a third of what the battery banks have to carry, and nothing tells the player. It is how the code parks them, so it is noted here rather than balanced away.
- **Spare Components.** Dust wears everything down steadily, so a growing base uses spare Components fast: the reference Campaign keeps 30 in stock, topped up by every Launch. With fewer, Maintenance waits for spares, solar arrays wear down to Broken, and a Night can then empty the battery banks.
- **One extraction plant.** It can make oxygen or silicon, but not both at once, so wafer and circuit board production slows while the oxygen is topped up.
- **Water.** The water wall takes 300 kg; after filling it the reference Campaign's water fell to 31 kg (under nine Earth Days) before the next Expedition's ice came through. A player should send the Rover again as soon as the wall is filled.
- **The first Launch's Funding.** With the Programme Grant above what any one Launch can cost, nothing stops a player spending most of it on the first Launch but the hint; one who does can't afford the export Plants, and has no way to earn more.
