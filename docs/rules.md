# How the game works

This is how a Campaign plays. It describes the rules, not the numbers: rates, masses, prices, thresholds, durations and Science costs are set in the data catalogue (`src/catalogue/catalogue.ts`), and the game shows them where they matter. [`GLOSSARY.md`](../GLOSSARY.md) defines the terms in capitals.

## Conventions

These hold throughout, so the sections below don't repeat them:

- **Refusals give the reason.** Any command that can't be carried out (an item that won't fit on the Launch manifest, a Structure placed where it can't stand, a Design that isn't unlocked) is refused, and the game says why.
- **Notifications never pause the game.** They appear in the list at the bottom right. "Skip to next event" jumps straight to the next notable moment: Night falling, a Construction commissioned, a warning, a Milestone, each leg of the Lander's round trip, a Solar Particle Event's warning, start and end, an Expedition leaving or returning, a Research Task completed, or a Structure needing Maintenance.
- **Screens don't pause the game either**: the Launch manifest, Research Tasks, Tech Tree and Expeditions screens all let it run on.
- **Running out is forecast and warned of.** For oxygen, water, Habitat power, the Radiation Dose and spare Components, the status panel shows when the limit will be reached, and warnings come at three levels of time left (the data catalogue sets them).
- **Chance is seeded.** Random events are the same for the same seed and choices. Add `?seed=<number>` to the address to replay a Campaign exactly.

## Screen and controls

- **Top bar:** the game clock, game speed, "Skip to next event", the Funding and Science balances, the Launch manifest, Research Tasks and Tech Tree buttons, the Guide, and Save and Load.
- **Status panel (left):** Milestones, the Mission Director, the base's power and stock, the Lander and Expeditions, and the running Research Task, above the build menu.
- **Base panel (right):** the Structures, Robots, Machines and Rovers with their Condition, between the Work panel and the notification list.
- Each section of the status and Base panels folds away when you click its title and stays folded on your next visit; a dot by a folded title means something in it needs attention. Hover over a self-sufficiency figure or the time left in the Lunation for detail.
- **Guide:** explains, without leaving the game, how the base works (power and Night, repairs, keeping the Mission Director alive, Launches and Funding, Science), what every Structure does, with its figures, Components and the Design it needs, what every Component is for, what the Robot, Machines and Rover do, and what each technology unlocks. Every figure and list in it comes from the data catalogue.
- **What things are for, where you choose them:** hovering over a Structure in the build menu says what it does and what it is built from; each item on the Launch manifest says what it is for (the Structures built from a Component and how many each takes, what spare Components do, how long oxygen or water lasts the Mission Director); each Tech Tree card says what unlocking it brings, with what each of its Structures does; and the Research Tasks screen lists what Science buys next, and on each task the Designs its Science would bring within reach or, if it pays too little for any, the cheapest it builds towards and how far short it leaves you. These say the same as the Guide.
- **Camera:** drag with the left mouse button to pan, drag with the right button to rotate, and use the wheel to zoom from the whole map down to a single Robot.

## Milestones

Milestones guide a new player through the Campaign. They carry no rewards and never end it, and there is no victory condition. The status panel shows the current Milestone (the earliest not yet reached) with a hint saying what to do next, and the one after it. A Milestone is reached the first time its condition holds, in any order, and stays reached even if the condition later stops holding. The data catalogue lists them, with their hints:

1. **Power storage before the first Night:** a Structure that stores power is commissioned (even if the first Night has already fallen).
2. **Habitat commissioned, Mission Director moved in.**
3. **Lander departs:** the Lander takes off for Earth for the first time.
4. **Habitat shielded:** Regolith shielding is commissioned over the Habitat the Mission Director lives in.
5. **Landing pad:** a landing pad is commissioned.
6. **First Research Task:** a Research Task is completed.
7. **First Export:** an Export is sold as the Lander reaches Earth.
8. **Oxygen self-sufficiency:** as the status panel judges it (see [Self-sufficiency](#self-sufficiency)).
9. **Water self-sufficiency:** the same, for water.

## Construction

To plan a Construction, pick a Structure in the build menu, move its translucent preview over the map and click to place it; right-click or Esc cancels. The Robot carries it out by itself through the stages of Construction, and the Work panel shows each one:

- **Site Preparation:** the Robot drives the excavator to the site and activates it, and the excavator grades the ground by itself while the Robot gets on with other work.
- **Component delivery and Assembly:** the Robot loads the Components at the stockpile beside the Lander, carries them over and assembles them.
- **Commissioning**, which can fail.
- **Cable:** every Construction after the first that uses power also has the Robot lay power cable from the nearest powered Structure (one on a network with a solar array or battery bank). Only Structures joined by cable share power. If a Structure that uses power is ever left without a source, the Robot lays it a new cable as soon as there is one.

A Construction whose Components aren't in the base's stock waits, with the reason in the Work panel, and the Robot moves on to the next. "Cancel" in the Work panel removes an unfinished Construction at once and returns its unassembled Components. "Dismantle" beside a commissioned Structure in the Base panel has the Robot take it apart and carry its Components back to the stockpile, minus a share damaged beyond reuse; the Structure keeps working until the Robot starts.

Nothing can be built over the stockpile, the Lander, the landing site or the Rover, and while you place a Structure, the build menu shows the Plume Ejecta danger zone round the Lander (placing in it is allowed). A few Structures can't be dismantled while something depends on them: the Habitat the Mission Director lives in, a shielded Habitat until its shielding is gone, Regolith shielding until any water wall over it is gone, and a landing pad while the Lander stands on it.

## Power

Solar arrays generate only in Daylight. Battery banks store any surplus and cover any shortfall. The status panel shows each network's generation, use, stored energy and when stored power will run out.

When a network can't cover everything, power goes in this order:

1. The Habitat. It works only with all the power it draws; part of it is the same as none.
2. Other Structures, which lose power in the order they were commissioned.
3. Heaters of Machines and Rovers plugged in to the network, at Night.
4. Lights, at Night, in the order they were commissioned (see below).
5. Plants, which run only on power that nothing else uses and no battery bank can store: in practice, in Daylight once the battery banks are full.

Light Masts switch on by themselves at Night, light the ground round them, and draw power only while on. They only help you see: work carries on in the dark without them. At Night a light stays on only while its network's battery banks hold more than everything else on the network needs through the rest of the Night and a reserve after it; otherwise it switches itself off to save power, the last-commissioned first, so lights never leave the Habitat, or anything else, without power. The Base panel shows a light off to save power, the power figures and forecasts leave it out, and a notification says when the lights on a network start switching off.

One battery bank can't carry the Habitat through a Night; the starting stock holds enough for one Night once they are charged. The Lander can't bring more in time if it leaves in the first Daylight, so build them all before moving in, or wait aboard until the next Daylight.

## The Mission Director

The Mission Director starts aboard the Lander, with an inflatable Habitat kit in the starting stock. Once the Habitat is commissioned and powered, "Move in" beside it moves them in at once and for good. The Lander is then free to fly.

- **Oxygen and water.** The base starts with enough for about a month. Aboard the Lander they are safe indefinitely; once the Mission Director lives in the Habitat they use some every Earth Day.
- **Habitat power.** Once they live in it, the Habitat must stay powered. An empty, unpowered Habitat harms nobody.
- **Radiation Dose.** None aboard the Lander, and a steady rate in the Habitat, cut by shielding (see [Radiation](#radiation)).

If oxygen or water runs out, the Habitat they live in loses power, or the Radiation Dose reaches the limit, the Mission Director dies at once and the Campaign is over. The game-over screen says how they died, and "Start a new Campaign" starts again from the landing (with the same seed, if the address gives one).

## Radiation

- **Regolith shielding:** pick it in the build menu and place it on a commissioned Habitat. The excavator grades the ground round it, then the Robot drives the regolith printer over and activates it, and the printer builds the shielding up layer by layer from Regolith taken straight from the ground: no Components and no cable. It cuts the dose rate sharply.
- **Water wall** (the Water-wall shielding Design): its bladders come by Launch and go over a Habitat's Regolith shielding (either kind). They are filled from the base's water stock as Assembly starts, which must leave the Mission Director a reserve of drinking water; until there is enough, the Construction waits, and the Work panel says how much more water it needs. The water stays in the wall even if the Construction is cancelled or the wall dismantled. It cuts the dose rate much further again.
- **Solar Particle Events** come at random, with a few hours' warning, and multiply the dose rate while they last. Aboard the Lander it stays zero and shielding keeps it low, but in an unshielded Habitat one can take half the dose limit. The forecasts and warnings account for them.

Shielding and the water wall are the only Structures that may overlap another, and only the Habitat they cover (and, for the water wall, its shielding). The Base panel shows a Habitat as shielded or water-walled; a Broken water wall or shielding stops protecting it.

## Launches and the Lander

The Mission Director starts with the Programme Grant as Funding. "Launch manifest" opens the screen where you choose what the next Launch brings: Components whose Design is unlocked, oxygen and water, and, once the Robots Design is unlocked, extra Robots. Bars show the manifest's Payload Mass against the Launch's limit and its cost (the Launch fee plus each item's price, or nothing while empty) against the Funding. Unlocking Reusable boosters on the Tech Tree lowers the Launch fee for every Launch paid for afterwards; one already paid for, on its way back, keeps the fee it was paid with.

Once the Mission Director has moved into a Habitat, "Send the Lander" sends it on its round trip: it flies to Earth, turns around there and flies back to land on the same spot. You can change the manifest until the Lander leaves Earth; then it locks and its cost comes off the Funding. It can never cost more than the Lander can pay as it leaves (see [Exports](#exports)). When the Lander lands, its Components join the base's stock and its oxygen and water the life support stocks, and a new, empty manifest starts. The base carries on while it is away. Running out of Funding never ends the Campaign by itself.

**Plume Ejecta.** Every take-off and landing at the landing site blasts the ground round it, wearing down the Condition of every Structure within reach.

**Landing pads** stop that. A landing pad can go anywhere clear of other Structures, but its pad panels and beacon must come by Launch. Once it is commissioned, the Lander lands and takes off there with no Plume Ejecta, and the danger zone disappears. On the pad, oxygen and water still arrive as the Lander lands, but the Components stay aboard until an unloading Work Order has a Robot carry them to the stockpile, and the Lander can't leave until it has. If the pad is dismantled or Broken, the Lander uses the landing site again.

## Exports

Wafers and circuit boards are Exports. The Launch manifest screen's Exports tab sets how many kilograms of each to load, against the Lander's Return Mass and the base's stock, with what they will sell for. Its Aboard column shows the kilograms of each already on the Lander, until they are sold. They can't be changed while the Lander is away.

- **At the landing site**, Exports stay in the base's stock until take-off, then go aboard (as much as is left).
- **On a landing pad**, setting them raises a loading Work Order, and a Robot carries them aboard. Until it picks them up, changing the amounts changes what it carries and clearing them cancels the loading; once it has them, changes and sending the Lander are refused until they are aboard. You can then set more for another round of loading.

The Exports are sold when the Lander reaches Earth, before the manifest is paid for as it leaves, so the manifest's cost may be up to the Funding balance plus what the Exports aboard and to load will sell for, and the Launch manifest screen counts their value alongside the Funding. The Exports to load count for as much of each as the base still has in stock, as the Lander takes no more. They can still be lowered, and the stock can run short of them as Plants use it, so the Lander can't be sent while the manifest costs more than they and the Funding come to; it says so, and the Launch tab warns of it. Once it is sent, they go aboard before anything else can use them.

## Condition and Maintenance

Every commissioned Structure, Machine, Rover and Robot has a Condition, from 100% down. The Base panel shows it, rounded to the whole percent. Things that wear it down:

- **Dust:** a rate for each hour something operates, set by type. A Structure to do with power operates only while powered; one without, such as a landing pad, always does. Machines and Rovers wear while working or driven, Robots while not idle.
- **Plume Ejecta** (see above).
- **Micrometeorites:** strikes at random, without warning, each hitting one Structure, Machine, Rover or Robot and taking a random share of its Condition.
- **The cold of Night:** Machines and Rovers left unpowered (see [Machines and the Rover](#machines-and-the-rover)).
- **Dust coating:** solar arrays also gather Dust coating in Daylight, which cuts their output on top of any wear.

Below a threshold, things work less well in step with their Condition: solar arrays generate less, battery banks store less (losing any energy above what they can now hold), Light Masts light a smaller circle, Plants run slower, and Machines and Robots work and move more slowly. The power figures and forecasts follow. The Habitat, shielding and landing pads work fully until Broken.

At 0% a Structure or Machine is **Broken**: it stays where it is but stops working. A Broken battery bank loses its stored energy, and a Broken Habitat loses its power and shielding, which kills the Mission Director if they live in it. A Broken Machine gives up the Construction stage it was on until another is free or it is repaired. A Broken Rover can't be driven. Robots are never Broken.

**Maintenance.** Once something's Condition falls below the Maintenance threshold, or it is Broken, a Maintenance Work Order is raised for it. The Robot loads spare Components at the stockpile, carries them over and restores it to 100%, using spare Components in proportion to the Condition restored. If the base's stock has too few, the Work Order waits, the Work panel says how many more it needs and to put spare Components on the Launch manifest, and the Robot does other work meanwhile. The player never repairs anything: a line at the top of the Base panel's Structures and Robots & Machines sections says repairs are automatic, hovering over a Condition says the same, and the notifications that something needs Maintenance or is Broken say the Robot will repair it. A solar array whose Dust coating passes a threshold is cleaned the same way, without spares, on the same visit as any Maintenance it is due. Nothing that is to be dismantled is maintained, and a Machine busy with a Construction stage is maintained once it is idle again, unless it is Broken.

**Spare Components forecast.** The status panel shows how long the spares will last at the current rate of wear (including the average Micrometeorite damage), after the spares already claimed. Each warning is given once, until more spares arrive or the forecast recovers well clear of the warning levels.

## Robots

Robots carry out Work Orders by themselves, in this order:

1. Repairing themselves.
2. Maintenance, in the order it was raised.
3. Parking Machines and Rovers before and during Night.
4. Everything else (Constructions, dismantling, unloading and loading the Lander) in the order you planned it.
5. Digging Regolith, only when there is nothing else to do.

Except to repair itself, a Robot finishes the Work Order it is on before taking a higher-priority one. Below a low Condition, a Robot stops, collects spare Components and repairs itself where the Mission Director lives (the Habitat, or the Lander while they are aboard), then takes up its Work Order again. Short of spares it makes a makeshift repair and carries on slowly.

**Extra Robots.** Unlocking the Robots Design offers a Robot on the Launch manifest. Each one shipped climbs down the Lander's ladder as it lands and walks to the stockpile, after which it works like the first. The Lander can't leave while a Robot is still climbing down. Robots share the Work Orders: each claims the next one that no other Robot holds, so several Constructions can go ahead at once. The Base panel and notifications number them ("Robot 1", "Robot 2").

## Machines and the Rover

The excavator and the regolith printer are Machines: a Robot drives them to a site and activates them, and they work by themselves. The Rover arrives in the starting cargo and is used for Expeditions.

A Machine or Rover standing close to a powered, unbroken Structure is **plugged in**: at Night its heater draws from that network, and the Base panel shows it as powered. One that isn't plugged in, or whose network can't supply its heater, wears down in the cold. Some hours before Night falls, the Robots start parking each idle Machine that isn't plugged in, then the Rover, beside the nearest powered Structure, and during Night they do the same whenever one becomes idle away from power. The heaters draw on the same battery banks as the Habitat.

## Bulk resources, digging and Expeditions

The base keeps bulk resources at the stockpile, measured in kilograms: Regolith, water ice, metals, silicon, wafers and circuit boards. The status panel shows them, with how fast any that is changing rises or falls a day, as the Plants and digging are running now, and roughly how long any that is falling will last.

**Digging.** Whenever Regolith is below a set level and the excavator is free, a Robot with nothing else to do drives it to clear ground beside the stockpile and sets it digging. Digging always gives way to Site Preparation, Maintenance and parking, and carries on afterwards while the stock is still short.

**Expeditions.** "Start an Expedition" on the Expeditions screen sends a Robot off the map in the Rover. It finishes the Work Order it holds, drives off the nearest map edge, is away for some Earth Days, then drives back and unloads water ice at the stockpile. Only one Expedition can be under way at a time, and not while the Rover is Broken. While away, the Robot takes no Work Orders and doesn't repair itself, and the cold and Micrometeorites pass both of them by. The Rover wears down by Dust as it drives, but never so far that it can't come back.

## Plants

A Plant is a Structure that runs a recipe by itself once commissioned: it turns bulk resources (or Regolith) into others, or into oxygen or water. Its Components come by Launch, and a Robot lays it a cable like any other. It draws power only while running, last of everything on its network, so it can never take power from the Habitat.

A Plant works in batches, each a game-hour of its recipe. It starts one only once an hour's worth of every input is in stock, and takes them as it starts; the batch's outputs come as it finishes, an hour later at full Condition and longer below it, and the next batch starts straight after if the inputs are there. A batch needs power to spare the whole time it runs: without it, as every Night, the batch waits with the work done on it kept, and finishes once there is power again. A Broken Plant's batch waits for its repair. A batch is lost if its Plant is dismantled.

The Base panel says what each Plant is doing: running, with the minutes left of its batch and what it makes and uses an hour; waiting for an input, with how much of it is in stock out of what a batch needs (for example "waiting for Silicon: 0.12 of 0.35 kg"); waiting for power to spare in Daylight, while the battery banks charge; or idle at Night. Two Plants that need the same input start their batches in the order they were commissioned, so the second may wait while the first runs.

| Plant                        | Design                       | Makes                                                                                              |
| ---------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Extraction plant             | Regolith extraction          | From Regolith, either mostly oxygen (its default) or mostly metals and silicon, a little of each   |
| Water-processing plant       | Water processing             | Water, from water ice                                                                              |
| Vacuum fabrication plant     | Vacuum fabrication           | Wafers, from silicon                                                                               |
| Circuit board plant          | Circuit board fabrication    | Circuit boards, from wafers and metals                                                             |
| Electrolysis plant           | Water electrolysis           | Oxygen, from water ice                                                                             |
| Large extraction plant       | Molten regolith electrolysis | The extraction plant's two recipes, faster and for less power for each kilogram                    |
| Integrated fabrication plant | Integrated fabrication       | Circuit boards from silicon and metals, or wafers alone; needs a large extraction plant to feed it |

A Plant with more than one recipe has a recipe list beside it in the Base panel. Choosing another switches it from its next batch, as one it has started finishes with the recipe it was started with; it is a setting, so no Robot does any work for it. The forecasts follow the recipe each Plant runs. So that they never run ahead of the stocks, they count what each running Plant makes a batch late, as it comes only as the batch finishes, and the inputs it has taken for its batch as if it used them evenly through the hour: while production outruns use, the status panel shows a stock rising instead of when it runs out. Plants stand idle at Night, so the oxygen and water forecasts look ahead through it: in Daylight they follow the current rate to nightfall, then what the Mission Director uses through the Night, and so on through the Lunations ahead, and at Night they look as far as the next Daylight. A stock that is rising but won't last the Night ahead shows when it will run out, and its warnings come before Night falls; one that will last it gets none.

An extraction plant, a vacuum fabrication plant and a circuit board plant are balanced to run together on what two solar arrays can spare. One extraction plant can't keep the Mission Director in oxygen and feed a vacuum fabrication plant at once, so switch its recipe as the stocks need, or ship a second.

### Self-sufficiency

The status panel shows whether the base is self-sufficient in oxygen and in water: whether, over the last Lunation, its Plants made at least as much as the Mission Director used, judged at regular intervals. Because it looks back a whole Lunation, it holds through a Night when the Plants stand idle. It can't hold before a whole Lunation has passed since the Campaign began (or since an older save was loaded), or while the Mission Director lives aboard the Lander. Gaining and losing it are notifications.

## Research and the Tech Tree

**Research Tasks** earn Science. The Research Tasks screen shows the one running, with its progress, and every other with its length, the Science it pays and the Designs that Science would bring within reach (or, if too few, how far short of the cheapest it leaves you), below what Science buys next; short ones pay more for each hour, long ones run unattended. Only one runs at a time, and each can be completed only once. A Research Task costs only game time: it needs no Robot, power or Components, and carries on through Night and everything else. Many need a Design unlocked first and are hidden until then. They range from hours to Lunations, and the Designs deeper in the Tech Tree cost the most, so research carries on long after the base is self-sufficient.

**The Tech Tree** spends Science on Designs. Its screen has a tab for each category (Power, Construction, Protection, Life Support, Industry and Mobility), with each Design's cost, what unlocking it brings, the Designs it needs first and whether it can be unlocked now. Everything available at the start belongs to a starting Design.

Unlocking a Design is permission, not the thing itself: its items appear on the Launch manifest and in the build menu, but still have to be shipped and built. Nothing already in stock, on its way or planned is affected, and Structures already built keep their old behaviour.

The Designs beyond the starting ones:

| Category     | Design                       | Unlocks                                                                                         |
| ------------ | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| Power        | Large battery banks          | A large battery bank: much more storage, less mass and money for each kWh                       |
| Power        | Thin-film solar cells        | A thin-film solar array: more power from a lighter array                                        |
| Power        | Tall Light Masts             | A tall Light Mast: lights four times the ground, for more power                                 |
| Construction | Prefabricated solar arrays   | A prefabricated solar array: one pack, quicker to build and less likely to fail Commissioning   |
| Construction | Regolith sintering           | A sintered landing pad, printed from Regolith with no Components, but slower to build           |
| Construction | Microwave sintering          | Sintered Regolith shielding, printed much faster                                                |
| Protection   | Dust-sealed solar arrays     | A dust-sealed solar array, which wears down more slowly                                         |
| Protection   | Electrodynamic dust screens  | A dust-screened solar array, which also gathers Dust coating more slowly                        |
| Protection   | Whipple shielding            | A Whipple-shielded battery bank, which takes less from Micrometeorites                          |
| Protection   | Hardened Habitat             | A hardened Habitat, which takes less from Micrometeorites and Plume Ejecta                      |
| Protection   | Water-wall shielding         | The water wall (see [Radiation](#radiation))                                                    |
| Life Support | Water electrolysis           | An electrolysis plant (see [Plants](#plants))                                                   |
| Life Support | Bulk supply tanks            | Larger, cheaper-for-each-kilogram oxygen and water tanks for the Launch manifest                |
| Industry     | Molten regolith electrolysis | A large extraction plant                                                                        |
| Industry     | Integrated fabrication       | An integrated fabrication plant                                                                 |
| Mobility     | Robots                       | Extra Robots on the Launch manifest (see [Robots](#robots))                                     |
| Mobility     | Landing pad lights           | A lit landing pad, whose lights come on at Night so you can see the Lander land and be unloaded |

A hardened Structure does the same job as the one it is based on, on the same footprint, but wears down more slowly, and the Mission Director can move into a hardened Habitat and shield it as usual. Unlocking some Designs also offers new Research Tasks.

## Saving

"Save" in the top bar downloads the Campaign as a `.moonbase` file named after the game clock, and "Load" carries on from a file you choose, in place of the Campaign you're playing. The game-over screen has both. Nothing is kept in the browser, so a Campaign you haven't saved is lost when you close or reload the page (ADR-0006). A file that isn't a Moon Base save, is damaged, or comes from a newer version of the game is refused, and the Campaign you're playing carries on.
