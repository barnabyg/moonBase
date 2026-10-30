import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogue, type ResearchTask } from "../src/catalogue";
import { loadCampaign, type Campaign, type GameEvent } from "../src/simulation";
import { formatEvent } from "../src/ui/notifications-text";
import { scenario } from "./scenario";

const [shortTask, otherTask] = catalogue.researchTasks;
if (shortTask === undefined || otherTask === undefined) {
  throw new Error("The data catalogue needs at least two Research Tasks.");
}

function lengthMinutes(task: ResearchTask): number {
  return task.lengthHours * 60;
}

function start(campaign: Campaign, task: ResearchTask): void {
  const result = campaign.startResearchTask(task.id);
  if (!result.ok) throw new Error(result.message);
}

function completions(events: readonly GameEvent[]): GameEvent[] {
  return events.filter((event) => event.kind === "research-task-completed");
}

describe("a Research Task", () => {
  it("completes after its length and pays its Science, with a notification naming it and the Science earned", () => {
    const { campaign } = scenario();
    expect(campaign.snapshot().science).toBe(0);
    start(campaign, shortTask);

    const before = campaign.advance(lengthMinutes(shortTask) - 1);

    expect(completions(before)).toEqual([]);
    expect(campaign.snapshot()).toMatchObject({
      science: 0,
      researchTask: { researchTaskId: shortTask.id, minutesLeft: 1 },
      completedResearchTaskIds: [],
    });

    const [completed, ...others] = completions(campaign.advance(1));

    expect(others).toEqual([]);
    expect(completed).toEqual({
      kind: "research-task-completed",
      atMinute: lengthMinutes(shortTask),
      researchTaskId: shortTask.id,
      science: shortTask.science,
    });
    if (completed === undefined) throw new Error("expected an event");
    expect(formatEvent(completed)).toBe(
      `${shortTask.label} complete, earning ${shortTask.science} Science`,
    );
    expect(campaign.snapshot()).toMatchObject({
      science: shortTask.science,
      researchTask: undefined,
      completedResearchTaskIds: [shortTask.id],
    });
  });
});

describe("starting a Research Task", () => {
  it("is refused while another one is running, which runs on as before", () => {
    const { campaign } = scenario();
    start(campaign, shortTask);
    campaign.advance(60);

    expect(campaign.startResearchTask(otherTask.id)).toEqual({
      ok: false,
      reason: "research-task-running",
      message: `${shortTask.label} is running, and only one Research Task runs at a time.`,
    });
    expect(campaign.startResearchTask(shortTask.id)).toMatchObject({
      ok: false,
      reason: "research-task-running",
    });
    expect(campaign.snapshot().researchTask).toMatchObject({
      researchTaskId: shortTask.id,
      minutesLeft: lengthMinutes(shortTask) - 60,
    });
  });

  it("is refused for one already completed, but not for another", () => {
    const { campaign } = scenario();
    start(campaign, shortTask);
    campaign.advance(lengthMinutes(shortTask));

    expect(campaign.startResearchTask(shortTask.id)).toEqual({
      ok: false,
      reason: "already-completed",
      message: `${shortTask.label} has already been completed, and can't be carried out again.`,
    });
    expect(campaign.snapshot().researchTask).toBeUndefined();
    expect(campaign.startResearchTask(otherTask.id)).toEqual({ ok: true });
  });

  it("is refused for a Research Task the data catalogue doesn't have", () => {
    const { campaign } = scenario();

    expect(campaign.startResearchTask("perpetual-motion")).toEqual({
      ok: false,
      reason: "unknown-research-task",
      message: `There is no Research Task called "perpetual-motion".`,
    });
    expect(campaign.snapshot().researchTask).toBeUndefined();
  });

  it("is refused once the Campaign has ended", () => {
    const loaded = loadCampaign(
      readFileSync(
        new URL("./saves/version-1-ended.moonbase", import.meta.url),
        "utf8",
      ),
    );
    if (!loaded.ok) throw new Error(loaded.message);

    expect(loaded.campaign.startResearchTask(shortTask.id)).toEqual({
      ok: false,
      reason: "campaign-ended",
      message: "The Campaign is over: the Mission Director has died.",
    });
  });
});

describe("a running Research Task", () => {
  /** The first Research Task lasting at least the given game-hours. */
  function lastingAtLeast(hours: number): ResearchTask {
    const task = catalogue.researchTasks.find(
      (candidate) => candidate.lengthHours >= hours,
    );
    if (task === undefined)
      throw new Error(`No Research Task lasts ${hours}h.`);
    return task;
  }

  it("carries on while the Robot is away on an Expedition, and through Night", () => {
    const { campaign } = scenario();
    // Starting just before Night, so that it runs on into it.
    campaign.advance(campaign.snapshot().lunation.minutesRemaining - 6 * 60);
    const expedition = campaign.startExpedition();
    if (!expedition.ok) throw new Error(expedition.message);
    const task = lastingAtLeast(3 * 24);
    start(campaign, task);
    const startedAt = campaign.snapshot().clock.elapsedMinutes;

    const events = campaign.advance(lengthMinutes(task));

    expect(completions(events)).toEqual([
      expect.objectContaining({
        researchTaskId: task.id,
        atMinute: startedAt + lengthMinutes(task),
      }),
    ]);
    expect(events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["expedition-left", "night-started"]),
    );
    const state = campaign.snapshot();
    expect(state.expedition?.stage).toBe("away");
    expect(state.lunation.part).toBe("night");
    expect(state.science).toBe(task.science);
  });

  it("carries on while the Robot is busy with a Construction, before the base has any power", () => {
    const game = scenario().plan("solar-array", { x: 20, y: 12 });
    expect(game.state.power.networks).toEqual([]);
    start(game.campaign, shortTask);

    const events = game.campaign.advance(lengthMinutes(shortTask));

    expect(completions(events)).toHaveLength(1);
    expect(game.state.robots[0]?.activity.kind).not.toBe("idle");
    expect(game.state.constructions).toHaveLength(1);
    expect(game.state.science).toBe(shortTask.science);
  });
});

describe("skipping to the next event", () => {
  it("stops as a Research Task completes", () => {
    const { campaign } = scenario();
    const task = otherTask;
    start(campaign, task);
    const endsAt = lengthMinutes(task);

    let stop: readonly GameEvent[] = [];
    for (let skips = 0; completions(stop).length === 0; skips++) {
      if (skips > 40) throw new Error("The Research Task never completed.");
      stop = campaign.advanceToNextEvent();
    }

    expect(completions(stop)).toEqual([
      expect.objectContaining({ researchTaskId: task.id, atMinute: endsAt }),
    ]);
    expect(campaign.snapshot().clock.elapsedMinutes).toBe(endsAt);
  });
});

describe("saving and loading", () => {
  it("keeps the Science, the Research Task running and how far it has got, and those completed", () => {
    const { campaign } = scenario();
    start(campaign, shortTask);
    campaign.advance(lengthMinutes(shortTask));
    start(campaign, otherTask);
    campaign.advance(90);

    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    expect(loaded.campaign.snapshot()).toMatchObject({
      science: shortTask.science,
      researchTask: {
        researchTaskId: otherTask.id,
        minutesLeft: lengthMinutes(otherTask) - 90,
      },
      completedResearchTaskIds: [shortTask.id],
    });
    expect(loaded.campaign.snapshot()).toEqual(campaign.snapshot());
  });

  it("goes on exactly as an uninterrupted run would, with a Research Task in progress", () => {
    const { campaign } = scenario();
    start(campaign, shortTask);
    campaign.advance(lengthMinutes(shortTask) / 2);
    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    const original = campaign.advance(lengthMinutes(shortTask));
    const reloaded = loaded.campaign.advance(lengthMinutes(shortTask));

    expect(completions(original)).toHaveLength(1);
    expect(reloaded).toEqual(original);
    expect(loaded.campaign.snapshot()).toEqual(campaign.snapshot());
    expect(loaded.campaign.save()).toBe(campaign.save());
  });
});
