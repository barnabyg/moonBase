import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";

/** The data catalogue's milestones.ts: the Acts and the Milestones. */

describe("the Acts", () => {
  it("are listed in order, each with a unique id and label and a one-line sentence saying what it asks", () => {
    const { acts } = catalogue;

    expect(acts[0]?.label).toBe("Act 1");
    expect(new Set(acts.map((act) => act.id)).size).toBe(acts.length);
    expect(new Set(acts.map((act) => act.label)).size).toBe(acts.length);
    for (const { label, asks } of acts) {
      expect(label.trim()).not.toBe("");
      expect(asks.trim()).toMatch(/^[A-Z].*\.$/);
      expect(asks).not.toContain("\n");
    }
  });

  it("start with today's nine Milestones in Act 1", () => {
    const firstAct = catalogue.acts[0]?.id;

    expect(
      catalogue.milestones
        .filter((milestone) => milestone.actId === firstAct)
        .map((milestone) => milestone.id),
    ).toEqual([
      "power-storage",
      "moved-in",
      "lander-departs",
      "habitat-shielded",
      "landing-pad",
      "first-research-task",
      "first-export",
      "oxygen-self-sufficient",
      "water-self-sufficient",
    ]);
  });

  it("each hold at least one Milestone, with every Milestone in an Act and the Milestones in the Acts' order, so that the current Act only ever moves on", () => {
    const actIdsInMilestoneOrder = catalogue.milestones
      .map((milestone) => milestone.actId)
      .filter((actId, index, actIds) => actId !== actIds[index - 1]);

    expect(actIdsInMilestoneOrder).toEqual(catalogue.acts.map((act) => act.id));
  });

  it("carry no reward, only words", () => {
    for (const act of catalogue.acts) {
      expect(Object.keys(act).sort()).toEqual(["asks", "id", "label"]);
    }
  });
});

describe("the Milestones", () => {
  it("are listed in order, each with a unique id and label and a one-line hint", () => {
    const { milestones } = catalogue;

    expect(milestones.map((milestone) => milestone.id)).toEqual([
      "power-storage",
      "moved-in",
      "lander-departs",
      "habitat-shielded",
      "landing-pad",
      "first-research-task",
      "first-export",
      "oxygen-self-sufficient",
      "water-self-sufficient",
      "workshop-running",
      "spare-components-self-sufficient",
      "metals-sold",
      "first-propellant",
      "propellant-sold",
      "return-mass-tripled",
      "moved-into-buried-habitat",
      "precision-optics-sold",
    ]);
    expect(new Set(milestones.map((milestone) => milestone.id)).size).toBe(
      milestones.length,
    );
    expect(new Set(milestones.map((milestone) => milestone.label)).size).toBe(
      milestones.length,
    );
    for (const { label, hint } of milestones) {
      expect(label.trim()).not.toBe("");
      expect(hint.trim()).not.toBe("");
      expect(hint).not.toContain("\n");
    }
  });

  it("judge self-sufficiency only in a life support stock the data catalogue has", () => {
    for (const { condition } of catalogue.milestones) {
      if (condition.kind !== "self-sufficient") continue;
      expect(catalogue.lifeSupportStocks.map((stock) => stock.id)).toContain(
        condition.stockId,
      );
    }
  });

  it("carry no reward, only a condition", () => {
    for (const milestone of catalogue.milestones) {
      expect(Object.keys(milestone).sort()).toEqual([
        "actId",
        "condition",
        "hint",
        "id",
        "label",
      ]);
    }
  });

  it("name the deadline of power storage, and point at the battery bank in the starting stock", () => {
    const [powerStorage] = catalogue.milestones;
    const bank = catalogue.structureTypes.find(
      (type) => type.id === "battery-bank",
    );

    expect(powerStorage?.label).toMatch(/before the first Night/);
    expect(powerStorage?.hint).toMatch(/battery bank/);
    expect(powerStorage?.hint).toMatch(/starting stock/);
    for (const need of bank?.components ?? []) {
      expect(
        catalogue.startingStock.find(
          (stock) => stock.componentId === need.componentId,
        )?.count,
      ).toBeGreaterThanOrEqual(need.count);
    }
  });
});
