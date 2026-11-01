import { describe, expect, it } from "vitest";
import { loadSample } from "./sample-saves";

describe("the sample save of format version 45", () => {
  // A new Campaign two game-hours on, with a Research Task running and two
  // queued behind it.
  it("loads with the queue in order, behind the Research Task running", () => {
    const state = loadSample("version-45.moonbase").snapshot();

    expect(state.researchTask).toMatchObject({
      researchTaskId: "regolith-sample-analysis",
      minutesLeft: 4 * 60,
    });
    expect(state.researchQueue).toEqual([
      "ice-volatiles-assay",
      "radiation-environment-survey",
    ]);
  });

  it("plays on, starting the first queued as the one running completes", () => {
    const campaign = loadSample("version-45.moonbase");

    const events = campaign.advance(4 * 60);

    expect(events.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining([
        "research-task-completed",
        "research-task-started",
      ]),
    );
    expect(campaign.snapshot()).toMatchObject({
      researchTask: { researchTaskId: "ice-volatiles-assay" },
      researchQueue: ["radiation-environment-survey"],
    });
  });
});

describe("a save from before the queue", () => {
  it("loads with an empty queue, and can queue a Research Task", () => {
    const campaign = loadSample("version-44.moonbase");

    expect(campaign.snapshot().researchQueue).toEqual([]);
    expect(
      campaign.queueResearchTask("regolith-sample-analysis"),
    ).toMatchObject({ ok: true });
    expect(campaign.queueResearchTask("ice-volatiles-assay")).toMatchObject({
      ok: true,
    });
    expect(campaign.snapshot().researchQueue).toEqual(["ice-volatiles-assay"]);
  });
});
