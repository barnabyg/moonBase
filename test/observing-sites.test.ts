import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type Campaign,
  type GameEvent,
  type GroundPosition,
} from "../src/simulation";
import {
  freshSaveWith,
  INFRARED_TELESCOPE_SITES,
  infraredTelescopeSave,
  RADIO_TELESCOPE_ARRAY_SITES,
  radioTelescopeArraySave,
} from "./try-scenarios";

// Observing sites (#264): a Survey back once a telescope's Design is unlocked
// finds a site of its kind, and a telescope standing wholly on one works its
// rounds half as fast again.

const rules = catalogue.expeditions.observingSites;
const FASTER = 1 + rules.roundsFasterBy;

function load(text: string): Campaign {
  const loaded = loadCampaign(text);
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.campaign;
}

/** A Campaign an hour in, able to send Surveys, with these Designs unlocked too. */
function surveyingBase(designs: readonly string[]): Campaign {
  return load(
    freshSaveWith((state) => {
      state.unlockedDesignIds.push("survey-expeditions", ...designs);
    }),
  );
}

/** Sends a Survey and plays on until it is back, returning what it reported. */
function survey(campaign: Campaign): GameEvent | undefined {
  const started = campaign.startExpedition("survey");
  if (!started.ok) throw new Error(started.message);
  for (let hours = 0; hours < 40 * 24; hours++) {
    const back = campaign
      .advance(60)
      .find(({ kind }) => kind === "survey-returned");
    if (back !== undefined) return back;
  }
  throw new Error("The Survey never came back.");
}

/** A save's text with these sites found. */
function withSites(
  text: string,
  sites: readonly { kindId: string; position: GroundPosition }[],
): string {
  const save = JSON.parse(text) as {
    version: number;
    state: { observingSites: unknown };
  };
  save.state.observingSites = sites;
  return JSON.stringify(save);
}

function positionOf(
  sites: typeof INFRARED_TELESCOPE_SITES | typeof RADIO_TELESCOPE_ARRAY_SITES,
  id: string,
): GroundPosition {
  const found = sites.find(([typeId]) => typeId === id);
  if (found === undefined) throw new Error(`expected a ${id}`);
  return found[1];
}

describe("a Survey finding observing sites", () => {
  it("finds none until a telescope that needs one can be built", () => {
    const campaign = surveyingBase([]);

    expect(survey(campaign)).toMatchObject({
      kind: "survey-returned",
      observingSiteKindId: undefined,
    });
    expect(campaign.snapshot().observingSites).toEqual([]);
  });

  it("finds a dark site once Infrared astronomy is unlocked, well away from the Lander and wholly on the map", () => {
    const campaign = surveyingBase(["infrared-astronomy"]);
    const science = campaign.snapshot().science;

    expect(survey(campaign)).toMatchObject({
      observingSiteKindId: "dark",
      science: 25,
    });
    const [site, ...others] = campaign.snapshot().observingSites;

    expect(others).toEqual([]);
    expect(site).toMatchObject({
      kindId: "dark",
      label: "Dark site",
      radiusMetres: rules.radiusMetres,
      keptClearOf: "lit",
    });
    expect(site?.fromLanderMetres).toBeGreaterThanOrEqual(
      rules.fromLanderMetres.least,
    );
    expect(site?.fromLanderMetres).toBeLessThanOrEqual(
      rules.fromLanderMetres.most,
    );
    for (const [at, half] of [
      [site?.position.x ?? Infinity, catalogue.map.widthMetres / 2],
      [site?.position.y ?? Infinity, catalogue.map.depthMetres / 2],
    ] as const) {
      expect(Math.abs(at) + rules.radiusMetres).toBeLessThanOrEqual(half);
    }
    expect(campaign.snapshot().science).toBeGreaterThanOrEqual(science + 25);
  });

  it("finds one site of each kind, a Survey at a time, and then no more", () => {
    const campaign = surveyingBase(["infrared-astronomy", "radio-astronomy"]);

    const found = [survey(campaign), survey(campaign), survey(campaign)];

    expect(
      found.map((event) =>
        event?.kind === "survey-returned"
          ? event.observingSiteKindId
          : event?.kind,
      ),
    ).toEqual(["dark", "radio-quiet", undefined]);
    const [dark, quiet] = campaign.snapshot().observingSites;
    expect(quiet).toMatchObject({ label: "Radio-quiet site" });
    expect(
      Math.hypot(
        (dark?.position.x ?? 0) - (quiet?.position.x ?? 0),
        (dark?.position.y ?? 0) - (quiet?.position.y ?? 0),
      ),
    ).toBeGreaterThanOrEqual(2 * rules.radiusMetres);
  });

  it("finds it in the same place every time the same save plays out, and the hazards to come are as they were", () => {
    const text = freshSaveWith((state) => {
      state.unlockedDesignIds.push("survey-expeditions", "infrared-astronomy");
    });
    const once = load(text);
    const again = load(text);
    const without = load(
      freshSaveWith((state) => {
        state.unlockedDesignIds.push("survey-expeditions");
      }),
    );

    survey(once);
    survey(again);
    survey(without);

    expect(once.snapshot().observingSites).toEqual(
      again.snapshot().observingSites,
    );
    const randomOf = (campaign: Campaign): unknown =>
      (JSON.parse(campaign.save()) as { random: unknown }).random;
    expect(randomOf(once)).toEqual(randomOf(without));
  });

  it("keeps the sites found in a save", () => {
    const campaign = surveyingBase(["infrared-astronomy"]);
    survey(campaign);

    const loaded = load(campaign.save());

    expect(loaded.snapshot().observingSites).toEqual(
      campaign.snapshot().observingSites,
    );
    expect(survey(loaded)).toMatchObject({ observingSiteKindId: undefined });
  });

  it("refuses a save with two sites of one kind as damaged", () => {
    const text = withSites(
      freshSaveWith(() => undefined),
      [
        { kindId: "dark", position: { x: 300, y: 0 } },
        { kindId: "dark", position: { x: -300, y: 0 } },
      ],
    );

    expect(loadCampaign(text)).toMatchObject({ ok: false, reason: "damaged" });
  });
});

describe("a telescope on an observing site", () => {
  it("observes its infrared rounds half as fast again on a dark site", () => {
    const text = infraredTelescopeSave();
    const telescope = positionOf(
      INFRARED_TELESCOPE_SITES,
      "infrared-telescope",
    );
    const plain = load(text);
    const onSite = load(
      withSites(text, [{ kindId: "dark", position: telescope }]),
    );
    // A radio-quiet site suits an array, not an infrared telescope.
    const onWrongSite = load(
      withSites(text, [{ kindId: "radio-quiet", position: telescope }]),
    );

    const [plainTelescope] = plain.snapshot().infraredTelescopes;
    const [siteTelescope] = onSite.snapshot().infraredTelescopes;
    const [wrongTelescope] = onWrongSite.snapshot().infraredTelescopes;

    expect(plainTelescope?.observingSiteKindId).toBeUndefined();
    expect(siteTelescope?.observingSiteKindId).toBe("dark");
    expect(wrongTelescope?.observingSiteKindId).toBeUndefined();
    expect(siteTelescope?.minutesLeft).toBeCloseTo(
      (plainTelescope?.minutesLeft ?? 0) / FASTER,
      5,
    );
    const infraredForecast = (campaign: Campaign): number =>
      campaign
        .forecasts()
        .science.sources.find(({ source }) => source === "infrared-survey")
        ?.perEarthDay ?? 0;
    expect(infraredForecast(onSite)).toBeCloseTo(
      infraredForecast(plain) * FASTER,
      5,
    );

    plain.advance(60);
    onSite.advance(60);

    const progressOf = (campaign: Campaign): number =>
      campaign.snapshot().infraredTelescopes[0]?.progress ?? 0;
    const before = plainTelescope?.progress ?? 0;
    expect(progressOf(onSite) - before).toBeCloseTo(
      (progressOf(plain) - before) * FASTER,
      5,
    );
  });

  it("gains nothing standing only partly on the site", () => {
    const text = infraredTelescopeSave();
    const telescope = positionOf(
      INFRARED_TELESCOPE_SITES,
      "infrared-telescope",
    );
    const campaign = load(
      withSites(text, [
        {
          kindId: "dark",
          // Its 4 m footprint runs a metre past the circle's edge.
          position: { x: telescope.x + rules.radiusMetres - 3, y: telescope.y },
        },
      ]),
    );

    expect(
      campaign.snapshot().infraredTelescopes[0]?.observingSiteKindId,
    ).toBeUndefined();
  });

  it("works a radio array's rounds half as fast again on a radio-quiet site", () => {
    const text = radioTelescopeArraySave();
    const array = positionOf(
      RADIO_TELESCOPE_ARRAY_SITES,
      "radio-telescope-array",
    );
    const plain = load(text);
    const onSite = load(
      withSites(text, [{ kindId: "radio-quiet", position: array }]),
    );

    const [plainArray] = plain.snapshot().radioArrays;
    const [siteArray] = onSite.snapshot().radioArrays;

    expect(siteArray?.observingSiteKindId).toBe("radio-quiet");
    expect(siteArray?.sciencePerLunation).toBeCloseTo(
      (plainArray?.sciencePerLunation ?? 0) * FASTER,
      5,
    );
    expect(siteArray?.minutesLeft).toBeCloseTo(
      (plainArray?.minutesLeft ?? 0) / FASTER,
      5,
    );
  });
});
