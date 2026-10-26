import { catalogue } from "../catalogue";
import type { CampaignState } from "./campaign";
import type { GameEvent } from "./events";
import { lunationMinutes } from "./lunation";

/** What the base's Plants made of a life support stock, and the Mission Director used, over a span of time. */
export interface LifeSupportRecord {
  producedKilograms: number;
  usedKilograms: number;
}

/**
 * The history of a life support stock that self-sufficiency is judged on:
 * the record under way, and the finished ones, oldest first, as far back
 * as the data catalogue's window.
 */
export interface SelfSufficiencyState {
  stockId: string;
  current: LifeSupportRecord;
  records: LifeSupportRecord[];
}

/** Whether the base is self-sufficient in a life support stock, as of the latest finished record. */
export interface SelfSufficiencySnapshot {
  readonly stockId: string;
  readonly selfSufficient: boolean;
  /**
   * The share of what the Mission Director used that the base's Plants
   * made over the window, or over as much of it as has passed; undefined
   * while they have used none.
   */
  readonly coveredShare: number | undefined;
  /** Whether a whole window has passed, so that the rule can be judged. */
  readonly windowComplete: boolean;
}

/** The game-minutes each record covers. */
function recordMinutes(): number {
  return Math.round(catalogue.selfSufficiency.recordHours * 60);
}

/** How many records the window covers. */
function windowRecords(): number {
  const window =
    lunationMinutes(catalogue.lunation).lunation *
    catalogue.selfSufficiency.windowLunations;
  return Math.round(window / recordMinutes());
}

/** No history yet, for every life support stock, in catalogue order. */
export function startingSelfSufficiency(): SelfSufficiencyState[] {
  return catalogue.lifeSupportStocks.map((stock) => ({
    stockId: stock.id,
    current: { producedKilograms: 0, usedKilograms: 0 },
    records: [],
  }));
}

/** Adds to the record under way what the Plants made of a stock, and the Mission Director used. */
export function recordLifeSupport(
  state: CampaignState,
  stockId: string,
  change: { readonly produced?: number; readonly used?: number },
): void {
  const history = state.selfSufficiency.find(
    (candidate) => candidate.stockId === stockId,
  );
  if (history === undefined) return;
  history.current.producedKilograms += change.produced ?? 0;
  history.current.usedKilograms += change.used ?? 0;
}

/**
 * Whether the base is self-sufficient in a stock: over the whole window,
 * the Plants made at least as much as the Mission Director used. It never
 * is before a whole window has been recorded, or while the Mission
 * Director lives aboard the Lander and uses nothing.
 */
function judge(
  state: CampaignState,
  history: SelfSufficiencyState,
): SelfSufficiencySnapshot {
  const produced = history.records.reduce(
    (sum, record) => sum + record.producedKilograms,
    0,
  );
  const used = history.records.reduce(
    (sum, record) => sum + record.usedKilograms,
    0,
  );
  const windowComplete = history.records.length >= windowRecords();
  return {
    stockId: history.stockId,
    selfSufficient:
      windowComplete &&
      state.missionDirector.residence === "habitat" &&
      used > 0 &&
      produced >= used,
    coveredShare: used > 0 ? produced / used : undefined,
    windowComplete,
  };
}

export function readSelfSufficiency(
  state: CampaignState,
): SelfSufficiencySnapshot[] {
  return state.selfSufficiency.map((history) => judge(state, history));
}

/**
 * Ends the record under way as the game-minute that has just passed
 * reaches the end of one, dropping any that has fallen out of the window,
 * and gives a notification for each stock the base has become, or ceased
 * to be, self-sufficient in. `before` is whether it was, by stock, as the
 * game-minute started.
 */
export function watchSelfSufficiency(
  state: CampaignState,
  before: readonly SelfSufficiencySnapshot[],
): GameEvent[] {
  if (state.elapsedMinutes % recordMinutes() === 0) {
    for (const history of state.selfSufficiency) {
      history.records.push(history.current);
      history.records = history.records.slice(-windowRecords());
      history.current = { producedKilograms: 0, usedKilograms: 0 };
    }
  }
  return readSelfSufficiency(state).flatMap((now) => {
    const was = before.find((other) => other.stockId === now.stockId);
    if (was === undefined || was.selfSufficient === now.selfSufficient) {
      return [];
    }
    return [
      {
        kind: now.selfSufficient
          ? "self-sufficiency-gained"
          : "self-sufficiency-lost",
        atMinute: state.elapsedMinutes,
        stockId: now.stockId,
      },
    ];
  });
}
