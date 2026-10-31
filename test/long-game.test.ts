import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import {
  act2TargetsMissed,
  designsNotUsed,
  designsTheLongGameUses,
  formatLongGame,
  act2Targets,
  LONG_GAME_END_EARTH_DAY,
  longGameSteps,
  longGameSucceeded,
  playLongGame,
} from "./long-game";
import { referenceSteps, type ReferenceTimeline } from "./reference-campaign";

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
      {
        milestoneId: "spare-components-self-sufficient",
        atMinute: 500 * earthDay,
      },
    ],
    researchTasksCompleted: [
      { researchTaskId: "long-stay-health-study", atMinute: 890 * earthDay },
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
