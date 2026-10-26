import { loadCampaign } from "../simulation";
import type { CampaignSlot } from "./campaign-slot";

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
}

/**
 * @param loaded Called once a loaded Campaign is in the slot, so that
 *   everything showing the last one can start afresh.
 */
export function createSaveFiles(
  slot: CampaignSlot,
  loaded: () => void,
): SaveFiles {
  return {
    save() {
      const { earthDay, hour, minute } = slot.snapshot().clock;
      const time = `${twoDigits(hour)}${twoDigits(minute)}`;
      return {
        name: `moon-base-earth-day-${earthDay}-${time}${SAVE_FILE_EXTENSION}`,
        text: slot.save(),
      };
    },
    async load(file) {
      let text: string;
      try {
        text = await file.text();
      } catch {
        return {
          ok: false,
          message: `Couldn't load "${file.name}". Firefox couldn't read the file.`,
        };
      }
      const result = loadCampaign(text);
      if (!result.ok) {
        return {
          ok: false,
          message: `Couldn't load "${file.name}". ${result.message}`,
        };
      }
      slot.replace(result.campaign);
      loaded();
      return { ok: true };
    },
  };
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}
