import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createCampaignSlot } from "../src/game/campaign-slot";
import { createSaveFiles } from "../src/game/save-files";
import { hasUnsavedProgress } from "../src/game/unsaved-progress";
import { scenario } from "./scenario";

describe("the unsaved progress rule", () => {
  it("is progress when the Campaign's save would differ from the save last kept", () => {
    expect(
      hasUnsavedProgress({ ended: false, save: "now", lastKept: "then" }),
    ).toBe(true);
    expect(
      hasUnsavedProgress({ ended: false, save: "same", lastKept: "same" }),
    ).toBe(false);
  });

  it("is never progress once the Campaign has ended", () => {
    expect(
      hasUnsavedProgress({ ended: true, save: "now", lastKept: "then" }),
    ).toBe(false);
  });
});

function saveFilesFor(seed: number) {
  const game = scenario(seed);
  const slot = createCampaignSlot(game.campaign);
  return { game, slot, saveFiles: createSaveFiles(slot, () => {}) };
}

describe("unsaved progress in a Campaign", () => {
  it("is none as the Campaign starts, and some once a game-minute has passed", () => {
    const { game, saveFiles } = saveFilesFor(1);
    expect(saveFiles.unsaved()).toBeUndefined();

    game.advance({ minutes: 1 });

    expect(saveFiles.unsaved()).toEqual(saveFiles.save());
  });

  it("is some after a command that changes the Campaign, with no time passing", () => {
    const { slot, saveFiles } = saveFilesFor(1);

    expect(slot.setLaunchManifest([{ itemId: "water", count: 1 }])).toEqual({
      ok: true,
    });

    expect(saveFiles.unsaved()).toEqual(saveFiles.save());
  });

  it("is none after a command that changes nothing, such as one refused", () => {
    const { slot, saveFiles } = saveFilesFor(1);

    expect(slot.cancelConstruction("no-such-construction").ok).toBe(false);

    expect(saveFiles.unsaved()).toBeUndefined();
  });

  it("is none once the save is kept in a file, until the Campaign goes on", () => {
    const { game, saveFiles } = saveFilesFor(1);
    game.advance({ hours: 3 });
    const { text } = saveFiles.save();

    saveFiles.saved(text);
    expect(saveFiles.unsaved()).toBeUndefined();

    game.advance({ minutes: 1 });
    expect(saveFiles.unsaved()).toBeDefined();
  });

  it("is what has happened since the save kept, when the file was saved from an earlier moment", () => {
    const { game, saveFiles } = saveFilesFor(1);
    const { text } = saveFiles.save();
    game.advance({ minutes: 5 });

    saveFiles.saved(text);

    expect(saveFiles.unsaved()).toBeDefined();
  });

  it("is none just after a Campaign is loaded, and some once it goes on", async () => {
    const { game, slot, saveFiles } = saveFilesFor(1);
    game.advance({ hours: 1 });
    const other = scenario(2).advance({ hours: 5 }).campaign.save();

    const result = await saveFiles.load(new File([other], "other.moonbase"));

    expect(result).toEqual({ ok: true });
    expect(saveFiles.unsaved()).toBeUndefined();
    slot.advance(1);
    expect(saveFiles.unsaved()).toBeDefined();
  });

  it("stays as it was when a file is refused", async () => {
    const { game, saveFiles } = saveFilesFor(1);
    game.advance({ hours: 1 });

    await saveFiles.load(new File(["Dear diary"], "notes.txt"));

    expect(saveFiles.unsaved()).toBeDefined();
  });

  it("is none on the game-over screen, once the Campaign has ended", async () => {
    const ended = await readFile(
      new URL("saves/version-1-ended.moonbase", import.meta.url),
      "utf8",
    );
    const { slot, saveFiles } = saveFilesFor(1);
    await saveFiles.load(new File([ended], "ended.moonbase"));
    expect(slot.snapshot().ended).toBeDefined();
    // Kept as loaded, and the rule says nothing is unsaved even if it weren't.
    saveFiles.saved("an older save");

    expect(saveFiles.unsaved()).toBeUndefined();
  });
});
