/**
 * Whether the Campaign has unsaved progress: anything that its save file
 * would now record differently from the save last kept, which is the one
 * last saved to a file, or loaded from one, or the Campaign as it started.
 * Every game-minute that passes changes the save, as does every command that
 * changes the Campaign; a command refused, a change of game speed or of what
 * the screen shows doesn't. Once the Campaign has ended, nothing more can
 * happen in it, so there is never unsaved progress on the game-over screen.
 *
 * The desktop app asks whether to save before closing only when there is
 * unsaved progress.
 */
export function hasUnsavedProgress(campaign: {
  /** Whether the Campaign has ended. */
  readonly ended: boolean;
  /** The Campaign's save now. */
  readonly save: string;
  /** The save last kept. */
  readonly lastKept: string;
}): boolean {
  return !campaign.ended && campaign.save !== campaign.lastKept;
}
