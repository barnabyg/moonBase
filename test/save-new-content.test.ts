import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import { createCampaign, loadCampaign } from "../src/simulation";

// The data catalogue with a Component and a bulk resource no save has ever
// counted, in the middle of their lists, as a later Act's content might be.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { catalogue } = actual;
  const inTheMiddle = <T>(list: readonly T[], added: T): T[] => [
    ...list.slice(0, 2),
    added,
    ...list.slice(2),
  ];
  return {
    ...actual,
    catalogue: {
      ...catalogue,
      componentTypes: inTheMiddle(catalogue.componentTypes, {
        id: "new-widget",
        label: "New widget",
      }),
      bulkResources: inTheMiddle(catalogue.bulkResources, {
        id: "new-slag",
        label: "New slag",
      }),
    },
  };
});

const sample = (name: string) =>
  readFileSync(new URL(`./saves/${name}`, import.meta.url), "utf8");

function counts(text: string) {
  const result = loadCampaign(text);
  if (!result.ok) throw new Error(result.message);
  const { stockpile, bulkResources } = result.campaign.snapshot();
  return { components: stockpile.components, bulkResources };
}

interface SaveJson {
  state: {
    stockpile: { components: { componentId: string; count: number }[] };
    bulkResources: { resourceId: string; kilograms: number }[];
  };
}

function edited(edit: (document: SaveJson) => void): string {
  const document = JSON.parse(createCampaign({ seed: 1 }).save()) as SaveJson;
  edit(document);
  return JSON.stringify(document);
}

describe("a Component and a bulk resource added since a save was written", () => {
  it.each([
    "version-14.moonbase",
    "version-15.moonbase",
    "version-39.moonbase",
    "version-40.moonbase",
  ])("%s loads with none of them, in catalogue order", (name) => {
    const { components, bulkResources } = counts(sample(name));

    expect(components.map((stock) => stock.componentId)).toEqual(
      catalogue.componentTypes.map((type) => type.id),
    );
    expect(components[2]).toEqual({ componentId: "new-widget", count: 0 });
    expect(bulkResources.map((stock) => stock.resourceId)).toEqual(
      catalogue.bulkResources.map((resource) => resource.id),
    );
    expect(bulkResources[2]).toEqual({ resourceId: "new-slag", kilograms: 0 });
  });

  it("keeps the counts the save does have", () => {
    const saved = JSON.parse(sample("version-40.moonbase")) as SaveJson;

    const { components, bulkResources } = counts(sample("version-40.moonbase"));

    for (const stock of saved.state.stockpile.components) {
      expect(components).toContainEqual(stock);
    }
    for (const stock of saved.state.bulkResources) {
      expect(bulkResources).toContainEqual(stock);
    }
  });

  it("plays on, and saves the new counts with the others", () => {
    const result = loadCampaign(sample("version-40.moonbase"));
    if (!result.ok) throw new Error(result.message);

    result.campaign.advance(60);
    const saved = result.campaign.save();

    expect(counts(saved).components[2]).toEqual({
      componentId: "new-widget",
      count: 0,
    });
  });
});

describe("a count the data catalogue has nothing for", () => {
  it("is refused as damaged for a Component", () => {
    const text = edited((document) => {
      document.state.stockpile.components.push({
        componentId: "no-such-component",
        count: 1,
      });
    });

    expect(loadCampaign(text)).toMatchObject({
      ok: false,
      reason: "damaged",
      message: expect.stringContaining(
        "isn't a Component in the data catalogue",
      ) as string,
    });
  });

  it("is refused as damaged for a bulk resource", () => {
    const text = edited((document) => {
      document.state.bulkResources.push({
        resourceId: "no-such-resource",
        kilograms: 1,
      });
    });

    expect(loadCampaign(text)).toMatchObject({
      ok: false,
      reason: "damaged",
      message: expect.stringContaining(
        "isn't a bulk resource in the data catalogue",
      ) as string,
    });
  });
});

describe("a save missing a count", () => {
  it("reads it as none, even for something the save's version already had", () => {
    const text = edited((document) => {
      document.state.stockpile.components =
        document.state.stockpile.components.filter(
          (stock) => stock.componentId !== "spare-component",
        );
      document.state.bulkResources = document.state.bulkResources.filter(
        (stock) => stock.resourceId !== "regolith",
      );
    });

    const { components, bulkResources } = counts(text);

    expect(components).toContainEqual({
      componentId: "spare-component",
      count: 0,
    });
    expect(bulkResources).toContainEqual({
      resourceId: "regolith",
      kilograms: 0,
    });
  });

  it("still refuses a count that isn't a whole number, and a stock that isn't a list", () => {
    expect(
      loadCampaign(
        edited((document) => {
          const [first] = document.state.stockpile.components;
          if (first !== undefined) first.count = 1.5;
        }),
      ),
    ).toMatchObject({ ok: false, reason: "damaged" });
    expect(
      loadCampaign(
        edited((document) => {
          (document.state as Record<string, unknown>)["bulkResources"] = {};
        }),
      ),
    ).toMatchObject({ ok: false, reason: "damaged" });
  });
});
