import { catalogue, type ResearchTask } from "../catalogue";
import type { CampaignState } from "./campaign";
import type { GameEvent } from "./events";
import { designLabel, isDesignUnlocked } from "./tech-tree";

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

export type QueueResearchTaskRefusal =
  | "unknown-research-task"
  | "already-completed"
  | "design-locked"
  | "already-running"
  | "already-queued"
  | "queue-full"
  | "campaign-ended";

export type QueueResearchTaskResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: QueueResearchTaskRefusal;
      /** The reason in words the player can read. */
      readonly message: string;
    };

export type RemoveQueuedResearchTaskRefusal =
  "running" | "not-queued" | "campaign-ended";

export type RemoveQueuedResearchTaskResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: RemoveQueuedResearchTaskRefusal;
      /** The reason in words the player can read. */
      readonly message: string;
    };

/**
 * Starts a Research Task, which runs by itself from the next game-minute, or,
 * if one is running, puts it at the end of the queue behind that one. Refused
 * if it has already been completed, the Design it needs isn't unlocked yet, it
 * is running or queued already, or the queue is full.
 */
export function queueResearchTask(
  state: CampaignState,
  researchTaskId: string,
): QueueResearchTaskResult {
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
  const needed = task.requiresDesignId;
  if (needed !== undefined && !isDesignUnlocked(state, needed)) {
    return refuse(
      "design-locked",
      `${task.label} needs the ${designLabel(needed)} Design unlocked first.`,
    );
  }
  const running = state.researchTask;
  if (running === undefined) {
    state.researchTask = { researchTaskId: task.id, workedMinutes: 0 };
    return { ok: true };
  }
  if (running.researchTaskId === task.id) {
    return refuse("already-running", `${task.label} is running already.`);
  }
  if (state.researchQueue.includes(task.id)) {
    return refuse("already-queued", `${task.label} is queued already.`);
  }
  const limit = catalogue.researchQueueLimit;
  if (state.researchQueue.length >= limit) {
    return refuse(
      "queue-full",
      `The queue is full: ${limit} Research Tasks are waiting already.`,
    );
  }
  state.researchQueue.push(task.id);
  return { ok: true };
}

/**
 * Takes a Research Task out of the queue, leaving the others in order. Nothing
 * is lost, as a queued one has done no work. One that has started can't be
 * cancelled.
 */
export function removeQueuedResearchTask(
  state: CampaignState,
  researchTaskId: string,
): RemoveQueuedResearchTaskResult {
  const label = findResearchTask(researchTaskId)?.label ?? researchTaskId;
  if (state.researchTask?.researchTaskId === researchTaskId) {
    return refuse(
      "running",
      `${label} is running, and a Research Task that has started can't be cancelled.`,
    );
  }
  const index = state.researchQueue.indexOf(researchTaskId);
  if (index === -1) {
    return refuse("not-queued", `${label} isn't queued.`);
  }
  state.researchQueue.splice(index, 1);
  return { ok: true };
}

/**
 * Runs the Research Task for a game-minute. It needs no Robot, power or
 * Components, so nothing else holds it up. Once it has run its length, it is
 * complete: its Science is added to the base's, it can't run again, and the
 * first in the queue starts, to run from the next game-minute.
 */
export function runResearch(state: CampaignState): GameEvent[] {
  const running = state.researchTask;
  if (running === undefined) return [];
  running.workedMinutes += 1;
  const task = findResearchTask(running.researchTaskId);
  if (task === undefined || running.workedMinutes < researchTaskMinutes(task)) {
    return [];
  }
  state.researchTask = undefined;
  state.completedResearchTaskIds.push(task.id);
  state.science += task.science;
  const events: GameEvent[] = [
    {
      kind: "research-task-completed",
      atMinute: state.elapsedMinutes,
      researchTaskId: task.id,
      science: task.science,
    },
  ];
  const next = state.researchQueue.shift();
  if (next !== undefined) {
    state.researchTask = { researchTaskId: next, workedMinutes: 0 };
    events.push({
      kind: "research-task-started",
      atMinute: state.elapsedMinutes,
      researchTaskId: next,
    });
  }
  return events;
}

export function readResearchTask(
  state: CampaignState,
): ResearchTaskSnapshot | undefined {
  const running = state.researchTask;
  if (running === undefined) return undefined;
  const task = findResearchTask(running.researchTaskId);
  if (task === undefined) return undefined;
  const length = researchTaskMinutes(task);
  return {
    researchTaskId: running.researchTaskId,
    progress: Math.min(running.workedMinutes / length, 1),
    minutesLeft: Math.max(length - running.workedMinutes, 0),
  };
}

/** How long a Research Task runs, in game-minutes. */
export function researchTaskMinutes(task: ResearchTask): number {
  return Math.round(task.lengthHours * 60);
}

function findResearchTask(id: string): ResearchTask | undefined {
  return catalogue.researchTasks.find((task) => task.id === id);
}

function refuse<Reason extends string>(
  reason: Reason,
  message: string,
): { readonly ok: false; readonly reason: Reason; readonly message: string } {
  return { ok: false, reason, message };
}
