import { catalogue } from "../src/catalogue";
import {
  loadCampaign,
  lunationMinutes,
  type Campaign,
} from "../src/simulation";
import { toGameMinutes } from "./scenario";
import { tryScenarios } from "./try-scenarios";

// The fixed scenes `npm run frame-time` draws, to measure how long the game
// takes to draw a frame (see docs/rendering-performance.md). Each starts from a
// base `npm run try` prepares and plays on to a fixed point in the Lunation, so
// that the sun, or the dark and the lights, are the same in every run.

export interface FrameTimeScene {
  /** What to type after `npm run frame-time -- --scene`. */
  readonly id: string;
  /** What the scene shows. */
  readonly title: string;
  /** The `npm run try` scenario whose base it starts from. */
  readonly base: string;
  /** Whether it is drawn by day, with the sun low, or at Night under the base's lights. */
  readonly part: "daylight" | "night";
  /**
   * How far to turn the mouse wheel over the 3D view, in pixels, to zoom out
   * from the Lander until the base is in view. 0 keeps the opening view.
   */
  readonly zoomOut: number;
  /** Light masts built round the Lander first, so that the Night shows lit ground. */
  readonly lights?: readonly LightMast[];
}

/** A light mast to build, and where. */
type LightMast = readonly [
  "light-mast" | "tall-light-mast",
  { readonly x: number; readonly y: number },
];

/** Round the Lander, in the opening view, on ground the base leaves clear. */
const LIGHT_MASTS: readonly LightMast[] = [
  ["tall-light-mast", { x: -12, y: -42 }],
  ["tall-light-mast", { x: 6, y: -16 }],
  ["light-mast", { x: 2, y: -30 }],
  ["light-mast", { x: 0, y: -52 }],
  ["light-mast", { x: 14, y: -60 }],
  ["light-mast", { x: -18, y: -26 }],
  ["light-mast", { x: -24, y: -58 }],
  ["light-mast", { x: 30, y: -50 }],
];

export const frameTimeScenes: readonly FrameTimeScene[] = [
  {
    id: "early-day",
    title: "An early base by day: a Workshop on its solar arrays and battery",
    base: "workshop",
    part: "daylight",
    zoomOut: 600,
  },
  {
    id: "late-day",
    title:
      "The long-game play guide's base near the end of Act 4, with eight light masts added round the Lander, by day with the sun low",
    base: "act-4-end",
    part: "daylight",
    zoomOut: 1500,
    lights: LIGHT_MASTS,
  },
  {
    id: "late-night",
    title: "The same base at Night, under its light masts",
    base: "act-4-end",
    part: "night",
    zoomOut: 1500,
    lights: LIGHT_MASTS,
  },
];

/** How long into Daylight or Night each scene is drawn: the sun is fully up, and low, by then. */
const INTO_PART_MINUTES = toGameMinutes({ hours: 6 });

/** How far into the current part of the Lunation the Campaign is, in game-minutes. */
function minutesInto(campaign: Campaign): number {
  const { daylight, lunation } = lunationMinutes(catalogue.lunation);
  const { part, minutesRemaining } = campaign.snapshot().lunation;
  return (
    (part === "daylight" ? daylight : lunation - daylight) - minutesRemaining
  );
}

/** Whether the Campaign stands at the scene's point in the Lunation. */
function atScenePoint(campaign: Campaign, scene: FrameTimeScene): boolean {
  const into = minutesInto(campaign);
  return (
    campaign.snapshot().lunation.part === scene.part &&
    into >= INTO_PART_MINUTES &&
    into < INTO_PART_MINUTES + 60
  );
}

/** The `npm run try` scenario's save, which may take minutes to prepare. */
export function baseSave(scenarioId: string): string {
  const scenario = tryScenarios.find(({ id }) => id === scenarioId);
  if (scenario === undefined) throw new Error(`No scenario ${scenarioId}.`);
  return scenario.save();
}

/** The base with the light masts built, unlocked and shipped first if need be. */
function withLights(base: string, lights: readonly LightMast[]): Campaign {
  const opened = JSON.parse(base) as {
    state: {
      unlockedDesignIds: string[];
      stockpile: { components: { componentId: string; count: number }[] };
    };
  };
  const { state } = opened;
  for (const [structureTypeId] of lights) {
    const type = catalogue.structureTypes.find(
      ({ id }) => id === structureTypeId,
    );
    if (type === undefined) throw new Error(`No ${structureTypeId}.`);
    if (!state.unlockedDesignIds.includes(type.designId)) {
      state.unlockedDesignIds.push(type.designId);
    }
    for (const { componentId, count } of type.components) {
      const stock = state.stockpile.components.find(
        (held) => held.componentId === componentId,
      );
      if (stock === undefined) {
        state.stockpile.components.push({ componentId, count });
      } else {
        stock.count += count;
      }
    }
  }
  const loaded = loadCampaign(JSON.stringify(opened));
  if (!loaded.ok) throw new Error(loaded.message);
  const { campaign } = loaded;
  for (const [structureTypeId, position] of lights) {
    const planned = campaign.planConstruction({ structureTypeId, position });
    if (!planned.ok) {
      throw new Error(
        `${structureTypeId} at ${position.x}, ${position.y}: ${planned.message}`,
      );
    }
  }
  for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
    if (hours > 40 * 24) throw new Error("The light masts were never built.");
    campaign.advance(60);
  }
  return campaign;
}

/**
 * The scene's save: its base played on, a game-hour at a time, to its point in
 * the Lunation, and the clock it then shows, as the game's top bar shows it.
 */
export function sceneSave(
  scene: FrameTimeScene,
  base: string,
): { save: string; clock: string } {
  const campaign = withLights(base, scene.lights ?? []);
  const { lunation } = lunationMinutes(catalogue.lunation);
  for (let hours = 0; !atScenePoint(campaign, scene); hours++) {
    if (hours * 60 > lunation)
      throw new Error(`${scene.id} was never reached.`);
    campaign.advance(60);
  }
  const { earthDay, hour } = campaign.snapshot().clock;
  return {
    save: campaign.save(),
    clock: `Earth Day ${earthDay}, ${String(hour).padStart(2, "0")}:00`,
  };
}
