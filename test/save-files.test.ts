import { describe, expect, it, vi } from "vitest";
import { createCampaignSlot } from "../src/game/campaign-slot";
import { createSaveFiles } from "../src/game/save-files";
import { loadCampaign } from "../src/simulation";
import { scenario } from "./scenario";

// The real loadCampaign, which a test can make fail as a bug would.
vi.mock("../src/simulation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/simulation")>();
  return { ...actual, loadCampaign: vi.fn(actual.loadCampaign) };
});

function saveFilesFor(seed: number) {
  const game = scenario(seed);
  const slot = createCampaignSlot(game.campaign);
  let loads = 0;
  const saveFiles = createSaveFiles(slot, () => {
    loads += 1;
  });
  return {
    game,
    slot,
    saveFiles,
    get loads() {
      return loads;
    },
  };
}

describe("saving to a file", () => {
  it("names the file after the game clock, with the .moonbase extension", () => {
    const { game, saveFiles } = saveFilesFor(1);
    game.advance({ earthDays: 2, hours: 7, minutes: 5 });

    expect(saveFiles.save()).toEqual({
      name: "moon-base-earth-day-3-0705.moonbase",
      text: game.campaign.save(),
    });
  });
});

describe("loading a file", () => {
  it("puts the Campaign it holds in place of the one being played", async () => {
    const saved = scenario(2).advance({ hours: 5 }).campaign.save();
    const files = saveFilesFor(1);
    const { slot, saveFiles } = files;

    const result = await saveFiles.load(
      new File([saved], "moon-base-earth-day-1-0500.moonbase"),
    );

    expect(result).toEqual({ ok: true });
    expect(slot.save()).toBe(saved);
    expect(files.loads).toBe(1);
  });

  it("refuses a file that isn't a save, naming it, and leaves the Campaign being played alone", async () => {
    const files = saveFilesFor(1);
    const { game, slot, saveFiles } = files;
    game.advance({ hours: 2 });
    const before = slot.save();

    const result = await saveFiles.load(new File(["Dear diary"], "notes.txt"));

    expect(result).toEqual({
      ok: false,
      message: `Couldn't load "notes.txt". It isn't a Moon Base save file.`,
    });
    expect(slot.save()).toBe(before);
    expect(files.loads).toBe(0);
  });

  it("tells the player when loading fails unexpectedly, and leaves the Campaign being played alone", async () => {
    const files = saveFilesFor(1);
    const before = files.slot.save();
    const failure = new Error("a bug in loading");
    vi.mocked(loadCampaign).mockImplementationOnce(() => {
      throw failure;
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await files.saveFiles.load(
      new File([before], "moon-base-earth-day-1-0000.moonbase"),
    );

    expect(result).toEqual({
      ok: false,
      message: `Couldn't load "moon-base-earth-day-1-0000.moonbase". Something went wrong while loading it.`,
    });
    expect(logged).toHaveBeenCalledWith(failure);
    expect(files.slot.save()).toBe(before);
    expect(files.loads).toBe(0);
    logged.mockRestore();
  });
});
