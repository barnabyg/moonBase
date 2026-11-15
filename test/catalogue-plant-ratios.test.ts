import { describe, expect, it } from "vitest";
import { catalogue, resourceOutputs } from "../src/catalogue";

/**
 * Plants that feed one another fit together: at full performance a producer
 * makes a whole multiple of what its consumer takes of each input, so a base
 * built in the right numbers piles up no silicon or wafers. Metals are an
 * Export, so a surplus of them is allowed, but their ratio is whole too.
 */

const recipeOf = (structureTypeId: string, recipeId: string) => {
  const recipe = catalogue.structureTypes
    .find((type) => type.id === structureTypeId)
    ?.recipes?.find((candidate) => candidate.id === recipeId);
  if (recipe === undefined) {
    throw new Error(`No recipe ${recipeId} for ${structureTypeId}`);
  }
  return recipe;
};

const bulkRate = (
  flows: readonly {
    resource: { kind: string; resourceId?: string };
    kilogramsPerHour: number;
  }[],
  resourceId: string,
) =>
  flows.find(
    (flow) =>
      flow.resource.kind === "bulk-resource" &&
      flow.resource.resourceId === resourceId,
  )?.kilogramsPerHour ?? Number.NaN;

const pairs = [
  {
    producer: ["extraction-plant", "metals-and-silicon"],
    consumer: ["vacuum-fabrication-plant", "wafers"],
    resources: ["silicon"],
  },
  {
    producer: ["vacuum-fabrication-plant", "wafers"],
    consumer: ["circuit-board-plant", "circuit-boards"],
    resources: ["wafers"],
  },
  {
    producer: ["extraction-plant", "metals-and-silicon"],
    consumer: ["circuit-board-plant", "circuit-boards"],
    resources: ["metals"],
  },
  {
    producer: ["large-extraction-plant", "metals-and-silicon"],
    consumer: ["integrated-fabrication-plant", "circuit-boards"],
    resources: ["silicon", "metals"],
  },
  {
    producer: ["large-extraction-plant", "metals-and-silicon"],
    consumer: ["integrated-fabrication-plant", "wafers"],
    resources: ["silicon"],
  },
] as const;

describe("Plants that feed one another", () => {
  it.each(
    pairs.flatMap(({ producer, consumer, resources }) =>
      resources.map(
        (resource) =>
          [
            `${producer.join(" ")} → ${consumer.join(" ")}`,
            resource,
            producer,
            consumer,
          ] as const,
      ),
    ),
  )(
    "%s: makes a whole multiple of the %s taken",
    (
      _,
      resource,
      [producerId, producerRecipe],
      [consumerId, consumerRecipe],
    ) => {
      const made = bulkRate(
        resourceOutputs(recipeOf(producerId, producerRecipe)),
        resource,
      );
      const taken = bulkRate(
        recipeOf(consumerId, consumerRecipe).inputs,
        resource,
      );
      const ratio = made / taken;

      expect(ratio).toBeGreaterThanOrEqual(1);
      expect(Math.abs(ratio - Math.round(ratio))).toBeLessThan(1e-9);
    },
  );
});
