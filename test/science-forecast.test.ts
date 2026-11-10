import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type Campaign,
  type ScienceForecast,
  type ScienceSource,
} from "../src/simulation";
import { loadSample } from "./sample-saves";
import { scenario } from "./scenario";
import { tryScenarios } from "./try-scenarios";

// How fast the base earns Science, as things stand. Science comes a round at
// a time, so the forecast spreads each round's over the time the round takes,
// and counts what works only at Night for the Night's share of a Lunation.

const { daylightEarthDays, nightEarthDays } = catalogue.lunation;
const nightShare = nightEarthDays / (daylightEarthDays + nightEarthDays);

/** The Campaign a try scenario starts in. */
function tried(id: string): Campaign {
  const save = tryScenarios.find((candidate) => candidate.id === id)?.save();
  if (save === undefined) throw new Error(`expected the ${id} scenario`);
  const loaded = loadCampaign(save);
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.campaign;
}

/** What a forecast says one source earns an Earth Day. */
function from(forecast: ScienceForecast, source: ScienceSource): number {
  const found = forecast.sources.find(
    (candidate) => candidate.source === source,
  );
  if (found === undefined) throw new Error(`expected ${source}`);
  return found.perEarthDay;
}

describe("the Science the base earns an Earth Day", () => {
  it("is none at the landing, from any source", () => {
    const { science } = scenario().campaign.forecasts();

    expect(science.perEarthDay).toBe(0);
    expect(science.sources).toEqual([
      { source: "research-task", perEarthDay: 0 },
      { source: "observing-programme", perEarthDay: 0 },
      { source: "infrared-survey", perEarthDay: 0 },
      { source: "radio-survey", perEarthDay: 0 },
      { source: "growing", perEarthDay: 0 },
    ]);
  });

  it("counts the Research Task running: its Science spread over its length", () => {
    const [task] = catalogue.researchTasks;
    if (task === undefined) throw new Error("expected a Research Task");
    const game = scenario();
    expect(game.campaign.queueResearchTask(task.id)).toEqual({ ok: true });

    const { science } = game.campaign.forecasts();

    expect(from(science, "research-task")).toBeCloseTo(
      (task.science * 24) / task.lengthHours,
    );
    expect(science.perEarthDay).toBeCloseTo(from(science, "research-task"));
  });

  it("counts a Research Task as much faster as automated experiments labs speed it up", () => {
    const campaign = tried("experiments-lab");
    const running = campaign.snapshot().researchTask;
    const task = catalogue.researchTasks.find(
      (candidate) => candidate.id === running?.researchTaskId,
    );
    if (running === undefined || task === undefined) {
      throw new Error("expected a Research Task running");
    }
    expect(running.rate).toBeGreaterThan(1);

    expect(from(campaign.forecasts().science, "research-task")).toBeCloseTo(
      (task.science * 24 * running.rate) / task.lengthHours,
    );
  });

  it("counts an infrared telescope's survey for the Night's share of a Lunation, the same in Daylight as while it observes", () => {
    const rounds = catalogue.structureTypes.find(
      (type) => type.observingRounds !== undefined,
    )?.observingRounds;
    if (rounds === undefined) throw new Error("expected an infrared telescope");
    const campaign = tried("infrared-telescope");
    const [telescope] = campaign.snapshot().infraredTelescopes;
    expect(telescope?.observing).toBe(true);
    const performance =
      campaign
        .snapshot()
        .structures.find((structure) => structure.id === telescope?.structureId)
        ?.performance ?? 0;

    const atNight = from(campaign.forecasts().science, "infrared-survey");

    expect(atNight).toBeCloseTo(
      ((rounds.science * 24) / rounds.lengthHours) * performance * nightShare,
    );

    // Daylight only pauses it, so it still counts.
    for (
      let hours = 0;
      campaign.snapshot().lunation.part === "night";
      hours++
    ) {
      if (hours > nightEarthDays * 24) throw new Error("Daylight never came.");
      campaign.advance(60);
    }
    campaign.advance(60);
    expect(campaign.snapshot().infraredTelescopes[0]?.observing).toBe(false);
    expect(from(campaign.forecasts().science, "infrared-survey")).toBeCloseTo(
      atNight,
      0,
    );
  });

  it("counts a radio telescope array's survey all through the Lunation, while it works", () => {
    const campaign = tried("radio-telescope-array");
    const [array] = campaign.snapshot().radioArrays;
    if (array === undefined) throw new Error("expected an array");
    expect(array.working).toBe(true);

    expect(from(campaign.forecasts().science, "radio-survey")).toBeCloseTo(
      array.sciencePerLunation / (daylightEarthDays + nightEarthDays),
    );
  });

  it("counts a Greenhouse's rounds of growing, by day and at Night", () => {
    const growing = catalogue.structureTypes.find(
      (type) => type.growing !== undefined,
    )?.growing;
    if (growing === undefined) throw new Error("expected a Greenhouse");
    const campaign = tried("greenhouse");

    const earned = from(campaign.forecasts().science, "growing");

    expect(earned).toBeGreaterThan(0);
    expect(earned).toBeLessThanOrEqual(
      (growing.science * 24) / growing.lengthHours,
    );
  });

  it("counts the observing programme for the Night's share of a Lunation, in Daylight as at Night", () => {
    const { lengthHours, science: perRound } = catalogue.observingProgramme;
    const campaign = loadSample("version-39.moonbase");
    const performances = (): number =>
      campaign
        .snapshot()
        .structures.filter(
          (structure) =>
            catalogue.structureTypes.find(
              (type) => type.id === structure.structureTypeId,
            )?.telescope === true,
        )
        .reduce((sum, structure) => sum + structure.performance, 0);
    const expected = (): number =>
      ((perRound * 24) / lengthHours) * performances() * nightShare;

    // The sample's telescope observes at Night.
    for (
      let hours = 0;
      campaign.snapshot().observingProgramme.observing === 0;
      hours++
    ) {
      if (hours > 40 * 24) throw new Error("No telescope ever observed.");
      campaign.advance(60);
    }
    expect(expected()).toBeGreaterThan(0);
    expect(
      from(campaign.forecasts().science, "observing-programme"),
    ).toBeCloseTo(expected());

    for (
      let hours = 0;
      campaign.snapshot().lunation.part === "night";
      hours++
    ) {
      if (hours > nightEarthDays * 24) throw new Error("Daylight never came.");
      campaign.advance(60);
    }
    campaign.advance(60);
    expect(campaign.snapshot().observingProgramme.observing).toBe(0);
    expect(
      from(campaign.forecasts().science, "observing-programme"),
    ).toBeCloseTo(expected());
  });

  it("adds up what every source earns", () => {
    const { science } = tried("late-game").forecasts();

    expect(science.perEarthDay).toBeGreaterThan(0);
    expect(science.perEarthDay).toBeCloseTo(
      science.sources.reduce((sum, source) => sum + source.perEarthDay, 0),
    );
  });
});
