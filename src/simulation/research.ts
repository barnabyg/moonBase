import { catalogue, type ResearchTask } from "../catalogue";
import type { CampaignState } from "./campaign";
import type { GameEvent } from "./events";

/** The Research Task running, and how far it has got. */
export interface ResearchTaskState {
  researchTaskId: string;
  /** The game-minutes it has run so far. */
  workedMinutes: number;
}

/** The Research Task running, and how long it has left. */
export interface ResearchTaskSnapshot {
  readonly researchTaskId: string;
  /** How much of it is done, from 0 to 1. */
  readonly progress: number;
  /** Game-minutes until it is complete. */
  readonly minutesLeft: number;
}

export type StartResearchTaskRefusal =
  | "unknown-research-task"
  | "already-completed"
  | "research-task-running"
  | "campaign-ended";

export type StartResearchTaskResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: StartResearchTaskRefusal;
      /** The reason in words the player can read. */
      readonly message: string;
    };

/**
 * Starts a Research Task, which runs by itself from the next game-minute,
 * unless it has already been completed or one is running already.
 */
export function startResearchTask(
  state: CampaignState,
  researchTaskId: string,
): StartResearchTaskResult {
  const task = findResearchTask(researchTaskId);
  if (task === undefined) {
    return refuse(
      "unknown-research-task",
      `There is no Research Task called "${researchTaskId}".`,
    );
  }
  if (state.completedResearchTaskIds.includes(task.id)) {
    return refuse(
      "already-completed",
      `${task.label} has already been completed, and can't be carried out again.`,
    );
  }
  const running = state.researchTask;
  if (running !== undefined) {
    const label =
      findResearchTask(running.researchTaskId)?.label ?? running.researchTaskId;
    return refuse(
      "research-task-running",
      `${label} is running, and only one Research Task runs at a time.`,
    );
  }
  state.researchTask = { researchTaskId: task.id, workedMinutes: 0 };
  return { ok: true };
}

/**
 * Runs the Research Task for a game-minute. It needs no Robot, power or
 * Components, so nothing else holds it up. Once it has run its length, it is
 * complete: its Science is added to the base's, and it can't run again.
 */
export function runResearch(state: CampaignState): GameEvent[] {
  const running = state.researchTask;
  if (running === undefined) return [];
  running.workedMinutes += 1;
  const task = findResearchTask(running.researchTaskId);
  if (task === undefined || running.workedMinutes < lengthMinutes(task)) {
    return [];
  }
  state.researchTask = undefined;
  state.completedResearchTaskIds.push(task.id);
  state.science += task.science;
  return [
    {
      kind: "research-task-completed",
      atMinute: state.elapsedMinutes,
      researchTaskId: task.id,
      science: task.science,
    },
  ];
}

export function readResearchTask(
  state: CampaignState,
): ResearchTaskSnapshot | undefined {
  const running = state.researchTask;
  if (running === undefined) return undefined;
  const task = findResearchTask(running.researchTaskId);
  if (task === undefined) return undefined;
  const length = lengthMinutes(task);
  return {
    researchTaskId: running.researchTaskId,
    progress: Math.min(running.workedMinutes / length, 1),
    minutesLeft: Math.max(length - running.workedMinutes, 0),
  };
}

/** How long a Research Task runs, in game-minutes. */
function lengthMinutes(task: ResearchTask): number {
  return Math.round(task.lengthHours * 60);
}

function findResearchTask(id: string): ResearchTask | undefined {
  return catalogue.researchTasks.find((task) => task.id === id);
}

function refuse(
  reason: StartResearchTaskRefusal,
  message: string,
): StartResearchTaskResult {
  return { ok: false, reason, message };
}
