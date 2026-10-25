# A headless simulation, rendered live

The game simulation is plain, deterministic TypeScript with no dependency on rendering, so it can be tested on its own and run at any speed. The renderer only draws the current simulation state, interpolating between ticks, so every stage of Construction is shown happening live on the base map. Cutscenes and pre-baked "building..." animations are deliberately excluded: what you see is what the simulation is doing.
