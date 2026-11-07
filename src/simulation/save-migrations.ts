import { nextFraction } from "./random";

/**
 * Upgrades a save document from one format version to the next. It is given
 * the parsed JSON of the older version and returns that of the newer; the
 * version number is updated for it.
 */
export type Migration = (
  document: Readonly<Record<string, unknown>>,
) => Record<string, unknown>;

/**
 * The migrations from each save format version to the next: the first from
 * version 1 to version 2, and so on, so that the current version is one more
 * than their number. A released format is a compatibility contract
 * (ADR-0006): changing the format means adding a migration here, never
 * editing one that has been released.
 */
export const migrations: readonly Migration[] = [
  // 1 to 2: the Lander's cargo stock became the base's stock, kept at a
  // stockpile beside the landing site, and Robots walk there rather than to
  // the Lander to load and unload Components.
  // Anything not as expected is left for reading the document to refuse.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { cargo, robots, ...rest } = state;
    return {
      ...document,
      state: {
        ...rest,
        robots: Array.isArray(robots)
          ? robots.map((robot: unknown) =>
              isRecord(robot) &&
              isRecord(robot["activity"]) &&
              robot["activity"]["kind"] === "walking" &&
              robot["activity"]["destination"] === "lander"
                ? {
                    ...robot,
                    activity: {
                      ...robot["activity"],
                      destination: "stockpile",
                    },
                  }
                : robot,
            )
          : robots,
        // Where the stockpile stood when format version 2 came in.
        stockpile: { position: { x: 9, y: -10 }, components: cargo },
      },
    };
  },
  // 2 to 3: the base programme has Funding, which a Campaign starts with
  // from the Programme Grant, and a Launch manifest, which starts empty.
  // The grant is the one when format version 3 came in, so that tuning it
  // later doesn't change what this migration gives.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    return {
      ...document,
      state: {
        ...state,
        fundingMillionDollars: 400,
        launchManifest: [],
      },
    };
  },
  // 3 to 4: the Lander flies a round trip to Earth and back. Until now it
  // had never left, so it is landed.
  (document) => {
    const state = document["state"];
    if (!isRecord(state) || !isRecord(state["lander"])) return { ...document };
    return {
      ...document,
      state: { ...state, lander: { ...state["lander"], trip: null } },
    };
  },
  // 4 to 5: the Lander takes the Launch manifest with it as it leaves Earth,
  // paying for it then, and delivers it as it lands. A Lander already on its
  // way back left Earth with nothing aboard, so the manifest it would now
  // be bringing, which nothing has paid for, is emptied.
  (document) => {
    const state = document["state"];
    const lander = isRecord(state) ? state["lander"] : undefined;
    const trip = isRecord(lander) ? lander["trip"] : undefined;
    if (
      !isRecord(state) ||
      !isRecord(trip) ||
      trip["leg"] !== "travelling-to-moon"
    ) {
      return { ...document };
    }
    return { ...document, state: { ...state, launchManifest: [] } };
  },
  // 5 to 6: every Structure has a Condition, which Plume Ejecta wears down.
  // Nothing wore it down before, so each is at 100%.
  (document) => {
    const state = document["state"];
    if (!isRecord(state) || !Array.isArray(state["structures"])) {
      return { ...document };
    }
    return {
      ...document,
      state: {
        ...state,
        structures: state["structures"].map((structure: unknown) =>
          isRecord(structure)
            ? { ...structure, conditionPercent: 100 }
            : structure,
        ),
      },
    };
  },
  // 6 to 7: the landing pad, with two new Components, which the base's
  // stock keeps a count of after the others. The Lander can land on a pad
  // with cargo aboard for the Robot to unload, so it has a list of cargo,
  // and there is a planned unloading. Before, it never had any.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { lander, stockpile } = state;
    return {
      ...document,
      state: {
        ...state,
        lander: isRecord(lander) ? { ...lander, cargo: [] } : lander,
        stockpile:
          isRecord(stockpile) && Array.isArray(stockpile["components"])
            ? {
                ...stockpile,
                components: [
                  ...(stockpile["components"] as unknown[]),
                  { componentId: "pad-panel", count: 0 },
                  { componentId: "pad-beacon", count: 0 },
                ],
              }
            : stockpile,
        unloading: null,
      },
    };
  },
  // 7 to 8: Maintenance, which uses up spare Components, a new Component
  // the base's stock keeps a count of after the others. An older save's
  // stock gains the starting amount of them, as it stood when format
  // version 8 came in, and has no Maintenance raised yet: Structures worn
  // down are raised for in the first game-minute played.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { stockpile } = state;
    return {
      ...document,
      state: {
        ...state,
        stockpile:
          isRecord(stockpile) && Array.isArray(stockpile["components"])
            ? {
                ...stockpile,
                components: [
                  ...(stockpile["components"] as unknown[]),
                  { componentId: "spare-component", count: 6 },
                ],
              }
            : stockpile,
        maintenance: [],
      },
    };
  },
  // 8 to 9: Dust coats solar arrays, and every Structure keeps a Dust
  // coating, clean until now. A Maintenance visit can clean as well as
  // restore Condition, so what one under way does becomes a visit: it
  // restores Condition with the spare Components taken, and doesn't clean.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { structures, maintenance } = state;
    return {
      ...document,
      state: {
        ...state,
        structures: Array.isArray(structures)
          ? structures.map((structure: unknown) =>
              isRecord(structure)
                ? { ...structure, dustCoatingPercent: 0 }
                : structure,
            )
          : structures,
        maintenance: Array.isArray(maintenance)
          ? maintenance.map((order: unknown) => {
              if (!isRecord(order)) return order;
              const { spareComponents, ...rest } = order;
              return {
                ...rest,
                visit:
                  spareComponents === null || spareComponents === undefined
                    ? null
                    : { spareComponents, cleaning: false },
              };
            })
          : maintenance,
      },
    };
  },
  // 9 to 10: every Machine has a Condition, which Dust wears down as it
  // works and is driven, and Maintenance can be for a Machine as well as a
  // Structure, so it names what it is for. Nothing wore a Machine down
  // before, so each is at 100%, and Maintenance until now was always for a
  // Structure.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { machines, maintenance } = state;
    return {
      ...document,
      state: {
        ...state,
        machines: Array.isArray(machines)
          ? machines.map((machine: unknown) =>
              isRecord(machine)
                ? { ...machine, conditionPercent: 100 }
                : machine,
            )
          : machines,
        maintenance: Array.isArray(maintenance)
          ? maintenance.map((order: unknown) => {
              if (!isRecord(order)) return order;
              const { structureId, ...rest } = order;
              return { target: { kind: "structure", structureId }, ...rest };
            })
          : maintenance,
      },
    };
  },
  // 10 to 11: Machines plug in to powered Structures, whose networks
  // supply their heaters at Night, and the Robot parks them where they can
  // plug in. A Machine has power as the next game-minute's power is
  // supplied, and none is being parked yet.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { machines } = state;
    return {
      ...document,
      state: {
        ...state,
        machines: Array.isArray(machines)
          ? machines.map((machine: unknown) =>
              isRecord(machine) ? { ...machine, powered: false } : machine,
            )
          : machines,
        parking: [],
      },
    };
  },
  // 11 to 12: every Robot has a Condition, which Dust wears down as it
  // works, and repairs itself when it falls too far. Nothing wore a Robot
  // down before, so each is at 100%, repairing nothing.
  (document) => {
    const state = document["state"];
    if (!isRecord(state) || !Array.isArray(state["robots"])) {
      return { ...document };
    }
    return {
      ...document,
      state: {
        ...state,
        robots: state["robots"].map((robot: unknown) =>
          isRecord(robot)
            ? { ...robot, conditionPercent: 100, selfRepair: null }
            : robot,
        ),
      },
    };
  },
  // 12 to 13: Micrometeorites strike at random, one at a time. The first
  // is scheduled from the saved generator, which moves on with the draw,
  // from 4 to 20 Earth Days after the game-minute saved, as the strikes'
  // range stood when format version 13 came in.
  (document) => {
    const state = document["state"];
    const saved = document["random"];
    if (
      !isRecord(state) ||
      !isWholeNumber(state["elapsedMinutes"]) ||
      !isRecord(saved) ||
      !isWholeNumber(saved["a"]) ||
      !isWholeNumber(saved["b"]) ||
      !isWholeNumber(saved["c"]) ||
      !isWholeNumber(saved["d"])
    ) {
      return { ...document };
    }
    const random = {
      a: saved["a"],
      b: saved["b"],
      c: saved["c"],
      d: saved["d"],
    };
    const low = 4 * 24 * 60;
    const high = 20 * 24 * 60;
    const strikesAtMinute =
      state["elapsedMinutes"] +
      low +
      Math.floor(nextFraction(random) * (high - low + 1));
    return {
      ...document,
      random,
      state: { ...state, micrometeorite: { strikesAtMinute } },
    };
  },
  // 13 to 14: warnings that the spare Components will run out, given once
  // for each level. None has been given yet.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    return {
      ...document,
      state: { ...state, spareComponentsWarnedMinutes: null },
    };
  },
  // 14 to 15: the base keeps a stock of bulk resources, Regolith alone so
  // far, which the excavator digs beside the stockpile. Nothing was dug
  // before, so there is none, and no Machine is digging.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { machines } = state;
    return {
      ...document,
      state: {
        ...state,
        machines: Array.isArray(machines)
          ? machines.map((machine: unknown) =>
              isRecord(machine) ? { ...machine, digging: null } : machine,
            )
          : machines,
        bulkResources: [{ resourceId: "regolith", kilograms: 0 }],
      },
    };
  },
  // 15 to 16: a Rover comes in the starting cargo, and "park" Work Orders
  // can be for a Rover as well as a Machine, so they name what they park;
  // until now each was for a Machine. An older save gains the Rover at full
  // Condition, parked near the Lander (see `roverSpotForVersion16`).
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { parking } = state;
    return {
      ...document,
      state: {
        ...state,
        rovers: [
          {
            id: "rover-1",
            position: roverSpotForVersion16(state),
            activity: { kind: "idle" },
            conditionPercent: 100,
            powered: false,
          },
        ],
        parking: Array.isArray(parking)
          ? parking.map((order: unknown) => {
              if (!isRecord(order)) return order;
              const { machineId, ...rest } = order;
              return { target: { kind: "machine", machineId }, ...rest };
            })
          : parking,
      },
    };
  },
  // 16 to 17: the extraction plant, a Structure that runs a recipe, with
  // two new Components, which the base's stock keeps a count of after the
  // others, and metals and silicon, which join Regolith among the bulk
  // resources. None of them was there before.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { stockpile, bulkResources } = state;
    return {
      ...document,
      state: {
        ...state,
        stockpile:
          isRecord(stockpile) && Array.isArray(stockpile["components"])
            ? {
                ...stockpile,
                components: [
                  ...(stockpile["components"] as unknown[]),
                  { componentId: "extraction-reactor", count: 0 },
                  { componentId: "oxygen-separator", count: 0 },
                ],
              }
            : stockpile,
        bulkResources: Array.isArray(bulkResources)
          ? [
              ...(bulkResources as unknown[]),
              { resourceId: "metals", kilograms: 0 },
              { resourceId: "silicon", kilograms: 0 },
            ]
          : bulkResources,
      },
    };
  },
  // 17 to 18: Expeditions, which bring back water ice, a new bulk
  // resource after the others. None has been under way yet, so there is
  // no ice.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { bulkResources } = state;
    return {
      ...document,
      state: {
        ...state,
        bulkResources: Array.isArray(bulkResources)
          ? [
              ...(bulkResources as unknown[]),
              { resourceId: "water-ice", kilograms: 0 },
            ]
          : bulkResources,
        expedition: null,
      },
    };
  },
  // 18 to 19: the water-processing plant, with two new Components, which
  // the base's stock keeps a count of after the others. None was there
  // before.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { stockpile } = state;
    return {
      ...document,
      state: {
        ...state,
        stockpile:
          isRecord(stockpile) && Array.isArray(stockpile["components"])
            ? {
                ...stockpile,
                components: [
                  ...(stockpile["components"] as unknown[]),
                  { componentId: "ice-melter", count: 0 },
                  { componentId: "water-purifier", count: 0 },
                ],
              }
            : stockpile,
      },
    };
  },
  // 19 to 20: the base is self-sufficient in oxygen or water once, over a
  // trailing window, its Plants have made as much as the Mission Director
  // used, which is judged on records of both. None was kept before, so a
  // whole window has to pass after loading before it can be.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    return {
      ...document,
      state: {
        ...state,
        selfSufficiency: ["oxygen", "water"].map((stockId) => ({
          stockId,
          current: { producedKilograms: 0, usedKilograms: 0 },
          records: [],
        })),
      },
    };
  },
  // 20 to 21: the vacuum fabrication plant, with two new Components, which
  // the base's stock keeps a count of after the others, and wafers, which
  // come among the bulk resources straight after silicon. None of them was
  // there before.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { stockpile, bulkResources } = state;
    return {
      ...document,
      state: {
        ...state,
        stockpile:
          isRecord(stockpile) && Array.isArray(stockpile["components"])
            ? {
                ...stockpile,
                components: [
                  ...(stockpile["components"] as unknown[]),
                  { componentId: "crystal-furnace", count: 0 },
                  { componentId: "wafer-saw", count: 0 },
                ],
              }
            : stockpile,
        bulkResources: Array.isArray(bulkResources)
          ? (bulkResources as unknown[]).flatMap((stock) =>
              isRecord(stock) && stock["resourceId"] === "silicon"
                ? [stock, { resourceId: "wafers", kilograms: 0 }]
                : [stock],
            )
          : bulkResources,
      },
    };
  },
  // 21 to 22: Exports, which the player sets to load onto the Lander and it
  // carries to Earth to sell. There were none before, to load or aboard.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { lander } = state;
    return {
      ...document,
      state: {
        ...state,
        lander: isRecord(lander) ? { ...lander, exports: [] } : lander,
        exportsToLoad: [],
      },
    };
  },
  // 22 to 23: the circuit board plant, with two new Components, which the
  // base's stock keeps a count of after the others, and circuit boards,
  // which come among the bulk resources straight after wafers. None of them
  // was there before.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { stockpile, bulkResources } = state;
    return {
      ...document,
      state: {
        ...state,
        stockpile:
          isRecord(stockpile) && Array.isArray(stockpile["components"])
            ? {
                ...stockpile,
                components: [
                  ...(stockpile["components"] as unknown[]),
                  { componentId: "circuit-etcher", count: 0 },
                  { componentId: "reflow-oven", count: 0 },
                ],
              }
            : stockpile,
        bulkResources: Array.isArray(bulkResources)
          ? (bulkResources as unknown[]).flatMap((stock) =>
              isRecord(stock) && stock["resourceId"] === "wafers"
                ? [stock, { resourceId: "circuit-boards", kilograms: 0 }]
                : [stock],
            )
          : bulkResources,
      },
    };
  },
  // 23 to 24: on a landing pad, the Robot carries the Exports to load from
  // the stockpile to the Lander, as a planned loading. There was none
  // before; if the Lander stands on a working landing pad with Exports to
  // load, one is planned in the first game-minute played.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    return { ...document, state: { ...state, exportLoading: null } };
  },
  // 24 to 25: a Plant can have several recipes, and runs the one chosen for
  // it. Until now each ran its only one, which is now its default, so each
  // runs that; any other Structure runs none. The defaults are those when
  // format version 25 came in, so that changing them later doesn't change
  // what this migration gives.
  (document) => {
    const state = document["state"];
    if (!isRecord(state) || !Array.isArray(state["structures"])) {
      return { ...document };
    }
    const defaults: Record<string, string> = {
      "extraction-plant": "oxygen",
      "water-processing-plant": "water",
      "vacuum-fabrication-plant": "wafers",
      "circuit-board-plant": "circuit-boards",
    };
    return {
      ...document,
      state: {
        ...state,
        structures: (state["structures"] as unknown[]).map((structure) => {
          if (!isRecord(structure)) return structure;
          const type = structure["structureTypeId"];
          return {
            ...structure,
            recipeId:
              typeof type === "string" ? (defaults[type] ?? null) : null,
          };
        }),
      },
    };
  },
  // 25 to 26: Research Tasks, which earn Science. None had run before, so
  // there is no Science, none running and none completed.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    return {
      ...document,
      state: {
        ...state,
        science: 0,
        researchTask: null,
        completedResearchTaskIds: [],
      },
    };
  },
  // 26 to 27: the Tech Tree, whose Designs are unlocked with Science.
  // Everything that could be built or shipped before belongs to a starting
  // Design, so an older save has those unlocked and no others. They are the
  // starting Designs when format version 27 came in, so that adding or
  // changing starting Designs later doesn't change what this migration gives.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    return {
      ...document,
      state: {
        ...state,
        unlockedDesignIds: [
          "solar-arrays",
          "battery-banks",
          "light-masts",
          "maintenance-spares",
          "regolith-shielding",
          "inflatable-habitat",
          "life-support-resupply",
          "water-processing",
          "regolith-extraction",
          "vacuum-fabrication",
          "circuit-board-fabrication",
          "landing-pads",
        ],
      },
    };
  },
  // 27 to 28: the large battery bank, behind the Large battery banks
  // Design, with two new Components, which the base's stock keeps a count
  // of after the others. None of them was there before. The later Phase 7
  // Designs that bring new Components add a migration like this one.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { stockpile } = state;
    return {
      ...document,
      state: {
        ...state,
        stockpile:
          isRecord(stockpile) && Array.isArray(stockpile["components"])
            ? {
                ...stockpile,
                components: [
                  ...(stockpile["components"] as unknown[]),
                  { componentId: "large-battery-module", count: 0 },
                  { componentId: "large-battery-cabinet", count: 0 },
                ],
              }
            : stockpile,
      },
    };
  },
  // 28 to 29: a Launch can bring a Robot, behind the Robots Design, which
  // climbs down from the Lander as it lands and walks to the stockpile
  // before it works. No Launch brought one before, so no Robot is
  // arriving.
  (document) => {
    const state = document["state"];
    if (!isRecord(state) || !Array.isArray(state["robots"])) {
      return { ...document };
    }
    return {
      ...document,
      state: {
        ...state,
        robots: state["robots"].map((robot: unknown) =>
          isRecord(robot) ? { ...robot, arrival: null } : robot,
        ),
      },
    };
  },
  // 29 to 30: the Protection Designs, whose hardened Structures bring four
  // new Components, which the base's stock keeps a count of after the
  // others. None of them was there before.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { stockpile } = state;
    return {
      ...document,
      state: {
        ...state,
        stockpile:
          isRecord(stockpile) && Array.isArray(stockpile["components"])
            ? {
                ...stockpile,
                components: [
                  ...(stockpile["components"] as unknown[]),
                  { componentId: "sealed-array-mast", count: 0 },
                  { componentId: "screened-solar-panel", count: 0 },
                  { componentId: "whipple-cabinet", count: 0 },
                  { componentId: "armoured-habitat-envelope", count: 0 },
                ],
              }
            : stockpile,
      },
    };
  },
  // 30 to 31: the Power and Construction Designs, whose thin-film solar
  // array, tall Light Mast and prefabricated solar array bring three new
  // Components, which the base's stock keeps a count of after the others.
  // None of them was there before.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { stockpile } = state;
    return {
      ...document,
      state: {
        ...state,
        stockpile:
          isRecord(stockpile) && Array.isArray(stockpile["components"])
            ? {
                ...stockpile,
                components: [
                  ...(stockpile["components"] as unknown[]),
                  { componentId: "thin-film-solar-panel", count: 0 },
                  { componentId: "tall-mast-pole", count: 0 },
                  { componentId: "prefabricated-array-pack", count: 0 },
                ],
              }
            : stockpile,
      },
    };
  },
  // 31 to 32: the Life Support, Industry and Mobility Designs, whose
  // electrolysis plant, large extraction plant, integrated fabrication
  // plant and lit landing pad bring four new Components, which the base's
  // stock keeps a count of after the others. None of them was there before.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { stockpile } = state;
    return {
      ...document,
      state: {
        ...state,
        stockpile:
          isRecord(stockpile) && Array.isArray(stockpile["components"])
            ? {
                ...stockpile,
                components: [
                  ...(stockpile["components"] as unknown[]),
                  { componentId: "electrolyser-stack", count: 0 },
                  { componentId: "molten-regolith-cell", count: 0 },
                  { componentId: "board-assembly-line", count: 0 },
                  { componentId: "landing-floodlight", count: 0 },
                ],
              }
            : stockpile,
      },
    };
  },
  // 32 to 33: the Milestones reached. The base kept no record of its past,
  // so this marks reached only what the saved state shows of a moment that
  // has passed: the Lander departing, while it is away. The Milestones
  // whose condition the saved state meets are reached as play goes on. The
  // id is the one when format version 33 came in, so that renaming it later
  // doesn't change what this migration gives.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { lander } = state;
    const away = isRecord(lander) && isRecord(lander["trip"]);
    return {
      ...document,
      state: {
        ...state,
        reachedMilestoneIds: away ? ["lander-departs"] : [],
      },
    };
  },
  // 33 to 34: Water-wall shielding, whose water wall brings a new
  // Component, which the base's stock keeps a count of after the others.
  // None was there before.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { stockpile } = state;
    return {
      ...document,
      state: {
        ...state,
        stockpile:
          isRecord(stockpile) && Array.isArray(stockpile["components"])
            ? {
                ...stockpile,
                components: [
                  ...(stockpile["components"] as unknown[]),
                  { componentId: "water-wall-bladder", count: 0 },
                ],
              }
            : stockpile,
      },
    };
  },
  // 34 to 35: Plants work in batches, and keep why they didn't run. Until
  // now each ran from game-minute to game-minute, so none has a batch
  // started: each starts one when it next can. None kept why it didn't run,
  // so until the first game-minute played each says why from the base as
  // it was saved.
  (document) => {
    const state = document["state"];
    if (!isRecord(state) || !Array.isArray(state["structures"])) {
      return { ...document };
    }
    return {
      ...document,
      state: {
        ...state,
        structures: (state["structures"] as unknown[]).map((structure) =>
          isRecord(structure)
            ? { ...structure, batch: null, plantStop: null }
            : structure,
        ),
      },
    };
  },
  // 35 to 36: the Launch manifest keeps the Launch fee it was paid with
  // while it is locked, as a Design can now cut the fee. Until now every
  // Launch paid the one fee, $150M when format version 36 came in, so a
  // Lander on its way to the Moon paid that.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const lander = state["lander"];
    const trip = isRecord(lander) ? lander["trip"] : undefined;
    const paid = isRecord(trip) && trip["leg"] === "travelling-to-moon";
    return {
      ...document,
      state: { ...state, launchFeePaidMillionDollars: paid ? 150 : null },
    };
  },
  // 36 to 37: the player can switch a Plant off and on. None could be
  // switched off before, so every Structure is switched on.
  (document) => {
    const state = document["state"];
    if (!isRecord(state) || !Array.isArray(state["structures"])) {
      return { ...document };
    }
    return {
      ...document,
      state: {
        ...state,
        structures: (state["structures"] as unknown[]).map((structure) =>
          isRecord(structure)
            ? { ...structure, switchedOff: false }
            : structure,
        ),
      },
    };
  },
  // 37 to 38: the parking area, behind the Parking areas Design, a new
  // starting Design, so an older save has it unlocked, after the Designs
  // it had. Its bay socket is a new Component, which the base's stock
  // keeps a count of after the others; none was there before. A park Work
  // Order keeps which bay of a parking area it is for, if any; there were
  // no parking areas before, so every one is for the spot beside its
  // Structure.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { stockpile, unlockedDesignIds, parking } = state;
    return {
      ...document,
      state: {
        ...state,
        parking: Array.isArray(parking)
          ? parking.map((order: unknown) =>
              isRecord(order) ? { ...order, bayIndex: null } : order,
            )
          : parking,
        stockpile:
          isRecord(stockpile) && Array.isArray(stockpile["components"])
            ? {
                ...stockpile,
                components: [
                  ...(stockpile["components"] as unknown[]),
                  { componentId: "bay-socket", count: 0 },
                ],
              }
            : stockpile,
        unlockedDesignIds: Array.isArray(unlockedDesignIds)
          ? [...(unlockedDesignIds as unknown[]), "parking-areas"]
          : unlockedDesignIds,
      },
    };
  },
  // 38 to 39: the telescope, behind the Optical telescopes Design, which
  // observes at Night for the observing programme, a standing Research
  // Task. It brings two new Components, which the base's stock keeps a
  // count of after the others; none of them was there before. No telescope
  // had observed, so the programme's first round has nothing done on it.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    const { stockpile } = state;
    return {
      ...document,
      state: {
        ...state,
        observingMinutes: 0,
        stockpile:
          isRecord(stockpile) && Array.isArray(stockpile["components"])
            ? {
                ...stockpile,
                components: [
                  ...(stockpile["components"] as unknown[]),
                  { componentId: "telescope-optics", count: 0 },
                  { componentId: "telescope-mount", count: 0 },
                ],
              }
            : stockpile,
      },
    };
  },
  // 39 to 40: nothing in the document changes. From this version on, reading
  // gives a count of none to any Component or bulk resource a save doesn't
  // have a count for, so that adding one to the data catalogue no longer needs
  // a migration.
  (document) => ({ ...document }),
  // 40 to 41: the base is self-sufficient in spare Components once, over a
  // trailing window, its Plants have made as many as repairs used, judged on
  // records of both. None was kept before, so a whole window has to pass after
  // loading before it can be.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    return {
      ...document,
      state: {
        ...state,
        spareComponentSufficiency: {
          current: { made: 0, used: 0 },
          records: [],
        },
      },
    };
  },
  // 41 to 42: nothing in the document changes. From this version on, a Plant
  // may be saved as waiting for room for what it makes. A stock over its new
  // storage limit stays as it is, and its Plants wait until it falls.
  (document) => ({ ...document }),
  // 42 to 43: the liquid oxygen tank and the bulk water tank are no longer Launch
  // items, as the Bulk supply tanks Design now brings storage tanks to build. What
  // a manifest not yet paid for asked of them is taken off it, as nothing has been
  // spent. A Lander on its way to the Moon has been paid for them, so it brings
  // the same oxygen and water as the resupply items, at six to the tank.
  (document) => {
    const state = document["state"];
    if (!isRecord(state) || !Array.isArray(state["launchManifest"])) {
      return { ...document };
    }
    const resupplyOf: Readonly<Record<string, string>> = {
      "liquid-oxygen-tank": "oxygen",
      "bulk-water-tank": "water",
    };
    const lander = state["lander"];
    const trip = isRecord(lander) ? lander["trip"] : undefined;
    const paid = isRecord(trip) && trip["leg"] === "travelling-to-moon";
    const lines: Record<string, unknown>[] = [];
    const add = (itemId: string, count: number) => {
      const line = lines.find((other) => other["itemId"] === itemId);
      if (line === undefined) lines.push({ itemId, count });
      else line["count"] = Number(line["count"]) + count;
    };
    for (const line of state["launchManifest"] as unknown[]) {
      const resupply =
        isRecord(line) && typeof line["itemId"] === "string"
          ? resupplyOf[line["itemId"]]
          : undefined;
      if (resupply === undefined) {
        lines.push(line as Record<string, unknown>);
      } else if (paid && isRecord(line) && typeof line["count"] === "number") {
        add(resupply, 6 * line["count"]);
      }
    }
    // A manifest is in catalogue order, where oxygen comes before water.
    const oxygen = lines.findIndex((line) => line["itemId"] === "oxygen");
    const water = lines.findIndex((line) => line["itemId"] === "water");
    if (water !== -1 && oxygen > water) {
      const [moved] = lines.splice(oxygen, 1);
      if (moved !== undefined) lines.splice(water, 0, moved);
    }
    return { ...document, state: { ...state, launchManifest: lines } };
  },
  // 43 to 44: the Greenhouse, whose current round is kept on its Structure. There
  // were none, so nothing has grown on any.
  (document) => {
    const state = document["state"];
    if (!isRecord(state) || !Array.isArray(state["structures"])) {
      return { ...document };
    }
    return {
      ...document,
      state: {
        ...state,
        structures: (state["structures"] as unknown[]).map((structure) =>
          isRecord(structure) ? { ...structure, growingMinutes: 0 } : structure,
        ),
      },
    };
  },
  // 44 to 45: Research Tasks can wait in a queue behind the one running. None
  // could before, so the queue is empty.
  (document) => {
    const state = document["state"];
    if (!isRecord(state)) return { ...document };
    return { ...document, state: { ...state, researchQueue: [] } };
  },
  // 45 to 46: types of Expedition. Only water ice could be under way before.
  (document) => {
    const state = document["state"];
    if (!isRecord(state) || !isRecord(state["expedition"])) {
      return { ...document };
    }
    return {
      ...document,
      state: {
        ...state,
        expedition: { ...state["expedition"], typeId: "water-ice" },
      },
    };
  },
  // 46 to 47: nothing in the document changes. From this version on, automated
  // experiments labs speed up the Research Task running, so the game-minutes done of
  // it may be a fraction, and a Plant may be saved as waiting for a Research Task.
  (document) => ({ ...document }),
];

/**
 * Where the migration to format version 16 parks the Rover: where a new
 * Campaign had it then, or, if something has been built or parked over
 * that ground since, the first of a few spots round the Lander that is
 * clear. The footprints are as they were when format version 16 came in,
 * so that tuning them later doesn't change what the migration gives.
 */
function roverSpotForVersion16(state: Record<string, unknown>): {
  x: number;
  y: number;
} {
  const roverRadius = 1.5;
  const radii: Record<string, number> = {
    "solar-array": 3,
    "battery-bank": 2,
    "light-mast": 0.8,
    habitat: 4,
    "regolith-shielding": 4,
    "landing-pad": 7,
    excavator: 1.6,
    "regolith-printer": 1.8,
  };
  const taken: { x: number; y: number; radius: number }[] = [];
  const take = (position: unknown, radius: number) => {
    if (
      isRecord(position) &&
      typeof position["x"] === "number" &&
      typeof position["y"] === "number"
    ) {
      taken.push({ x: position["x"], y: position["y"], radius });
    }
  };
  const radiusOf = (type: unknown) =>
    typeof type === "string" ? (radii[type] ?? 0) : 0;
  for (const key of ["structures", "constructions", "dismantlings"]) {
    const items = state[key];
    if (!Array.isArray(items)) continue;
    for (const item of items as unknown[]) {
      if (isRecord(item))
        take(item["position"], radiusOf(item["structureTypeId"]));
    }
  }
  const machines = state["machines"];
  if (Array.isArray(machines)) {
    for (const machine of machines as unknown[]) {
      if (isRecord(machine)) {
        take(machine["position"], radiusOf(machine["machineTypeId"]));
      }
    }
  }
  const stockpile = state["stockpile"];
  if (isRecord(stockpile)) take(stockpile["position"], 1.5);
  const spots = [
    { x: 0, y: 13 },
    { x: -13, y: 4 },
    { x: 13, y: 2 },
    { x: -5, y: -13 },
    { x: 7, y: 13 },
  ];
  return (
    spots.find((spot) =>
      taken.every(
        (other) =>
          Math.hypot(spot.x - other.x, spot.y - other.y) >=
          other.radius + roverRadius,
      ),
    ) ?? { x: 0, y: 13 }
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}
