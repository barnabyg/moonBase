import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { loadCampaign, type Campaign, type GameEvent } from "../src/simulation";
import { describeStructure } from "../src/ui/describe";
import { formatEvent } from "../src/ui/notifications-text";
import { formatPlantRates } from "../src/ui/structure-state";
import { exportEconomics } from "./pacing-report";
import { freshSaveWith } from "./try-scenarios";

// Act 2 through the simulation interface: its Milestones, the metals Export and
// what limits it, and the Plants that take nothing in.

const EARTH_DAY = 24 * 60;

function typeOf(id: string) {
  const type = catalogue.structureTypes.find(
    (candidate) => candidate.id === id,
  );
  if (type === undefined) throw new Error(`expected a Structure type ${id}`);
  return type;
}

/** A Campaign an hour in, with the Components of these Structures in stock, their Designs unlocked and these stocks of bulk resources. */
function baseWith(
  structureTypeIds: readonly string[],
  bulk: Readonly<Record<string, number>> = {},
  funding = 5000,
): Campaign {
  const loaded = loadCampaign(
    freshSaveWith((state) => {
      state.unlockedDesignIds = catalogue.designs.map(({ id }) => id);
      state.fundingMillionDollars = funding;
      for (const id of structureTypeIds) {
        for (const { componentId, count } of typeOf(id).components) {
          const stock = state.stockpile.components.find(
            (candidate) => candidate.componentId === componentId,
          );
          if (stock !== undefined) stock.count += count;
        }
      }
      for (const stock of state.bulkResources) {
        stock.kilograms = bulk[stock.resourceId] ?? stock.kilograms;
      }
      for (const stock of state.lifeSupport) stock.kilograms = 2000;
      const spares = state.stockpile.components.find(
        ({ componentId }) =>
          componentId === catalogue.maintenance.spareComponentId,
      );
      if (spares !== undefined) spares.count += 60;
    }),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.campaign;
}

/** Plans these Structures east of the landing site, in rows, and lets the Robot build them all. */
function build(campaign: Campaign, structureTypeIds: readonly string[]): void {
  for (const [index, structureTypeId] of structureTypeIds.entries()) {
    const planned = campaign.planConstruction({
      structureTypeId,
      position: {
        x: 40 + (index % 4) * 12,
        y: 30 + Math.floor(index / 4) * 12,
      },
    });
    if (!planned.ok) throw new Error(planned.message);
  }
  for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
    if (hours > 30 * 24) throw new Error("The base was never finished.");
    campaign.advance(60);
  }
}

/** Runs the game up to the next time Night falls, so that Plants have stopped. */
function runToNightfall(campaign: Campaign): void {
  for (let hours = 0; campaign.snapshot().lunation.part === "night"; hours++) {
    if (hours > 30 * 24) throw new Error("Daylight never came.");
    campaign.advance(60);
  }
  for (
    let hours = 0;
    campaign.snapshot().lunation.part === "daylight";
    hours++
  ) {
    if (hours > 30 * 24) throw new Error("Night never fell.");
    campaign.advance(60);
  }
}

function bulk(campaign: Campaign, resourceId: string): number {
  return (
    campaign
      .snapshot()
      .bulkResources.find((stock) => stock.resourceId === resourceId)
      ?.kilograms ?? 0
  );
}

/** What the Mission Director can live on for a Lunation or two: buried, as the Radiation Dose would otherwise kill them, and carried through the Night. */
const HOME = [
  "solar-array",
  "solar-array",
  "battery-bank",
  "battery-bank",
  "battery-bank",
  "buried-habitat",
];

/** Moves the Mission Director into the Buried Habitat, once it has power. */
function moveIn(campaign: Campaign): void {
  const home = () =>
    campaign
      .snapshot()
      .structures.find(
        ({ structureTypeId }) => structureTypeId === "buried-habitat",
      );
  for (let hours = 0; home()?.powered !== true; hours++) {
    if (hours > 30 * 24) throw new Error("It never had power.");
    campaign.advance(60);
  }
  const moved = campaign.moveMissionDirectorIn(home()?.id ?? "");
  if (!moved.ok) throw new Error(moved.message);
}

describe("Act 2's Milestones", () => {
  it("come after Act 1's, under Act 2: Independence, each with a hint that names what to do in the game's own words", () => {
    const act = catalogue.acts[1];
    expect(act?.label).toBe("Act 2: Independence");
    const own = catalogue.milestones.filter(({ actId }) => actId === act?.id);
    expect(own.map(({ id }) => id)).toEqual([
      "workshop-running",
      "spare-components-self-sufficient",
      "metals-sold",
    ]);
    const hints = own.map(({ hint }) => hint);
    expect(hints[0]).toContain("Parts machining");
    expect(hints[0]).toContain("machine tool");
    expect(hints[1]).toContain("Self-sufficient");
    expect(hints[2]).toContain("Exports tab");
    // A hint has nothing in it that only someone who has read the code knows.
    for (const hint of hints) expect(hint).not.toMatch(/[a-z]+-[a-z]+-[a-z]+/);
  });

  it("reaches Workshop running once a Workshop has started a batch, and not before", () => {
    const campaign = baseWith(["solar-array", "battery-bank", "workshop"], {
      metals: 50,
    });
    expect(campaign.snapshot().milestones.reachedIds).not.toContain(
      "workshop-running",
    );

    build(campaign, ["solar-array", "battery-bank", "workshop"]);
    campaign.advance(60);

    expect(campaign.snapshot().milestones.reachedIds).toContain(
      "workshop-running",
    );
  });

  it("doesn't reach Workshop running for a Workshop with no metals to start on", () => {
    const campaign = baseWith(["solar-array", "workshop"], { metals: 0 });

    build(campaign, ["solar-array", "workshop"]);
    campaign.advance(60);

    expect(campaign.snapshot().milestones.reachedIds).not.toContain(
      "workshop-running",
    );
  });

  it("reaches Metals sold only for a sale with metals in it", () => {
    const campaign = baseWith(HOME, { metals: 80, wafers: 50 });
    build(campaign, HOME);
    moveIn(campaign);
    const sendWith = (resourceId: string) => {
      const loading = campaign.loadExports([{ resourceId, kilograms: 20 }]);
      if (!loading.ok) throw new Error(loading.message);
      const sent = campaign.sendLander();
      if (!sent.ok) throw new Error(sent.message);
      campaign.advance(11 * EARTH_DAY);
    };

    sendWith("wafers");
    expect(campaign.snapshot().milestones.reachedIds).toContain("first-export");
    expect(campaign.snapshot().milestones.reachedIds).not.toContain(
      "metals-sold",
    );

    const funding = campaign.snapshot().fundingMillionDollars;
    sendWith("metals");
    expect(campaign.snapshot().milestones.reachedIds).toContain("metals-sold");
    expect(campaign.snapshot().fundingMillionDollars).toBe(funding + 20);
  });
});

describe("an older save with all nine of Act 1's Milestones reached", () => {
  it("loads straight into Act 2, with no notification that it has begun", () => {
    const document = JSON.parse(
      readFileSync(
        new URL("saves/version-40.moonbase", import.meta.url),
        "utf8",
      ),
    ) as { state: { reachedMilestoneIds: string[] } };
    document.state.reachedMilestoneIds = catalogue.milestones
      .filter(({ actId }) => actId === "act-1")
      .map(({ id }) => id);

    const loaded = loadCampaign(JSON.stringify(document));
    if (!loaded.ok) throw new Error(loaded.message);

    expect(loaded.campaign.snapshot().milestones).toMatchObject({
      currentActId: "act-2",
      currentId: "workshop-running",
    });
    expect(
      loaded.campaign.advance(60).filter(({ kind }) => kind === "act-started"),
    ).toEqual([]);
  });
});

describe("self-sufficiency in spare Components", () => {
  it("is judged as a life support stock's is, on what Plants made against what repairs used over a whole Lunation, and is reached with a notification", () => {
    const structures = [...HOME, "workshop"];
    const campaign = baseWith(structures, { metals: 400 });
    build(campaign, structures);
    moveIn(campaign);
    expect(campaign.snapshot().spareComponentSufficiency).toMatchObject({
      selfSufficient: false,
      windowComplete: false,
    });

    // Looked at as it comes: if it came before a whole window had passed, this
    // would see that.
    const isGained = (event: GameEvent) =>
      event.kind === "self-sufficiency-gained" &&
      event.stockId === catalogue.maintenance.spareComponentId;
    const events: GameEvent[] = [];
    for (let days = 0; days < 62 && !events.some(isGained); days++) {
      events.push(...campaign.advance(EARTH_DAY));
    }

    const judged = campaign.snapshot().spareComponentSufficiency;
    expect(judged.windowComplete).toBe(true);
    expect(judged.coveredShare).toBeGreaterThan(1);
    expect(judged.selfSufficient).toBe(true);
    expect(campaign.snapshot().milestones.reachedIds).toContain(
      "spare-components-self-sufficient",
    );
    const gained = events.find(isGained);
    expect(gained).toBeDefined();
    if (gained === undefined) return;
    expect(formatEvent(gained)).toBe(
      "The base is now self-sufficient in spare Components",
    );
  });

  it("doesn't count spare Components a Launch brought, or a base with no Plant making them", () => {
    const campaign = baseWith(HOME);
    build(campaign, HOME);
    moveIn(campaign);
    const spares = catalogue.launch.items.find(
      ({ brings }) =>
        brings.kind === "component" &&
        brings.componentId === catalogue.maintenance.spareComponentId,
    );
    const manifest = campaign.setLaunchManifest([
      { itemId: spares?.id ?? "", count: 50 },
    ]);
    if (!manifest.ok) throw new Error(manifest.message);
    const sent = campaign.sendLander();
    if (!sent.ok) throw new Error(sent.message);

    // As soon as there is a whole window to judge, with the Launch in it,
    // repairs having used some and no Plant having made any.
    const events: GameEvent[] = [];
    for (
      let days = 0;
      days < 45 &&
      !campaign.snapshot().spareComponentSufficiency.windowComplete;
      days++
    ) {
      events.push(...campaign.advance(EARTH_DAY));
    }

    expect(events.map(({ kind }) => kind)).toContain("lander-landed");
    const judged = campaign.snapshot().spareComponentSufficiency;
    expect(judged.windowComplete).toBe(true);
    expect(judged.coveredShare).toBe(0);
    expect(judged.selfSufficient).toBe(false);
  });
});

describe("the metals Export", () => {
  it("doesn't pay for a Launch by itself, and sells for less by the kilogram than wafers, so that Act 1 still has every reason to make them", () => {
    const priceOf = (resourceId: string) =>
      catalogue.exports.find((sold) => sold.resourceId === resourceId)
        ?.priceMillionDollarsPerKilogram ?? Infinity;
    const metals = priceOf("metals");

    expect(metals * catalogue.lander.returnMassKilograms).toBeLessThan(
      catalogue.launch.feeMillionDollars,
    );
    expect(metals).toBeLessThan(priceOf("wafers"));
  });

  it("runs into the Return Mass, where circuit boards run into their Plant's rate", () => {
    const { exports: sold } = exportEconomics(catalogue);
    const limitOf = (resourceId: string) =>
      sold.find((entry) => entry.resourceId === resourceId)?.limitedBy;
    expect(limitOf("circuit-boards")).toBe("plant");
    expect(limitOf("metals")).toBe("return-mass");

    // Three round trips a Lunation is all the Lander can carry away.
    const { toEarth, turnaround, toMoon } = catalogue.lander.roundTripEarthDays;
    const lunation =
      catalogue.lunation.daylightEarthDays + catalogue.lunation.nightEarthDays;
    const carried =
      (catalogue.lander.returnMassKilograms * lunation) /
      (toEarth + turnaround + toMoon);

    // A base with plenty of everything, on plenty of power, with one Plant
    // for circuit boards, and a large extraction plant for the metals.
    const structures = [
      "solar-array",
      "solar-array",
      "battery-bank",
      "large-extraction-plant",
      "circuit-board-plant",
    ];
    const campaign = baseWith(structures, {
      wafers: 400,
      metals: 400,
      regolith: 2000,
    });
    build(campaign, structures);
    const large = campaign
      .snapshot()
      .structures.find(
        ({ structureTypeId }) => structureTypeId === "large-extraction-plant",
      );
    const set = campaign.setPlantRecipe(large?.id ?? "", "metals-and-silicon");
    if (!set.ok) throw new Error(set.message);
    runToNightfall(campaign);

    const boardsAtStart = bulk(campaign, "circuit-boards");
    const metalsAtStart = bulk(campaign, "metals");
    runToNightfall(campaign);
    const boards = bulk(campaign, "circuit-boards") - boardsAtStart;
    const metals = bulk(campaign, "metals") - metalsAtStart;

    // Circuit boards fall short of what the Lander can carry away, whatever is
    // in stock: their Plant's rate is the limit.
    expect(boards).toBeLessThan(0.7 * carried);
    expect(boards).toBeGreaterThan(0.55 * carried);
    // Metals pile up far past it, net of what the circuit boards use.
    expect(metals).toBeGreaterThan(1.5 * carried);

    // And a load past the Return Mass is refused, whatever there is in stock.
    expect(
      campaign.loadExports([
        {
          resourceId: "metals",
          kilograms: catalogue.lander.returnMassKilograms + 1,
        },
      ]).ok,
    ).toBe(false);
  });
});

describe("a Plant that takes nothing in", () => {
  const iceLine = typeOf("cold-trap-ice-line");

  it("says what it gets from the ground, in the Guide and while it runs", () => {
    expect(describeStructure(iceLine)).toContain(
      "runs for water ice, making 0.4 kg of water ice an hour from the ground",
    );

    const campaign = baseWith(["solar-array", "cold-trap-ice-line"]);
    build(campaign, ["solar-array", "cold-trap-ice-line"]);
    campaign.advance(1);
    const running = campaign
      .snapshot()
      .structures.find(
        ({ structureTypeId }) => structureTypeId === "cold-trap-ice-line",
      );
    if (running === undefined) throw new Error("expected it built");
    expect(formatPlantRates(running)).toBe(
      "making 0.4 kg of water ice an hour from the ground",
    );
  });

  it("makes about what an Expedition brings in a Daylight, with no Robot going anywhere", () => {
    const campaign = baseWith(["solar-array", "cold-trap-ice-line"]);
    build(campaign, ["solar-array", "cold-trap-ice-line"]);
    runToNightfall(campaign);
    const ice = bulk(campaign, "water-ice");
    runToNightfall(campaign);

    const made = bulk(campaign, "water-ice") - ice;
    expect(Math.abs(made - catalogue.expeditions.kilograms)).toBeLessThan(40);
    expect(campaign.snapshot().expedition).toBeUndefined();
  });
});

describe("an array works", () => {
  it("makes what a solar array is built from, at the cost of silicon and metals, so that a base can build one with nothing from a Launch", () => {
    const structures = ["solar-array", "battery-bank", "array-works"];
    const campaign = baseWith(structures, { silicon: 50, metals: 50 });
    build(campaign, structures);
    const inStock = (componentId: string) =>
      campaign
        .snapshot()
        .stockpile.components.find((stock) => stock.componentId === componentId)
        ?.count ?? 0;
    const panels = inStock("solar-panel");
    const silicon = bulk(campaign, "silicon");

    campaign.advance(3 * EARTH_DAY);
    expect(inStock("solar-panel")).toBeGreaterThan(panels);
    expect(bulk(campaign, "silicon")).toBeLessThan(silicon);

    const works = campaign
      .snapshot()
      .structures.find(
        ({ structureTypeId }) => structureTypeId === "array-works",
      );
    const masts = inStock("array-mast");
    const set = campaign.setPlantRecipe(works?.id ?? "", "array-masts");
    if (!set.ok) throw new Error(set.message);
    campaign.advance(3 * EARTH_DAY);
    expect(inStock("array-mast")).toBeGreaterThan(masts);
  });
});

describe("a concentrator tower", () => {
  it("generates as much as ten solar arrays, with far less to wear in a Lunation than they have between them", () => {
    const tower = typeOf("concentrator-tower");
    const array = typeOf("solar-array");

    expect(tower.power.generationKilowatts).toBe(
      10 * array.power.generationKilowatts,
    );
    expect(tower.dustWearPercentPerHour).toBeLessThan(
      (10 * array.dustWearPercentPerHour) / 5,
    );

    const campaign = baseWith(["concentrator-tower"]);
    build(campaign, ["concentrator-tower"]);
    runToNightfall(campaign);
    for (
      let hours = 0;
      campaign.snapshot().lunation.part === "night";
      hours++
    ) {
      if (hours > 30 * 24) throw new Error("Daylight never came.");
      campaign.advance(60);
    }
    const [network] = campaign.snapshot().power.networks;
    expect(network?.generationKilowatts).toBeGreaterThan(50);
  });
});

describe("a thermal store", () => {
  it("stores as much as seven large battery banks and a half for less than a large battery bank draws to stay warm", () => {
    const store = typeOf("thermal-store");
    const large = typeOf("large-battery-bank");
    expect(store.power.storageKilowattHours).toBe(
      7.5 * large.power.storageKilowattHours,
    );
    expect(store.power.drawKilowatts).toBeLessThan(
      2 * large.power.drawKilowatts,
    );
  });

  it("keeps Plants running deep into the Night, where a battery bank alone would stop them", () => {
    const plain = ["solar-array", "solar-array", "battery-bank", "workshop"];
    const runningLateAtNight = (structures: readonly string[]) => {
      const campaign = baseWith(structures, { metals: 400 });
      build(campaign, structures);
      runToNightfall(campaign);
      for (let hours = 0; campaign.snapshot().lunation.part === "night";) {
        if (++hours > 30 * 24) throw new Error("Daylight never came.");
        campaign.advance(60);
      }
      runToNightfall(campaign);
      campaign.advance(150 * 60);
      return campaign
        .snapshot()
        .structures.find(
          ({ structureTypeId }) => structureTypeId === "workshop",
        )?.plant?.running;
    };

    expect(runningLateAtNight([...plain, "thermal-store"])).toBe(true);
    expect(runningLateAtNight(plain)).toBe(false);
  });
});
