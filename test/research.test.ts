import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogue, type ResearchTask } from "../src/catalogue";
import { loadCampaign, type Campaign, type GameEvent } from "../src/simulation";
import { formatEvent } from "../src/ui/notifications-text";
import { scenario } from "./scenario";

// Those a new Campaign can run, so that any of them can be queued.
const [shortTask, otherTask, thirdTask, fourthTask, fifthTask] =
  catalogue.researchTasks.filter((task) => task.requiresDesignId === undefined);
if (
  shortTask === undefined ||
  otherTask === undefined ||
  thirdTask === undefined ||
  fourthTask === undefined ||
  fifthTask === undefined
) {
  throw new Error(
    "The data catalogue needs at least five Research Tasks with no Design.",
  );
}

function lengthMinutes(task: ResearchTask): number {
  return task.lengthHours * 60;
}

function start(campaign: Campaign, task: ResearchTask): void {
  const result = campaign.queueResearchTask(task.id);
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

describe("queueing a Research Task", () => {
  it("starts it at once when none is running", () => {
    const { campaign } = scenario();

    expect(campaign.queueResearchTask(shortTask.id)).toEqual({ ok: true });

    expect(campaign.snapshot()).toMatchObject({
      researchTask: { researchTaskId: shortTask.id },
      researchQueue: [],
    });
  });

  it("puts up to three behind the one running, in order, and refuses a fourth with the reason", () => {
    const { campaign } = scenario();
    start(campaign, shortTask);
    campaign.advance(60);

    start(campaign, otherTask);
    start(campaign, thirdTask);
    start(campaign, fourthTask);
    const refused = campaign.queueResearchTask(fifthTask.id);

    expect(refused).toEqual({
      ok: false,
      reason: "queue-full",
      message: "The queue is full: 3 Research Tasks are waiting already.",
    });
    expect(campaign.snapshot()).toMatchObject({
      researchTask: {
        researchTaskId: shortTask.id,
        minutesLeft: lengthMinutes(shortTask) - 60,
      },
      researchQueue: [otherTask.id, thirdTask.id, fourthTask.id],
    });
  });

  it("is refused for the one running, and for one queued already", () => {
    const { campaign } = scenario();
    start(campaign, shortTask);
    start(campaign, otherTask);

    expect(campaign.queueResearchTask(shortTask.id)).toEqual({
      ok: false,
      reason: "already-running",
      message: `${shortTask.label} is running already.`,
    });
    expect(campaign.queueResearchTask(otherTask.id)).toEqual({
      ok: false,
      reason: "already-queued",
      message: `${otherTask.label} is queued already.`,
    });
    expect(campaign.snapshot().researchQueue).toEqual([otherTask.id]);
  });

  it("is refused for one whose Design is locked, even with another running", () => {
    const gated = catalogue.researchTasks.find(
      (task) => task.requiresDesignId !== undefined,
    );
    if (gated === undefined) throw new Error("expected a gated Research Task");
    const { campaign } = scenario();
    start(campaign, shortTask);

    expect(campaign.queueResearchTask(gated.id)).toMatchObject({
      ok: false,
      reason: "design-locked",
    });
    expect(campaign.snapshot().researchQueue).toEqual([]);
  });

  it("is refused for one already completed, but not for another", () => {
    const { campaign } = scenario();
    start(campaign, shortTask);
    campaign.advance(lengthMinutes(shortTask));

    expect(campaign.queueResearchTask(shortTask.id)).toEqual({
      ok: false,
      reason: "already-completed",
      message: `${shortTask.label} has already been completed, and can't be carried out again.`,
    });
    expect(campaign.snapshot().researchTask).toBeUndefined();
    expect(campaign.queueResearchTask(otherTask.id)).toEqual({ ok: true });
  });

  it("is refused for a Research Task the data catalogue doesn't have", () => {
    const { campaign } = scenario();

    expect(campaign.queueResearchTask("perpetual-motion")).toEqual({
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

    expect(loaded.campaign.queueResearchTask(shortTask.id)).toEqual({
      ok: false,
      reason: "campaign-ended",
      message: "The Campaign is over: the Mission Director has died.",
    });
  });
});

describe("the queue of Research Tasks", () => {
  it("starts each by itself as the one before completes, saying so after the completion", () => {
    const { campaign } = scenario();
    start(campaign, shortTask);
    start(campaign, otherTask);
    start(campaign, thirdTask);

    const events = campaign.advance(lengthMinutes(shortTask));

    const research = events.filter(({ kind }) => kind.startsWith("research-"));
    expect(research).toEqual([
      {
        kind: "research-task-completed",
        atMinute: lengthMinutes(shortTask),
        researchTaskId: shortTask.id,
        science: shortTask.science,
      },
      {
        kind: "research-task-started",
        atMinute: lengthMinutes(shortTask),
        researchTaskId: otherTask.id,
      },
    ]);
    const started = research[1];
    if (started === undefined) throw new Error("expected an event");
    expect(formatEvent(started)).toBe(
      `${otherTask.label} started from the queue`,
    );
    expect(campaign.snapshot()).toMatchObject({
      researchTask: {
        researchTaskId: otherTask.id,
        minutesLeft: lengthMinutes(otherTask),
      },
      researchQueue: [thirdTask.id],
      completedResearchTaskIds: [shortTask.id],
    });

    campaign.advance(lengthMinutes(otherTask));
    expect(campaign.snapshot()).toMatchObject({
      researchTask: { researchTaskId: thirdTask.id },
      researchQueue: [],
      completedResearchTaskIds: [shortTask.id, otherTask.id],
    });

    campaign.advance(lengthMinutes(thirdTask));
    expect(campaign.snapshot()).toMatchObject({
      researchTask: undefined,
      science: shortTask.science + otherTask.science + thirdTask.science,
    });
  });

  it("gives up a queued one when it is removed, keeping the others in order and the one running as it was", () => {
    const { campaign } = scenario();
    start(campaign, shortTask);
    start(campaign, otherTask);
    start(campaign, thirdTask);
    start(campaign, fourthTask);
    campaign.advance(60);

    expect(campaign.removeQueuedResearchTask(thirdTask.id)).toEqual({
      ok: true,
    });

    expect(campaign.snapshot()).toMatchObject({
      researchTask: {
        researchTaskId: shortTask.id,
        minutesLeft: lengthMinutes(shortTask) - 60,
      },
      researchQueue: [otherTask.id, fourthTask.id],
    });
    // There is room for it again.
    expect(campaign.queueResearchTask(thirdTask.id)).toEqual({ ok: true });
  });

  it("refuses to remove the one running, or one not queued", () => {
    const { campaign } = scenario();
    start(campaign, shortTask);

    expect(campaign.removeQueuedResearchTask(shortTask.id)).toEqual({
      ok: false,
      reason: "running",
      message: `${shortTask.label} is running, and a Research Task that has started can't be cancelled.`,
    });
    expect(campaign.removeQueuedResearchTask(otherTask.id)).toEqual({
      ok: false,
      reason: "not-queued",
      message: `${otherTask.label} isn't queued.`,
    });
    expect(campaign.snapshot().researchTask).toMatchObject({
      researchTaskId: shortTask.id,
    });
  });

  it("can't be changed once the Campaign has ended", () => {
    const loaded = loadCampaign(
      readFileSync(
        new URL("./saves/version-1-ended.moonbase", import.meta.url),
        "utf8",
      ),
    );
    if (!loaded.ok) throw new Error(loaded.message);

    expect(loaded.campaign.removeQueuedResearchTask(shortTask.id)).toEqual({
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

  it("stops at the completion when the next in the queue starts, with both events", () => {
    const { campaign } = scenario();
    start(campaign, shortTask);
    start(campaign, otherTask);
    const endsAt = lengthMinutes(shortTask);

    let stop: readonly GameEvent[] = [];
    for (let skips = 0; completions(stop).length === 0; skips++) {
      if (skips > 40) throw new Error("The Research Task never completed.");
      stop = campaign.advanceToNextEvent();
    }

    expect(
      stop
        .map(({ kind }) => kind)
        .filter((kind) => kind.startsWith("research-")),
    ).toEqual(["research-task-completed", "research-task-started"]);
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

  it("keeps the queue, which goes on in order after loading", () => {
    const { campaign } = scenario();
    start(campaign, shortTask);
    start(campaign, otherTask);
    start(campaign, thirdTask);
    campaign.advance(60);

    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    expect(loaded.campaign.snapshot().researchQueue).toEqual([
      otherTask.id,
      thirdTask.id,
    ]);
    const reloaded = loaded.campaign.advance(lengthMinutes(shortTask) - 60);
    expect(reloaded).toEqual(campaign.advance(lengthMinutes(shortTask) - 60));
    expect(loaded.campaign.snapshot().researchTask).toMatchObject({
      researchTaskId: otherTask.id,
    });
  });

  it.each([
    [
      "one twice",
      {
        researchTask: { researchTaskId: "regolith-sample-analysis" },
        researchQueue: ["ice-volatiles-assay", "ice-volatiles-assay"],
      },
      'state.researchQueue names "ice-volatiles-assay" twice',
    ],
    [
      "the one running",
      {
        researchTask: { researchTaskId: "regolith-sample-analysis" },
        researchQueue: ["regolith-sample-analysis"],
      },
      'state.researchQueue names "regolith-sample-analysis", which is running',
    ],
    [
      "one already completed",
      {
        researchTask: { researchTaskId: "regolith-sample-analysis" },
        researchQueue: ["ice-volatiles-assay"],
        completedResearchTaskIds: ["ice-volatiles-assay"],
      },
      'state.researchQueue names "ice-volatiles-assay", which is completed',
    ],
    [
      "any with none running",
      { researchTask: null, researchQueue: ["ice-volatiles-assay"] },
      "state.researchQueue isn't empty, though no Research Task is running",
    ],
  ])("refuses a save whose queue holds %s", (_case, edits, problem) => {
    const { campaign } = scenario();
    const document = JSON.parse(campaign.save()) as {
      state: Record<string, unknown>;
    };
    const { researchTask, ...rest } = edits;
    document.state = {
      ...document.state,
      ...rest,
      researchTask:
        researchTask === null ? null : { ...researchTask, workedMinutes: 0 },
    };

    const loaded = loadCampaign(JSON.stringify(document));

    expect(loaded).toMatchObject({
      ok: false,
      reason: "damaged",
      message: `The save file is damaged: ${problem}.`,
    });
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
