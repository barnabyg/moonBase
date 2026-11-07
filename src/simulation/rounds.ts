import { batchHoursOf } from "../catalogue";
import type { CampaignState } from "./campaign";
import type { StructureState } from "./construction";
import { recipeOf } from "./plants";

// Rounds that a Structure works towards by itself, each earning Science as it is
// complete: a Greenhouse's rounds of growing, and an infrared telescope's and a
// radio telescope array's rounds of their surveys. Each keeps how far its round has got on its Structure, works it
// a share of a game-minute at a time, and loses it to a shortage. What differs between them is when they work and what loses a round,
// which their own modules decide.

/** How close to a whole round counts as one, as below full performance a round adds fractions of a game-minute. */
const MINUTE_TOLERANCE = 1e-9;

/** A Structure's rounds: how long one takes at full performance, and what it pays. */
export interface Rounds {
  /** Game-hours of work at full performance. */
  readonly lengthHours: number;
  /** The Science a round earns as it is complete. */
  readonly science: number;
}

/** Where a Structure keeps how far its round has got, in game-minutes at full performance. */
export type RoundProgress = "growingMinutes" | "observedMinutes";

/**
 * Adds the given share of a game-minute to a Structure's round. Once the round
 * has its length, its Science is added to the base's and the next starts with
 * anything worked beyond it. Says whether a round was completed.
 */
export function workRound(
  state: CampaignState,
  structure: StructureState,
  rounds: Rounds,
  progress: RoundProgress,
  minutes: number,
): boolean {
  structure[progress] += minutes;
  const length = rounds.lengthHours * 60;
  if (structure[progress] < length - MINUTE_TOLERANCE) return false;
  structure[progress] = Math.max(structure[progress] - length, 0);
  state.science += rounds.science;
  return true;
}

/**
 * Loses what a Structure has done of its round. Says whether that is worth a
 * notification: not for a round no more than the given game-minutes old, such
 * as one only just begun.
 */
export function loseRound(
  structure: StructureState,
  progress: RoundProgress,
  quietMinutes: number,
): boolean {
  const done = structure[progress];
  structure[progress] = 0;
  return done > quietMinutes;
}

/**
 * A Plant's batch in game-minutes, 0 for any other Structure: a round no older
 * than that goes without a notification as it is lost.
 */
export function batchMinutes(structure: StructureState): number {
  const recipe = recipeOf(structure);
  return recipe === undefined ? 0 : batchHoursOf(recipe) * 60;
}

/** How much of a round is done, from 0 to 1. */
export function roundFraction(done: number, rounds: Rounds): number {
  return Math.min(done / (rounds.lengthHours * 60), 1);
}

/**
 * Game-minutes of work at the given rate, a share of a game-minute each
 * game-minute, until a round is complete; undefined at a rate of 0, as for a
 * Broken Structure.
 */
export function roundMinutesLeft(
  done: number,
  rounds: Rounds,
  rate: number,
): number | undefined {
  if (rate === 0) return undefined;
  const left = Math.max(rounds.lengthHours * 60 - done, 0);
  return Math.ceil(left / rate - MINUTE_TOLERANCE);
}
