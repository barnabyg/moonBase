# Moon Base

A construction and management game about establishing a base at the lunar south pole, where nothing appears by magic: everything is delivered from Earth or made on the Moon, and building takes real work and time.

## Player and progression

**Mission Director**:
The person the player plays: a real, mortal human living at the base who plans and prioritises the work but never builds anything and is never seen on screen.
_Avoid_: avatar, player character, commander

**Campaign**:
A single open-ended playthrough, advanced by reaching Milestones and lost by hitting a failure state.
_Avoid_: run, scenario, game

**Milestone**:
A named achievement that marks progress through the Campaign, such as the first crew landing. Each belongs to an Act.
_Avoid_: goal, objective, achievement

**Act**:
A stretch of the Campaign with its own bottleneck, Mechanic, Export, Milestones and pacing target. The current Act is the one holding the earliest Milestone not yet reached, or the last Act once every Milestone is reached. There are to be four: the first as the game stands, then Independence, Scale and Permanence.
_Avoid_: chapter, level, stage, era

**Mechanic**:
A new way of playing that an Act brings, as distinct from more of something already in the game.
_Avoid_: feature, system

## Research and technology

**Research Task**:
A piece of scientific work carried out at the base whose successful completion earns Science.
_Avoid_: experiment, mission, contract

**Observing programme**:
The standing Research Task the base's telescopes carry out at Night, a round at a time, each round earning a little Science; unlike any other Research Task it runs alongside the one started and never ends.
_Avoid_: passive science, science income

**Science**:
The currency spent to unlock Designs in the Tech Tree, earned only through Research Tasks.
_Avoid_: research points, RP, knowledge

**Tech Tree**:
The set of all Designs and the prerequisites between them.
_Avoid_: research tree, tech web

**Design**:
An unlocked technology: permission to have a particular thing, either delivered by Launch or built locally from available materials. Unlocking a Design never creates the thing itself.
_Avoid_: blueprint, recipe, tech

## Economy and logistics

**Funding**:
The money the base programme has to spend, earned by selling Exports.
_Avoid_: credits, cash, budget

**Programme Grant**:
The fixed lump of Funding the Mission Director starts the Campaign with, and the only money available until Exports earn more.
_Avoid_: starting money, seed funding, budget

**Export**:
A product manufactured at the base and sold off the Moon for Funding. It is carried away within the Lander's Return Mass.
_Avoid_: trade good, sale item

**Import**:
Anything a Launch brings from Earth: the Components, oxygen and water, and Robots on the Launch manifest, listed on its Imports tab. Imports are limited by the Payload Mass and paid for with Funding.
_Avoid_: shipment, delivery, upmass

**Return Mass**:
The mass of Exports the Lander can carry off the Moon when it leaves. Producing propellant locally increases it.
_Avoid_: downmass, return cargo

**Precision optics**:
An Export planned for the last Act: optical parts made in the Moon's vacuum, worth far more for their mass than circuit boards.
_Avoid_: lenses, mirrors

**Propellant**:
What the Lander burns to leave the Moon. Planned for the third Act: making it at the base raises the Return Mass, and oxygen can be sold as propellant.
_Avoid_: fuel

**Lander**:
The reusable spacecraft that makes every Launch, flying between Earth and the base. It brings the Mission Director at the start of the Campaign and keeps them safe indefinitely while they live aboard, but it can't leave until they've moved into a Habitat.
_Avoid_: spaceship, ship, shuttle

**Launch**:
A single trip of the Lander from Earth to the base, carrying up to a fixed Payload Mass.
_Avoid_: shipment, supply drop, resupply run

**Stockpile**:
The base's stock of Components, and of bulk resources such as Regolith measured in kilograms, kept on the ground beside the landing site, where Robots load Components for Construction and Exports to carry onto the Lander on a landing pad, and unload Components recovered by dismantling or carried off the Lander from a landing pad. It belongs to the base, not the Lander, and stays when the Lander leaves.
_Avoid_: cargo, cargo stock, inventory

**Regolith heap**:
The base's stock of Regolith as it lies on the ground: a heap of loose Regolith beside the stockpile's footprint, where the excavator tips what it digs, growing and shrinking with the stock.
_Avoid_: spoil heap, mound, pile

**Ice store**:
The base's stock of water ice as it stands on the ground: insulated containers beside the stockpile's footprint, where the Robot unloads what an Expedition brings back, showing more ice as the stock rises and less as it falls. It only shows the stock, which has no limit of its own: past its full containers, it shows no more.
_Avoid_: ice bin, ice depot, ice tank

**Payload Mass**:
The mass a Launch can carry, and the main limit on what can be imported from Earth.
_Avoid_: cargo capacity, weight

**Launch manifest**:
The list of what the next Launch is to bring from Earth: Components, oxygen and water in set amounts, and Robots. Its cost is the Launch fee plus each item's price, or nothing while it is empty, and it must stay within the Payload Mass and the Funding balance, counting what the Exports aboard the Lander and to load will sell for first. It is paid for and locked as the Lander leaves Earth, and joins the base's stock as the Lander lands, except the Robots, which climb down and join the work.
_Avoid_: order, shopping list, cargo list

**Launch fee**:
The set amount of Funding every Launch costs on top of the price of what it brings.
_Avoid_: shipping cost, flight cost

## Construction

**Structure**:
Anything built in place on the base, such as a habitat module, a solar array or a landing pad. One that runs a recipe is a **Plant**.
_Avoid_: building, facility

**Plant**:
A Structure that runs a recipe, turning resources into products by itself once it is commissioned, such as the extraction plant that turns Regolith into oxygen, metals and silicon. A recipe is a Plant's inputs and outputs, not a Design. The Mission Director can switch a Plant off, so that it starts no new Batch, and back on, without dismantling it.
_Avoid_: factory, facility, Machine

**Workshop**:
A Plant, planned for the second Act, that makes spare Components at the base, so that they no longer need a Launch.
_Avoid_: factory, fabricator, printer

**Batch**:
A game-hour of a Plant's recipe, the unit a Plant works in: it takes the inputs as it starts and puts out the outputs as it finishes.
_Avoid_: job, run, cycle

**Construction**:
The process that turns a planned Structure into a working one through four stages: Site Preparation, Component delivery, Assembly and Commissioning.
_Avoid_: building (as a verb), placement

**Light Mast**:
A cheap Structure that lights up the area around it at Night, so the player can see what's happening. Darkness never stops work. It switches itself off to save power once its network's battery banks hold only enough for everything else through the rest of the Night and a reserve, so it never leaves the Habitat without power.
_Avoid_: lamp, floodlight

**Parking area**:
A cheap Structure of graded, marked ground with bays, each with a power socket, where the Robot parks idle Machines and Rovers together before Night, so that they plug in and keep warm. A bay holds one Machine or Rover.
_Avoid_: car park, garage, depot

**Site Preparation**:
The first stage of Construction, when the ground is cleared and graded for a Structure, and, for a Structure the regolith printer prints, the Regolith it is printed from is dug on the site, with none of it going into the base's stock.
_Avoid_: groundwork, levelling

**Component**:
A part needed to assemble a Structure, either delivered by Launch or fabricated locally.
_Avoid_: part, kit, material

**Assembly**:
The stage of Construction in which Components are put together into the Structure.
_Avoid_: building, fitting

**Commissioning**:
The final stage of Construction, when a finished Structure is tested before it goes live. Commissioning can fail.
_Avoid_: activation, startup

**Work Order**:
A unit of physical work generated by the Mission Director's plans, which Robots claim and carry out by themselves.
_Avoid_: job, task, order

## People and machines

**Robot**:
An autonomous humanoid worker that carries out Work Orders by walking to Machines and Rovers to position, programme and activate them, and by doing light Assembly such as unfolding a solar panel.
_Avoid_: drone, bot, unit, android

**Machine**:
A piece of automated equipment that carries out a process, such as printing a Structure from Regolith, once a Robot has positioned and activated it. Anything built in place that runs by itself is a **Plant**, not a Machine.
_Avoid_: device, equipment, building

**Rover**:
A vehicle a Robot drives, mainly to go on Expeditions.
_Avoid_: buggy, truck, vehicle

**Expedition**:
A trip a Robot makes in a Rover beyond the base, returning some time later with resources.
_Avoid_: sortie, trip, run

**Crew**:
The humans living at the base other than the Mission Director.
_Avoid_: colonists, astronauts, settlers

**Habitat**:
A Structure in which people live, which provides life support and, once shielded, protection from radiation.
_Avoid_: accommodation module, hab, living quarters

**Buried Habitat**:
A Habitat built under the Regolith, planned for the last Act, that cuts the Radiation Dose rate far enough for the Mission Director to live past the limit behind a water wall.
_Avoid_: bunker, underground base, deep Habitat

**Water wall**:
Bladders of water laid over a Habitat's Regolith shielding, filled from the base's water, which cut the Radiation Dose inside further than Regolith alone.
_Avoid_: water shield, water jacket, tank

## Condition

**Condition**:
How intact a Structure, Machine, Robot or Rover is, from 100% down to 0%. Hazards wear it down, and performance drops as it falls.
_Avoid_: health, HP, durability

**Broken**:
The state of something whose Condition has reached 0%: it stops working until repaired, but is not destroyed.
_Avoid_: destroyed, dead, disabled

**Maintenance**:
Work Orders that restore Condition, using up spare Components.
_Avoid_: repair job, servicing

## Resources

**Regolith**:
The loose rock and soil covering the lunar surface, treated as a resource, such as a building material or a source of oxygen and metals.
_Avoid_: soil, dirt, sand

**Deposit**:
A concentration of a resource at a specific place on the map, such as water ice in a shadowed crater. Its location and grade are unknown until it has been prospected.
_Avoid_: node, vein, resource patch

**Prospecting**:
Surveying an area to find Deposits and estimate how rich they are.
_Avoid_: scanning, exploring

## Hazards

**Hazard**:
An environmental threat that damages or wears down the base, its Robots or its Crew.
_Avoid_: disaster, event

**Dust**:
The fine, abrasive fraction of Regolith considered as a Hazard: it wears equipment out and coats surfaces.
_Avoid_: regolith (when the hazard is meant)

**Plume Ejecta**:
Dust and rock blasted outwards by a landing or departing lander, which damages nearby Structures until a landing pad exists.
_Avoid_: blast, exhaust damage

**Solar Particle Event**:
A burst of solar radiation, announced a few hours in advance, during which Crew must be inside shielded Structures.
_Avoid_: solar flare, radiation storm

**Radiation Dose**:
The total radiation a person has absorbed. It rises faster the less shielding they have, and beyond a limit they die.
_Avoid_: exposure, rads

**Micrometeorite**:
A tiny, fast-moving particle from space that damages whatever it hits.
_Avoid_: meteor, space debris

## Time

**Earth Day**:
A 24-hour period, the unit the game clock counts in.
_Avoid_: day (unqualified), sol

**Lunation**:
One full cycle of Daylight followed by Night, repeating on a fixed schedule.
_Avoid_: lunar month, day (unqualified)

**Daylight**:
The part of a Lunation when the sun shines on the base and solar power works.
_Avoid_: day, daytime, lunar day

**Night**:
The part of a Lunation when the base gets no sunlight, so solar power is unavailable and the base runs on stored power.
_Avoid_: dark period, lunar night
