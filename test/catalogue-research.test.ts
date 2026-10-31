import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";

/**
 * The data catalogue's research.ts: Research Tasks, the observing programme and
 * the Tech Tree as a whole. What each category's Designs bring is in the
 * catalogue-*-designs.test.ts files.
 */

describe("the data catalogue", () => {
  it("has a handful of Research Tasks with unique ids and labels, each lasting a positive, whole number of game-minutes and paying a whole amount of Science", () => {
    const { researchTasks } = catalogue;

    expect(researchTasks.length).toBeGreaterThanOrEqual(4);
    expect(new Set(researchTasks.map((task) => task.id)).size).toBe(
      researchTasks.length,
    );
    expect(new Set(researchTasks.map((task) => task.label)).size).toBe(
      researchTasks.length,
    );
    for (const task of researchTasks) {
      expect(task.lengthHours).toBeGreaterThan(0);
      expect(Number.isInteger(task.lengthHours * 60)).toBe(true);
      expect(Number.isSafeInteger(task.science)).toBe(true);
      expect(task.science).toBeGreaterThan(0);
    }
  });

  it("has an observing programme whose rounds last a whole number of game-minutes within a Night and pay a whole amount of Science, carried out by a telescope behind a Design", () => {
    const { observingProgramme, lunation } = catalogue;

    expect(observingProgramme.label).not.toBe("");
    expect(catalogue.researchTasks.map((task) => task.label)).not.toContain(
      observingProgramme.label,
    );
    expect(observingProgramme.lengthHours).toBeGreaterThan(0);
    expect(Number.isInteger(observingProgramme.lengthHours * 60)).toBe(true);
    // At least one round fits in a Night, so a telescope earns every Lunation.
    expect(observingProgramme.lengthHours).toBeLessThanOrEqual(
      lunation.nightEarthDays * 24,
    );
    expect(Number.isSafeInteger(observingProgramme.science)).toBe(true);
    expect(observingProgramme.science).toBeGreaterThan(0);
    const telescopes = catalogue.structureTypes.filter(
      (type) => type.telescope === true,
    );
    expect(telescopes.length).toBeGreaterThan(0);
    for (const type of telescopes) {
      // It observes only with power, which it draws only at Night.
      expect(type.power.nightDrawKilowatts).toBeGreaterThan(0);
      expect(type.power.drawKilowatts).toBe(0);
      expect(
        catalogue.designs.find((design) => design.id === type.designId)
          ?.starting,
      ).toBe(false);
    }
  });

  it("has some Research Tasks that take hours and some that take Earth Days, the longer ones paying more", () => {
    const lengths = catalogue.researchTasks.map((task) => task.lengthHours);

    expect(lengths.some((hours) => hours < 24)).toBe(true);
    expect(lengths.some((hours) => hours >= 3 * 24)).toBe(true);
    const byLength = [...catalogue.researchTasks].sort(
      (a, b) => a.lengthHours - b.lengthHours,
    );
    for (const [index, task] of byLength.entries()) {
      const shorter = byLength[index - 1];
      if (shorter !== undefined && shorter.lengthHours < task.lengthHours) {
        expect(task.science).toBeGreaterThan(shorter.science);
      }
    }
  });

  it("has Research Tasks that, run back to back, take at least eight Lunations, so research carries on long after the base is self-sufficient", () => {
    const { daylightEarthDays, nightEarthDays } = catalogue.lunation;
    const lunationHours = (daylightEarthDays + nightEarthDays) * 24;
    const hours = catalogue.researchTasks.reduce(
      (sum, task) => sum + task.lengthHours,
      0,
    );

    expect(hours).toBeGreaterThanOrEqual(8 * lunationHours);
    expect(
      catalogue.researchTasks.some((task) => task.lengthHours >= lunationHours),
    ).toBe(true);
  });

  it("has Designs with unique ids and labels, each with a description, one of the six categories, a whole Science cost and prerequisites the Tech Tree has", () => {
    const { designs } = catalogue;
    const ids = new Set(designs.map((design) => design.id));

    expect(ids.size).toBe(designs.length);
    expect(new Set(designs.map((design) => design.label)).size).toBe(
      designs.length,
    );
    for (const design of designs) {
      expect(design.description).not.toBe("");
      expect([
        "power",
        "construction",
        "protection",
        "life-support",
        "industry",
        "mobility",
      ]).toContain(design.category);
      expect(Number.isSafeInteger(design.scienceCost)).toBe(true);
      expect(design.scienceCost).toBeGreaterThanOrEqual(0);
      expect(new Set(design.prerequisiteDesignIds).size).toBe(
        design.prerequisiteDesignIds.length,
      );
      for (const id of design.prerequisiteDesignIds) {
        expect(ids).toContain(id);
        expect(id).not.toBe(design.id);
      }
    }
  });

  it("starts with some Designs unlocked, which need nothing first and cost nothing, and has a few more that cost Science to unlock", () => {
    const starting = catalogue.designs.filter((design) => design.starting);
    const others = catalogue.designs.filter((design) => !design.starting);

    expect(starting.length).toBeGreaterThan(0);
    for (const design of starting) {
      expect(design.prerequisiteDesignIds).toEqual([]);
      expect(design.scienceCost).toBe(0);
    }
    expect(others.length).toBeGreaterThanOrEqual(3);
    for (const design of others) expect(design.scienceCost).toBeGreaterThan(0);
  });

  it("puts every Structure type and Launch item in exactly one Design the Tech Tree has", () => {
    const ids = new Set(catalogue.designs.map((design) => design.id));

    for (const { designId } of [
      ...catalogue.structureTypes,
      ...catalogue.launch.items,
    ]) {
      expect(ids).toContain(designId);
    }
  });

  it("has at least one Structure type, with Launch items, behind a Design that isn't a starting one", () => {
    const locked = (designId: string) =>
      catalogue.designs.find((design) => design.id === designId)?.starting ===
      false;

    expect(catalogue.structureTypes.some((type) => locked(type.designId))).toBe(
      true,
    );
    expect(catalogue.launch.items.some((item) => locked(item.designId))).toBe(
      true,
    );
  });

  it("has no cycles in the Tech Tree, and every Design can be reached from the starting Designs", () => {
    // Unlocks in turn every Design whose prerequisites are all unlocked.
    // A Design on a cycle, or after one, is never reached.
    const reached = new Set(
      catalogue.designs
        .filter((design) => design.starting)
        .map((design) => design.id),
    );
    for (let grew = true; grew;) {
      grew = false;
      for (const design of catalogue.designs) {
        if (
          !reached.has(design.id) &&
          design.prerequisiteDesignIds.every((id) => reached.has(id))
        ) {
          reached.add(design.id);
          grew = true;
        }
      }
    }

    expect([...reached].sort()).toEqual(
      catalogue.designs.map((design) => design.id).sort(),
    );
  });

  it("gates some Research Tasks behind a Design the Tech Tree has, so the tree and the research list grow together", () => {
    const ids = new Set(catalogue.designs.map((design) => design.id));
    const gated = catalogue.researchTasks.filter(
      (task) => task.requiresDesignId !== undefined,
    );

    expect(gated.length).toBeGreaterThan(0);
    for (const task of gated) expect(ids).toContain(task.requiresDesignId);
  });

  it("has Research Tasks that pay at least as much Science as every Design beyond the starting ones costs", () => {
    const paid = catalogue.researchTasks.reduce(
      (sum, task) => sum + task.science,
      0,
    );
    const cost = catalogue.designs
      .filter((design) => !design.starting)
      .reduce((sum, design) => sum + design.scienceCost, 0);

    expect(paid).toBeGreaterThanOrEqual(cost);
  });

  it("lets a player unlock every Design and complete every Research Task, completing all the Research Tasks on offer, then unlocking the cheapest Design they can, in turn", () => {
    // A Research Task gated by a Design can only pay for that Design's
    // successors, so the total alone isn't enough: this plays the tree.
    const unlocked = new Set(
      catalogue.designs
        .filter((design) => design.starting)
        .map((design) => design.id),
    );
    const completed = new Set<string>();
    let science = 0;
    for (let progress = true; progress;) {
      progress = false;
      for (const task of catalogue.researchTasks) {
        const offered =
          task.requiresDesignId === undefined ||
          unlocked.has(task.requiresDesignId);
        if (offered && !completed.has(task.id)) {
          completed.add(task.id);
          science += task.science;
          progress = true;
        }
      }
      const next = catalogue.designs
        .filter(
          (design) =>
            !unlocked.has(design.id) &&
            design.scienceCost <= science &&
            design.prerequisiteDesignIds.every((id) => unlocked.has(id)),
        )
        .sort((a, b) => a.scienceCost - b.scienceCost)[0];
      if (next !== undefined) {
        unlocked.add(next.id);
        science -= next.scienceCost;
        progress = true;
      }
    }

    expect(unlocked.size).toBe(catalogue.designs.length);
    expect(completed.size).toBe(catalogue.researchTasks.length);
  });

  it("has enough Designs in the Tech Tree for the Acts so far, and no more than 50", () => {
    expect(catalogue.designs.length).toBeGreaterThanOrEqual(23);
    expect(catalogue.designs.length).toBeLessThanOrEqual(50);
  });

  it("has every Design beyond the starting ones permit at least one Structure type or Launch item, so that unlocking one always gives the player something", () => {
    const permitted = new Set(
      [...catalogue.structureTypes, ...catalogue.launch.items].map(
        (entry) => entry.designId,
      ),
    );
    const empty = catalogue.designs
      .filter((design) => !design.starting && !permitted.has(design.id))
      .map((design) => design.id);

    expect(empty).toEqual([]);
  });

  it("represents all six categories in the Tech Tree, each with at least one Design beyond the starting ones", () => {
    for (const { id } of catalogue.designCategories) {
      expect(
        catalogue.designs.some(
          (design) => design.category === id && !design.starting,
        ),
      ).toBe(true);
    }
    expect(catalogue.designCategories).toHaveLength(6);
  });
});
