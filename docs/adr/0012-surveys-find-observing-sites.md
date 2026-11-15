# Surveys find observing sites, where the late telescopes work faster

ADR-0009 said Surveys would find the dark and radio-quiet sites the infrared telescope and the radio telescope array need, so that Expeditions have a part in Act 4. It left open what a site is, how it shows, what it does, and how it relates to the planned Deposits (#264).

The map is 1 km square, and the telescopes only have to be 80 m from lights and 120 m from Plants. A site that only showed where those rules are met would add almost nothing, so a site changes the telescope's rate.

- **What it is.** An **Observing site** is a circle on the map, 40 m in radius, of one kind: a dark site, for an infrared telescope, or a radio-quiet site, for a radio telescope array. Its centre is 250 m to 420 m from the Lander, so the whole circle is on the map and beyond a long cable. A Campaign finds at most one of each kind.
- **How it is found.** By an ordinary Survey, with no new type of Expedition. Once the Design of a telescope that needs a site is unlocked, the next Survey back finds one as well as its Science, the dark site first if both are due. Where it lies comes from a copy of the Campaign's random generator, so the same save finds it in the same place, and finding it leaves the hazards to come as they were.
- **What it does.** An infrared telescope whose whole footprint stands within the dark site, or a radio telescope array whose own footprint stands within the radio-quiet site, works its rounds 50% faster. For an array, the speed-up applies to its whole rate, its antenna fields included, wherever they stand. A telescope anywhere else works as it always did. The dark and quiet radii still apply on a site.
- **How it shows.** The map draws each found site as a coloured disc. The Survey's notification says what it found. The Expeditions screen lists found sites and can show each on the map. A telescope's pop-up, and the hint while placing one, say whether it is on its site.
- **Deposits.** An Observing site is not a Deposit, and Deposits stay planned. Found sites are kept in their own list in the save (format version 51).

A site found where a telescope already stands speeds that telescope up. This isn't an upgrade changing what exists: the telescope was always placed there, and the Survey only finds what the ground was already like.

## Considered options

- **Sites only show where to build, with no change to rates.** On a 1 km map that is guidance the player doesn't need, so a Survey would still have no part in Act 4.
- **Telescopes may only be built on a found site.** Old saves with telescopes off any site would need special handling, and a base that never sends a Survey would lose the telescopes.
- **A new type of Expedition, a site survey.** More content to add and balance, for what an ordinary Survey can do as it comes back.
- **Build Deposit surveying first, and make sites a kind of Deposit.** It holds this issue up behind a larger design that isn't settled.
