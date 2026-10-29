import { catalogue, type ResourceRef } from "../catalogue";
import type { CampaignEnd, CampaignState } from "./campaign";
import type {
  ConstructionStage,
  MachineStage,
  StructureState,
} from "./construction";
import type { DismantlingStage } from "./dismantling";
import type { DeathCause } from "./events";
import type { ExpeditionStage } from "./expeditions";
import type { LanderLeg } from "./lander";
import type { MachineActivity } from "./machines";
import type { MissionDirectorResidence } from "./mission-director";
import type { PlantStop } from "./plants";
import { MAX_SEED, nextFraction } from "./random";
import type { RobotActivity, WalkingDestination } from "./robot";
import type { RoverActivity } from "./rovers";
import type {
  MachineWorkOrderKind,
  RoverWorkOrderKind,
  StructureWorkOrderKind,
  WorkOrder,
  WorkOrderKind,
} from "./work-orders";

/** What every save document says it is, to tell it from any other JSON. */
const SAVE_FORMAT = "moonbase-save";

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

export type LoadRefusal =
  /** It isn't JSON, or isn't a Moon Base save document. */
  | "not-a-save"
  /** It comes from a newer save format version than this game can load. */
  | "newer-version"
  /** It is a save document, but something in it is missing or wrong. */
  | "damaged";

export type ReadResult =
  | { readonly ok: true; readonly state: CampaignState }
  | {
      readonly ok: false;
      readonly reason: LoadRefusal;
      /** The reason in words the player can read. */
      readonly message: string;
    };

/**
 * Writes the Campaign state as the text of a save document: JSON with the
 * format, its version, the random generator state and the rest of the
 * simulation state. Anything undefined is written as null, so that every
 * field is there to see.
 */
export function writeSaveDocument(state: CampaignState): string {
  const { random, ...rest } = state;
  return JSON.stringify(
    {
      format: SAVE_FORMAT,
      version: migrations.length + 1,
      random,
      state: rest,
    },
    (_key, value: unknown) => (value === undefined ? null : value),
    2,
  );
}

/**
 * Reads the text of a save document back into a Campaign state, first
 * bringing an older format version up to date through the chain of
 * migrations. Anything that isn't a save document of a version it can load,
 * with every field present and valid, is refused with the reason.
 */
export function readSaveDocument(
  text: string,
  chain: readonly Migration[] = migrations,
): ReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return notASave;
  }
  if (!isRecord(parsed) || parsed["format"] !== SAVE_FORMAT) return notASave;
  const version = parsed["version"];
  if (!isWholeNumber(version) || version < 1) {
    return damaged("its version isn't a whole number from 1 up");
  }
  const currentVersion = chain.length + 1;
  if (version > currentVersion) {
    return {
      ok: false,
      reason: "newer-version",
      message: `It was saved by a newer version of Moon Base, in save format version ${version}. This version can load up to version ${currentVersion}.`,
    };
  }
  let document: Record<string, unknown> = parsed;
  for (const [index, migration] of chain.entries()) {
    const from = index + 1;
    if (from < version) continue;
    try {
      document = { ...migration(document), version: from + 1 };
    } catch {
      return damaged(
        `it couldn't be brought up to date from format version ${from}`,
      );
    }
  }
  try {
    const { random, state } = saveDocument(document, "");
    return { ok: true, state: { random, ...state } };
  } catch (error) {
    if (error instanceof DamagedSave) return damaged(error.message);
    throw error;
  }
}

const notASave: ReadResult = {
  ok: false,
  reason: "not-a-save",
  message: "It isn't a Moon Base save file.",
};

function damaged(problem: string): ReadResult {
  return {
    ok: false,
    reason: "damaged",
    message: `The save file is damaged: ${problem}.`,
  };
}

// What follows checks a parsed save document against the current format,
// field by field, and rebuilds it as a Campaign state. Each decoder takes the
// value and its path in the document, for the reason it gives if refused.

class DamagedSave extends Error {}

type Decoder<T> = (value: unknown, path: string) => T;

function refuse(path: string, problem: string): DamagedSave {
  return new DamagedSave(`${path} ${problem}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function at(path: string, key: string | number): string {
  return path === "" ? String(key) : `${path}.${key}`;
}

const finiteNumber: Decoder<number> = (value, path) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw refuse(path, "isn't a number");
  }
  return value;
};

/** A number from 0 up, not necessarily whole, such as working time done at less than full speed. */
const amount: Decoder<number> = (value, path) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw refuse(path, "isn't a number from 0 up");
  }
  return value;
};

const wholeNumber: Decoder<number> = (value, path) => {
  if (!isWholeNumber(value) || value < 0) {
    throw refuse(path, "isn't a whole number from 0 up");
  }
  return value;
};

/**
 * A word of the random generator's state: 32 bits, which the generator keeps
 * as a signed or an unsigned number.
 */
const randomWord: Decoder<number> = (value, path) => {
  if (!isWholeNumber(value) || value < -(2 ** 31) || value > MAX_SEED) {
    throw refuse(path, "isn't a 32-bit whole number");
  }
  return value;
};

const boolean: Decoder<boolean> = (value, path) => {
  if (typeof value !== "boolean") throw refuse(path, "isn't true or false");
  return value;
};

const text: Decoder<string> = (value, path) => {
  if (typeof value !== "string") throw refuse(path, "isn't text");
  return value;
};

/** One of the given words; a record of them all, so the compiler checks none is left out. */
function oneOf<T extends string>(options: Record<T, true>): Decoder<T> {
  const words = Object.keys(options);
  return (value, path) => {
    if (typeof value !== "string" || !words.includes(value)) {
      throw refuse(path, `isn't one of ${quoted(words)}`);
    }
    return value as T;
  };
}

function quoted(words: readonly string[]): string {
  return words.map((word) => `"${word}"`).join(", ");
}

function exactly<T extends string>(word: T): Decoder<T> {
  return oneOf({ [word]: true } as Record<T, true>);
}

/** The id of something in the data catalogue. */
function catalogueId(
  entries: readonly { readonly id: string }[],
  kind: string,
): Decoder<string> {
  return (value, path) => {
    if (!entries.some((entry) => entry.id === value)) {
      throw refuse(path, `isn't a ${kind} in the data catalogue`);
    }
    return value as string;
  };
}

/** Undefined in the Campaign state, which is written as null. */
function optional<T>(decoder: Decoder<T>): Decoder<T | undefined> {
  return (value, path) =>
    value === null || value === undefined ? undefined : decoder(value, path);
}

function list<T>(decoder: Decoder<T>): Decoder<T[]> {
  return (value, path) => {
    if (!Array.isArray(value)) throw refuse(path, "isn't a list");
    return value.map((item, index) => decoder(item, at(path, index)));
  };
}

/** What a decoder, or any of a union of decoders, gives. */
type Decodes<D> = D extends Decoder<infer T> ? T : never;

type Fields = Record<string, Decoder<unknown>>;
type Decoded<F extends Fields> = { -readonly [K in keyof F]: Decodes<F[K]> };

/**
 * An object with exactly these fields. It keeps the fields in the order the
 * document gives them, so that saving a loaded Campaign again writes the
 * same text.
 */
function object<F extends Fields>(fields: F): Decoder<Decoded<F>> {
  return (value, path) => {
    if (!isRecord(value)) throw refuse(path, "isn't an object");
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const decoder = Object.hasOwn(fields, key) ? fields[key] : undefined;
      if (decoder === undefined) {
        throw refuse(at(path, key), "isn't part of the save format");
      }
      result[key] = decoder(child, at(path, key));
    }
    for (const [key, decoder] of Object.entries(fields)) {
      if (!Object.hasOwn(value, key)) decoder(undefined, at(path, key));
    }
    return result as Decoded<F>;
  };
}

/** One of two kinds of object, told apart by whether they have a field. */
function byField<A, B>(
  key: string,
  withField: Decoder<A>,
  withoutField: Decoder<B>,
): Decoder<A | B> {
  return (value, path) =>
    isRecord(value) && Object.hasOwn(value, key)
      ? withField(value, path)
      : withoutField(value, path);
}

/** One of several kinds of object, told apart by the word in one field. */
function tagged<C extends Record<string, Decoder<unknown>>>(
  key: string,
  cases: C,
): Decoder<Decodes<C[keyof C]>> {
  const words = Object.keys(cases);
  return (value, path) => {
    if (!isRecord(value)) throw refuse(path, "isn't an object");
    const word = value[key];
    const decoder =
      typeof word === "string" && Object.hasOwn(cases, word)
        ? cases[word]
        : undefined;
    if (decoder === undefined) {
      throw refuse(at(path, key), `isn't one of ${quoted(words)}`);
    }
    return decoder(value, path) as Decodes<C[keyof C]>;
  };
}

const groundPosition = object({ x: finiteNumber, y: finiteNumber });

const componentCount = object({
  componentId: catalogueId(catalogue.componentTypes, "Component"),
  count: wholeNumber,
});

const structureTypeId = catalogueId(catalogue.structureTypes, "Structure type");

const researchTaskId = catalogueId(catalogue.researchTasks, "Research Task");

const designId = catalogueId(catalogue.designs, "Design");

const resourceRef: Decoder<ResourceRef> = tagged("kind", {
  "bulk-resource": object({
    kind: exactly("bulk-resource"),
    resourceId: catalogueId(catalogue.bulkResources, "bulk resource"),
  }),
  "life-support": object({
    kind: exactly("life-support"),
    stockId: catalogueId(catalogue.lifeSupportStocks, "life support stock"),
  }),
} satisfies Record<ResourceRef["kind"], unknown>);

const plantStop: Decoder<PlantStop> = tagged("reason", {
  broken: object({ reason: exactly("broken") }),
  "no-input": object({ reason: exactly("no-input"), resource: resourceRef }),
  night: object({ reason: exactly("night") }),
  "no-power": object({ reason: exactly("no-power") }),
  "switched-off": object({ reason: exactly("switched-off") }),
  "switched-on": object({ reason: exactly("switched-on") }),
} satisfies Record<PlantStop["reason"], unknown>);

/**
 * A commissioned Structure. If it is a Plant, its recipe, and that of any
 * batch it has started, must be one of its type's; if it isn't, it has no
 * recipe, batch or reason it didn't run, and isn't switched off.
 */
const structure: Decoder<StructureState> = (() => {
  const fields = object({
    id: text,
    structureTypeId,
    position: groundPosition,
    powered: boolean,
    lit: boolean,
    storedKilowattHours: finiteNumber,
    conditionPercent: finiteNumber,
    dustCoatingPercent: finiteNumber,
    recipeId: optional(text),
    batch: optional(object({ recipeId: text, minutesWorked: amount })),
    plantStop: optional(plantStop),
    switchedOff: boolean,
  });
  return (value, path) => {
    const decoded = fields(value, path);
    const recipes =
      catalogue.structureTypes.find(
        (type) => type.id === decoded.structureTypeId,
      )?.recipes ?? [];
    const notAPlant = "isn't null, though the Structure isn't a Plant";
    /** Refuses a recipe the Structure's type doesn't have, or any recipe if it isn't a Plant. */
    const refuseUnknownRecipe = (
      recipeId: string | undefined,
      field: string,
    ) => {
      const known =
        recipes.length === 0
          ? recipeId === undefined
          : recipes.some((recipe) => recipe.id === recipeId);
      if (!known) {
        throw refuse(
          field,
          recipes.length === 0
            ? notAPlant
            : `isn't one of ${quoted(recipes.map((recipe) => recipe.id))}`,
        );
      }
    };
    refuseUnknownRecipe(decoded.recipeId, at(path, "recipeId"));
    if (decoded.batch !== undefined) {
      refuseUnknownRecipe(
        decoded.batch.recipeId,
        at(at(path, "batch"), "recipeId"),
      );
    }
    if (recipes.length === 0 && decoded.plantStop !== undefined) {
      throw refuse(at(path, "plantStop"), notAPlant);
    }
    if (recipes.length === 0 && decoded.switchedOff) {
      throw refuse(
        at(path, "switchedOff"),
        "is true, though the Structure isn't a Plant",
      );
    }
    return decoded;
  };
})();

const exportLine = object({
  resourceId: catalogueId(
    catalogue.exports.map((sold) => ({ id: sold.resourceId })),
    "Export",
  ),
  kilograms: amount,
});

const missionDirector: Decoder<MissionDirectorResidence> = tagged("residence", {
  lander: object({ residence: exactly("lander") }),
  habitat: object({
    residence: exactly("habitat"),
    habitatId: text,
    movedInAtMinute: wholeNumber,
  }),
} satisfies Record<MissionDirectorResidence["residence"], unknown>);

const deathCause: Decoder<DeathCause> = tagged("kind", {
  "ran-out": object({
    kind: exactly("ran-out"),
    stockId: catalogueId(catalogue.lifeSupportStocks, "life support stock"),
  }),
  "habitat-power-failed": object({
    kind: exactly("habitat-power-failed"),
    habitatId: text,
  }),
  "radiation-dose-limit": object({ kind: exactly("radiation-dose-limit") }),
} satisfies Record<DeathCause["kind"], unknown>);

const campaignEnd: Decoder<CampaignEnd> = object({
  atMinute: wholeNumber,
  cause: deathCause,
});

const robotActivity: Decoder<RobotActivity> = (() => {
  const drivingOrActivating = byField(
    "structureId",
    object({
      kind: oneOf({ "driving-machine": true, "activating-machine": true }),
      structureId: text,
      machineId: text,
    }),
    object({
      kind: oneOf({ "driving-machine": true, "activating-machine": true }),
      machineId: text,
      purpose: exactly("digging"),
    }),
  );
  const working = object({
    kind: oneOf({
      "loading-components": true,
      "unloading-components": true,
      assembling: true,
      commissioning: true,
      "laying-cable": true,
      dismantling: true,
      "returning-components": true,
      "loading-cargo": true,
      "unloading-cargo": true,
      maintaining: true,
      cleaning: true,
    }),
    structureId: text,
  });
  // Loading the Exports onto the Lander on a landing pad.
  const forExports = object({
    kind: oneOf({ "loading-exports": true, "putting-exports-aboard": true }),
  });
  // Maintenance of a Machine.
  const forMachine = object({
    kind: oneOf({ "loading-components": true, maintaining: true }),
    machineId: text,
  });
  // Maintenance of a Rover.
  const forRover = object({
    kind: oneOf({ "loading-components": true, maintaining: true }),
    roverId: text,
  });
  const walking = byField(
    "roverId",
    object({
      kind: exactly("walking"),
      roverId: text,
      destination: oneOf({ stockpile: true, rover: true }),
    }),
    byField(
      "machineId",
      object({
        kind: exactly("walking"),
        machineId: text,
        destination: oneOf({ stockpile: true, machine: true }),
      }),
      byField(
        "purpose",
        object({
          kind: exactly("walking"),
          purpose: exactly("exports"),
          destination: oneOf({ stockpile: true, lander: true }),
        }),
        object({
          kind: exactly("walking"),
          structureId: text,
          destination: oneOf<WalkingDestination>({
            site: true,
            stockpile: true,
            machine: true,
            cable: true,
            lander: true,
          }),
        }),
      ),
    ),
  );
  const repairing = object({
    kind: oneOf({ "loading-spare-components": true, "repairing-itself": true }),
  });
  return tagged("kind", {
    idle: object({ kind: exactly("idle") }),
    walking,
    "walking-to-repair": object({
      kind: exactly("walking-to-repair"),
      destination: oneOf({ stockpile: true, habitat: true, lander: true }),
    }),
    "loading-spare-components": repairing,
    "repairing-itself": repairing,
    "driving-machine": drivingOrActivating,
    "activating-machine": drivingOrActivating,
    "driving-rover": byField(
      "structureId",
      object({
        kind: exactly("driving-rover"),
        roverId: text,
        structureId: text,
      }),
      object({
        kind: exactly("driving-rover"),
        roverId: text,
        purpose: exactly("expedition"),
      }),
    ),
    "on-expedition": object({ kind: exactly("on-expedition") }),
    "unloading-expedition": object({ kind: exactly("unloading-expedition") }),
    "climbing-down": object({ kind: exactly("climbing-down") }),
    "walking-to-stockpile": object({ kind: exactly("walking-to-stockpile") }),
    "loading-components": byField(
      "roverId",
      forRover,
      byField("machineId", forMachine, working),
    ),
    "unloading-components": working,
    assembling: working,
    commissioning: working,
    "laying-cable": working,
    dismantling: working,
    "returning-components": working,
    "loading-cargo": working,
    "unloading-cargo": working,
    "loading-exports": forExports,
    "putting-exports-aboard": forExports,
    maintaining: byField(
      "roverId",
      forRover,
      byField("machineId", forMachine, working),
    ),
    cleaning: working,
  } satisfies Record<RobotActivity["kind"], unknown>);
})();

const workOrder: Decoder<WorkOrder> = (() => {
  const onRover = object({
    roverId: text,
    kind: oneOf<RoverWorkOrderKind>({
      "maintain-rover": true,
      "park-rover": true,
    }),
  });
  const onMachine = object({
    machineId: text,
    kind: oneOf<MachineWorkOrderKind>({
      "maintain-machine": true,
      "park-machine": true,
      dig: true,
    }),
  });
  const onStructure = object({
    structureId: text,
    kind: oneOf<StructureWorkOrderKind>({
      "prepare-site": true,
      "deliver-components": true,
      assemble: true,
      commission: true,
      "lay-cable": true,
      dismantle: true,
      "return-components": true,
      "unload-lander": true,
      "load-lander": true,
      maintain: true,
    }),
  });
  return tagged("kind", {
    "prepare-site": onStructure,
    "deliver-components": onStructure,
    assemble: onStructure,
    commission: onStructure,
    "lay-cable": onStructure,
    dismantle: onStructure,
    "return-components": onStructure,
    "unload-lander": onStructure,
    "load-lander": onStructure,
    maintain: onStructure,
    "maintain-machine": onMachine,
    "park-machine": onMachine,
    dig: onMachine,
    "maintain-rover": onRover,
    "park-rover": onRover,
  } satisfies Record<WorkOrderKind, unknown>);
})();

const machineActivity: Decoder<MachineActivity> = (() => {
  const busy = object({
    kind: oneOf({ "being-positioned": true, working: true }),
    constructionId: text,
  });
  return tagged("kind", {
    idle: object({ kind: exactly("idle") }),
    "being-positioned": busy,
    working: busy,
    "being-parked": object({
      kind: exactly("being-parked"),
      structureId: text,
    }),
    "being-positioned-to-dig": object({
      kind: exactly("being-positioned-to-dig"),
    }),
    digging: object({ kind: exactly("digging") }),
  } satisfies Record<MachineActivity["kind"], unknown>);
})();

const machineAssignment = object({
  constructionId: text,
  stage: oneOf<MachineStage>({ "site-preparation": true, assembly: true }),
  destination: groundPosition,
  activationMinutes: amount,
  working: boolean,
});

const lifeSupportRecord = object({
  producedKilograms: amount,
  usedKilograms: amount,
});

/** The Campaign state apart from the random generator's. */
const simulationState = object({
  elapsedMinutes: wholeNumber,
  nextStructureNumber: wholeNumber,
  nextPlanNumber: wholeNumber,
  lander: object({
    position: groundPosition,
    trip: optional(
      object({
        leg: oneOf<LanderLeg>({
          "travelling-to-earth": true,
          turnaround: true,
          "travelling-to-moon": true,
        }),
        legStartedAtMinute: wholeNumber,
        legEndsAtMinute: wholeNumber,
      }),
    ),
    cargo: list(componentCount),
    exports: list(exportLine),
  }),
  missionDirector,
  lifeSupport: list(
    object({
      stockId: catalogueId(catalogue.lifeSupportStocks, "life support stock"),
      kilograms: finiteNumber,
    }),
  ),
  selfSufficiency: list(
    object({
      stockId: catalogueId(catalogue.lifeSupportStocks, "life support stock"),
      current: lifeSupportRecord,
      records: list(lifeSupportRecord),
    }),
  ),
  radiationDoseMillisieverts: finiteNumber,
  solarParticleEvent: object({
    warnsAtMinute: wholeNumber,
    startsAtMinute: wholeNumber,
    endsAtMinute: wholeNumber,
  }),
  micrometeorite: object({ strikesAtMinute: wholeNumber }),
  spareComponentsWarnedMinutes: optional(wholeNumber),
  fundingMillionDollars: finiteNumber,
  launchManifest: list(
    object({
      itemId: catalogueId(catalogue.launch.items, "Launch item"),
      count: wholeNumber,
    }),
  ),
  launchFeePaidMillionDollars: optional(amount),
  exportsToLoad: list(exportLine),
  science: wholeNumber,
  researchTask: optional(
    object({ researchTaskId, workedMinutes: wholeNumber }),
  ),
  completedResearchTaskIds: list(researchTaskId),
  unlockedDesignIds: list(designId),
  reachedMilestoneIds: list(catalogueId(catalogue.milestones, "Milestone")),
  ended: optional(campaignEnd),
  robots: list(
    object({
      id: text,
      position: groundPosition,
      activity: robotActivity,
      carrying: list(componentCount),
      workOrder: optional(workOrder),
      conditionPercent: finiteNumber,
      selfRepair: optional(
        object({
          home: oneOf({ habitat: true, lander: true }),
          spot: groundPosition,
          spareComponents: optional(wholeNumber),
          workedMinutes: wholeNumber,
        }),
      ),
      arrival: optional(object({ workedMinutes: wholeNumber })),
    }),
  ),
  machines: list(
    object({
      id: text,
      machineTypeId: catalogueId(catalogue.machineTypes, "Machine type"),
      position: groundPosition,
      activity: machineActivity,
      assignment: optional(machineAssignment),
      digging: optional(
        object({
          destination: groundPosition,
          activationMinutes: amount,
          working: boolean,
        }),
      ),
      conditionPercent: finiteNumber,
      powered: boolean,
    }),
  ),
  rovers: list(
    object({
      id: text,
      position: groundPosition,
      activity: tagged("kind", {
        idle: object({ kind: exactly("idle") }),
        "being-parked": object({
          kind: exactly("being-parked"),
          structureId: text,
        }),
        "on-expedition": object({ kind: exactly("on-expedition") }),
      } satisfies Record<RoverActivity["kind"], unknown>),
      conditionPercent: finiteNumber,
      powered: boolean,
    }),
  ),
  stockpile: object({
    position: groundPosition,
    components: list(componentCount),
  }),
  bulkResources: list(
    object({
      resourceId: catalogueId(catalogue.bulkResources, "bulk resource"),
      kilograms: amount,
    }),
  ),
  constructions: list(
    object({
      id: text,
      structureTypeId,
      position: groundPosition,
      planNumber: wholeNumber,
      workSpot: groundPosition,
      stage: oneOf<ConstructionStage>({
        "site-preparation": true,
        "component-delivery": true,
        assembly: true,
        commissioning: true,
      }),
      workedMinutes: amount,
      componentsTaken: boolean,
      failedCommissionings: wholeNumber,
    }),
  ),
  structures: list(structure),
  dismantlings: list(
    object({
      id: text,
      structureTypeId,
      position: groundPosition,
      planNumber: wholeNumber,
      workSpot: groundPosition,
      stage: oneOf<DismantlingStage>({
        "taking-apart": true,
        "returning-components": true,
      }),
      workedMinutes: amount,
      recovered: list(componentCount),
      collected: boolean,
    }),
  ),
  unloading: optional(
    object({
      landingPadId: text,
      planNumber: wholeNumber,
      cargo: list(componentCount),
      workedMinutes: amount,
      collected: boolean,
    }),
  ),
  exportLoading: optional(
    object({
      landingPadId: text,
      planNumber: wholeNumber,
      workedMinutes: amount,
      collected: boolean,
    }),
  ),
  cables: list(
    object({
      fromStructureId: text,
      toStructureId: text,
      start: groundPosition,
      end: groundPosition,
      route: list(groundPosition),
      complete: boolean,
    }),
  ),
  reconnections: list(object({ structureId: text, planNumber: wholeNumber })),
  maintenance: list(
    object({
      target: tagged("kind", {
        structure: object({ kind: exactly("structure"), structureId: text }),
        machine: object({ kind: exactly("machine"), machineId: text }),
        rover: object({ kind: exactly("rover"), roverId: text }),
      }),
      workSpot: groundPosition,
      visit: optional(
        object({ spareComponents: wholeNumber, cleaning: boolean }),
      ),
      workedMinutes: amount,
    }),
  ),
  parking: list(
    object({
      target: tagged("kind", {
        machine: object({ kind: exactly("machine"), machineId: text }),
        rover: object({ kind: exactly("rover"), roverId: text }),
      }),
      structureId: text,
      bayIndex: optional(wholeNumber),
      destination: groundPosition,
    }),
  ),
  expedition: optional(
    object({
      robotId: text,
      roverId: text,
      stage: oneOf<ExpeditionStage>({
        boarding: true,
        "driving-out": true,
        away: true,
        "driving-back": true,
        unloading: true,
      }),
      exitPoint: optional(groundPosition),
      returnsAtMinute: optional(wholeNumber),
      workedMinutes: amount,
    }),
  ),
}) satisfies Decoder<Omit<CampaignState, "random">>;

const saveDocument = object({
  format: exactly(SAVE_FORMAT),
  version: wholeNumber,
  random: object({
    a: randomWord,
    b: randomWord,
    c: randomWord,
    d: randomWord,
  }),
  state: simulationState,
});
