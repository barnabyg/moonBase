import { catalogue, type GameSpeed } from "../catalogue";
import type { Campaign } from "../simulation";

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

  return {
    get speed() {
      return speed;
    },
    speeds,
    setSpeed(id) {
      speed = findSpeed(id);
    },
    update(realElapsedMs) {
      const frameMs = Math.min(Math.max(realElapsedMs, 0), MAX_FRAME_MS);
      owedScaledMinutes += frameMs * speed.gameMinutesPerRealSecond;
      const gameMinutes = Math.floor(owedScaledMinutes / MS_PER_SECOND);
      owedScaledMinutes -= gameMinutes * MS_PER_SECOND;
      campaign.advance(gameMinutes);
      return gameMinutes;
    },
  };
}
