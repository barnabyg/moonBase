import { describe, expect, it } from "vitest";
import {
  createCampaign,
  type ConstructionSnapshot,
  type DismantlingSnapshot,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import {
  popUpFor,
  structureDetails,
  type StructureDetails,
} from "../src/ui/structure-details";
import { DEFAULT_SEED } from "./scenario";

const start = createCampaign({ seed: DEFAULT_SEED }).snapshot();

/** The Campaign as it starts, with what is given in place of what it has. */
function snapshotWith(changes: Partial<Snapshot>): Snapshot {
  return { ...start, ...changes };
}

/** A commissioned Structure in working order, unless told otherwise. */
function structure(
  structureTypeId: string,
  changes: Partial<StructureSnapshot> = {},
): StructureSnapshot {
  return {
    id: "s1",
    structureTypeId,
    position: { x: 20, y: 20 },
    powered: true,
    lit: false,
    savingPower: false,
    storedKilowattHours: 0,
    shielded: false,
    waterWalled: false,
    buried: false,
    conditionPercent: 100,
    performance: 1,
    lightRadiusMetres: 0,
    dustCoatingPercent: 0,
    plant: undefined,
    observing: false,
    recipeId: undefined,
    switchedOff: false,
    ...changes,
  };
}

function construction(
  structureTypeId: string,
  changes: Partial<ConstructionSnapshot> = {},
): ConstructionSnapshot {
  return {
    id: "s1",
    structureTypeId,
    position: { x: 20, y: 20 },
    stage: "site-preparation",
    stageProgress: 0,
    componentsTaken: false,
    failedCommissionings: 0,
    unusedComponents: [],
    waiting: undefined,
    ...changes,
  };
}

function dismantling(
  structureTypeId: string,
  changes: Partial<DismantlingSnapshot> = {},
): DismantlingSnapshot {
  return {
    id: "s1",
    structureTypeId,
    position: { x: 20, y: 20 },
    stage: "taking-apart",
    stageProgress: 0,
    recovered: [],
    collected: false,
    ...changes,
  };
}

/** Each line of the pop-up, as it reads: "Label: value · note". */
function lines(details: StructureDetails | undefined): string[] {
  if (details === undefined) throw new Error("No pop-up for the Structure.");
  return details.lines.map(
    ({ label, stat }) =>
      `${label}: ${stat.value}${stat.note === undefined ? "" : ` · ${stat.note}`}`,
  );
}

function line(
  details: StructureDetails | undefined,
  label: string,
): string | undefined {
  return lines(details).find((text) => text.startsWith(`${label}: `));
}

describe("the pop-up for a Structure clicked on the map", () => {
  it("names it and says what it does, as the Guide does", () => {
    const details = structureDetails(
      snapshotWith({ structures: [structure("solar-array")] }),
      "s1",
    );
    expect(details?.title).toBe("Solar array");
    expect(details?.description).toBe(
      "Solar panels on a mast, which generate power in Daylight and nothing at Night.",
    );
  });

  it("has nothing to show once the Structure is gone, such as after it is dismantled", () => {
    expect(
      structureDetails(
        snapshotWith({ structures: [structure("solar-array")] }),
        "s2",
      ),
    ).toBeUndefined();
  });

  it("shows a Construction's stage and progress, and what it waits for", () => {
    const details = structureDetails(
      snapshotWith({
        constructions: [
          construction("solar-array", {
            stage: "component-delivery",
            stageProgress: 0.42,
            waiting: {
              reason: "missing-components",
              missing: [{ componentId: "solar-panel", count: 2 }],
            },
          }),
        ],
      }),
      "s1",
    );
    expect(line(details, "Stage")).toBe(
      "Stage: Component delivery: 42% · Waiting: 2 solar panels aren't in the base's stock",
    );
    expect(details?.lines[0]?.fraction).toBeCloseTo(0.42);
    expect(line(details, "Condition")).toBe("Condition: –");
    expect(details?.commissioned).toBeUndefined();
  });

  it("keeps the same lines in the same order from Construction to Commissioning and dismantling, so that nothing jumps about", () => {
    const labels = (snapshot: Snapshot) =>
      structureDetails(snapshot, "s1")?.lines.map(({ label }) => label);
    const planned = labels(
      snapshotWith({ constructions: [construction("battery-bank")] }),
    );
    expect(planned).toEqual([
      "Stage",
      "State",
      "Condition",
      "Rated",
      "Network",
      "Battery",
    ]);
    expect(
      labels(snapshotWith({ structures: [structure("battery-bank")] })),
    ).toEqual(planned);
    expect(
      labels(snapshotWith({ dismantlings: [dismantling("battery-bank")] })),
    ).toEqual(planned);
  });

  it("shows a commissioned Structure's Condition, Maintenance, and what it makes and draws on its network", () => {
    const details = structureDetails(
      snapshotWith({
        structures: [
          structure("solar-array", {
            conditionPercent: 37.4,
            performance: 0.8,
            dustCoatingPercent: 12.3,
          }),
        ],
        power: {
          networks: [
            {
              structureIds: ["s1"],
              generationKilowatts: 8,
              consumptionKilowatts: 1.25,
              storedKilowattHours: 0,
              storageCapacityKilowattHours: 0,
              powered: true,
            },
          ],
        },
        maintenance: [
          {
            target: {
              kind: "structure",
              structureId: "s1",
              structureTypeId: "solar-array",
            },
            spareComponents: 2,
            cleaning: false,
            underWay: true,
            step: "restoring-condition",
            stageProgress: 0.5,
            waiting: undefined,
          },
        ],
      }),
      "s1",
    );
    expect(lines(details)).toEqual([
      "Stage: commissioned",
      "State: commissioned",
      "Condition: 37% · undergoing Maintenance, working at 80%",
      "Rated: generates 10 kW in Daylight and draws 0.05 kW all the time",
      "Network: 8.00 kW made · 1.25 kW used",
      "Dust coating: 12%",
    ]);
    expect(details?.lines[2]?.fraction).toBeCloseTo(0.374);
  });

  it("warns of a Broken Structure", () => {
    const details = structureDetails(
      snapshotWith({
        structures: [structure("solar-array", { conditionPercent: 0 })],
      }),
      "s1",
    );
    expect(line(details, "Condition")).toBe("Condition: 0% · Broken");
    expect(
      details?.lines.find(({ label }) => label === "Condition")?.warning,
    ).toBe(true);
  });

  it("shows how much a battery bank holds, as its Condition allows", () => {
    const details = structureDetails(
      snapshotWith({
        structures: [
          structure("battery-bank", {
            storedKilowattHours: 75,
            performance: 0.75,
          }),
        ],
      }),
      "s1",
    );
    expect(line(details, "Battery")).toBe("Battery: 75.0 / 150.0 kWh");
    expect(
      details?.lines.find(({ label }) => label === "Battery")?.fraction,
    ).toBeCloseTo(0.5);
  });

  it("shows a Plant's recipe, its batch, and that it is switched off", () => {
    const details = structureDetails(
      snapshotWith({
        structures: [
          structure("extraction-plant", {
            recipeId: "metals-and-silicon",
            switchedOff: true,
            powered: false,
            plant: {
              running: false,
              stoppedFor: { reason: "switched-off" },
              batch: undefined,
            },
          }),
        ],
      }),
      "s1",
    );
    expect(line(details, "State")).toBe("State: switched off");
    expect(line(details, "Recipe")).toBe("Recipe: Metals and silicon");
    expect(line(details, "Output")).toBe(
      "Output: nothing while it stands idle",
    );
    expect(line(details, "Rated")).toBe("Rated: draws 4 kW while it runs");
    expect(details?.commissioned?.id).toBe("s1");
  });

  it("shows who lives in a Habitat, its shielding and the Radiation Dose rate inside", () => {
    const details = structureDetails(
      snapshotWith({
        structures: [structure("habitat", { shielded: true })],
        missionDirector: {
          residence: "habitat",
          habitatId: "s1",
          movedInAtMinute: 0,
        },
      }),
      "s1",
    );
    expect(line(details, "Residents")).toBe("Residents: the Mission Director");
    expect(line(details, "Shielding")).toBe("Shielding: Regolith shielding");
    expect(line(details, "Dose rate")).toBe("Dose rate: 1.50 mSv a day");
  });

  it("shows the Radiation Dose rate raised by a Solar Particle Event under way", () => {
    const details = structureDetails(
      snapshotWith({
        structures: [structure("habitat")],
        solarParticleEvent: {
          state: "under-way",
          startsAtMinute: 0,
          endsAtMinute: 600,
          doseRateMultiplier: 10,
        },
      }),
      "s1",
    );
    expect(line(details, "Residents")).toBe("Residents: nobody");
    expect(line(details, "Shielding")).toBe("Shielding: none");
    expect(line(details, "Dose rate")).toBe(
      "Dose rate: 300.00 mSv a day · 10× during the Solar Particle Event",
    );
  });

  it("shows a Structure to be dismantled, then the dismantling's stage", () => {
    const toBe = structureDetails(
      snapshotWith({
        structures: [structure("solar-array")],
        dismantlings: [dismantling("solar-array")],
      }),
      "s1",
    );
    expect(line(toBe, "Stage")).toBe("Stage: to be dismantled");
    expect(toBe?.toBeDismantled).toBe(true);
    const under = structureDetails(
      snapshotWith({
        dismantlings: [dismantling("solar-array", { stageProgress: 0.25 })],
      }),
      "s1",
    );
    expect(line(under, "Stage")).toBe("Stage: Taking apart: 25%");
    expect(line(under, "State")).toBe("State: being dismantled");
    expect(under?.commissioned).toBeUndefined();
  });
});

describe("the pop-up for a Habitat under Regolith shielding and a water wall", () => {
  const site = { x: 30, y: -10 };
  const covered = snapshotWith({
    structures: [
      structure("habitat", { id: "habitat", position: site, shielded: true }),
      structure("regolith-shielding", { id: "shielding", position: site }),
    ],
    constructions: [construction("water-wall", { id: "wall", position: site })],
  });

  it("opens for the Habitat when its cover is clicked, which hides it", () => {
    expect(popUpFor(covered, "shielding")).toBe("habitat");
    expect(popUpFor(covered, "wall")).toBe("habitat");
    expect(popUpFor(covered, "habitat")).toBe("habitat");
  });

  it("opens for anything else that is clicked", () => {
    const array = snapshotWith({
      structures: [structure("solar-array", { id: "array" })],
    });
    expect(popUpFor(array, "array")).toBe("array");
  });

  it("offers to switch to each Structure over the Habitat, and from each back to it", () => {
    expect(structureDetails(covered, "habitat")?.switchTo).toEqual([
      { structureId: "shielding", title: "Regolith shielding" },
      { structureId: "wall", title: "Water wall" },
    ]);
    expect(structureDetails(covered, "shielding")?.switchTo).toEqual([
      { structureId: "habitat", title: "Inflatable Habitat" },
    ]);
  });

  it("offers nothing to switch to for a Structure standing alone", () => {
    expect(
      structureDetails(
        snapshotWith({ structures: [structure("solar-array")] }),
        "s1",
      )?.switchTo,
    ).toEqual([]);
  });
});

describe("the pop-up for a telescope", () => {
  const programme = {
    progress: 0.42,
    telescopes: 2,
    observing: 2,
    minutesLeft: 120,
    stoppedFor: undefined,
  };

  it("shows it observing, and how the observing programme it shares is going", () => {
    const details = structureDetails(
      snapshotWith({
        structures: [structure("telescope", { observing: true })],
        observingProgramme: programme,
      }),
      "s1",
    );
    expect(line(details, "Rated")).toBe(
      "Rated: draws 0.25 kW at Night while it observes, and nothing in Daylight",
    );
    expect(line(details, "Observing")).toBe("Observing: observing");
    expect(line(details, "Programme")).toBe(
      "Programme: Night-sky survey · 2 telescopes observing, 2h left",
    );
    expect(
      details?.lines.find(({ label }) => label === "Programme")?.fraction,
    ).toBeCloseTo(0.42);
  });

  it("says when it isn't observing, to save power", () => {
    const details = structureDetails(
      snapshotWith({
        structures: [structure("telescope", { savingPower: true })],
        observingProgramme: {
          ...programme,
          observing: 0,
          minutesLeft: undefined,
        },
      }),
      "s1",
    );
    expect(line(details, "Observing")).toBe(
      "Observing: not observing, to save power",
    );
  });

  it("keeps the same lines while it is built as once it observes", () => {
    const labels = (snapshot: Snapshot) =>
      structureDetails(snapshot, "s1")?.lines.map(({ label }) => label);
    const planned = labels(
      snapshotWith({ constructions: [construction("telescope")] }),
    );
    expect(planned).toEqual([
      "Stage",
      "State",
      "Condition",
      "Rated",
      "Network",
      "Observing",
      "Programme",
    ]);
    expect(
      labels(
        snapshotWith({
          structures: [structure("telescope", { observing: true })],
          observingProgramme: programme,
        }),
      ),
    ).toEqual(planned);
  });
});

describe("the pop-up for a parking area", () => {
  const area = { x: 40, y: 40 };

  it("shows how many of its bays have a Machine or the Rover in them", () => {
    const [first, second] = start.machines;
    if (first === undefined || second === undefined) {
      throw new Error("The Campaign starts with two Machines.");
    }
    const details = structureDetails(
      snapshotWith({
        structures: [structure("parking-area", { position: area })],
        machines: [
          { ...first, position: { x: area.x - 2.25, y: area.y + 2.25 } },
          { ...second, position: { x: area.x + 2.4, y: area.y - 2.1 } },
        ],
        rovers: start.rovers.map((rover) => ({
          ...rover,
          position: { x: area.x + 30, y: area.y },
        })),
      }),
      "s1",
    );
    expect(line(details, "Bays")).toBe("Bays: 2 of 4 taken");
    expect(
      details?.lines.find(({ label }) => label === "Bays")?.fraction,
    ).toBeCloseTo(0.5);
  });

  it("shows no bays taken until it is commissioned", () => {
    expect(
      line(
        structureDetails(
          snapshotWith({
            constructions: [construction("parking-area", { position: area })],
          }),
          "s1",
        ),
        "Bays",
      ),
    ).toBe("Bays: –");
  });
});
