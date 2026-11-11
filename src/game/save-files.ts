import { loadCampaign, type LoadResult } from "../simulation";
import type { CampaignSlot } from "./campaign-slot";
import { hasUnsavedProgress } from "./unsaved-progress";

/** The extension of a Moon Base save file. */
export const SAVE_FILE_EXTENSION = ".moonbase";

export type LoadFileResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      /** Why the file wasn't loaded, in words the player can read. */
      readonly message: string;
    };

/**
 * Saving the Campaign to a file and loading one from a file, which the
 * player chooses to do; nothing is ever kept in the browser (ADR-0006).
 */
export interface SaveFiles {
  /** The Campaign being played as a save file, named after the game clock. */
  save(): { readonly name: string; readonly text: string };
  /**
   * Loads the Campaign in a save file in place of the one being played. A
   * file that can't be loaded is refused with the reason, and the Campaign
   * being played carries on.
   */
  load(file: File): Promise<LoadFileResult>;
  /**
   * Tells it that `text`, a save from `save()`, has been kept in a file, so
   * the Campaign as it was then is no longer unsaved progress.
   */
  saved(text: string): void;
  /**
   * The Campaign as a save file, as `save()` gives it, if it has unsaved
   * progress since it started, or was last saved or loaded
   * (unsaved-progress.ts); otherwise undefined.
   */
  unsaved(): { readonly name: string; readonly text: string } | undefined;
}

/**
 * @param loaded Called once a loaded Campaign is in the slot, so that
 *   everything showing the last one can start afresh.
 */
export function createSaveFiles(
  slot: CampaignSlot,
  loaded: () => void,
): SaveFiles {
  // The save last kept: the Campaign as it started, until one is saved or
  // loaded.
  let lastKept = slot.save();
  const save = (): { name: string; text: string } => {
    const { earthDay, hour, minute } = slot.snapshot().clock;
    const time = `${twoDigits(hour)}${twoDigits(minute)}`;
    return {
      name: `moon-base-earth-day-${earthDay}-${time}${SAVE_FILE_EXTENSION}`,
      text: slot.save(),
    };
  };
  return {
    save,
    saved(text) {
      lastKept = text;
    },
    unsaved() {
      const current = save();
      const ended = slot.snapshot().ended !== undefined;
      return hasUnsavedProgress({ ended, save: current.text, lastKept })
        ? current
        : undefined;
    },
    async load(file) {
      let text: string;
      try {
        text = await file.text();
      } catch {
        return {
          ok: false,
          message: `Couldn't load "${file.name}". The browser couldn't read the file.`,
        };
      }
      let result: LoadResult;
      try {
        result = loadCampaign(text);
      } catch (error) {
        // A bug rather than a bad file, but the player should still hear of it.
        console.error(error);
        return {
          ok: false,
          message: `Couldn't load "${file.name}". Something went wrong while loading it.`,
        };
      }
      if (!result.ok) {
        return {
          ok: false,
          message: `Couldn't load "${file.name}". ${result.message}`,
        };
      }
      slot.replace(result.campaign);
      lastKept = slot.save();
      loaded();
      return { ok: true };
    },
  };
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}
