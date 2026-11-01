import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import {
  act2TargetsMissed,
  laterActTargetsMissed,
  designsNotUsed,
  designsTheLongGameUses,
  formatLongGame,
  act2Targets,
  LONG_GAME_END_EARTH_DAY,
  longGameSteps,
  longGameSucceeded,
  playLongGame,
  buyInTurn,
  giveUpOnMissedTargets,
  laterActTargets,
  purchaseStallWatch,
  PURCHASE_STALL_EARTH_DAYS,
  type Purchase,
} from "./long-game";
import {
  keepingLastSnapshot,
  referenceSteps,
  REFERENCE_SEED,
  type Play,
  type ReferenceTimeline,
} from "./reference-campaign";
import { catalogueUpToAct } from "./pacing-report";
import { createCampaign, type Snapshot } from "../src/simulation";

// The long game itself takes minutes, so nothing here plays it through: `npm
// run long-game` does, on demand (see docs/reference-campaign.md).

const earthDay = 24 * 60;

const everythingBuilt: ReferenceTimeline["structureTypesBuilt"] =
  catalogue.structureTypes.map(({ id }) => ({
    structureTypeId: id,
    atMinute: 0,
  }));

function timeline(
  overrides: Partial<ReferenceTimeline> = {},
): ReferenceTimeline {
  return {
    ...playLongGame([]),
    structureTypesBuilt: everythingBuilt,
    launchItemsManifested: catalogue.launch.items.map(({ id }) => id),
    moves: [{ atMinute: 1500 * 24 * 60, structureTypeId: "buried-habitat" }],
    milestones: [
      { milestoneId: "workshop-running", atMinute: 400 * earthDay },
      { milestoneId: "metals-sold", atMinute: 400 * earthDay },
      { milestoneId: "first-propellant", atMinute: 1000 * earthDay },
      { milestoneId: "return-mass-tripled", atMinute: 1200 * earthDay },
      { milestoneId: "precision-optics-sold", atMinute: 1700 * earthDay },
      {
        milestoneId: "spare-components-self-sufficient",
        atMinute: 500 * earthDay,
      },
    ],
    researchTasksCompleted: [
      { researchTaskId: "long-stay-health-study", atMinute: 890 * earthDay },
      { researchTaskId: "ascent-load-survey", atMinute: 1400 * earthDay },
      {
        researchTaskId: "grinding-line-yield-survey",
        atMinute: 2990 * earthDay,
      },
    ],
    designsUnlocked: [
      { designId: "cold-trap-mining", atMinute: 800 * earthDay },
    ],
    ...overrides,
  };
}

describe("the long-game play guide", () => {
  it("plays the reference Campaign first, then its own steps", () => {
    expect(longGameSteps.slice(0, referenceSteps.length)).toEqual(
      referenceSteps,
    );
    expect(longGameSteps.length).toBeGreaterThan(referenceSteps.length);
  });

  it("says why it gave up, as the reference Campaign does", () => {
    const given = playLongGame([
      {
        milestoneId: undefined,
        description: "Give up.",
        play() {
          throw new Error("Something never came.");
        },
      },
    ]);

    expect(given.failure).toBe("Something never came.");
    expect(longGameSucceeded(given)).toBe(false);
    expect(formatLongGame(given)).toContain(
      "It gave up: Something never came.",
    );
  });

  it("says when a Workshop came, what the spare Components did, and what Launches brought of them before and after it", () => {
    const lines = formatLongGame(
      timeline({
        structureTypesBuilt: [
          { structureTypeId: "workshop", atMinute: 100 * 24 * 60 },
        ],
        sparesInStock: [
          { atMinute: 50 * 24 * 60, inStock: 20, fewest: 12 },
          { atMinute: 110 * 24 * 60, inStock: 30, fewest: 9 },
          { atMinute: 140 * 24 * 60, inStock: 25, fewest: 22 },
        ],
        sparesShipped: [
          { atMinute: 60 * 24 * 60, count: 15 },
          { atMinute: 80 * 24 * 60, count: 5 },
          { atMinute: 120 * 24 * 60, count: 3 },
        ],
      }),
    );

    expect(lines).toContain(
      "A Workshop was commissioned on Earth Day 100.0. After it the stock was never below 9.",
    );
    expect(lines).toContain(
      "Launches bringing spare Components: 2, with 20, before a Workshop; 1, with 3, after it.",
    );
    expect(lines).toContain("     140  25 (22)");
  });

  it("says what became of the propellant", () => {
    const lines = formatLongGame(
      timeline({
        structureTypesBuilt: [
          { structureTypeId: "propellant-tank", atMinute: 1000 * earthDay },
        ],
        sales: [
          {
            atMinute: 1200 * earthDay,
            earnedMillionDollars: 120,
            sold: [
              { resourceId: "propellant", kilograms: 100 },
              { resourceId: "metals", kilograms: 20 },
            ],
          },
        ],
        propellantUse: {
          burnedKilograms: 1000,
          takeOffsBurning: 4,
          takeOffs: 10,
          mostBurnedKilograms: 400,
          mostCarriedKilograms: 300,
          highestKilograms: 1050,
          limitKilograms: 1500,
          minutesWaiting: 12 * earthDay,
        },
      }),
    );

    expect(lines).toContain(
      "A propellant tank was commissioned on Earth Day 1000.0.",
    );
    expect(lines).toContain(
      "Propellant: 1000 kg burned, on 4 of 10 take-offs, the most on one 400 kg, for the most carried, 300 kg; 100 kg sold. It held at most 1050 kg, against a limit by the end of 1500 kg, and some Plant waited for tank space for 12 Earth Days.",
    );
  });

  it("says what a Greenhouse and a growing hall each earned, and what the Greenhouse chain had it buy", () => {
    const lines = formatLongGame(
      timeline({
        endMinute: 3000 * earthDay,
        structureTypesBuilt: [
          { structureTypeId: "greenhouse", atMinute: 1640 * earthDay },
          { structureTypeId: "growing-hall", atMinute: 2300 * earthDay },
          { structureTypeId: "vault-cistern", atMinute: 2800 * earthDay },
        ],
        designsUnlocked: [
          { designId: "growing-halls", atMinute: 2200 * earthDay },
        ],
        looks: [
          {
            atMinute: 2200 * earthDay,
            radiationDoseMillisieverts: 575,
            fundingMillionDollars: 20000,
          },
        ],
        greenhouseRounds: [
          {
            atMinute: 1700 * earthDay,
            structureTypeId: "greenhouse",
            science: 20,
          },
          {
            atMinute: 2400 * earthDay,
            structureTypeId: "growing-hall",
            science: 100,
          },
          {
            atMinute: 2500 * earthDay,
            structureTypeId: "growing-hall",
            science: 0,
            lostFor: "water",
          },
        ],
      }),
    );

    expect(lines).toContainEqual(
      expect.stringContaining(
        "A Greenhouse was commissioned on Earth Day 1640.0. It earned 20 Science in 1 rounds",
      ),
    );
    expect(lines).toContainEqual(
      expect.stringContaining(
        "A growing hall was commissioned on Earth Day 2300.0. It earned 100 Science in 1 rounds",
      ),
    );
    expect(lines).toContainEqual(
      expect.stringContaining("lost 1 rounds for want of water"),
    );
    expect(lines).toContain(
      "Growing halls was unlocked on Earth Day 2200.0, with $20000M in hand. The first of each commissioned since:",
    );
    expect(lines).toContain("  2800.0  Vault cistern");
  });

  it("plays to the length the Campaign's content is meant to last", () => {
    expect(LONG_GAME_END_EARTH_DAY).toBe(3000);
  });

  it("fails if the Mission Director didn't move into a Buried Habitat by the Act's target", () => {
    expect(longGameSucceeded(timeline())).toBe(true);
    expect(longGameSucceeded(timeline({ moves: [] }))).toBe(false);
    expect(
      longGameSucceeded(
        timeline({
          moves: [
            { atMinute: 1601 * 24 * 60, structureTypeId: "buried-habitat" },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("says when the Buried Habitat was sent for, commissioned and moved into, with the Radiation Dose at each, and how fast it rose after", () => {
    const lines = formatLongGame(
      timeline({
        endMinute: 3000 * earthDay,
        waterWallAtMinute: 100 * earthDay,
        launchManifests: [
          {
            atMinute: 1400 * earthDay,
            items: [{ itemId: "spare-component", count: 3 }],
          },
          {
            atMinute: 1500 * earthDay,
            items: [
              { itemId: "vault-section", count: 4 },
              { itemId: "oxygen", count: 1 },
            ],
          },
        ],
        structureTypesBuilt: [
          ...everythingBuilt.filter(
            ({ structureTypeId }) => structureTypeId !== "buried-habitat",
          ),
          { structureTypeId: "buried-habitat", atMinute: 1550 * earthDay },
        ],
        moves: [
          { atMinute: 3 * earthDay, structureTypeId: "habitat" },
          { atMinute: 1560 * earthDay, structureTypeId: "buried-habitat" },
        ],
        looks: [
          [100, 250, 100],
          [1500, 550, 20000],
          [1550, 557.5, 15000],
          [1560, 559, 15000],
          [3000, 588, 40000],
        ].map(([day, dose, funding]) => ({
          atMinute: (day ?? 0) * earthDay,
          radiationDoseMillisieverts: dose ?? 0,
          fundingMillionDollars: funding ?? 0,
        })),
      }),
    );

    expect(lines).toContain(
      "  Earth Day 1500.0, at 550.0 mSv: the Lander left for Earth to bring 4 vault-section.",
    );
    expect(lines).toContain("  Funding as it was first sent for: $20000M.");
    expect(lines).toContain("  Earth Day 1550.0, at 557.5 mSv: commissioned.");
    expect(lines).toContain(
      "  Earth Day 1560.0, at 559.0 mSv: the Mission Director moved in.",
    );
    expect(lines).toContain(
      "  Earth Day 3000.0, at 588.0 mSv: the end, the Radiation Dose having risen 0.0201 mSv an Earth Day since they moved in (1.34 times the usual rate, for Solar Particle Events).",
    );
    expect(lines).toContain(
      "  Behind the water wall it rose 0.212 mSv an Earth Day (1.41 times the usual rate).",
    );
  });

  it("fails if it misses any of Act 2's pacing targets, and says which", () => {
    expect(act2TargetsMissed(timeline())).toEqual([]);

    const later = (milestoneId: string, atDay: number) => ({
      milestones: [
        ...timeline().milestones.filter(
          (milestone) => milestone.milestoneId !== milestoneId,
        ),
        { milestoneId, atMinute: atDay * earthDay },
      ],
    });
    const missed = [
      [later("workshop-running", 501), "a Workshop running by Earth Day 500."],
      [later("metals-sold", 901), "metals sold by Earth Day 900."],
      [
        later("spare-components-self-sufficient", 801),
        "spare Components needing no Launch by Earth Day 800.",
      ],
      [
        { sparesShipped: [{ atMinute: 801 * earthDay, count: 5 }] },
        "spare Components needing no Launch by Earth Day 800.",
      ],
      [
        {
          designsUnlocked: [
            { designId: "cold-trap-mining", atMinute: 699 * earthDay },
          ],
        },
        "Designs still to buy at Earth Day 700.",
      ],
      [
        {
          researchTasksCompleted: [
            {
              researchTaskId: "long-stay-health-study",
              atMinute: 800 * earthDay,
            },
          ],
        },
        "research lasting until about Earth Day 900 (it ended on 800).",
      ],
      [
        {
          structureTypesBuilt: [
            { structureTypeId: "workshop", atMinute: 400 * earthDay },
          ],
          sparesInStock: [{ atMinute: 500 * earthDay, inStock: 2, fewest: 0 }],
        },
        "spare Components never running out.",
      ],
    ] as const;
    for (const [overrides, target] of missed) {
      expect(act2TargetsMissed(timeline(overrides))).toContain(target);
      expect(longGameSucceeded(timeline(overrides))).toBe(false);
    }
  });

  it.each([
    ["propellant", "first-propellant", 1051, "propellant made by"],
    ["a tripled Return Mass", "return-mass-tripled", 1251, "tripled by"],
    ["optics", "precision-optics-sold", 2001, "optics sold by"],
  ])(
    "fails if %s come too late for Act 3's and Act 4's targets",
    (_what, milestoneId, earthDays, says) => {
      const late = timeline();
      const missed = laterActTargetsMissed({
        ...late,
        milestones: late.milestones.map((milestone) =>
          milestone.milestoneId === milestoneId
            ? { milestoneId, atMinute: earthDays * earthDay }
            : milestone,
        ),
      });
      expect(missed.join()).toContain(says);
      expect(laterActTargetsMissed(late)).toEqual([]);
    },
  );

  it("has one of every Launch item take at least the profit of 20 Launches", () => {
    expect(act2TargetsMissed(timeline()).join()).not.toContain(
      "Launches' profit",
    );
    expect(act2Targets.launchesToBuyEverything).toBe(20);
  });

  it("says when Act 2's Structures came, and shows the Funding every 100 Earth Days", () => {
    const lines = formatLongGame(
      timeline({
        looks: [
          {
            atMinute: 100 * earthDay,
            radiationDoseMillisieverts: 0,
            fundingMillionDollars: 1234,
          },
          {
            atMinute: 400 * earthDay,
            radiationDoseMillisieverts: 0,
            fundingMillionDollars: 99,
          },
        ],
        sales: [
          {
            atMinute: 400 * earthDay,
            earnedMillionDollars: 228,
            sold: [
              { resourceId: "circuit-boards", kilograms: 64 },
              { resourceId: "metals", kilograms: 36 },
            ],
          },
        ],
        structureTypesBuilt: [
          { structureTypeId: "workshop", atMinute: 363 * earthDay },
        ],
      }),
    );

    expect(lines).toContain("     100  $1234M");
    expect(lines).toContain("   363.0  Workshop");
    expect(lines).toContainEqual(
      expect.stringContaining(
        "lowest at $99M on Earth Day 400.0. Exports earned $228M over 1 trips: 64 kg of circuit boards and 36 kg of metals.",
      ),
    );
  });

  it("names only Designs the Tech Tree has as those it uses", () => {
    const ids = catalogue.designs.map((design) => design.id);

    for (const designId of designsTheLongGameUses) {
      expect(ids).toContain(designId);
    }
  });
});

describe("the limit on a purchase that makes no progress", () => {
  const fresh = createCampaign({ seed: REFERENCE_SEED }).snapshot();
  const solarArray: Purchase = {
    structureTypeId: "solar-array",
    site: { x: 28, y: -33 },
  };

  /** Runs the purchases over a stretch of Earth Days, a look a day, on a base that stays as it is. */
  function lookEachDay(
    fromEarthDay: number,
    toEarthDay: number,
    base: Partial<Snapshot>,
  ): void {
    const buy = buyInTurn([solarArray]);
    for (let day = fromEarthDay; day <= toEarthDay; day++) {
      const state: Snapshot = {
        ...fresh,
        clock: { ...fresh.clock, elapsedMinutes: day * earthDay },
        ...base,
      };
      buy({
        state,
        campaign: {
          planConstruction: () => ({
            ok: false,
            message: "A Rover is standing there.",
          }),
          setLaunchManifest: () => ({ ok: true }),
        },
      } as unknown as Play);
    }
  }

  const inStock = {
    stockpile: {
      ...fresh.stockpile,
      components: [
        ...fresh.stockpile.components.filter(
          ({ componentId }) =>
            componentId !== "solar-panel" && componentId !== "array-mast",
        ),
        { componentId: "solar-panel", count: 9 },
        { componentId: "array-mast", count: 9 },
      ],
    },
  };
  const lastDay = 400 + PURCHASE_STALL_EARTH_DAYS + 1;

  it("gives up on a purchase that keeps being refused, saying where and why", () => {
    expect(() => {
      lookEachDay(400, lastDay, inStock);
    }).toThrow(
      `The purchases have made no progress for ${PURCHASE_STALL_EARTH_DAYS} Earth Days, since Earth Day 400.0: a solar-array at (28, -33) can't be planned: A Rover is standing there.`,
    );
  });

  it("gives up on a purchase whose Components never come, saying what it lacks", () => {
    expect(() => {
      lookEachDay(400, lastDay, {
        stockpile: { ...fresh.stockpile, components: [] },
        fundingMillionDollars: 12,
      });
    }).toThrow(/a solar-array at \(28, -33\) lacks .*with \$12M of Funding/);
  });

  it("gives up on a purchase planned and never commissioned", () => {
    const planned = {
      structureTypeId: solarArray.structureTypeId,
      position: solarArray.site,
    };
    expect(() => {
      lookEachDay(400, lastDay, {
        constructions: [planned] as unknown as Snapshot["constructions"],
      });
    }).toThrow("is planned, and hasn't been commissioned");
  });

  it("doesn't count the time planned of a purchase known to stand stranded", () => {
    const stranded = { ...solarArray, strandedBecause: "for this test" };
    const buy = buyInTurn([stranded]);
    for (let day = 400; day <= lastDay; day++) {
      buy({
        state: {
          ...fresh,
          clock: { ...fresh.clock, elapsedMinutes: day * earthDay },
          constructions: [
            {
              structureTypeId: stranded.structureTypeId,
              position: stranded.site,
            },
          ] as unknown as Snapshot["constructions"],
        },
      } as unknown as Play);
    }
  });

  it("doesn't count the time its Design is locked, however long Science takes", () => {
    expect(() => {
      lookEachDay(400, 2000, { unlockedDesignIds: [] });
    }).not.toThrow();
  });

  it("doesn't count the time before Act 2, when it isn't buying yet", () => {
    expect(() => {
      lookEachDay(0, 349 + PURCHASE_STALL_EARTH_DAYS, inStock);
    }).not.toThrow();
  });

  it("starts again with each purchase", () => {
    const watch = purchaseStallWatch(10);
    const waiting = (what: string) => [{ what, why: "waits" }];

    watch(0, waiting("first"));
    watch(10 * earthDay, waiting("second"));
    watch(20 * earthDay, waiting("second"));
    expect(() => {
      watch(21 * earthDay, waiting("second"));
    }).toThrow("since Earth Day 10.0: second waits");
  });
});

describe("giving up on a dated pacing target", () => {
  const fresh = createCampaign({ seed: REFERENCE_SEED }).snapshot();
  const allMilestones = {
    ...fresh.milestones,
    reachedIds: [
      "workshop-running",
      "spare-components-self-sufficient",
      "metals-sold",
      "first-propellant",
      "return-mass-tripled",
      "precision-optics-sold",
    ],
  };
  const researchUpToAct = (act: number) =>
    catalogueUpToAct(catalogue, act).researchTasks.map(({ id }) => id);

  /** One look at a base on an Earth Day, with no campaign to send a command to, as the check sends none. */
  function lookOn(day: number, base: Partial<Snapshot> = {}): void {
    giveUpOnMissedTargets()({
      state: {
        ...fresh,
        clock: { ...fresh.clock, elapsedMinutes: day * earthDay },
        milestones: allMilestones,
        ...base,
      },
    } as unknown as Play);
  }

  it.each([
    [
      "workshop-running",
      act2Targets.workshopRunningBy,
      "a Workshop running by Earth Day 500.",
    ],
    [
      "spare-components-self-sufficient",
      act2Targets.sparesNeedNoLaunchBy,
      "spare Components needing no Launch by Earth Day 800.",
    ],
    ["metals-sold", act2Targets.metalsSoldBy, "metals sold by Earth Day 900."],
    [
      "first-propellant",
      laterActTargets.propellantMadeBy,
      "propellant made by Earth Day 1050.",
    ],
    [
      "return-mass-tripled",
      laterActTargets.returnMassTripledBy,
      "Return Mass tripled by Earth Day 1250.",
    ],
    [
      "precision-optics-sold",
      laterActTargets.opticsSoldBy,
      "precision optics sold by Earth Day 2000.",
    ],
  ])(
    "gives up just after %s's date, not on it, in the words the end would use",
    (milestoneId, by, words) => {
      const unmet = {
        milestones: {
          ...allMilestones,
          reachedIds: allMilestones.reachedIds.filter(
            (id) => id !== milestoneId,
          ),
        },
      };
      expect(() => {
        lookOn(by, unmet);
      }).not.toThrow(words);
      expect(() => {
        lookOn(by + 0.1, unmet);
      }).toThrow(
        `On Earth Day ${(by + 0.1).toFixed(1)} a pacing target can no longer be met: ${words}`,
      );

      const neverReached = timeline({
        milestones: timeline().milestones.filter(
          (milestone) => milestone.milestoneId !== milestoneId,
        ),
      });
      expect([
        ...act2TargetsMissed(neverReached),
        ...laterActTargetsMissed(neverReached),
      ]).toContain(words);
    },
  );

  it("gives up if a Launch leaves with spare Components after their date, not before", () => {
    const leaving = (legStartedAtMinute: number) => ({
      lander: {
        ...fresh.lander,
        state: "travelling-to-earth",
        legStartedAtMinute,
      } as Snapshot["lander"],
      launchManifest: {
        ...fresh.launchManifest,
        items: [{ itemId: "spare-component", count: 5 }],
      },
    });
    expect(() => {
      lookOn(801, leaving(800 * earthDay));
    }).not.toThrow();
    expect(() => {
      lookOn(801, leaving(800 * earthDay + 1));
    }).toThrow("spare Components needing no Launch by Earth Day 800.");
  });

  it("gives up once every Design of Act 2 is unlocked before Earth Day 700", () => {
    const allDesigns = {
      unlockedDesignIds: catalogueUpToAct(catalogue, 2).designs.map(
        ({ id }) => id,
      ),
    };
    expect(() => {
      lookOn(700 - 1 / 24, allDesigns);
    }).toThrow("Designs still to buy at Earth Day 700.");
    // Unlocked at this look, the timeline dates it to the next, past the target.
    expect(() => {
      lookOn(700, allDesigns);
    }).not.toThrow();
    expect(() => {
      lookOn(699);
    }).not.toThrow();
  });

  it.each([
    [2, 850, 950, "research lasting until about Earth Day 900"],
    [3, 1350, 1450, "Act 3's research lasting until about Earth Day 1400"],
  ])(
    "gives up on Act %i's research ending too soon or still going too late",
    (act, soonest, latest, words) => {
      const done = { completedResearchTaskIds: researchUpToAct(act) };
      expect(() => {
        lookOn(soonest - 1, done);
      }).toThrow(`${words} (it has ended already).`);
      expect(() => {
        lookOn(soonest, done);
      }).not.toThrow(words);
      expect(() => {
        lookOn(latest, { completedResearchTaskIds: [] });
      }).not.toThrow(words);
      expect(() => {
        lookOn(latest + 1, { completedResearchTaskIds: [] });
      }).toThrow(`${words} (it hasn't ended).`);
    },
  );

  it("gives up on Act 4's research ending too soon, and leaves whether it lasts to the end", () => {
    const done = { completedResearchTaskIds: researchUpToAct(4) };
    expect(() => {
      lookOn(2949, done);
    }).toThrow("Act 4's research lasting until about Earth Day 3000");
    expect(() => {
      lookOn(2950, done);
    }).not.toThrow();
    expect(() => {
      lookOn(3000, { completedResearchTaskIds: researchUpToAct(3) });
    }).not.toThrow();
  });

  it("says nothing while every target is still on course", () => {
    expect(() => {
      lookOn(100, { milestones: { ...allMilestones, reachedIds: [] } });
    }).not.toThrow();
  });

  it("makes the play give up, saying why", () => {
    const given = playLongGame([
      {
        milestoneId: undefined,
        description: "Look once, on an Earth Day past a target.",
        play(play) {
          giveUpOnMissedTargets()({
            ...play,
            state: {
              ...play.state,
              clock: { ...play.state.clock, elapsedMinutes: 501 * earthDay },
            },
          });
        },
      },
    ]);

    expect(given.failure).toBe(
      "On Earth Day 501.0 a pacing target can no longer be met: a Workshop running by Earth Day 500.",
    );
    expect(longGameSucceeded(given)).toBe(false);
  });

  it("is what the guide's last step keeps up last, seeing what the others did", () => {
    const habits: ((play: Play) => void)[] = [];
    longGameSteps.at(-1)?.play({
      keepUp: (habit: (play: Play) => void) => habits.push(habit),
      waitUntil: () => undefined,
      state: {
        completedResearchTaskIds: catalogue.researchTasks.map(({ id }) => id),
        unlockedDesignIds: catalogue.designs.map(({ id }) => id),
      },
    } as unknown as Play);

    expect(() => {
      habits.at(-1)?.({
        state: {
          ...fresh,
          clock: { ...fresh.clock, elapsedMinutes: 501 * earthDay },
        },
      } as unknown as Play);
    }).toThrow("a Workshop running by Earth Day 500.");
  });
});

describe("keeping the Campaign's last snapshot", () => {
  it("shows the same snapshot until a command or game time could change it", () => {
    const campaign = keepingLastSnapshot(
      createCampaign({ seed: REFERENCE_SEED }),
    );
    const first = campaign.snapshot();

    expect(campaign.snapshot()).toBe(first);
    campaign.forecasts();
    expect(campaign.snapshot()).toBe(first);

    campaign.advance(60);
    const later = campaign.snapshot();
    expect(later.clock.elapsedMinutes).toBe(60);

    const planned = campaign.planConstruction({
      structureTypeId: "solar-array",
      position: { x: 36, y: -12 },
    });
    expect(planned.ok).toBe(true);
    expect(campaign.snapshot().constructions.length).toBe(
      later.constructions.length + 1,
    );
  });

  it("shows what a Campaign left alone shows", () => {
    const kept = keepingLastSnapshot(createCampaign({ seed: REFERENCE_SEED }));
    const plain = createCampaign({ seed: REFERENCE_SEED });
    kept.snapshot();
    kept.advance(600);
    plain.advance(600);

    expect(kept.snapshot()).toEqual(plain.snapshot());
    expect(kept.save()).toBe(plain.save());
  });
});

describe("its timeline", () => {
  it("shows each Research Task and Design by the Earth Day it was done", () => {
    const lines = formatLongGame(
      timeline({
        researchTasksCompleted: [
          { researchTaskId: "regolith-sample-analysis", atMinute: earthDay },
        ],
        designsUnlocked: [{ designId: "robots", atMinute: 2 * earthDay }],
      }),
    );

    expect(lines).toContain("     1.0  Regolith sample analysis");
    expect(lines).toContain("     2.0  Robots");
  });

  it("shows the forecast date the Radiation Dose reaches its limit", () => {
    expect(
      formatLongGame(
        timeline({ endMinute: 1440, minutesUntilDoseLimit: 2 * 1440 }),
      ),
    ).toContainEqual(
      expect.stringContaining("reaches the limit on Earth Day 3."),
    );
    expect(
      formatLongGame(timeline({ minutesUntilDoseLimit: undefined })),
    ).toContainEqual(expect.stringContaining("isn't rising"));
  });

  it("fails if a Design it says it uses was never built or sent for", () => {
    const missing = timeline({
      structureTypesBuilt: [],
      launchItemsManifested: [],
    });

    expect(designsNotUsed(missing)).toContain("solar-arrays");
    expect(designsNotUsed(missing)).toContain("maintenance-spares");
    expect(longGameSucceeded(missing)).toBe(false);
    expect(longGameSucceeded(timeline())).toBe(true);
  });

  it("ends well past the reference Campaign", () => {
    expect(LONG_GAME_END_EARTH_DAY).toBeGreaterThan(171);
  });
});
