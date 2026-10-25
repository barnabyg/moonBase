import { catalogue, type GameSpeed } from "../catalogue";
import type { Campaign, GameEvent, Snapshot } from "../simulation";

/**
 * The longest stretch of real time a single frame may account for. A longer
 * gap, such as a hidden tab, pauses the game clock rather than making it leap
 * ahead.
 */
const MAX_FRAME_MS = 250;
const MS_PER_SECOND = 1000;
const INITIAL_SPEED_ID = "1x";

export interface GameLoop {
  readonly speed: GameSpeed;
  readonly speeds: readonly GameSpeed[];
  setSpeed(id: string): void;
  /**
   * Turns real time into whole 1-game-minute ticks at the current speed and
   * advances the Campaign by them. Returns how many game-minutes it advanced.
   */
  update(realElapsedMs: number): number;
  /**
   * Jumps the Campaign straight to its next notable event, whatever the
   * speed, and returns the events that happened then.
   */
  skipToNextEvent(): readonly GameEvent[];
  /**
   * The Campaign's state one game-minute before its current state, so that
   * the renderer can draw smoothly between the two. Undefined until the first
   * game-minute passes, and straight after a skip.
   */
  readonly previous: Snapshot | undefined;
  /** How far real time has run towards the next game-minute, from 0 to 1. */
  readonly tickProgress: number;
}

export function createGameLoop(campaign: Campaign): GameLoop {
  const speeds = catalogue.gameSpeeds;
  const findSpeed = (id: string): GameSpeed => {
    const found = speeds.find((speed) => speed.id === id);
    if (found === undefined)
      throw new RangeError(`There is no game speed called "${id}".`);
    return found;
  };

  let speed = findSpeed(INITIAL_SPEED_ID);
  // Game-minutes owed but not yet ticked, scaled by MS_PER_SECOND so that
  // whole-millisecond frames accumulate exactly.
  let owedScaledMinutes = 0;
  let previous: Snapshot | undefined;

  return {
    get speed() {
      return speed;
    },
    speeds,
    get previous() {
      return previous;
    },
    get tickProgress() {
      return owedScaledMinutes / MS_PER_SECOND;
    },
    setSpeed(id) {
      speed = findSpeed(id);
    },
    update(realElapsedMs) {
      const frameMs = Math.min(Math.max(realElapsedMs, 0), MAX_FRAME_MS);
      owedScaledMinutes += frameMs * speed.gameMinutesPerRealSecond;
      const gameMinutes = Math.floor(owedScaledMinutes / MS_PER_SECOND);
      owedScaledMinutes -= gameMinutes * MS_PER_SECOND;
      if (gameMinutes > 0) {
        campaign.advance(gameMinutes - 1);
        previous = campaign.snapshot();
        campaign.advance(1);
      }
      return gameMinutes;
    },
    skipToNextEvent() {
      // The jump replaces the part-minute that was building up.
      previous = undefined;
      owedScaledMinutes = 0;
      return campaign.advanceToNextEvent();
    },
  };
}
