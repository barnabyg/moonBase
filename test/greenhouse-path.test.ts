import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  reserveKilograms,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
} from "../src/simulation";
import { describeStructureEntry } from "../src/ui/structure-state";
import { structureDetails } from "../src/ui/structure-details";
import { scenarioOf, scenario, type Scenario } from "./scenario";
import { changed, withFunding, withScience } from "./worn";

// The whole path, from a locked Design to earning Science and to losing a round,
// at the real prices and Science costs. The Habitat needs no power and keeps the
// Mission Director safe, as a round trip takes longer than the starting stock keeps
// one powered.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { safeHabitat } = await import("./safe-habitat");
  return {
    ...actual,
    catalogue: safeHabitat(actual.catalogue, [
      "power",
      "radiation",
      "solar-particle-events",
    ]),
  };
});

const habitatSite: GroundPosition = { x: 25, y: -20 };
const solarSite: GroundPosition = { x: 20, y: 12 };
const batterySite: GroundPosition = { x: 32, y: 28 };
const greenhouseSite: GroundPosition = { x: 36, y: 12 };

const componentsOf = (structureTypeId: string) =>
  catalogue.structureTypes.find(({ id }) => id === structureTypeId)
    ?.components ?? [];

/** Every Design on the way to the Greenhouse's. */
function designsTo(designId: string): string[] {
  const design = catalogue.designs.find(({ id }) => id === designId);
  if (design === undefined || design.starting) return [];
  return [
    ...new Set([...design.prerequisiteDesignIds.flatMap(designsTo), designId]),
  ];
}

function runUntilBuilt(game: Scenario): void {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 5 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
}

function greenhouseOf(state: Snapshot) {
  const house = state.structures.find(
    ({ structureTypeId }) => structureTypeId === "greenhouse",
  );
  if (house === undefined) throw new Error("expected a Greenhouse");
  return house;
}

function water(state: Snapshot): number {
  return (
    state.lifeSupport.find(({ stockId }) => stockId === "water")?.kilograms ?? 0
  );
}

const roundsIn = (events: readonly GameEvent[], kind: GameEvent["kind"]) =>
  events.filter((event) => event.kind === kind);

describe("from unlocking Lunar greenhouses to earning Science and losing a round", () => {
  it("is refused until the Design is unlocked, ships its Components, is built and commissioned, earns Science by rounds, loses one for want of water and starts again by itself", () => {
    const locked = scenario();
    expect(
      locked.campaign.planConstruction({
        structureTypeId: "greenhouse",
        position: greenhouseSite,
      }),
    ).toMatchObject({ ok: false, reason: "design-locked" });

    // What the Research Tasks would have earned, and what Exports would have.
    const path = designsTo("lunar-greenhouses");
    const science = path.reduce(
      (total, id) =>
        total +
        (catalogue.designs.find((design) => design.id === id)?.scienceCost ??
          0),
      0,
    );
    const game = scenarioOf(
      withFunding(withScience(locked.campaign, science), 2000),
    );
    expect(game.campaign.unlockDesign("lunar-greenhouses").ok).toBe(false);
    for (const id of path) expect(game.campaign.unlockDesign(id).ok).toBe(true);
    expect(game.state.science).toBe(0);

    // Then the Mission Director moves in, so that the Lander can fly.
    game.plan("solar-array", solarSite).plan("habitat", habitatSite);
    runUntilBuilt(game);
    const home = game.state.structures.find(
      ({ structureTypeId }) => structureTypeId === "habitat",
    );
    const moved = game.campaign.moveMissionDirectorIn(home?.id ?? "");
    if (!moved.ok) throw new Error(moved.message);

    const set = game.campaign.setLaunchManifest(
      componentsOf("greenhouse").map(({ componentId, count }) => ({
        itemId: componentId,
        count,
      })),
    );
    if (!set.ok) throw new Error(set.message);
    const sent = game.campaign.sendLander();
    if (!sent.ok) throw new Error(sent.message);
    for (let skips = 0; game.state.lander.state !== "landed-free"; skips++) {
      if (skips > 100) throw new Error("The Lander never came back.");
      game.campaign.advanceToNextEvent();
    }

    game.plan("battery-bank", batterySite).plan("greenhouse", greenhouseSite);
    runUntilBuilt(game);
    const id = greenhouseOf(game.state).id;
    expect(
      game.state.cables.some(
        ({ toStructureId, complete }) => complete && toStructureId === id,
      ),
    ).toBe(true);

    // The next Daylight, on plenty of water to earn on: the rest of it is enough for
    // all that follows, and a single battery bank can't light it through a Night.
    const filled = (from: Scenario) =>
      scenarioOf(
        changed(from.campaign, (saved) => {
          for (const stock of saved.lifeSupport) stock.kilograms = 390;
        }),
      );
    const waiting = filled(game);
    waiting.advance({
      minutes:
        waiting.state.lunation.part === "daylight"
          ? waiting.state.lunation.minutesRemaining +
            catalogue.lunation.nightEarthDays * 24 * 60
          : waiting.state.lunation.minutesRemaining,
    });
    const wet = filled(waiting);
    wet.advance({ minutes: 1 });
    expect(wet.state.lunation.part).toBe("daylight");

    const growing = catalogue.structureTypes.find(
      ({ id: type }) => type === "greenhouse",
    )?.growing;
    if (growing === undefined) throw new Error("expected rounds of growing");

    // The Base panel and the pop-up say what it is doing.
    const entry = describeStructureEntry(
      wet.state,
      greenhouseOf(wet.state),
      false,
    );
    expect(entry.value).toMatch(/^growing, .* left of this round$/);
    expect(entry.more).toBe(
      `using 1 kg of water an hour, for ${growing.science} Science a round`,
    );
    const details = structureDetails(wet.state, id);
    expect(details?.commissioned).toBeDefined();
    expect(
      details?.lines.find(({ label }) => label === "Round")?.stat.note,
    ).toContain("a shortage of water or power");

    // It earns Science by a round.
    const scienceBefore = wet.state.science;
    const earned = wet.campaign.advance(growing.lengthHours * 60);
    expect(roundsIn(earned, "greenhouse-round-completed")).toHaveLength(1);
    expect(wet.state.science).toBe(scienceBefore + growing.science);

    // A shortage of water loses the round it has grown so far, and no more.
    const reserve = reserveKilograms("water");
    const dry = scenarioOf(
      changed(wet.campaign, (saved) => {
        for (const stock of saved.lifeSupport) {
          if (stock.stockId === "water") stock.kilograms = reserve + 3;
        }
      }),
    );
    const scienceAtDry = dry.state.science;
    const dried = dry.campaign.advance(12 * 60);
    expect(roundsIn(dried, "greenhouse-round-lost")).toHaveLength(1);
    expect(greenhouseOf(dry.state).growingMinutes).toBe(0);
    expect(dry.state.science).toBe(scienceAtDry);
    expect(dry.state.ended).toBeUndefined();
    expect(
      describeStructureEntry(dry.state, greenhouseOf(dry.state), false).value,
    ).toMatch(/^waiting for Water: .* reserve/);

    // And it starts a new one by itself, once it is supplied.
    const supplied = scenarioOf(
      changed(dry.campaign, (saved) => {
        for (const stock of saved.lifeSupport) {
          if (stock.stockId === "water") stock.kilograms = 390;
        }
      }),
    );
    const scienceAgain = supplied.state.science;
    supplied.advance({ hours: growing.lengthHours });
    expect(greenhouseOf(supplied.state).plant).toMatchObject({ running: true });
    expect(supplied.state.science).toBe(scienceAgain + growing.science);
    expect(water(supplied.state)).toBeGreaterThan(reserve);
  });
});
